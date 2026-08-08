import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { BusinessException } from '../../common/exceptions/business.exception';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';
import {
  AI_RAG_PORT,
  DOCUMENT_CONTENT_PORT,
  DOCUMENT_SHARE_PATH_PORT,
  DOCUMENT_STORAGE_PORT,
  KNOWLEDGE_BASE_PORT,
  MEMBERSHIP_DOCUMENT_PORT,
  type AiRagPort,
  type DocumentContentPort,
  type DocumentSharePathPort,
  type DocumentStoragePort,
  type KnowledgeBasePort,
  type MembershipDocumentPort,
} from '../../ports';
import { MCP_SCOPES, type McpScope } from './mcp.types';
import { buildMcpDocumentPayload } from '../../utils/document-mcp.util';
import { resolveMcpDocumentCreate } from '../../utils/mcp-document-create.util';
import {
  normalizeSheetRows,
  writeBaseRecordsToWorkbook,
  writeSheetCellsToWorkbook,
} from '../../utils/mcp-sheet-write.util';

export interface McpToolDefinition {
  name: string;
  description: string;
  requiredScope: McpScope;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>, auth: AuthUser) => Promise<unknown>;
}

@Injectable()
export class McpToolRegistry {
  private readonly tools = new Map<string, McpToolDefinition>();

  constructor(
    @Inject(DOCUMENT_STORAGE_PORT) private readonly storageService: DocumentStoragePort,
    @Inject(DOCUMENT_CONTENT_PORT) private readonly documentContext: DocumentContentPort,
    @Inject(KNOWLEDGE_BASE_PORT) private readonly knowledgeBaseService: KnowledgeBasePort,
    @Inject(AI_RAG_PORT) private readonly knowledgeService: AiRagPort,
    @Inject(DOCUMENT_SHARE_PATH_PORT) private readonly documentShareService: DocumentSharePathPort,
    @Inject(MEMBERSHIP_DOCUMENT_PORT) private readonly membershipService: MembershipDocumentPort,
  ) {
    this.registerBuiltinTools();
  }

  private register(tool: McpToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  listTools(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parameters,
    }));
  }

  hasScope(auth: AuthUser, scope: McpScope): boolean {
    return auth.mcpScopes?.includes(scope) ?? false;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    auth: AuthUser,
  ): Promise<{ content: Array<{ type: string; text: string }>; isError: boolean }> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new BusinessException(100002, `未知 Tool: ${name}`, HttpStatus.BAD_REQUEST);
    }
    if (!this.hasScope(auth, tool.requiredScope)) {
      throw new BusinessException(100004, `Token 缺少权限: ${tool.requiredScope}`, HttpStatus.FORBIDDEN);
    }

    try {
      const result = await tool.handler(args ?? {}, auth);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: false,
      };
    } catch (err) {
      const message = err instanceof BusinessException
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Tool 执行失败';
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }],
        isError: true,
      };
    }
  }

  private registerBuiltinTools(): void {
    this.registerDocumentTools();
    this.registerKnowledgeBaseTools();
    this.registerRagTools();
  }

  private registerDocumentTools(): void {
    this.register({
      name: 'list_documents',
      description: '列出当前用户可访问的文档',
      requiredScope: MCP_SCOPES.DOC_READ,
      parameters: {
        type: 'object',
        properties: {
          sortBy: { type: 'string', enum: ['lastVisited', 'created', 'updated'] },
        },
      },
      handler: async (args, auth) => {
        const sort = (args.sortBy as 'lastVisited' | 'created' | 'updated') || 'lastVisited';
        const ctx = this.storageService.accessFromAuth(auth);
        const items = await this.storageService.listOwnedDocuments(sort, ctx);
        return { items, total: items.length };
      },
    });

    this.register({
      name: 'get_document',
      description: '获取文档内容与元数据（含 freeform/base 表格的 sheets、cells、markdownTable）',
      requiredScope: MCP_SCOPES.DOC_READ,
      parameters: {
        type: 'object',
        properties: { docId: { type: 'string' } },
        required: ['docId'],
      },
      handler: async (args, auth) => {
        const docId = String(args.docId ?? '');
        const ctx = this.storageService.accessFromAuth(auth);
        const doc = await this.storageService.loadDocumentForUser(docId, ctx);
        if (!doc) return { error: 'Document not found' };
        return buildMcpDocumentPayload(doc);
      },
    });

    this.register({
      name: 'get_document_path',
      description: '获取文档路径（面包屑）',
      requiredScope: MCP_SCOPES.DOC_READ,
      parameters: {
        type: 'object',
        properties: { docId: { type: 'string' } },
        required: ['docId'],
      },
      handler: async (args, auth) => {
        const docId = String(args.docId ?? '');
        return this.documentShareService.resolvePathForUser(auth, docId);
      },
    });

    this.register({
      name: 'create_document',
      description:
        '创建新文档。写 Markdown/纯文本请指定 docType=richtext（或不传，默认按内容推断为 richtext）；'
        + '表格用 freeform，多维表用 base，思维导图 mindnote，白板 whiteboard。'
        + '也可传 content 一并写入正文，或传结构化 data。',
      requiredScope: MCP_SCOPES.DOC_WRITE,
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          docType: {
            type: 'string',
            description:
              '文档类型：richtext（富文本/Markdown，默认）、freeform（表格）、base（多维表）、mindnote、whiteboard',
            enum: ['richtext', 'freeform', 'base', 'mindnote', 'whiteboard'],
          },
          content: {
            type: 'string',
            description: '可选。Markdown/纯文本初始内容（用于 richtext；有内容且未指定类型时自动选 richtext）',
          },
          data: { type: 'object', description: '可选。结构化初始数据；可据此推断 docType' },
        },
        required: ['title'],
      },
      handler: async (args, auth) => {
        const title = String(args.title ?? '').trim();
        if (!title) return { error: 'title is required' };
        const resolved = resolveMcpDocumentCreate({
          docType: typeof args.docType === 'string' ? args.docType : null,
          content: typeof args.content === 'string' ? args.content : null,
          data: args.data,
        });
        const ctx = this.storageService.accessFromAuth(auth);
        await this.membershipService.assertCanCreateDocument(auth, ctx, resolved.docType);
        const scope = ctx.identityType === 'tenant' && ctx.tenantId ? 2 : 1;
        const created = await this.storageService.createDocument({
          id: `doc_${uuidv4().slice(0, 8)}`,
          title,
          docType: resolved.docType,
          data: resolved.data,
          ownerId: auth.userId,
          scope,
          tenantId: scope === 2 ? ctx.tenantId : null,
        });
        return {
          ...created,
          docTypeResolved: resolved.docType,
          inferredFrom: resolved.inferredFrom,
        };
      },
    });

    this.register({
      name: 'update_document',
      description:
        '全量更新文档元数据或 data。富文本写 Markdown 请用 write_document_content；'
        + '普通表格写入请优先 write_sheet_cells；多维表请优先 write_base_records。'
        + '若必须直接写 data：freeform 形如'
        + ' {activeSheetId,sheetOrder,sheets:[{id,data:{sheetId,name,type:"freeform",rowCount,colCount,'
        + 'cells:{"R0C0":{value:{type:"text",text:"姓名"}},"R1C0":{value:{type:"number",value:1,format:{kind:"general"}}}}}}]}。'
        + '单元格 key 必须是 R{row}C{col}（从 0 起）。',
      requiredScope: MCP_SCOPES.DOC_WRITE,
      parameters: {
        type: 'object',
        properties: {
          docId: { type: 'string' },
          title: { type: 'string' },
          docType: {
            type: 'string',
            enum: ['richtext', 'freeform', 'base', 'mindnote', 'whiteboard'],
          },
          data: { type: 'object' },
        },
        required: ['docId'],
      },
      handler: async (args, auth) => {
        const docId = String(args.docId ?? '');
        const ctx = this.storageService.accessFromAuth(auth);
        const body: Record<string, unknown> = {};
        if (args.title !== undefined) body.title = args.title;
        if (args.docType !== undefined) body.docType = args.docType;
        if (args.data !== undefined) body.data = args.data;
        return this.storageService.saveDocument(docId, body, ctx);
      },
    });

    this.register({
      name: 'write_document_content',
      description:
        '以 Markdown/文本写入文档正文（append 或 replace）。'
        + '若目标是表格(freeform)/多维表(base)，会自动转为 richtext 再写入，避免打开后空白。'
        + '普通表格数据请用 write_sheet_cells；多维表请用 write_base_records。',
      requiredScope: MCP_SCOPES.DOC_WRITE,
      parameters: {
        type: 'object',
        properties: {
          docId: { type: 'string' },
          content: { type: 'string' },
          mode: { type: 'string', enum: ['append', 'replace'] },
        },
        required: ['docId', 'content'],
      },
      handler: async (args) => {
        const docId = String(args.docId ?? '');
        const content = String(args.content ?? '');
        const mode = String(args.mode ?? 'append') === 'replace' ? 'replace' : 'append';
        return this.documentContext.write(docId, content, mode);
      },
    });

    this.register({
      name: 'write_sheet_cells',
      description:
        '向普通表格(freeform)写入单元格。推荐传入 rows 二维数组，或 markdownTable。'
        + '服务端会转成系统 cells（key=R{row}C{col}）。'
        + '若文档不是 freeform，会自动改为 freeform。示例 rows: [["姓名","年龄"],["张三",28]]',
      requiredScope: MCP_SCOPES.DOC_WRITE,
      parameters: {
        type: 'object',
        properties: {
          docId: { type: 'string' },
          rows: {
            type: 'array',
            description: '二维数组，第一行通常是表头',
            items: { type: 'array', items: { type: ['string', 'number', 'boolean', 'null'] } },
          },
          markdownTable: {
            type: 'string',
            description: '可选。Markdown 表格，与 rows 二选一',
          },
          sheetId: { type: 'string' },
          sheetName: { type: 'string' },
          mode: { type: 'string', enum: ['replace', 'append'], description: '默认 replace' },
          startRow: { type: 'number' },
          startCol: { type: 'number' },
        },
        required: ['docId'],
      },
      handler: async (args, auth) => {
        const docId = String(args.docId ?? '');
        const ctx = this.storageService.accessFromAuth(auth);
        const doc = await this.storageService.loadDocumentForUser(docId, ctx);
        if (!doc) return { error: 'Document not found' };
        try {
          const rows = normalizeSheetRows({
            rows: args.rows,
            markdownTable: typeof args.markdownTable === 'string' ? args.markdownTable : null,
          });
          if (rows.length === 0) return { error: 'rows or markdownTable is required' };
          const written = writeSheetCellsToWorkbook(doc.data, {
            rows,
            sheetId: typeof args.sheetId === 'string' ? args.sheetId : undefined,
            sheetName: typeof args.sheetName === 'string' ? args.sheetName : undefined,
            mode: String(args.mode ?? 'replace') === 'append' ? 'append' : 'replace',
            startRow: typeof args.startRow === 'number' ? args.startRow : undefined,
            startCol: typeof args.startCol === 'number' ? args.startCol : undefined,
          });
          const saved = await this.storageService.saveDocument(docId, {
            docType: 'freeform',
            data: written.data,
          }, ctx);
          return {
            success: true,
            version: saved.version,
            docId,
            docType: 'freeform',
            sheetId: written.sheetId,
            rowCount: written.rowCount,
            colCount: written.colCount,
            convertedFrom: doc.docType !== 'freeform' ? doc.docType : undefined,
          };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'write_sheet_cells failed' };
        }
      },
    });

    this.register({
      name: 'write_base_records',
      description:
        '向多维表(base)写入记录。传 columns（字段定义）+ records（对象数组，可用字段名或字段 id 作 key）。'
        + '若文档不是 base，会自动改为 base。示例：'
        + ' columns:[{name:"姓名"},{name:"年龄",type:"number"}]、records:[{姓名:"张三",年龄:28}]',
      requiredScope: MCP_SCOPES.DOC_WRITE,
      parameters: {
        type: 'object',
        properties: {
          docId: { type: 'string' },
          columns: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                type: { type: 'string', description: 'text/number/boolean/date/select 等' },
              },
              required: ['name'],
            },
          },
          records: {
            type: 'array',
            items: { type: 'object' },
          },
          sheetId: { type: 'string' },
          sheetName: { type: 'string' },
          mode: { type: 'string', enum: ['replace', 'append'], description: '默认 replace' },
        },
        required: ['docId', 'records'],
      },
      handler: async (args, auth) => {
        const docId = String(args.docId ?? '');
        const ctx = this.storageService.accessFromAuth(auth);
        const doc = await this.storageService.loadDocumentForUser(docId, ctx);
        if (!doc) return { error: 'Document not found' };
        try {
          const records = Array.isArray(args.records)
            ? args.records.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
            : [];
          if (records.length === 0) return { error: 'records is required' };
          const columns = Array.isArray(args.columns)
            ? args.columns
              .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
              .map((item) => ({
                id: typeof item.id === 'string' ? item.id : undefined,
                name: String(item.name ?? ''),
                type: typeof item.type === 'string' ? item.type : undefined,
              }))
              .filter((item) => item.name.trim())
            : undefined;
          const written = writeBaseRecordsToWorkbook(doc.data, {
            columns,
            records,
            sheetId: typeof args.sheetId === 'string' ? args.sheetId : undefined,
            sheetName: typeof args.sheetName === 'string' ? args.sheetName : undefined,
            mode: String(args.mode ?? 'replace') === 'append' ? 'append' : 'replace',
          });
          const saved = await this.storageService.saveDocument(docId, {
            docType: 'base',
            data: written.data,
          }, ctx);
          return {
            success: true,
            version: saved.version,
            docId,
            docType: 'base',
            sheetId: written.sheetId,
            recordCount: written.recordCount,
            columnCount: written.columnCount,
            convertedFrom: doc.docType !== 'base' ? doc.docType : undefined,
          };
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'write_base_records failed' };
        }
      },
    });

    this.register({
      name: 'delete_document',
      description: '将文档移入回收站',
      requiredScope: MCP_SCOPES.DOC_WRITE,
      parameters: {
        type: 'object',
        properties: { docId: { type: 'string' } },
        required: ['docId'],
      },
      handler: async (args, auth) => {
        const docId = String(args.docId ?? '');
        const ctx = this.storageService.accessFromAuth(auth);
        const ok = await this.storageService.deleteDocument(docId, ctx);
        return { success: ok };
      },
    });

    this.register({
      name: 'restore_document',
      description: '从回收站恢复文档',
      requiredScope: MCP_SCOPES.DOC_WRITE,
      parameters: {
        type: 'object',
        properties: { docId: { type: 'string' } },
        required: ['docId'],
      },
      handler: async (args, auth) => {
        const docId = String(args.docId ?? '');
        const ok = await this.storageService.restoreDocument(docId, this.storageService.accessFromAuth(auth));
        return { success: ok };
      },
    });

    this.register({
      name: 'permanent_delete_document',
      description: '永久删除文档',
      requiredScope: MCP_SCOPES.DOC_WRITE,
      parameters: {
        type: 'object',
        properties: { docId: { type: 'string' } },
        required: ['docId'],
      },
      handler: async (args, auth) => {
        const docId = String(args.docId ?? '');
        const ok = await this.storageService.permanentDeleteDocument(
          docId,
          this.storageService.accessFromAuth(auth),
        );
        return { success: ok };
      },
    });
  }

  private registerKnowledgeBaseTools(): void {
    this.register({
      name: 'list_knowledge_bases',
      description: '列出可访问的知识库',
      requiredScope: MCP_SCOPES.KB_READ,
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string' },
          sortBy: { type: 'string', enum: ['updated', 'created', 'name'] },
        },
      },
      handler: async (args, auth) => {
        const sortBy = args.sortBy as 'updated' | 'created' | 'name' | undefined;
        return this.knowledgeBaseService.list(auth, {
          keyword: typeof args.keyword === 'string' ? args.keyword : undefined,
          sortBy,
        });
      },
    });

    this.register({
      name: 'get_knowledge_base',
      description: '获取知识库详情',
      requiredScope: MCP_SCOPES.KB_READ,
      parameters: {
        type: 'object',
        properties: { kbId: { type: 'string' } },
        required: ['kbId'],
      },
      handler: async (args, auth) => {
        return this.knowledgeBaseService.getById(auth, String(args.kbId ?? ''));
      },
    });

    this.register({
      name: 'create_knowledge_base',
      description: '创建知识库',
      requiredScope: MCP_SCOPES.KB_WRITE,
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          visibility: { type: 'string', enum: ['members', 'organization'] },
        },
        required: ['name'],
      },
      handler: async (args, auth) => {
        return this.knowledgeBaseService.create(auth, {
          name: String(args.name ?? ''),
          description: typeof args.description === 'string' ? args.description : undefined,
          visibility: args.visibility === 'organization' ? 'organization' : 'members',
        });
      },
    });

    this.register({
      name: 'update_knowledge_base',
      description: '更新知识库元数据',
      requiredScope: MCP_SCOPES.KB_WRITE,
      parameters: {
        type: 'object',
        properties: {
          kbId: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['kbId'],
      },
      handler: async (args, auth) => {
        return this.knowledgeBaseService.update(auth, String(args.kbId ?? ''), {
          name: typeof args.name === 'string' ? args.name : undefined,
          description: typeof args.description === 'string' ? args.description : undefined,
        });
      },
    });

    this.register({
      name: 'delete_knowledge_base',
      description: '删除知识库',
      requiredScope: MCP_SCOPES.KB_WRITE,
      parameters: {
        type: 'object',
        properties: { kbId: { type: 'string' } },
        required: ['kbId'],
      },
      handler: async (args, auth) => {
        return this.knowledgeBaseService.remove(auth, String(args.kbId ?? ''));
      },
    });

    this.register({
      name: 'list_kb_nodes',
      description: '获取知识库目录树',
      requiredScope: MCP_SCOPES.KB_READ,
      parameters: {
        type: 'object',
        properties: { kbId: { type: 'string' } },
        required: ['kbId'],
      },
      handler: async (args, auth) => {
        return this.knowledgeBaseService.listNodes(auth, String(args.kbId ?? ''));
      },
    });

    this.register({
      name: 'create_kb_node',
      description: '创建知识库目录节点',
      requiredScope: MCP_SCOPES.KB_WRITE,
      parameters: {
        type: 'object',
        properties: {
          kbId: { type: 'string' },
          title: { type: 'string' },
          nodeType: { type: 'string', enum: ['page', 'doc_ref', 'folder'] },
          parentId: { type: 'string' },
        },
        required: ['kbId', 'title'],
      },
      handler: async (args, auth) => {
        const nodeType = String(args.nodeType ?? 'page');
        return this.knowledgeBaseService.createNode(auth, String(args.kbId ?? ''), {
          title: String(args.title ?? ''),
          nodeType: nodeType as 'page' | 'doc_ref' | 'folder',
          parentId: typeof args.parentId === 'string' ? args.parentId : null,
        });
      },
    });

    this.register({
      name: 'update_kb_node',
      description: '更新知识库节点',
      requiredScope: MCP_SCOPES.KB_WRITE,
      parameters: {
        type: 'object',
        properties: {
          kbId: { type: 'string' },
          nodeId: { type: 'string' },
          title: { type: 'string' },
          parentId: { type: 'string' },
        },
        required: ['kbId', 'nodeId'],
      },
      handler: async (args, auth) => {
        return this.knowledgeBaseService.updateNode(auth, String(args.kbId ?? ''), String(args.nodeId ?? ''), {
          title: typeof args.title === 'string' ? args.title : undefined,
          parentId: typeof args.parentId === 'string' ? args.parentId : undefined,
        });
      },
    });

    this.register({
      name: 'delete_kb_node',
      description: '删除知识库节点',
      requiredScope: MCP_SCOPES.KB_WRITE,
      parameters: {
        type: 'object',
        properties: {
          kbId: { type: 'string' },
          nodeId: { type: 'string' },
          deleteDocument: { type: 'boolean' },
        },
        required: ['kbId', 'nodeId'],
      },
      handler: async (args, auth) => {
        return this.knowledgeBaseService.removeNode(
          auth,
          String(args.kbId ?? ''),
          String(args.nodeId ?? ''),
          Boolean(args.deleteDocument),
        );
      },
    });

    this.register({
      name: 'create_kb_document',
      description:
        '在知识库目录下创建文档。写 Markdown/文本用 docType=richtext（默认按内容推断）；'
        + '也可传 content 创建时写入正文。',
      requiredScope: MCP_SCOPES.KB_WRITE,
      parameters: {
        type: 'object',
        properties: {
          kbId: { type: 'string' },
          parentNodeId: { type: 'string' },
          title: { type: 'string' },
          docType: {
            type: 'string',
            description: 'richtext（默认）/ freeform / base / mindnote / whiteboard',
            enum: ['richtext', 'freeform', 'base', 'mindnote', 'whiteboard'],
          },
          content: { type: 'string', description: '可选。Markdown/纯文本初始内容' },
          data: { type: 'object', description: '可选。结构化初始数据' },
        },
        required: ['kbId', 'parentNodeId', 'title'],
      },
      handler: async (args, auth) => {
        const resolved = resolveMcpDocumentCreate({
          docType: typeof args.docType === 'string' ? args.docType : null,
          content: typeof args.content === 'string' ? args.content : null,
          data: args.data,
        });
        const created = await this.knowledgeBaseService.createDocument(
          auth,
          String(args.kbId ?? ''),
          String(args.parentNodeId ?? ''),
          {
            title: String(args.title ?? '未命名文档'),
            docType: resolved.docType,
            data: resolved.data,
          },
        );
        return {
          ...created,
          docTypeResolved: resolved.docType,
          inferredFrom: resolved.inferredFrom,
        };
      },
    });
  }

  private registerRagTools(): void {
    this.register({
      name: 'search_knowledge',
      description: 'AI 向量语义检索',
      requiredScope: MCP_SCOPES.AI_RAG,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          topK: { type: 'number' },
          documentIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['query'],
      },
      handler: async (args, auth) => {
        const query = String(args.query ?? '');
        const topK = Number(args.topK ?? 5);
        const documentIds = Array.isArray(args.documentIds)
          ? args.documentIds.map((id) => String(id)).filter(Boolean)
          : undefined;
        return this.knowledgeService.search(
          query,
          topK,
          auth.currentTenantId ?? undefined,
          documentIds,
        );
      },
    });

    this.register({
      name: 'embed_document',
      description: '为文档建立/更新向量索引',
      requiredScope: MCP_SCOPES.AI_RAG,
      parameters: {
        type: 'object',
        properties: { documentId: { type: 'string' } },
        required: ['documentId'],
      },
      handler: async (args) => {
        return this.knowledgeService.embedDocument(String(args.documentId ?? ''));
      },
    });

    this.register({
      name: 'delete_document_vectors',
      description: '删除文档向量索引',
      requiredScope: MCP_SCOPES.AI_RAG,
      parameters: {
        type: 'object',
        properties: { documentId: { type: 'string' } },
        required: ['documentId'],
      },
      handler: async (args) => {
        await this.knowledgeService.deleteVectors(String(args.documentId ?? ''));
        return { success: true };
      },
    });
  }
}
