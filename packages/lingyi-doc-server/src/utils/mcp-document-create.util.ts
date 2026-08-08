import { replaceDocumentContent } from '../modules/ai/ai-agent/document-context.util';

/** MCP / Agent 可创建的文档类型 */
export const MCP_DOC_TYPES = [
  'richtext',
  'freeform',
  'base',
  'mindnote',
  'whiteboard',
] as const;

export type McpDocType = (typeof MCP_DOC_TYPES)[number];

export function normalizeMcpDocType(raw: string | undefined | null): McpDocType | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value === 'rich' || value === 'doc' || value === 'markdown' || value === 'md' || value === 'text') {
    return 'richtext';
  }
  if (value === 'sheet' || value === 'spreadsheet' || value === 'table' || value === 'excel') {
    return 'freeform';
  }
  if (value === 'multidim' || value === 'base_table' || value === 'database') {
    return 'base';
  }
  if (value === 'mind' || value === 'mindmap' || value === 'mind_note') {
    return 'mindnote';
  }
  if (value === 'board' || value === 'canvas') {
    return 'whiteboard';
  }
  if ((MCP_DOC_TYPES as readonly string[]).includes(value)) {
    return value as McpDocType;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** 根据结构化 data 推断文档类型 */
export function inferDocTypeFromData(data: unknown): McpDocType | null {
  if (!isRecord(data)) return null;

  if (Array.isArray(data.columnDefs) || Array.isArray(data.rows)) {
    return 'base';
  }
  if (Array.isArray(data.sheets) || data.cells || data.sheetOrder || data.activeSheetId) {
    return 'freeform';
  }
  if (data.root && typeof data.root === 'object') {
    return 'mindnote';
  }
  if (Array.isArray(data.elements) || data.viewport) {
    return 'whiteboard';
  }
  if (Array.isArray(data.content) || Array.isArray(data.blocks)) {
    return 'richtext';
  }
  return null;
}

/**
 * 根据 Agent 指定的类型 / 文本内容 / 结构化 data 解析文档类型与初始数据。
 * 规则：显式 docType 优先；否则从 data 推断；再否则有文本内容则 richtext；默认 richtext。
 */
export function resolveMcpDocumentCreate(input: {
  docType?: string | null;
  content?: string | null;
  data?: unknown;
}): { docType: McpDocType; data: unknown; inferredFrom: 'explicit' | 'data' | 'content' | 'default' } {
  const content = typeof input.content === 'string' ? input.content.trim() : '';
  const explicit = normalizeMcpDocType(input.docType);

  if (explicit) {
    const data = buildInitialDataForDocType(explicit, content, input.data);
    return { docType: explicit, data, inferredFrom: 'explicit' };
  }

  const fromData = inferDocTypeFromData(input.data);
  if (fromData) {
    return {
      docType: fromData,
      data: input.data ?? buildEmptyDataForDocType(fromData),
      inferredFrom: 'data',
    };
  }

  if (content) {
    return {
      docType: 'richtext',
      data: replaceDocumentContent({}, content),
      inferredFrom: 'content',
    };
  }

  return {
    docType: 'richtext',
    data: buildEmptyDataForDocType('richtext'),
    inferredFrom: 'default',
  };
}

export function buildEmptyDataForDocType(docType: McpDocType): Record<string, unknown> {
  switch (docType) {
    case 'richtext':
      return {
        content: [{
          type: 'paragraph',
          id: `blk_empty_${Date.now()}`,
          text: '',
          marks: [],
          align: 'left',
        }],
      };
    case 'freeform':
      return {
        sheets: [],
        sheetOrder: [],
        activeSheetId: '',
      };
    case 'base':
      return {
        type: 'base',
        columnDefs: [],
        rows: [],
        cells: {},
      };
    case 'mindnote':
      return {
        root: {
          id: `node_${Date.now()}`,
          text: '',
          children: [],
        },
      };
    case 'whiteboard':
      return {
        viewport: { x: 0, y: 0, zoom: 1 },
        elements: [],
      };
    default:
      return {};
  }
}

export function buildInitialDataForDocType(
  docType: McpDocType,
  content: string,
  data?: unknown,
): unknown {
  if (data !== undefined && data !== null) {
    return data;
  }
  if (content && docType === 'richtext') {
    return replaceDocumentContent({}, content);
  }
  // 文本内容无法直接映射到表格/白板等，先建空壳，后续由专用 Tool 写入
  return buildEmptyDataForDocType(docType);
}

/** 文本写入是否应转到 richtext（Agent 写 Markdown 到错误类型时） */
export function shouldConvertToRichtextForTextWrite(docType: string): boolean {
  const normalized = docType === 'rich' ? 'richtext' : docType;
  return normalized === 'freeform' || normalized === 'base' || normalized === 'standard';
}
