/** 文档字数/字符数统计（与文档信息「总字数 / 总字符数」同一套算法） */

export interface DocumentTextStats {
  wordCount: number;
  charCount: number;
}

interface AttachmentItemLike {
  name?: string;
  size?: number;
  url?: string;
}

function normalizeDocType(docType: string): string {
  return docType === 'rich' ? 'richtext' : docType;
}

function pushText(value: unknown, out: string[]): void {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (trimmed) out.push(trimmed);
}

function tryParseAttachmentJson(text: string): AttachmentItemLike[] | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed) || !parsed.length) return null;
    if (!parsed.every(item => item && typeof item === 'object' && ('url' in item || 'name' in item))) {
      return null;
    }
    return parsed as AttachmentItemLike[];
  } catch {
    return null;
  }
}

function cellValueToText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const v = value as Record<string, unknown>;
  switch (v.type) {
    case 'empty':
      return '';
    case 'text': {
      const text = String(v.text ?? '');
      const attachments = tryParseAttachmentJson(text);
      if (attachments) {
        return attachments.map(item => item.name?.trim() || '').filter(Boolean).join('\n');
      }
      return text;
    }
    case 'number':
      return String(v.value ?? '');
    case 'boolean':
      return v.value ? 'TRUE' : 'FALSE';
    case 'date':
      return String(v.timestamp ?? '');
    case 'formula':
      return v.cached ? cellValueToText(v.cached) : '';
    case 'error':
      return String(v.error ?? '');
    case 'richtext':
      return Array.isArray(v.segments)
        ? v.segments.map(seg => (seg as { text?: string }).text ?? '').join('')
        : '';
    case 'link':
      return String(v.text || v.url || '');
    default:
      return '';
  }
}

function collectDocTableCells(cells: unknown, out: string[]): void {
  if (!Array.isArray(cells)) return;
  for (const row of cells) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      if (typeof cell === 'string') {
        pushText(cell, out);
        continue;
      }
      if (cell && typeof cell === 'object') {
        const c = cell as Record<string, unknown>;
        if (typeof c.text === 'string') pushText(c.text, out);
        else if (c.value) pushText(cellValueToText(c.value), out);
      }
    }
  }
}

function collectMindNode(node: unknown, out: string[]): void {
  if (!node || typeof node !== 'object') return;
  const n = node as Record<string, unknown>;
  pushText(n.text, out);
  pushText(n.note, out);
  if (Array.isArray(n.children)) {
    n.children.forEach(child => collectMindNode(child, out));
  }
}

function collectWhiteboardElement(el: unknown, out: string[]): void {
  if (!el || typeof el !== 'object') return;
  const e = el as Record<string, unknown>;
  switch (e.type) {
    case 'text':
    case 'sticky':
      pushText(e.text, out);
      break;
    case 'shape':
    case 'connector':
      pushText(e.text, out);
      break;
    case 'table':
      collectDocTableCells(e.cells, out);
      break;
    case 'mindmap':
      if (e.root) collectMindNode(e.root, out);
      break;
    default:
      break;
  }
}

function collectWhiteboard(data: unknown, out: string[]): void {
  if (!data || typeof data !== 'object') return;
  const elements = (data as Record<string, unknown>).elements;
  if (!Array.isArray(elements)) return;
  elements.forEach(el => collectWhiteboardElement(el, out));
}

function collectSheetData(sheet: unknown, out: string[]): void {
  if (!sheet || typeof sheet !== 'object') return;
  const s = sheet as Record<string, unknown>;
  const cells = s.cells;
  if (cells && typeof cells === 'object') {
    const cellList = Array.isArray(cells) ? cells : Object.values(cells as Record<string, unknown>);
    for (const cell of cellList) {
      if (!cell || typeof cell !== 'object') continue;
      const c = cell as Record<string, unknown>;
      if (c.value) pushText(cellValueToText(c.value), out);
      else if (typeof c.text === 'string') pushText(c.text, out);
    }
  }
}

function collectWorkbookDocument(data: unknown, out: string[]): void {
  if (!data || typeof data !== 'object') return;
  const wb = data as Record<string, unknown>;
  if (Array.isArray(wb.sheets)) {
    for (const sheet of wb.sheets) {
      if (!sheet || typeof sheet !== 'object') continue;
      const wrapper = sheet as Record<string, unknown>;
      collectSheetData(wrapper.data ?? wrapper, out);
    }
    return;
  }
  collectSheetData(wb, out);
}

function collectRichTextBlock(block: unknown, out: string[]): void {
  if (!block || typeof block !== 'object') return;
  const b = block as Record<string, unknown>;
  switch (b.type) {
    case 'heading':
    case 'paragraph':
    case 'quote':
    case 'code':
    case 'mermaid':
      pushText(b.text, out);
      break;
    case 'list':
      if (Array.isArray(b.items)) {
        for (const item of b.items) {
          if (item && typeof item === 'object') {
            pushText((item as Record<string, unknown>).text, out);
          }
        }
      }
      break;
    case 'table':
      collectDocTableCells(b.cells, out);
      break;
    case 'image':
      pushText(b.alt, out);
      pushText(b.caption, out);
      break;
    case 'base':
      if (b.sheetData) collectWorkbookDocument(b.sheetData, out);
      break;
    case 'whiteboard':
      if (b.whiteboardData) collectWhiteboard(b.whiteboardData, out);
      break;
    default:
      break;
  }
}

function collectRichText(data: unknown, out: string[]): void {
  if (!data || typeof data !== 'object') return;
  const doc = data as Record<string, unknown>;
  const blocks = Array.isArray(doc.content)
    ? doc.content
    : Array.isArray(doc.blocks)
      ? doc.blocks
      : [];
  blocks.forEach(block => collectRichTextBlock(block, out));
}

function collectMindNote(data: unknown, out: string[]): void {
  if (!data || typeof data !== 'object') return;
  const root = (data as Record<string, unknown>).root;
  if (root) collectMindNode(root, out);
}

/** 中文按字、英文按词，与文档信息「总字数」一致 */
export function countWords(text: string): number {
  if (!text) return 0;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return 0;
  const cjk = normalized.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)?.length ?? 0;
  const nonCjk = normalized.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ');
  const latinWords = nonCjk.split(/\s+/).filter(Boolean).length;
  return cjk + latinWords;
}

/** 提取文档纯文本（富文本 / 表格 / 白板等） */
export function extractDocumentPlainText(data: unknown, docType: string): string {
  const chunks: string[] = [];
  switch (normalizeDocType(docType)) {
    case 'richtext':
      collectRichText(data, chunks);
      break;
    case 'mindnote':
      collectMindNote(data, chunks);
      break;
    case 'whiteboard':
      collectWhiteboard(data, chunks);
      break;
    case 'freeform':
    case 'base':
      collectWorkbookDocument(data, chunks);
      break;
    default:
      collectWorkbookDocument(data, chunks);
      collectRichText(data, chunks);
      collectMindNote(data, chunks);
      collectWhiteboard(data, chunks);
      break;
  }
  return chunks.join('\n');
}

/** 统计文档正文字数与字符数（文档信息「总字数 / 总字符数」） */
export function computeDocumentTextStats(data: unknown, docType: string): DocumentTextStats {
  const text = extractDocumentPlainText(data, docType);
  return {
    charCount: text.length,
    wordCount: countWords(text),
  };
}

/** 富文本文档块级统计（与文档信息 richtext 口径一致，不含标题） */
export function computeRichDocumentTextStats(blocks: unknown[]): DocumentTextStats {
  return computeDocumentTextStats({ content: blocks }, 'richtext');
}
