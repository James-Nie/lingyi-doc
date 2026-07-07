import type { DocBlock, TextMark, ListType, TableBlock } from './types';
import {
  genBlockId,
  createEmptyParagraph,
  createEmptyTableCell,
  createEmptyTable,
  splitMarks,
  isTextBlock,
  ensureTableSizes,
  fitTableColumnWidths,
  DOC_TABLE_DEFAULT_COL_WIDTH,
  DOC_TABLE_DEFAULT_ROW_HEIGHT,
} from './utils';
import { normalizeOrderedListItems, normalizeBulletListItems, clampListLevel } from './listOps';

const HEADING_RE = /^(#{1,4})\s+(.+)$/;
const HR_RE = /^(\*{3,}|-{3,}|_{3,})\s*$/;
const QUOTE_RE = /^>\s?(.*)$/;
const UL_RE = /^(\s*)([-*+])\s+(.+)$/;
const OL_RE = /^(\s*)(\d+)\.\s+(.+)$/;
const TASK_RE = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.+)$/;
const FENCE_RE = /^(`{3,}|~{3,})([\w-]*)?\s*$/;

function isTableSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('-')) return false;
  const stripped = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|').join('');
  return /^[\s:|-]+$/.test(stripped) && /-{2,}/.test(stripped);
}

function isTableRowLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (isTableSeparatorLine(trimmed)) return true;
  return trimmed.includes('|') && parseTableRow(trimmed) != null;
}

const DEFAULT_CODE_HEIGHT = 200;
const LINE_HEIGHT = 22;

const MARKDOWN_MIME_TYPES = [
  'text/markdown',
  'text/x-markdown',
  'application/x-markdown',
] as const;

function normalizeClipboardNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\uFEFF/, '');
}

function htmlToPlainText(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html;
  return normalizeClipboardNewlines(el.innerText || el.textContent || '');
}

function extractPreformattedFromHtml(html: string): string {
  const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (!preMatch) return '';
  const el = document.createElement('div');
  el.innerHTML = preMatch[1];
  return normalizeClipboardNewlines(el.textContent || '');
}

/** 从 DataTransfer 读取最适合 Markdown 检测的纯文本 */
export function getClipboardTextFromDataTransfer(dt: DataTransfer | null | undefined): string {
  if (!dt) return '';

  // 优先直接读取 text/plain（不依赖 types 列表，部分浏览器 types 为空但 getData 可用）
  try {
    const plain = normalizeClipboardNewlines(dt.getData('text/plain'));
    if (plain.length > 0) return plain;
  } catch {
    // ignore
  }

  const types = typeof dt.types !== 'undefined' ? Array.from(dt.types as unknown as string[]) : [];

  for (const mime of MARKDOWN_MIME_TYPES) {
    if (types.length > 0 && !types.includes(mime)) continue;
    try {
      const text = normalizeClipboardNewlines(dt.getData(mime));
      if (text.trim()) return text;
    } catch {
      // ignore unsupported mime
    }
  }

  try {
    const text = normalizeClipboardNewlines(dt.getData('text'));
    if (text.trim()) return text;
  } catch {
    // ignore
  }

  try {
    const html = dt.getData('text/html');
    if (html) {
      const fromPre = extractPreformattedFromHtml(html);
      if (fromPre.trim()) return fromPre;
      // 部分编辑器将 markdown 源放在 html 注释或 code 标签中
      const codeMatch = html.match(/<code[^>]*>([\s\S]*?)<\/code>/i);
      if (codeMatch) {
        const el = document.createElement('div');
        el.innerHTML = codeMatch[1];
        const fromCode = normalizeClipboardNewlines(el.textContent || '');
        if (fromCode.trim() && looksLikeMarkdown(fromCode)) return fromCode;
      }
      const plain = htmlToPlainText(html);
      if (plain.trim()) return plain;
    }
  } catch {
    // ignore
  }

  return '';
}

/** 从剪贴板事件读取纯文本 */
export function getClipboardPlainText(e: ClipboardEvent): string {
  return getClipboardTextFromDataTransfer(e.clipboardData);
}

/** 检测粘贴文本是否像 Markdown */
export function looksLikeMarkdown(text: string): boolean {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return false;

  const lines = normalized.split('\n');
  let score = 0;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (HEADING_RE.test(t)) score += 2;
    if (FENCE_RE.test(t)) score += 3;
    if (HR_RE.test(t)) score += 2;
    if (QUOTE_RE.test(t)) score += 1;
    if (TASK_RE.test(line)) score += 2;
    if (UL_RE.test(line) || OL_RE.test(line)) score += 1;
    if (isTableSeparatorLine(t) || (t.includes('|') && t.split('|').length >= 3)) score += 2;
  }

  if (score >= 1) return true;

  if (/\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`|\[[^\]]+\]\([^)]+\)/.test(normalized)) {
    return true;
  }

  if (/^#{1,4}\s+\S/m.test(normalized)) return true;
  if (/^```/m.test(normalized)) return true;
  if (/^```\s*mermaid/im.test(normalized)) return true;
  if (/^>\s/m.test(normalized)) return true;
  if (/^[-*+]\s+\S/m.test(normalized)) return true;
  if (/^\d+\.\s+\S/m.test(normalized)) return true;
  if (/^\|.+\|/m.test(normalized) && normalized.split('\n').some(isTableSeparatorLine)) return true;

  // 围栏代码块（任意位置）
  if (/```[\s\S]*?```/.test(normalized)) return true;

  // 多行文本且包含典型 Markdown 特征
  if (lines.length >= 2 && normalized.length >= 12) {
    if (/^#{1,6}\s/m.test(normalized)) return true;
    if (/(\*\*|__|~~|`|\[[^\]]+\]\([^)]+\))/.test(normalized)) return true;
    if (/^[\s]*[-*+]\s/m.test(normalized)) return true;
    if (/^[\s]*\d+\.\s/m.test(normalized)) return true;
  }

  return false;
}

/** 解析行内 Markdown 为 text + marks */
export function parseInlineMarkdown(input: string): { text: string; marks: TextMark[] } {
  type Token = { start: number; end: number; type: TextMark['type']; value?: string; raw: string };

  const tokens: Token[] = [];
  const patterns: { re: RegExp; type: TextMark['type']; value?: (m: RegExpMatchArray) => string | undefined }[] = [
    { re: /\[([^\]]+)\]\(([^)]+)\)/g, type: 'link', value: m => m[2] },
    { re: /\*\*([^*]+)\*\*/g, type: 'bold' },
    { re: /__([^_]+)__/g, type: 'bold' },
    { re: /\*([^*]+)\*/g, type: 'italic' },
    { re: /_([^_]+)_/g, type: 'italic' },
    { re: /~~([^~]+)~~/g, type: 'strikethrough' },
  ];

  for (const { re, type, value } of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        type,
        value: value?.(m),
        raw: m[0],
      });
    }
  }

  tokens.sort((a, b) => a.start - b.start || b.end - a.end);
  const used: boolean[] = new Array(input.length).fill(false);
  const accepted: Token[] = [];

  for (const tok of tokens) {
    let overlap = false;
    for (let i = tok.start; i < tok.end; i++) {
      if (used[i]) { overlap = true; break; }
    }
    if (overlap) continue;
    for (let i = tok.start; i < tok.end; i++) used[i] = true;
    accepted.push(tok);
  }

  accepted.sort((a, b) => a.start - b.start);

  let text = '';
  const marks: TextMark[] = [];
  let cursor = 0;

  for (const tok of accepted) {
    if (tok.start > cursor) text += input.slice(cursor, tok.start);

    const inner = tok.type === 'link'
      ? (/\[([^\]]+)\]/.exec(tok.raw)?.[1] ?? '')
      : tok.raw.replace(/^(\*\*|__|\*|_|~~)/, '').replace(/(\*\*|__|\*|_|~~)$/, '');

    const start = text.length;
    text += inner;
    marks.push({ type: tok.type, start, end: text.length, value: tok.value });
    cursor = tok.end;
  }
  text += input.slice(cursor);

  return { text, marks };
}

function makeCodeBlock(text: string, language?: string): DocBlock {
  const lines = text.split('\n').length;
  const autoHeight = Math.max(120, Math.min(480, lines * LINE_HEIGHT + 48));
  return {
    type: 'code',
    id: genBlockId(),
    text,
    language: language || undefined,
    collapsed: false,
    height: autoHeight,
    wordWrap: false,
  };
}

function makeMermaidBlock(text: string): DocBlock {
  const lines = text.split('\n').length;
  const autoHeight = Math.max(160, Math.min(600, lines * LINE_HEIGHT + 80));
  return {
    type: 'mermaid',
    id: genBlockId(),
    text,
    collapsed: false,
    height: autoHeight,
  };
}

function makeHeading(level: 1 | 2 | 3 | 4, raw: string): DocBlock {
  const { text, marks } = parseInlineMarkdown(raw);
  return { type: 'heading', id: genBlockId(), level, text, marks };
}

function makeParagraph(raw: string): DocBlock {
  const { text, marks } = parseInlineMarkdown(raw);
  return { ...createEmptyParagraph(), text, marks };
}

function makeQuote(raw: string): DocBlock {
  const { text, marks } = parseInlineMarkdown(raw);
  return { type: 'quote', id: genBlockId(), text, marks };
}

function makeList(listType: ListType, items: { text: string; level: number; checked?: boolean }[]): DocBlock {
  const mapped = items.map(it => {
    const { text, marks } = parseInlineMarkdown(it.text);
    return { text, level: clampListLevel(it.level), checked: it.checked, marks };
  });
  return {
    type: 'list',
    id: genBlockId(),
    listType,
    items: listType === 'ordered'
      ? normalizeOrderedListItems(mapped)
      : listType === 'bullet'
        ? normalizeBulletListItems(mapped)
        : mapped,
  };
}

/** 将 Markdown 文本解析为 DocBlock 数组 */
export function parseMarkdownToBlocks(source: string): DocBlock[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: DocBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { i++; continue; }

    const fenceMatch = trimmed.match(FENCE_RE);
    if (fenceMatch) {
      const fence = fenceMatch[1][0];
      const language = fenceMatch[2] || undefined;
      i++;
      const codeLines: string[] = [];
      while (i < lines.length) {
        const cl = lines[i].trim();
        if (new RegExp(`^\\${fence}{3,}\\s*$`).test(cl)) break;
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      if (language?.toLowerCase() === 'mermaid') {
        blocks.push(makeMermaidBlock(codeLines.join('\n')));
      } else {
        blocks.push(makeCodeBlock(codeLines.join('\n'), language));
      }
      continue;
    }

    const headingMatch = trimmed.match(HEADING_RE);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 4) as 1 | 2 | 3 | 4;
      blocks.push(makeHeading(level, headingMatch[2]));
      i++;
      continue;
    }

    if (HR_RE.test(trimmed)) {
      blocks.push({ type: 'divider', id: genBlockId() });
      i++;
      continue;
    }

    const quoteMatch = line.match(QUOTE_RE);
    if (quoteMatch) {
      const quoteLines: string[] = [quoteMatch[1]];
      i++;
      while (i < lines.length) {
        const qm = lines[i].match(QUOTE_RE);
        if (!qm) break;
        quoteLines.push(qm[1]);
        i++;
      }
      blocks.push(makeQuote(quoteLines.join('\n')));
      continue;
    }

    const taskMatch = line.match(TASK_RE);
    if (taskMatch) {
      const items: { text: string; level: number; checked?: boolean }[] = [];
      while (i < lines.length) {
        const tm = lines[i].match(TASK_RE);
        if (!tm) break;
        const indent = tm[1].length;
        const level = clampListLevel(Math.floor(indent / 2) + 1);
        items.push({ text: tm[3], level, checked: tm[2].toLowerCase() === 'x' });
        i++;
      }
      blocks.push(makeList('task', items));
      continue;
    }

    const ulMatch = line.match(UL_RE);
    if (ulMatch) {
      const items: { text: string; level: number }[] = [];
      while (i < lines.length) {
        const um = lines[i].match(UL_RE);
        if (!um) break;
        const level = clampListLevel(Math.floor(um[1].length / 2) + 1);
        items.push({ text: um[3], level });
        i++;
      }
      blocks.push(makeList('bullet', items));
      continue;
    }

    const olMatch = line.match(OL_RE);
    if (olMatch) {
      const items: { text: string; level: number }[] = [];
      while (i < lines.length) {
        const om = lines[i].match(OL_RE);
        if (!om) break;
        const level = clampListLevel(Math.floor(om[1].length / 2) + 1);
        items.push({ text: om[3], level });
        i++;
      }
      blocks.push(makeList('ordered', items));
      continue;
    }

    if (isTableRowLine(trimmed)) {
      const tableLines: string[] = [];
      while (i < lines.length) {
        const tl = lines[i].trim();
        if (!tl) break;
        if (!isTableRowLine(tl)) break;
        tableLines.push(tl);
        i++;
      }
      const tableData = parseMarkdownTable(tableLines.join('\n'));
      if (tableData) {
        blocks.push(markdownTableDataToTableBlock(tableData));
        continue;
      }
      i -= tableLines.length;
    }

    const paraLines: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i];
      if (!next.trim()) break;
      if (HEADING_RE.test(next.trim()) || FENCE_RE.test(next.trim()) || HR_RE.test(next.trim())
        || QUOTE_RE.test(next) || TASK_RE.test(next) || UL_RE.test(next) || OL_RE.test(next)
        || isTableRowLine(next.trim())) break;
      paraLines.push(next);
      i++;
    }
    blocks.push(makeParagraph(paraLines.join('\n')));
  }

  return blocks.length ? blocks : [createEmptyParagraph()];
}

function trimMarks(marks: TextMark[], len: number): TextMark[] {
  return marks.filter(m => m.start < len && m.end > 0).map(m => ({
    ...m, start: Math.max(0, m.start), end: Math.min(len, m.end),
  }));
}

/** 在光标处插入 Markdown 解析后的块 */
export function spliceMarkdownBlocks(
  blocks: DocBlock[],
  index: number,
  cursorOffset: number,
  currentText: string,
  currentMarks: TextMark[],
  parsed: DocBlock[],
): DocBlock[] {
  if (!parsed.length) return blocks;

  const current = blocks[index];
  const next = [...blocks];

  if (current?.type === 'paragraph' && !current.text && !currentText) {
    next.splice(index, 1, ...parsed);
    return next.length ? next : [createEmptyParagraph()];
  }

  if (current && isTextBlock(current)) {
    const before = currentText.slice(0, cursorOffset);
    const after = currentText.slice(cursorOffset);
    const [marksBefore, marksAfter] = splitMarks(currentMarks, cursorOffset);

    const parts: DocBlock[] = [];
    if (before) {
      parts.push({ ...current, text: before, marks: trimMarks(marksBefore, before.length) });
    }
    parts.push(...parsed);
    if (after) {
      parts.push({
        ...createEmptyParagraph(),
        text: after,
        marks: trimMarks(marksAfter, after.length),
        ...(current.type !== 'quote' && 'align' in current ? { align: current.align } : {}),
      });
    }

    if (!before && !after && current.type === 'paragraph' && !current.text) {
      next.splice(index, 1, ...parsed);
    } else {
      next.splice(index, 1, ...parts);
    }
    return next.length ? next : [createEmptyParagraph()];
  }

  next.splice(index + 1, 0, ...parsed);
  return next;
}

const HEADING_FONT_SIZES: Record<number, string> = {
  1: '22px', 2: '18px', 3: '16px', 4: '15px',
};

function joinCellSegments(segments: { text: string; marks: TextMark[] }[], sep: string): { text: string; marks: TextMark[] } {
  let text = '';
  const marks: TextMark[] = [];
  segments.forEach((seg, i) => {
    if (i > 0) text += sep;
    const offset = text.length;
    text += seg.text;
    marks.push(...seg.marks.map(m => ({
      ...m,
      start: m.start + offset,
      end: m.end + offset,
    })));
  });
  return { text, marks };
}

function blockToCellSegment(block: DocBlock): { text: string; marks: TextMark[] } {
  if (block.type === 'heading') {
    const marks: TextMark[] = [
      ...block.marks.map(m => ({ ...m })),
      { type: 'bold', start: 0, end: block.text.length },
      { type: 'fontSize', start: 0, end: block.text.length, value: HEADING_FONT_SIZES[block.level] ?? '15px' },
    ];
    return { text: block.text, marks };
  }
  if (block.type === 'paragraph' || block.type === 'quote') {
    return { text: block.text, marks: block.marks };
  }
  if (block.type === 'list') {
    const segments = block.items.map((item, i) => {
      const prefix = block.listType === 'ordered'
        ? `${i + 1}. `
        : block.listType === 'task'
          ? `${item.checked ? '☑ ' : '☐ '}`
          : '• ';
      const parsed = item.marks?.length
        ? { text: item.text, marks: item.marks }
        : parseInlineMarkdown(item.text);
      return {
        text: prefix + parsed.text,
        marks: parsed.marks.map(m => ({
          ...m,
          start: m.start + prefix.length,
          end: m.end + prefix.length,
        })),
      };
    });
    return joinCellSegments(segments, '\n');
  }
  if (block.type === 'code') {
    return {
      text: block.text,
      marks: [{ type: 'fontSize', start: 0, end: block.text.length, value: '13px' }],
    };
  }
  if (block.type === 'mermaid') {
    return { text: block.text, marks: [] };
  }
  if (block.type === 'divider') {
    return { text: '———', marks: [] };
  }
  return { text: '', marks: [] };
}

/** 将 Markdown 块扁平化为单元格富文本 */
export function blocksToCellContent(blocks: DocBlock[]): { text: string; marks: TextMark[] } {
  if (!blocks.length) return { text: '', marks: [] };
  return joinCellSegments(blocks.map(blockToCellSegment), '\n');
}

/** 在单元格光标处合并富文本 */
export function spliceMarkdownIntoCellContent(
  cursorOffset: number,
  currentText: string,
  currentMarks: TextMark[],
  insert: { text: string; marks: TextMark[] },
): { text: string; marks: TextMark[] } {
  const before = currentText.slice(0, cursorOffset);
  const after = currentText.slice(cursorOffset);
  const [marksBefore, marksAfter] = splitMarks(currentMarks, cursorOffset);
  const insOffset = before.length;
  const shiftedInsert = insert.marks.map(m => ({
    ...m,
    start: m.start + insOffset,
    end: m.end + insOffset,
  }));
  const shiftedAfter = marksAfter.map(m => ({
    ...m,
    start: m.start + insOffset + insert.text.length,
    end: m.end + insOffset + insert.text.length,
  }));
  const text = before + insert.text + after;
  return {
    text,
    marks: [
      ...trimMarks(marksBefore, before.length),
      ...shiftedInsert,
      ...trimMarks(shiftedAfter, after.length),
    ],
  };
}

function parseTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return null;
  const cells = trimmed
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(c => c.trim());
  if (cells.length < 2) return null;
  if (cells.every(c => c === '')) return null;
  return cells;
}

/** 解析 Markdown 表格为二维文本数组（不含分隔行） */
export function parseMarkdownTable(source: string): string[][] | null {
  const lines = source.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const rows: string[][] = [];
  let hasSeparator = false;

  for (const line of lines) {
    if (isTableSeparatorLine(line)) {
      hasSeparator = true;
      continue;
    }
    const cells = parseTableRow(line);
    if (!cells) return null;
    rows.push(cells);
  }

  if (!rows.length) return null;
  if (!hasSeparator && rows.length < 2) return null;

  const colCount = rows[0].length;
  if (!rows.every(r => r.length === colCount)) return null;
  return rows;
}

/** 从 Markdown 表格数据创建文档 TableBlock（列宽默认撑满文档内容区） */
export function markdownTableDataToTableBlock(data: string[][]): TableBlock {
  const rows = data.length;
  const cols = Math.max(...data.map(r => r.length));
  const block = createEmptyTable(rows, cols);
  const cells = block.cells.map((row, ri) =>
    row.map((cell, ci) => {
      const raw = data[ri]?.[ci] ?? '';
      const { text, marks } = parseInlineMarkdown(raw);
      return { ...cell, text, marks };
    }),
  );
  return { ...block, cells, columnWidths: fitTableColumnWidths(cols) };
}

/** 在文档块列表中插入表格块 */
export function insertTableBlockAt(
  blocks: DocBlock[],
  index: number,
  cursorOffset: number,
  currentText: string,
  currentMarks: TextMark[],
  tableBlock: TableBlock,
): DocBlock[] {
  const current = blocks[index];
  const next = [...blocks];

  if (current?.type === 'paragraph' && !current.text && !currentText) {
    next.splice(index, 1, tableBlock);
    return next.length ? next : [createEmptyParagraph()];
  }

  if (current && isTextBlock(current)) {
    const before = currentText.slice(0, cursorOffset);
    const after = currentText.slice(cursorOffset);
    const [marksBefore, marksAfter] = splitMarks(currentMarks, cursorOffset);
    const parts: DocBlock[] = [];
    if (before) {
      parts.push({ ...current, text: before, marks: trimMarks(marksBefore, before.length) });
    }
    parts.push(tableBlock);
    if (after) {
      parts.push({
        ...createEmptyParagraph(),
        text: after,
        marks: trimMarks(marksAfter, after.length),
        ...(current.type !== 'quote' && 'align' in current ? { align: current.align } : {}),
      });
    }
    if (!before && !after && current.type === 'paragraph' && !current.text) {
      next.splice(index, 1, tableBlock);
    } else {
      next.splice(index, 1, ...parts);
    }
    return next.length ? next : [createEmptyParagraph()];
  }

  next.splice(index + 1, 0, tableBlock);
  return next;
}

/** 将 Markdown 表格数据写入文档表格（从指定单元格起） */
export function applyMarkdownTableToTableBlock(
  block: TableBlock,
  startRow: number,
  startCol: number,
  data: string[][],
): TableBlock {
  const neededRows = startRow + data.length;
  const neededCols = startCol + Math.max(...data.map(r => r.length));

  let rows = block.rows;
  let cols = block.cols;
  let cells = block.cells.map(r => r.map(c => ({ ...c })));

  while (rows < neededRows) {
    cells.push(Array.from({ length: cols }, () => createEmptyTableCell()));
    rows++;
  }
  while (cols < neededCols) {
    cells = cells.map(row => [...row, createEmptyTableCell()]);
    cols++;
  }

  for (let dr = 0; dr < data.length; dr++) {
    for (let dc = 0; dc < data[dr].length; dc++) {
      const { text, marks } = parseInlineMarkdown(data[dr][dc]);
      const ri = startRow + dr;
      const ci = startCol + dc;
      cells[ri][ci] = { ...cells[ri][ci], text, marks };
    }
  }

  const sized = ensureTableSizes({ ...block, rows, cols, cells });
  const columnWidths = [...sized.columnWidths];
  const rowHeights = [...sized.rowHeights];
  while (columnWidths.length < cols) columnWidths.push(DOC_TABLE_DEFAULT_COL_WIDTH);
  while (rowHeights.length < rows) rowHeights.push(DOC_TABLE_DEFAULT_ROW_HEIGHT);

  return { ...block, rows, cols, cells, columnWidths, rowHeights };
}

export { DEFAULT_CODE_HEIGHT, LINE_HEIGHT };
