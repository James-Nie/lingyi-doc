/** 从文档 JSON 统计字数/字符数，并汇总正文 JSON 与内嵌附件/图片体积 */

export interface DocumentTextStats {
  wordCount: number;
  charCount: number;
}

export interface DocumentSizeStats {
  jsonBytes: number;
  assetBytes: number;
  totalBytes: number;
}

export interface DocumentContentStats extends DocumentTextStats, DocumentSizeStats {}

export interface AssetRef {
  explicitSize?: number;
  objectKey?: string;
  dataUrl?: string;
}

type ObjectKeyResolver = (key: string) => Promise<number | null>;

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

/** 统计文档正文字数与字符数 */
export function computeDocumentTextStats(data: unknown, docType: string): DocumentTextStats {
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
  const text = chunks.join('\n');
  return {
    charCount: text.length,
    wordCount: countWords(text),
  };
}

function countWords(text: string): number {
  if (!text) return 0;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return 0;
  const cjk = normalized.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)?.length ?? 0;
  const nonCjk = normalized.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ');
  const latinWords = nonCjk.split(/\s+/).filter(Boolean).length;
  return cjk + latinWords;
}

export function computeJsonBytes(data: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(data ?? null), 'utf8');
  } catch {
    return 0;
  }
}

function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return 0;
  const payload = dataUrl.slice(comma + 1);
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(payload.length * 3 / 4) - padding);
}

/** 从 OSS 访问 URL 中解析 objectKey */
export function extractObjectKeyFromAssetUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:')) return null;

  try {
    const absolute = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `http://local${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
    const parsed = new URL(absolute);
    if (parsed.pathname.endsWith('/oss/access') || parsed.pathname.endsWith('/api/v1/oss/access')) {
      const key = parsed.searchParams.get('key');
      if (!key) return null;
      return Buffer.from(key, 'base64url').toString('utf8');
    }
    const path = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    return path || null;
  } catch {
    return null;
  }
}

function addAssetRef(refs: AssetRef[], input: { size?: unknown; url?: unknown; src?: unknown; image?: unknown }): void {
  const candidates = [input.url, input.src, input.image]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(value => value.trim());

  let objectKey: string | undefined;
  let dataUrl: string | undefined;
  for (const value of candidates) {
    if (value.startsWith('data:')) {
      dataUrl = value;
      break;
    }
    const key = extractObjectKeyFromAssetUrl(value);
    if (key) {
      objectKey = key;
      break;
    }
  }

  const explicitSize = typeof input.size === 'number' && input.size > 0 ? input.size : undefined;
  if (!explicitSize && !objectKey && !dataUrl) return;
  refs.push({ explicitSize, objectKey, dataUrl });
}

function collectAttachmentAssetsFromText(text: string, refs: AssetRef[]): void {
  const attachments = tryParseAttachmentJson(text);
  if (!attachments) return;
  for (const item of attachments) {
    addAssetRef(refs, { size: item.size, url: item.url });
  }
}

function collectCellAssets(cell: unknown, refs: AssetRef[]): void {
  if (!cell || typeof cell !== 'object') return;
  const c = cell as Record<string, unknown>;
  if (c.value && typeof c.value === 'object') {
    const value = c.value as Record<string, unknown>;
    if (value.type === 'text' && typeof value.text === 'string') {
      collectAttachmentAssetsFromText(value.text, refs);
    }
    if (value.type === 'link' && typeof value.url === 'string') {
      addAssetRef(refs, { url: value.url });
    }
  }
}

function collectSheetAssets(sheet: unknown, refs: AssetRef[]): void {
  if (!sheet || typeof sheet !== 'object') return;
  const s = sheet as Record<string, unknown>;
  const cells = s.cells;
  if (cells && typeof cells === 'object') {
    const cellList = Array.isArray(cells) ? cells : Object.values(cells as Record<string, unknown>);
    cellList.forEach(cell => collectCellAssets(cell, refs));
  }
}

function collectWorkbookAssets(data: unknown, refs: AssetRef[]): void {
  if (!data || typeof data !== 'object') return;
  const wb = data as Record<string, unknown>;
  if (Array.isArray(wb.sheets)) {
    for (const sheet of wb.sheets) {
      if (!sheet || typeof sheet !== 'object') continue;
      const wrapper = sheet as Record<string, unknown>;
      collectSheetAssets(wrapper.data ?? wrapper, refs);
    }
    return;
  }
  collectSheetAssets(wb, refs);
}

function collectRichTextBlockAssets(block: unknown, refs: AssetRef[]): void {
  if (!block || typeof block !== 'object') return;
  const b = block as Record<string, unknown>;
  switch (b.type) {
    case 'image':
      addAssetRef(refs, { url: b.url });
      break;
    case 'table':
      if (Array.isArray(b.cells)) {
        for (const row of b.cells) {
          if (!Array.isArray(row)) continue;
          row.forEach(cell => collectCellAssets(cell, refs));
        }
      }
      break;
    case 'base':
      if (b.sheetData) collectWorkbookAssets(b.sheetData, refs);
      break;
    case 'whiteboard':
      if (b.whiteboardData) collectWhiteboardAssets(b.whiteboardData, refs);
      break;
    default:
      break;
  }
}

function collectRichTextAssets(data: unknown, refs: AssetRef[]): void {
  if (!data || typeof data !== 'object') return;
  const doc = data as Record<string, unknown>;
  const blocks = Array.isArray(doc.content)
    ? doc.content
    : Array.isArray(doc.blocks)
      ? doc.blocks
      : [];
  blocks.forEach(block => collectRichTextBlockAssets(block, refs));
}

function collectWhiteboardElementAssets(el: unknown, refs: AssetRef[]): void {
  if (!el || typeof el !== 'object') return;
  const e = el as Record<string, unknown>;
  if (e.type === 'image') {
    addAssetRef(refs, { src: e.src });
    return;
  }
  if (e.type === 'table' && Array.isArray(e.cells)) {
    for (const row of e.cells) {
      if (!Array.isArray(row)) continue;
      row.forEach(cell => collectCellAssets(cell, refs));
    }
    return;
  }
  if (e.type === 'mindmap' && e.root) collectMindNodeAssets(e.root, refs);
}

function collectWhiteboardAssets(data: unknown, refs: AssetRef[]): void {
  if (!data || typeof data !== 'object') return;
  const elements = (data as Record<string, unknown>).elements;
  if (!Array.isArray(elements)) return;
  elements.forEach(el => collectWhiteboardElementAssets(el, refs));
}

function collectMindNodeAssets(node: unknown, refs: AssetRef[]): void {
  if (!node || typeof node !== 'object') return;
  const n = node as Record<string, unknown>;
  addAssetRef(refs, { image: n.image, url: n.image });
  if (Array.isArray(n.children)) {
    n.children.forEach(child => collectMindNodeAssets(child, refs));
  }
}

function collectMindNoteAssets(data: unknown, refs: AssetRef[]): void {
  if (!data || typeof data !== 'object') return;
  const root = (data as Record<string, unknown>).root;
  if (root) collectMindNodeAssets(root, refs);
}

/** 收集文档内嵌图片/附件引用 */
export function collectDocumentAssets(data: unknown, docType: string): AssetRef[] {
  const refs: AssetRef[] = [];
  switch (normalizeDocType(docType)) {
    case 'richtext':
      collectRichTextAssets(data, refs);
      break;
    case 'mindnote':
      collectMindNoteAssets(data, refs);
      break;
    case 'whiteboard':
      collectWhiteboardAssets(data, refs);
      break;
    case 'freeform':
    case 'base':
      collectWorkbookAssets(data, refs);
      break;
    default:
      collectRichTextAssets(data, refs);
      collectMindNoteAssets(data, refs);
      collectWhiteboardAssets(data, refs);
      collectWorkbookAssets(data, refs);
      break;
  }
  return refs;
}

function assetRefKey(ref: AssetRef): string | null {
  if (ref.dataUrl) return `data:${ref.dataUrl.length}:${ref.dataUrl.slice(0, 48)}`;
  if (ref.objectKey) return `oss:${ref.objectKey}`;
  if (ref.explicitSize) return `size:${ref.explicitSize}`;
  return null;
}

/** 汇总附件/图片字节数（优先使用内嵌 size，其余走 OSS HEAD 或 data URL 估算） */
export async function resolveAssetBytes(
  refs: AssetRef[],
  headObject?: ObjectKeyResolver,
): Promise<number> {
  const seen = new Set<string>();
  let total = 0;

  for (const ref of refs) {
    const dedupeKey = assetRefKey(ref);
    if (dedupeKey) {
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
    }

    if (typeof ref.explicitSize === 'number' && ref.explicitSize > 0) {
      total += ref.explicitSize;
      continue;
    }

    if (ref.dataUrl) {
      total += estimateDataUrlBytes(ref.dataUrl);
      continue;
    }

    if (ref.objectKey && headObject) {
      const size = await headObject(ref.objectKey);
      if (size && size > 0) total += size;
    }
  }

  return total;
}

/** @deprecated 使用 computeDocumentStats */
export function computeDocumentContentStats(
  data: unknown,
  docType: string,
): DocumentTextStats {
  return computeDocumentTextStats(data, docType);
}

/** 统计文档字数/字符数/大小（JSON + 内嵌资源） */
export async function computeDocumentStats(
  data: unknown,
  docType: string,
  headObject?: ObjectKeyResolver,
): Promise<DocumentContentStats> {
  const textStats = computeDocumentTextStats(data, docType);
  const jsonBytes = computeJsonBytes(data);
  const assetRefs = collectDocumentAssets(data, docType);
  const assetBytes = await resolveAssetBytes(assetRefs, headObject);
  return {
    ...textStats,
    jsonBytes,
    assetBytes,
    totalBytes: jsonBytes + assetBytes,
  };
}

export function formatStorageSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
