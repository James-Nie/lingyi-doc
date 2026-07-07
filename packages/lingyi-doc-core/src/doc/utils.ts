import type {
  DocBlock,
  HeadingBlock,
  ListBlock,
  ListItem,
  ParagraphBlock,
  QuoteBlock,
  RichDocumentJSON,
  TextMark,
  TableBlock,
  TableCell,
  MermaidBlock,
  BaseBlock,
  BaseEmbedViewType,
  WhiteboardBlock,
} from './types';
import { normalizeWhiteboardBlockData } from './whiteboardBlock';

let blockIdCounter = 0;

export function genBlockId(): string {
  blockIdCounter += 1;
  return `blk_${Date.now()}_${blockIdCounter}`;
}

export function createEmptyParagraph(): ParagraphBlock {
  return { type: 'paragraph', id: genBlockId(), text: '', marks: [], align: 'left' };
}

export function createEmptyMermaid(text?: string): MermaidBlock {
  return {
    type: 'mermaid',
    id: genBlockId(),
    text: text ?? `flowchart TD
  A[开始] --> B[结束]`,
    collapsed: false,
    height: 240,
  };
}

export function createEmptyTableCell(): TableCell {
  return {
    text: '',
    marks: [],
    align: 'left',
    verticalAlign: 'top',
    cellStyle: 'paragraph',
  };
}

export const DOC_TABLE_DEFAULT_COL_WIDTH = 120;
export const DOC_TABLE_DEFAULT_ROW_HEIGHT = 40;
export const DOC_TABLE_MIN_COL_WIDTH = 60;
export const DOC_TABLE_MIN_ROW_HEIGHT = 32;

/** 文档编辑器内容区宽度（与 RichDocEditor 的 maxWidth / padding 一致） */
export const DOC_EDITOR_MAX_WIDTH = 800;
export const DOC_EDITOR_CONTENT_PADDING_X = 112; // paddingLeft 64 + paddingRight 48
/** 表格左侧行号/列头 gutter（与 DocTableBlock GUTTER 一致） */
export const DOC_TABLE_GUTTER_WIDTH = 10;
/** 表格行列插入按钮直径 */
export const DOC_TABLE_INSERT_BTN_SIZE = 14;
/** 表格列宽之和的默认目标值 = 文档内容区宽度 - gutter */
export const DOC_TABLE_CONTENT_WIDTH =
  DOC_EDITOR_MAX_WIDTH - DOC_EDITOR_CONTENT_PADDING_X - DOC_TABLE_GUTTER_WIDTH;

/** 将列宽均分至目标总宽度（用于 Markdown 粘贴等场景） */
export function fitTableColumnWidths(
  cols: number,
  totalWidth: number = DOC_TABLE_CONTENT_WIDTH,
): number[] {
  if (cols <= 0) return [];
  const minTotal = cols * DOC_TABLE_MIN_COL_WIDTH;
  const target = Math.max(totalWidth, minTotal);
  const base = Math.floor(target / cols);
  const remainder = target - base * cols;
  return Array.from({ length: cols }, (_, i) => base + (i < remainder ? 1 : 0));
}

export function ensureTableSizes(block: TableBlock): { columnWidths: number[]; rowHeights: number[] } {
  const columnWidths = [...(block.columnWidths ?? [])];
  const rowHeights = [...(block.rowHeights ?? [])];
  while (columnWidths.length < block.cols) columnWidths.push(DOC_TABLE_DEFAULT_COL_WIDTH);
  while (columnWidths.length > block.cols) columnWidths.pop();
  while (rowHeights.length < block.rows) rowHeights.push(DOC_TABLE_DEFAULT_ROW_HEIGHT);
  while (rowHeights.length > block.rows) rowHeights.pop();
  return { columnWidths, rowHeights };
}

export function createEmptyTable(rows: number, cols: number): TableBlock {
  const r = Math.max(1, rows);
  const c = Math.max(1, cols);
  const cells: TableCell[][] = Array.from({ length: r }, () =>
    Array.from({ length: c }, () => createEmptyTableCell()),
  );
  return {
    type: 'table', id: genBlockId(), rows: r, cols: c, cells,
    columnWidths: fitTableColumnWidths(c),
    rowHeights: Array.from({ length: r }, () => DOC_TABLE_DEFAULT_ROW_HEIGHT),
  };
}

export function updateTableCell(
  block: TableBlock,
  row: number,
  col: number,
  cell: TableCell,
): TableBlock {
  const cells = block.cells.map((r, ri) =>
    r.map((cellItem, ci) => (ri === row && ci === col ? cell : cellItem)),
  );
  return { ...block, cells };
}

export function addTableRow(block: TableBlock, afterRow?: number): TableBlock {
  const insertAt = afterRow == null ? block.rows : afterRow + 1;
  const { columnWidths, rowHeights } = ensureTableSizes(block);
  const newRow = Array.from({ length: block.cols }, () => createEmptyTableCell());
  const cells = [...block.cells];
  cells.splice(insertAt, 0, newRow);
  const nextRowHeights = [...rowHeights];
  nextRowHeights.splice(insertAt, 0, DOC_TABLE_DEFAULT_ROW_HEIGHT);
  return { ...block, rows: block.rows + 1, cells, rowHeights: nextRowHeights, columnWidths };
}

export function addTableColumn(block: TableBlock, afterCol?: number): TableBlock {
  const insertAt = afterCol == null ? block.cols : afterCol + 1;
  const { columnWidths, rowHeights } = ensureTableSizes(block);
  const cells = block.cells.map(row => {
    const next = [...row];
    next.splice(insertAt, 0, createEmptyTableCell());
    return next;
  });
  const nextColWidths = [...columnWidths];
  nextColWidths.splice(insertAt, 0, DOC_TABLE_DEFAULT_COL_WIDTH);
  return { ...block, cols: block.cols + 1, cells, columnWidths: nextColWidths, rowHeights };
}

export function removeTableRow(block: TableBlock, rowIndex: number): TableBlock {
  if (block.rows <= 1) return block;
  const { columnWidths, rowHeights } = ensureTableSizes(block);
  const cells = block.cells.filter((_, i) => i !== rowIndex);
  const nextRowHeights = rowHeights.filter((_, i) => i !== rowIndex);
  return { ...block, rows: block.rows - 1, cells, rowHeights: nextRowHeights, columnWidths };
}

export function removeTableColumn(block: TableBlock, colIndex: number): TableBlock {
  if (block.cols <= 1) return block;
  const { columnWidths, rowHeights } = ensureTableSizes(block);
  const cells = block.cells.map(row => row.filter((_, i) => i !== colIndex));
  const nextColWidths = columnWidths.filter((_, i) => i !== colIndex);
  return { ...block, cols: block.cols - 1, cells, columnWidths: nextColWidths, rowHeights };
}

/** 删除多个行（索引降序删除） */
export function removeTableRows(block: TableBlock, rowIndices: number[]): TableBlock {
  let next = block;
  [...rowIndices].sort((a, b) => b - a).forEach(i => { next = removeTableRow(next, i); });
  return next;
}

/** 删除多个列（索引降序删除） */
export function removeTableColumns(block: TableBlock, colIndices: number[]): TableBlock {
  let next = block;
  [...colIndices].sort((a, b) => b - a).forEach(i => { next = removeTableColumn(next, i); });
  return next;
}

export function createEmptyDocument(documentId = '', title = '未命名文档'): RichDocumentJSON {
  return {
    documentId,
    title,
    content: [createEmptyParagraph()],
  };
}

/** 为 JSON 块补全 id */
export function normalizeBlocks(raw: unknown[]): DocBlock[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [createEmptyParagraph()];
  }
  return raw.map(item => {
    const b = item as DocBlock;
    const id = b.id || genBlockId();
    switch (b.type) {
      case 'heading':
        return {
          ...b, id, level: b.level || 1, text: b.text ?? '', marks: b.marks ?? [],
          firstLineIndent: !!b.firstLineIndent, indentLevel: b.indentLevel ?? 0,
        };
      case 'paragraph':
        return {
          ...b, id, text: b.text ?? '', marks: b.marks ?? [], align: b.align ?? 'left',
          firstLineIndent: !!b.firstLineIndent, indentLevel: b.indentLevel ?? 0,
        };
      case 'list':
        return {
          ...b,
          id,
          listType: b.listType || 'bullet',
          items: (b.items ?? []).map((it: ListItem) => ({
            text: it.text ?? '',
            level: it.level ?? 1,
            checked: !!it.checked,
            marks: it.marks ?? [],
          })),
        };
      case 'quote':
        return {
          ...b, id, text: b.text ?? '', marks: b.marks ?? [],
          firstLineIndent: !!b.firstLineIndent, indentLevel: b.indentLevel ?? 0,
        };
      case 'code': {
        if ((b.language ?? '').toLowerCase() === 'mermaid') {
          return {
            type: 'mermaid', id, text: b.text ?? '',
            collapsed: !!b.collapsed, height: b.height,
          };
        }
        return {
          ...b, id, text: b.text ?? '',
          language: b.language, collapsed: !!b.collapsed,
          height: b.height, wordWrap: !!b.wordWrap,
        };
      }
      case 'mermaid':
        return {
          type: 'mermaid', id, text: b.text ?? '',
          collapsed: !!b.collapsed, height: b.height,
        };
      case 'table': {
        const rows = Math.max(1, b.rows ?? 1);
        const cols = Math.max(1, b.cols ?? 1);
        const cells: TableCell[][] = (b.cells ?? []).map(row =>
          (row ?? []).map((cell: TableCell) => ({
            text: cell?.text ?? '',
            marks: cell?.marks ?? [],
            align: cell?.align ?? 'left',
            verticalAlign: cell?.verticalAlign ?? 'top',
            cellStyle: cell?.cellStyle ?? 'paragraph',
          })),
        );
        while (cells.length < rows) cells.push(Array.from({ length: cols }, () => createEmptyTableCell()));
        while (cells.length > rows) cells.pop();
        for (const row of cells) {
          while (row.length < cols) row.push(createEmptyTableCell());
          while (row.length > cols) row.pop();
        }
        const { columnWidths, rowHeights } = ensureTableSizes({ ...b, rows, cols, cells } as TableBlock);
        return { type: 'table', id, rows, cols, cells, columnWidths, rowHeights };
      }
      case 'divider':
        return { type: 'divider', id };
      case 'image':
        return {
          ...b, id, url: b.url ?? '', width: b.width, align: b.align ?? 'left',
          alt: b.alt, caption: b.caption, imageStyle: b.imageStyle ?? 'none', rotation: b.rotation ?? 0,
          link: b.link, naturalWidth: b.naturalWidth, naturalHeight: b.naturalHeight,
        };
      case 'base': {
        const bb = b as BaseBlock;
        const view = bb.activeViewType as BaseEmbedViewType;
        const validViews: BaseEmbedViewType[] = ['grid', 'kanban', 'gantt', 'gallery'];
        const sheetData = bb.sheetData;
        return {
          type: 'base',
          id,
          title: typeof bb.title === 'string' ? bb.title : undefined,
          activeViewType: validViews.includes(view) ? view : 'grid',
          sheetData:
            sheetData && typeof sheetData === 'object' && !Array.isArray(sheetData)
              ? (sheetData as Record<string, unknown>)
              : {},
        };
      }
      case 'whiteboard': {
        const wb = b as WhiteboardBlock;
        return {
          type: 'whiteboard',
          id,
          title: typeof wb.title === 'string' ? wb.title : '画板',
          whiteboardData: normalizeWhiteboardBlockData(wb.whiteboardData),
        };
      }
      default:
        return createEmptyParagraph();
    }
  });
}

export function exportDocumentJSON(docId: string, title: string, blocks: DocBlock[]): RichDocumentJSON {
  return {
    documentId: docId,
    title,
    content: blocks.map(stripBlockId),
  };
}

function stripBlockId(block: DocBlock): DocBlock {
  const { id: _id, ...rest } = block as DocBlock & { id: string };
  return rest as DocBlock;
}

export function importDocumentJSON(json: RichDocumentJSON): { blocks: DocBlock[]; title: string; documentId: string } {
  return {
    documentId: json.documentId || '',
    title: json.title || '未命名文档',
    blocks: normalizeBlocks(json.content as unknown[]),
  };
}

/** 将 marks 按位置排序并渲染为 HTML 片段（支持 \n 软换行） */
export function marksToHtml(text: string, marks: TextMark[]): string {
  if (!text) return '';
  if (!text.includes('\n')) return renderMarkedLine(text, marks);

  const lines = text.split('\n');
  let offset = 0;
  return lines.map(line => {
    const lineMarks = marks
      .filter(m => m.end > offset && m.start < offset + line.length)
      .map(m => ({
        ...m,
        start: Math.max(0, m.start - offset),
        end: Math.min(line.length, m.end - offset),
      }));
    const html = line.length === 0 ? '\u200B' : renderMarkedLine(line, lineMarks);
    offset += line.length + 1;
    return html;
  }).join('<br>');
}

function renderMarkedLine(text: string, marks: TextMark[]): string {
  if (!text) return '';
  if (!marks.length) return escapeHtml(text);

  const sorted = [...marks]
    .filter(m => m.start < m.end && m.start >= 0 && m.end <= text.length)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const boundaries = new Set<number>([0, text.length]);
  for (const m of sorted) {
    boundaries.add(m.start);
    boundaries.add(m.end);
  }
  const points = [...boundaries].sort((a, b) => a - b);

  let html = '';
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (start >= end) continue;
    const segment = escapeHtml(text.slice(start, end));
    const active = sorted.filter(m => m.start <= start && m.end >= end);
    html += wrapSegment(segment, active);
  }
  return html || escapeHtml(text);
}

function wrapSegment(segment: string, marks: TextMark[]): string {
  if (!marks.length) return segment;
  let result = segment;
  const order: MarkType[] = ['link', 'color', 'background', 'fontSize', 'bold', 'italic', 'underline', 'strikethrough'];
  const sorted = [...marks].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  for (const m of sorted) {
    switch (m.type) {
      case 'bold':
        result = `<strong>${result}</strong>`;
        break;
      case 'italic':
        result = `<em>${result}</em>`;
        break;
      case 'underline':
        result = `<u>${result}</u>`;
        break;
      case 'strikethrough':
        result = `<s>${result}</s>`;
        break;
      case 'color':
        result = `<span style="color:${m.value || '#1F2329'}">${result}</span>`;
        break;
      case 'background':
        result = `<span style="background:${m.value || '#fff566'}">${result}</span>`;
        break;
      case 'fontSize':
        result = `<span style="font-size:${m.value || '15px'}">${result}</span>`;
        break;
      case 'link':
        result = `<a href="${escapeAttr(m.value || '#')}" target="_blank" rel="noopener noreferrer">${result}</a>`;
        break;
      default:
        break;
    }
  }
  return result;
}

type MarkType = TextMark['type'];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;');
}

/** 从 contenteditable 提取纯文本（保留软换行） */
export function extractPlainText(el: HTMLElement): string {
  return el.innerText.replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n');
}

/** 获取 contenteditable 内光标字符偏移（含 <br> 软换行，与 extractContentFromEditable 计数一致） */
export function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return extractContentFromEditable(el).text.length;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return extractContentFromEditable(el).text.length;

  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  const temp = document.createElement('div');
  temp.appendChild(pre.cloneContents());
  return extractContentFromEditable(temp).text.length;
}

/** 设置 contenteditable 内光标字符偏移（与 getCaretOffset / extractContentFromEditable 计数一致，含 <br>） */
export function setCaretOffset(el: HTMLElement, offset: number): void {
  const sel = window.getSelection();
  if (!sel) return;

  const collapseAtEnd = () => {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  if (offset <= 0) {
    const range = document.createRange();
    if (el.firstChild) {
      range.setStart(el, 0);
    } else {
      range.selectNodeContents(el);
      range.collapse(true);
    }
    sel.removeAllRanges();
    sel.addRange(range);
    return;
  }

  let remaining = offset;

  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const raw = node.textContent ?? '';
      const len = raw.replace(/\u00a0/g, ' ').length;
      if (remaining <= len) {
        const range = document.createRange();
        range.setStart(node, remaining);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      }
      remaining -= len;
      return false;
    }
    if (node.nodeName === 'BR') {
      if (remaining <= 0) {
        const range = document.createRange();
        range.setStartBefore(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      }
      if (remaining <= 1) {
        const range = document.createRange();
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      }
      remaining -= 1;
      return false;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      for (const child of Array.from(node.childNodes)) {
        if (walk(child)) return true;
      }
    }
    return false;
  };

  for (const child of Array.from(el.childNodes)) {
    if (walk(child)) return;
  }
  collapseAtEnd();
}

/** 在光标处拆分 marks */
export function splitMarks(marks: TextMark[], offset: number): [TextMark[], TextMark[]] {
  const before: TextMark[] = [];
  const after: TextMark[] = [];
  for (const m of marks) {
    if (m.end <= offset) {
      before.push(m);
    } else if (m.start >= offset) {
      after.push({ ...m, start: m.start - offset, end: m.end - offset });
    } else {
      before.push({ ...m, end: offset });
      after.push({ ...m, start: 0, end: m.end - offset });
    }
  }
  return [before, after];
}

/** 块拆分时去掉新块段首软换行，避免光标落在空行上 */
export function stripLeadingNewlines(
  text: string,
  marks: TextMark[],
): { text: string; marks: TextMark[] } {
  let skip = 0;
  while (skip < text.length && text[skip] === '\n') skip++;
  if (skip === 0) return { text, marks: normalizeMarks(marks, text.length) };
  const nextText = text.slice(skip);
  const nextMarks = normalizeMarks(
    marks
      .filter(m => m.end > skip)
      .map(m => ({
        ...m,
        start: Math.max(0, m.start - skip),
        end: m.end - skip,
      })),
    nextText.length,
  );
  return { text: nextText, marks: nextMarks };
}

/** 合并重叠 marks */
export function normalizeMarks(marks: TextMark[], textLen: number): TextMark[] {
  return marks
    .filter(m => m.start < m.end && m.start >= 0 && m.end <= textLen)
    .sort((a, b) => a.start - b.start);
}

export function marksEqual(a: TextMark[] | undefined, b: TextMark[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  return left.every((m, i) => {
    const o = right[i];
    return m.type === o.type && m.start === o.start && m.end === o.end && m.value === o.value;
  });
}

export function toggleMark(
  marks: TextMark[],
  textLen: number,
  type: TextMark['type'],
  selStart: number,
  selEnd: number,
  value?: string,
): TextMark[] {
  if (selStart === selEnd && type !== 'fontSize' && type !== 'color' && type !== 'background') {
    return marks;
  }
  const start = Math.min(selStart, selEnd);
  const end = Math.max(selStart, selEnd);
  if (start === end) return marks;

  const existing = marks.some(m =>
    m.type === type && m.start <= start && m.end >= end &&
    (value === undefined || m.value === value),
  );

  const filtered = marks.filter(m => {
    if (m.type !== type) return true;
    if (value !== undefined && m.value !== value) return true;
    return m.end <= start || m.start >= end;
  });

  if (existing) return normalizeMarks(filtered, textLen);

  return normalizeMarks([...filtered, { type, start, end, value }], textLen);
}

export function blockToParagraphStyle(block: DocBlock): import('./types').ParagraphStyle {
  if (block.type === 'heading') {
    return `heading${block.level}` as import('./types').ParagraphStyle;
  }
  if (block.type === 'quote') return 'paragraph';
  return 'paragraph';
}

export function applyParagraphStyle(block: DocBlock, style: import('./types').ParagraphStyle): DocBlock {
  const text = getBlockText(block);
  const marks = getBlockMarks(block);
  const align = 'align' in block ? block.align : 'left';

  if (style === 'paragraph') {
    return {
      type: 'paragraph', id: block.id, text, marks, align: align as 'left' | 'center' | 'right',
      firstLineIndent: isTextBlock(block) ? block.firstLineIndent : undefined,
      indentLevel: isTextBlock(block) ? block.indentLevel : undefined,
    };
  }
  const level = Number(style.replace('heading', '')) as 1 | 2 | 3 | 4 | 5 | 6;
  return {
    type: 'heading', id: block.id, level, text, marks, align: align as 'left' | 'center' | 'right',
    firstLineIndent: isTextBlock(block) ? block.firstLineIndent : undefined,
    indentLevel: isTextBlock(block) ? block.indentLevel : undefined,
  };
}

export function getBlockText(block: DocBlock): string {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'quote':
    case 'code':
      return block.text;
    case 'mermaid':
      return block.text;
    case 'list':
      return block.items.map(i => i.text).join('\n');
    default:
      return '';
  }
}

export function getBlockMarks(block: DocBlock): TextMark[] {
  if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'quote') {
    return block.marks;
  }
  return [];
}

export function isTextBlock(block: DocBlock): block is HeadingBlock | ParagraphBlock | QuoteBlock {
  return block.type === 'heading' || block.type === 'paragraph' || block.type === 'quote';
}

export function isListBlock(block: DocBlock): block is ListBlock {
  return block.type === 'list';
}

export const INDENT_STEP_PX = 24;
export const FIRST_LINE_INDENT = '2em';

type IndentableBlock = HeadingBlock | ParagraphBlock | QuoteBlock;

export function getBlockIndentStyle(block: IndentableBlock): {
  textIndent?: string;
  paddingLeft?: number;
} {
  const level = block.indentLevel ?? 0;
  const basePadding = block.type === 'quote' ? 12 : 0;
  return {
    textIndent: block.firstLineIndent ? FIRST_LINE_INDENT : undefined,
    paddingLeft: basePadding + level * INDENT_STEP_PX || undefined,
  };
}

/** Tab 增加缩进：无缩进时首行缩进，已有缩进时整段增加一级 */
export function increaseBlockIndent(block: IndentableBlock): IndentableBlock {
  if (!block.firstLineIndent && !(block.indentLevel ?? 0)) {
    return { ...block, firstLineIndent: true };
  }
  return { ...block, indentLevel: (block.indentLevel ?? 0) + 1 };
}

/** Shift+Tab / 减少缩进 */
export function decreaseBlockIndent(block: IndentableBlock): IndentableBlock {
  const level = block.indentLevel ?? 0;
  if (level > 0) {
    return { ...block, indentLevel: level - 1 };
  }
  if (block.firstLineIndent) {
    return { ...block, firstLineIndent: false };
  }
  return block;
}

/** 对整段文字应用行内颜色/背景 marks */
export function applyBlockTextMark(
  block: IndentableBlock,
  type: 'color' | 'background',
  color: string,
): IndentableBlock {
  const len = block.text.length;
  const marks = block.marks.filter(m => m.type !== type);
  if (type === 'background' && color === 'transparent') {
    return { ...block, marks: normalizeMarks(marks, len) };
  }
  if (len === 0) return { ...block, marks: normalizeMarks(marks, len) };
  return {
    ...block,
    marks: normalizeMarks([...marks, { type, start: 0, end: len, value: color }], len),
  };
}

export function cloneDocBlock(block: DocBlock): DocBlock {
  const cloned = JSON.parse(JSON.stringify(block)) as DocBlock;
  cloned.id = genBlockId();
  return cloned;
}

export function getBlockHandleLabel(block: DocBlock): string | null {
  if (block.type === 'heading') return `H${block.level}`;
  if (block.type === 'paragraph') return 'T';
  if (block.type === 'quote') return '❝';
  if (block.type === 'code') return '</>';
  if (block.type === 'mermaid') return '◇';
  if (block.type === 'table') return '▦';
  if (block.type === 'base') return '▦';
  if (block.type === 'whiteboard') return '画';
  if (block.type === 'list') {
    if (block.listType === 'ordered') return '1.';
    if (block.listType === 'task') return '☑';
    return '•';
  }
  return null;
}

export function supportsBlockHandle(block: DocBlock): boolean {
  return block.type === 'paragraph' || block.type === 'heading' || block.type === 'table' || block.type === 'base' || block.type === 'whiteboard';
}

/** 罗马数字（1–3999，飞书 3 级列表用 i / ii / iii） */
export function toRomanNumeral(n: number, upper = false): string {
  if (n <= 0 || n >= 4000) return String(n);
  const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const syms = upper
    ? ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I']
    : ['m', 'cm', 'd', 'cd', 'c', 'xc', 'l', 'xl', 'x', 'ix', 'v', 'iv', 'i'];
  let num = n;
  let result = '';
  for (let i = 0; i < vals.length; i += 1) {
    while (num >= vals[i]) {
      result += syms[i];
      num -= vals[i];
    }
  }
  return result;
}

/** 中文数字（1–99，含 十一、二十 等） */
export function toChineseNumber(n: number): string {
  if (n <= 0) return String(n);
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (n < 10) return digits[n];
  if (n === 10) return '十';
  if (n < 20) return `十${digits[n - 10]}`;
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return ones === 0 ? `${digits[tens]}十` : `${digits[tens]}十${digits[ones]}`;
  }
  return String(n);
}

function formatListCounter(numFmt: string | undefined, counter: number): string {
  switch (numFmt) {
    case 'chineseCounting':
    case 'chineseCountingThousand':
      return `${toChineseNumber(counter)}、`;
    case 'lowerLetter':
      return `${String.fromCharCode(96 + ((counter - 1) % 26) + 1)}.`;
    case 'upperLetter':
      return `${String.fromCharCode(64 + ((counter - 1) % 26) + 1)}.`;
    case 'lowerRoman':
      return `${toRomanNumeral(counter, false)}.`;
    case 'upperRoman':
      return `${toRomanNumeral(counter, true)}.`;
    case 'bullet':
      return '•';
    default:
      return `${counter}.`;
  }
}

/** 飞书 3 级编号：1→decimal / 2→lowerLetter / 3→lowerRoman */
export function getOrderedNumFmtForLevel(level: number): string {
  const lv = Math.min(Math.max(1, level), 3);
  if (lv === 1) return 'decimal';
  if (lv === 2) return 'lowerLetter';
  return 'lowerRoman';
}

/** 有序列表项按层级独立递归计数 */
export function orderedListMarker(items: ListItem[], index: number): string {
  const counters: number[] = [];
  for (let i = 0; i <= index; i += 1) {
    const level = Math.min(Math.max(1, items[i].level ?? 1), 3);
    const lvl = level - 1;
    while (counters.length > lvl + 1) counters.pop();
    counters[lvl] = (counters[lvl] ?? 0) + 1;
  }
  const item = items[index];
  const level = Math.min(Math.max(1, item.level ?? 1), 3);
  const lvl = level - 1;
  const numFmt = getOrderedNumFmtForLevel(level);
  return formatListCounter(numFmt, counters[lvl] ?? 1);
}

type ActiveMark = { type: TextMark['type']; value?: string };

const EXEC_FONT_SIZE_PX: Record<string, string> = {
  '1': '10px',
  '2': '13px',
  '3': '16px',
  '4': '18px',
  '5': '24px',
  '6': '32px',
  '7': '48px',
};

function cssColorToHex(color: string): string | undefined {
  if (!color) return undefined;
  if (color.startsWith('#')) return color;
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return undefined;
  const hex = (n: string) => Number(n).toString(16).padStart(2, '0');
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
}

function marksFromElement(el: HTMLElement): ActiveMark[] {
  const marks: ActiveMark[] = [];
  let node: HTMLElement | null = el;
  while (node) {
    if (node.dataset.docEditable !== undefined || node.dataset.listRoot !== undefined) break;
    const tag = node.tagName.toLowerCase();
    if (tag === 'strong' || tag === 'b') marks.push({ type: 'bold' });
    if (tag === 'em' || tag === 'i') marks.push({ type: 'italic' });
    if (tag === 'u') marks.push({ type: 'underline' });
    if (tag === 's' || tag === 'strike') marks.push({ type: 'strikethrough' });
    if (tag === 'a') marks.push({ type: 'link', value: node.getAttribute('href') || undefined });
    if (tag === 'font') {
      const sizeAttr = node.getAttribute('size');
      if (sizeAttr && EXEC_FONT_SIZE_PX[sizeAttr]) {
        marks.push({ type: 'fontSize', value: EXEC_FONT_SIZE_PX[sizeAttr] });
      }
      const fontColor = node.getAttribute('color');
      if (fontColor) {
        const hex = cssColorToHex(fontColor) ?? (fontColor.startsWith('#') ? fontColor : undefined);
        if (hex) marks.push({ type: 'color', value: hex });
      }
    }
    const color = cssColorToHex(node.style.color);
    if (color) marks.push({ type: 'color', value: color });
    const bg = cssColorToHex(node.style.backgroundColor);
    if (bg && bg !== '#000000') marks.push({ type: 'background', value: bg });
    if (node.style.fontSize) marks.push({ type: 'fontSize', value: node.style.fontSize });
    node = node.parentElement;
  }
  return marks;
}

/** 从 contenteditable DOM 提取纯文本与 marks */
export function extractContentFromEditable(el: HTMLElement): { text: string; marks: TextMark[] } {
  const marks: TextMark[] = [];
  let text = '';

  const pushSegment = (segment: string, active: ActiveMark[]) => {
    if (!segment) return;
    const start = text.length;
    text += segment;
    const end = text.length;
    for (const m of active) {
      marks.push({ type: m.type, start, end, value: m.value });
    }
  };

  const walk = (node: Node, inherited: ActiveMark[]) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const raw = (node.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\u200B/g, '');
      pushSegment(raw, inherited);
      return;
    }
    if (node.nodeName === 'BR') {
      text += '\n';
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const elem = node as HTMLElement;
      const own = marksFromElement(elem);
      const combined = [...inherited];
      for (const m of own) {
        if (!combined.some(c => c.type === m.type && c.value === m.value)) combined.push(m);
      }
      elem.childNodes.forEach(child => walk(child, combined));
    }
  };

  el.childNodes.forEach(child => walk(child, []));
  return { text, marks: normalizeMarks(marks, text.length) };
}
