import { Injectable } from '@nestjs/common';
import { DocumentContextService } from './document-context.service';
import { KnowledgeService } from '../ai-knowledge/knowledge.service';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>, context: ToolExecutionContext) => Promise<unknown>;
}

export interface ToolExecutionContext {
  documentId?: string;
  tenantId?: string | null;
  userId?: string;
}

@Injectable()
export class AgentTools {
  private readonly tools = new Map<string, ToolDefinition>();

  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly documentContext: DocumentContextService,
  ) {
    this.registerBuiltinTools();
  }

  private registerBuiltinTools(): void {
    this.register({
      name: 'search_knowledge_base',
      description: '从知识库中检索相关信息',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索查询' },
          topK: { type: 'number', description: '返回结果数量', default: 5 },
          documentIds: {
            type: 'array',
            items: { type: 'string' },
            description: '限定检索的文档 ID 列表（必填其一：参数或当前上下文文档）',
          },
        },
        required: ['query'],
      },
      handler: async (args, context) => {
        const query = String(args.query ?? '');
        const topK = Number(args.topK ?? 5);
        const fromArgs = Array.isArray(args.documentIds)
          ? args.documentIds.map((id) => String(id)).filter(Boolean)
          : [];
        const documentIds = fromArgs.length
          ? fromArgs
          : context.documentId
            ? [context.documentId]
            : undefined;
        return this.knowledgeService.search(
          query,
          topK,
          context.tenantId ?? undefined,
          documentIds,
        );
      },
    });

    this.register({
      name: 'read_document',
      description: '读取文档内容',
      parameters: {
        type: 'object',
        properties: {
          documentId: { type: 'string', description: '文档ID' },
        },
        required: ['documentId'],
      },
      handler: async (args, context) => {
        const docId = String(args.documentId ?? context.documentId ?? '');
        if (!docId) return { error: 'documentId is required' };
        return this.documentContext.read(docId);
      },
    });

    this.register({
      name: 'write_document',
      description:
        '以 Markdown/文本写入文档正文（append/replace）。'
        + '若文档是表格(freeform)/多维表(base)会自动转为 richtext，避免打开空白。',
      parameters: {
        type: 'object',
        properties: {
          documentId: { type: 'string', description: '文档ID' },
          content: { type: 'string', description: 'Markdown 或纯文本内容' },
          mode: { type: 'string', enum: ['append', 'replace'], description: '写入模式', default: 'append' },
        },
        required: ['documentId', 'content'],
      },
      handler: async (args, context) => {
        const docId = String(args.documentId ?? context.documentId ?? '');
        const content = String(args.content ?? '');
        const mode = String(args.mode ?? 'append') === 'replace' ? 'replace' : 'append';
        if (!docId) return { error: 'documentId is required' };
        return this.documentContext.write(docId, content, mode);
      },
    });

    this.register({
      name: 'format_document',
      description: '格式化文档为 Markdown',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '文档内容' },
          format: { type: 'string', description: '目标格式', enum: ['markdown', 'html'] },
        },
        required: ['content'],
      },
      handler: async (args) => {
        const content = String(args.content ?? '');
        const format = String(args.format ?? 'markdown');
        return { formatted: content, format };
      },
    });
  }

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  getToolDefinitions(toolNames?: string[]): unknown[] {
    const names = toolNames?.length ? toolNames : Array.from(this.tools.keys());
    return names
      .filter((name) => this.tools.has(name))
      .map((name) => {
        const tool = this.tools.get(name)!;
        return {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        };
      });
  }

  async executeTool(
    name: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool not found: ${name}`);
    return tool.handler(args, context);
  }
}
