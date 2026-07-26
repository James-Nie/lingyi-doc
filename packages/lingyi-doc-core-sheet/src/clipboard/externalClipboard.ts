import type { BorderStyle, CellStyle } from '@lingyi-doc/core-types';

/** 外部剪贴板单元格（文本 + 可选样式） */
export interface ClipboardPasteCell {
  text: string;
  style?: Partial<CellStyle>;
}

export type ClipboardPasteGrid = ClipboardPasteCell[][];

export interface ClipboardPasteMerge {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface ClipboardPastePayload {
  grid: ClipboardPasteGrid;
  merges: ClipboardPasteMerge[];
}

const OCCUPIED = Symbol('occupied');
type GridSlot = ClipboardPasteCell | typeof OCCUPIED | undefined;

/** 将剪贴板文本规范为 Unix 换行 */
function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\uFEFF/, '');
}

function isPasteCellEmpty(cell: ClipboardPasteCell): boolean {
  return cell.text === '' && !cell.style;
}

function trimTrailingEmptyRows(grid: ClipboardPasteGrid): ClipboardPasteGrid {
  let end = grid.length;
  while (end > 0 && grid[end - 1].every(isPasteCellEmpty)) {
    end -= 1;
  }
  return grid.slice(0, end);
}

/** 统一各行列数，并去掉末尾空行 */
export function normalizeClipboardGrid(grid: ClipboardPasteGrid): ClipboardPasteGrid {
  const trimmed = trimTrailingEmptyRows(grid);
  if (trimmed.length === 0) return [];
  const maxCols = Math.max(...trimmed.map(row => row.length), 0);
  return trimmed.map(row => {
    const padded: ClipboardPasteCell[] = row.map(cell => ({ text: cell.text ?? '', style: cell.style }));
    while (padded.length < maxCols) padded.push({ text: '' });
    return padded;
  });
}

/** 解析 TSV / 制表符分隔的表格文本（Excel、Numbers 等） */
export function parseTsvGrid(text: string): string[][] {
  const normalized = normalizeNewlines(text);
  if (!normalized.trim()) return [];
  return normalized.split('\n').map(line => line.split('\t'));
}

/** 共享空单元格，避免大表 TSV 为每个空格分配新对象 */
const EMPTY_PASTE_CELL: ClipboardPasteCell = Object.freeze({ text: '' });

function tsvToPasteGrid(text: string): ClipboardPasteGrid {
  const normalized = normalizeNewlines(text);
  if (!normalized.trim()) return [];
  const lines = normalized.split('\n');
  const grid: ClipboardPasteGrid = new Array(lines.length);
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split('\t');
    const row: ClipboardPasteCell[] = new Array(parts.length);
    for (let j = 0; j < parts.length; j++) {
      const cellText = parts[j];
      row[j] = cellText === '' ? EMPTY_PASTE_CELL : { text: cellText };
    }
    grid[i] = row;
  }
  return grid;
}

function cssColorToHex(input: string): string | undefined {
  const value = input.trim().toLowerCase();
  if (!value || value === 'transparent' || value === 'auto' || value === 'inherit') return undefined;

  if (value.startsWith('#')) {
    const hex = value.slice(1);
    if (hex.length === 3) {
      return `#${hex.split('').map(ch => ch + ch).join('').toUpperCase()}`;
    }
    if (hex.length === 6 || hex.length === 8) {
      return `#${hex.slice(-6).toUpperCase()}`;
    }
  }

  const rgbMatch = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
    return `#${toHex(Number(rgbMatch[1]))}${toHex(Number(rgbMatch[2]))}${toHex(Number(rgbMatch[3]))}`.toUpperCase();
  }

  const named: Record<string, string> = {
    black: '#000000',
    white: '#FFFFFF',
    red: '#FF0000',
    green: '#008000',
    blue: '#0000FF',
    yellow: '#FFFF00',
    gray: '#808080',
    grey: '#808080',
    silver: '#C0C0C0',
    maroon: '#800000',
    navy: '#000080',
    teal: '#008080',
    olive: '#808000',
    purple: '#800080',
    aqua: '#00FFFF',
    fuchsia: '#FF00FF',
    lime: '#00FF00',
    windowtext: '#000000',
    window: '#FFFFFF',
    infotext: '#000000',
    infobackground: '#FFFFCC',
    captiontext: '#000000',
  };
  return named[value.replace(/\s+/g, '')];
}

function normalizeCssDeclarations(declarations: string): string {
  return declarations
    .replace(/<!--|-->/g, '')
    .replace(/\s*\n\s*/g, ';')
    .replace(/;;+/g, ';');
}

function parseHtmlColorAttr(color?: string | null): string | undefined {
  if (!color) return undefined;
  const trimmed = color.trim();
  if (/^#?[0-9a-f]{3,8}$/i.test(trimmed)) {
    return cssColorToHex(trimmed.startsWith('#') ? trimmed : `#${trimmed}`);
  }
  return cssColorToHex(trimmed);
}

function mapBorderWidthToStyle(widthPt: number): BorderStyle['style'] {
  if (widthPt >= 2.5) return 'thick';
  if (widthPt >= 1.5) return 'medium';
  return 'thin';
}

function mapBorderKeyword(keyword: string): BorderStyle['style'] | undefined {
  switch (keyword.toLowerCase()) {
    case 'thin':
    case 'hair':
    case 'solid':
      return 'thin';
    case 'medium':
      return 'medium';
    case 'thick':
      return 'thick';
    case 'double':
      return 'double';
    case 'dotted':
      return 'dotted';
    case 'dashed':
    case 'dashdot':
    case 'dashdotdot':
    case 'slanteddashdot':
      return 'dashed';
    default:
      return undefined;
  }
}

function parseBorderSideValue(raw: string): BorderStyle | undefined {
  const value = raw.trim();
  if (!value || /^none$/i.test(value)) return undefined;

  const colorMatch = value.match(/#([0-9a-f]{3,8})/i)
    || value.match(/\brgb[a]?\([^)]+\)/i)
    || value.match(/\b(windowtext|black|white|red|blue|green|yellow|gray|grey)\b/i);
  const widthMatch = value.match(/([\d.]+)\s*pt/i) || value.match(/([\d.]+)\s*px/i);
  const styleMatch = value.match(/\b(thin|medium|thick|double|dotted|dashed|solid|hair|dashdot|dashdotdot|slanteddashdot)\b/i);

  let color = '#000000';
  if (colorMatch) {
    color = cssColorToHex(colorMatch[0]) || color;
  } else {
    const tokens = value.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      const parsed = cssColorToHex(token);
      if (parsed) {
        color = parsed;
        break;
      }
    }
  }

  let style: BorderStyle['style'] = 'thin';
  if (styleMatch) {
    style = mapBorderKeyword(styleMatch[1]) || 'thin';
  }
  if (widthMatch) {
    const width = Number.parseFloat(widthMatch[1]);
    if (!Number.isNaN(width)) {
      style = mapBorderWidthToStyle(width);
    }
  }

  return { color, style };
}

function parseMsoBorderAlt(raw: string): BorderStyle | undefined {
  const value = raw.trim();
  if (!value || /^none$/i.test(value)) return undefined;

  const styleMatch = value.match(/\b(thin|medium|thick|double|dotted|dashed|solid|hair)\b/i);
  const widthMatch = value.match(/([\d.]+)\s*pt/i);
  const colorMatch = value.match(/#([0-9a-f]{3,8})/i)
    || value.match(/\brgb[a]?\([^)]+\)/i)
    || value.match(/\b(windowtext|black|white|red|blue|green|yellow|gray|grey)\b/i);

  let color = '#000000';
  if (colorMatch) {
    color = cssColorToHex(colorMatch[0]) || color;
  }

  let borderStyle: BorderStyle['style'] = 'thin';
  if (styleMatch) {
    borderStyle = mapBorderKeyword(styleMatch[1]) || 'thin';
  }
  if (widthMatch) {
    const width = Number.parseFloat(widthMatch[1]);
    if (!Number.isNaN(width)) {
      borderStyle = mapBorderWidthToStyle(width);
    }
  }

  return { color, style: borderStyle };
}

function parseBorderSides(styleAttr: string, style: Partial<CellStyle>): boolean {
  let hasBorder = false;
  const sides: Array<['borderTop' | 'borderRight' | 'borderBottom' | 'borderLeft', RegExp]> = [
    ['borderTop', /(?:^|;)\s*border-top\s*:\s*([^;]+)/i],
    ['borderRight', /(?:^|;)\s*border-right\s*:\s*([^;]+)/i],
    ['borderBottom', /(?:^|;)\s*border-bottom\s*:\s*([^;]+)/i],
    ['borderLeft', /(?:^|;)\s*border-left\s*:\s*([^;]+)/i],
  ];

  for (const [key, re] of sides) {
    const match = styleAttr.match(re);
    if (!match) continue;
    const parsed = parseBorderSideValue(match[1]);
    if (parsed) {
      style[key] = parsed;
      hasBorder = true;
    }
  }

  const msoAltSides: Array<['borderTop' | 'borderRight' | 'borderBottom' | 'borderLeft', RegExp]> = [
    ['borderTop', /(?:^|;)\s*mso-border-top-alt\s*:\s*([^;]+)/i],
    ['borderRight', /(?:^|;)\s*mso-border-right-alt\s*:\s*([^;]+)/i],
    ['borderBottom', /(?:^|;)\s*mso-border-bottom-alt\s*:\s*([^;]+)/i],
    ['borderLeft', /(?:^|;)\s*mso-border-left-alt\s*:\s*([^;]+)/i],
  ];
  for (const [key, re] of msoAltSides) {
    if (style[key]) continue;
    const match = styleAttr.match(re);
    if (!match) continue;
    const parsed = parseMsoBorderAlt(match[1]);
    if (parsed) {
      style[key] = parsed;
      hasBorder = true;
    }
  }

  const shorthand = styleAttr.match(/(?:^|;)\s*border\s*:\s*([^;]+)/i);
  if (shorthand) {
    const parsed = parseBorderSideValue(shorthand[1]);
    if (parsed) {
      style.borderTop = parsed;
      style.borderRight = parsed;
      style.borderBottom = parsed;
      style.borderLeft = parsed;
      hasBorder = true;
    }
  }

  const msoAlt = styleAttr.match(/(?:^|;)\s*mso-border-alt\s*:\s*([^;]+)/i);
  if (msoAlt && !hasBorder) {
    const parsed = parseMsoBorderAlt(msoAlt[1]);
    if (parsed) {
      style.borderTop = parsed;
      style.borderRight = parsed;
      style.borderBottom = parsed;
      style.borderLeft = parsed;
      hasBorder = true;
    }
  }

  return hasBorder;
}

function parseInlineStyle(styleAttr: string): Partial<CellStyle> | undefined {
  if (!styleAttr.trim()) return undefined;
  const normalized = normalizeCssDeclarations(styleAttr);
  const style: Partial<CellStyle> = {};
  let hasStyle = false;

  const bgMatch = normalized.match(/(?:background(?:-color)?)\s*:\s*([^;]+)/i);
  if (bgMatch) {
    const bg = cssColorToHex(bgMatch[1].trim());
    if (bg) { style.backgroundColor = bg; hasStyle = true; }
  }

  const colorMatch = normalized.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
  if (colorMatch) {
    const color = cssColorToHex(colorMatch[1].trim());
    if (color) { style.fontColor = color; hasStyle = true; }
  }

  if (/font-weight\s*:\s*(bold|[7-9]00)/i.test(normalized) || /mso-font-weight\s*:\s*bold/i.test(normalized)) {
    style.bold = true;
    hasStyle = true;
  }
  if (/font-style\s*:\s*italic/i.test(normalized)) {
    style.italic = true;
    hasStyle = true;
  }
  if (/text-decoration[^:]*:\s*[^;]*underline/i.test(normalized) || /mso-text-underline\s*:\s*single/i.test(normalized)) {
    style.underline = true;
    hasStyle = true;
  }
  if (/text-decoration[^:]*:\s*[^;]*line-through/i.test(normalized)) {
    style.strikethrough = true;
    hasStyle = true;
  }

  const fontSizeMatch = normalized.match(/font-size\s*:\s*([\d.]+)\s*pt/i)
    || normalized.match(/font-size\s*:\s*([\d.]+)\s*px/i);
  if (fontSizeMatch) {
    const size = Number.parseFloat(fontSizeMatch[1]);
    if (!Number.isNaN(size)) {
      style.fontSize = fontSizeMatch[0].includes('px')
        ? Math.round(size)
        : Math.round(size * 1.333);
      hasStyle = true;
    }
  }

  const alignMatch = normalized.match(/text-align\s*:\s*(left|center|right|justify)/i);
  if (alignMatch) {
    style.horizontalAlign = alignMatch[1] as CellStyle['horizontalAlign'];
    hasStyle = true;
  }

  const valignMatch = normalized.match(/vertical-align\s*:\s*(top|middle|bottom|center)/i);
  if (valignMatch) {
    const v = valignMatch[1].toLowerCase();
    style.verticalAlign = (v === 'center' ? 'middle' : v) as CellStyle['verticalAlign'];
    hasStyle = true;
  }

  if (/white-space\s*:\s*normal/i.test(normalized) && /mso-data-placement\s*:\s*same-cell/i.test(normalized)) {
    style.textWrap = true;
    hasStyle = true;
  }

  if (parseBorderSides(normalized, style)) {
    hasStyle = true;
  }

  return hasStyle ? style : undefined;
}

function mergePartialStyles(base: Partial<CellStyle>, extra?: Partial<CellStyle>): Partial<CellStyle> {
  if (!extra) return base;
  return { ...base, ...extra };
}

/** 解析 Excel 剪贴板 HTML 中 <style> 块里的 .xlNN 等 CSS 类（飞书/Office 通用方案） */
function parseExcelStylesheet(doc: Document): Map<string, Partial<CellStyle>> {
  const classStyles = new Map<string, Partial<CellStyle>>();

  doc.querySelectorAll('style').forEach(styleEl => {
    const raw = (styleEl.textContent || '').replace(/<!--|-->/g, '');
    const ruleRe = /\.([a-zA-Z_][\w-]*)\s*\{([^}]*)\}/g;
    let match: RegExpExecArray | null;
    while ((match = ruleRe.exec(raw)) !== null) {
      const className = match[1];
      const parsed = parseInlineStyle(normalizeCssDeclarations(match[2]));
      if (!parsed) continue;
      const prev = classStyles.get(className);
      classStyles.set(className, prev ? mergePartialStyles(prev, parsed) : parsed);
    }
  });

  return classStyles;
}

function parseHtmlCellStyle(
  el: Element,
  classStyles?: Map<string, Partial<CellStyle>>,
): Partial<CellStyle> | undefined {
  let merged: Partial<CellStyle> = {};
  let hasStyle = false;

  const apply = (partial?: Partial<CellStyle>) => {
    if (!partial) return;
    merged = mergePartialStyles(merged, partial);
    hasStyle = true;
  };

  const classAttr = el.getAttribute('class');
  if (classAttr && classStyles) {
    for (const cls of classAttr.trim().split(/\s+/)) {
      if (!cls) continue;
      apply(classStyles.get(cls));
    }
  }

  apply(parseInlineStyle(el.getAttribute('style') || '') ?? undefined);

  const bgAttr = parseHtmlColorAttr(el.getAttribute('bgcolor'));
  if (bgAttr) {
    merged.backgroundColor = bgAttr;
    hasStyle = true;
  }

  const styledNodes = el.querySelectorAll('span, font, b, strong, i, em, u, p');
  styledNodes.forEach(node => {
    apply(parseInlineStyle(node.getAttribute('style') || '') ?? undefined);
    const tag = node.tagName.toLowerCase();
    if (tag === 'b' || tag === 'strong') merged.bold = true;
    if (tag === 'i' || tag === 'em') merged.italic = true;
    if (tag === 'u') merged.underline = true;
    const fontColor = parseHtmlColorAttr(node.getAttribute('color'));
    if (fontColor) merged.fontColor = fontColor;
  });

  if (el.querySelector('b, strong')) merged.bold = true;
  if (el.querySelector('i, em')) merged.italic = true;
  if (el.querySelector('u')) merged.underline = true;

  return hasStyle ? merged : undefined;
}

function extractCellText(el: Element): string {
  return (el.textContent || '').replace(/\u00a0/g, ' ');
}

function maxGridCols(grid: ClipboardPasteGrid): number {
  return Math.max(...grid.map(row => row.length), 0);
}

function dimensionsMatch(a: ClipboardPasteGrid, b: ClipboardPasteGrid): boolean {
  if (a.length !== b.length) return false;
  return maxGridCols(a) === maxGridCols(b);
}

/** 维度匹配时用 TSV 文本覆盖 HTML 文本，保留 HTML 样式与合并 */
function mergeTsvTextOntoHtml(
  htmlPayload: ClipboardPastePayload,
  tsvPayload: ClipboardPastePayload,
): ClipboardPastePayload {
  if (!dimensionsMatch(htmlPayload.grid, tsvPayload.grid)) {
    return htmlPayload;
  }

  const grid = htmlPayload.grid.map((row, r) =>
    row.map((cell, c) => ({
      text: tsvPayload.grid[r][c].text,
      style: cell.style,
    })),
  );

  return { grid, merges: htmlPayload.merges };
}

/** 剥离 CF_HTML / WPS 剪贴板头，便于 DOMParser 解析 */
function stripClipboardHtmlEnvelope(html: string): string {
  let next = html;
  // Windows CF_HTML: Version:...\r\nStartHTML:... 之后才是真实 HTML
  const htmlTag = next.search(/<html[\s>]/i);
  if (htmlTag > 0) next = next.slice(htmlTag);
  const fragmentMatch = next.match(/<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/i);
  if (fragmentMatch) next = fragmentMatch[1];
  return next;
}

function looksLikeHtmlTable(html: string): boolean {
  return /<table[\s>]/i.test(html) || /<(td|th)[\s>]/i.test(html);
}

function buildPayloadFromParts(plain: string, html: string): ClipboardPastePayload | null {
  const tsvPayload = plain.trim() ? parseClipboardFromText(plain) : null;
  // 千行级粘贴：跳过 HTML DOM 解析（WPS/Excel HTML 可达数 MB，易卡死主线程）
  const plainLines = plain ? plain.split(/\r\n|\n|\r/).length : 0;
  const skipHtml = plainLines >= 400 || (html?.length ?? 0) >= 400_000;

  let htmlPayload: ClipboardPastePayload | null = null;
  if (!skipHtml) {
    const normalizedHtml = html ? stripClipboardHtmlEnvelope(html) : '';
    if (normalizedHtml && looksLikeHtmlTable(normalizedHtml)) {
      htmlPayload = parseHtmlTablePayload(normalizedHtml);
    }
  }

  if (htmlPayload) {
    if (tsvPayload) return mergeTsvTextOntoHtml(htmlPayload, tsvPayload);
    return htmlPayload;
  }

  return tsvPayload;
}

function buildPasteCell(el: Element, classStyles?: Map<string, Partial<CellStyle>>): ClipboardPasteCell {
  const text = extractCellText(el);
  const style = parseHtmlCellStyle(el, classStyles);
  return style ? { text, style } : { text };
}

function convertSlotMatrix(slots: GridSlot[][]): ClipboardPasteGrid {
  return slots.map(row => row.map(slot => {
    if (!slot || slot === OCCUPIED) return { text: '' };
    return { text: slot.text ?? '', style: slot.style };
  }));
}

/** 从 Excel 等来源的 HTML 表格解析二维数据（含样式与合并） */
export function parseHtmlTablePayload(
  html: string,
  expectedRows?: number,
  expectedCols?: number,
): ClipboardPastePayload | null {
  const normalized = stripClipboardHtmlEnvelope(html || '');
  if (!normalized || !looksLikeHtmlTable(normalized)) return null;

  const wrapped = /<table[\s>]/i.test(normalized)
    ? normalized
    : `<table><tbody>${normalized}</tbody></table>`;

  const doc = new DOMParser().parseFromString(wrapped, 'text/html');
  const classStyles = parseExcelStylesheet(doc);
  const table = findBestHtmlTable(doc, expectedRows, expectedCols);
  if (!table) return null;

  const slots: GridSlot[][] = [];
  const merges: ClipboardPasteMerge[] = [];
  const rowEls = Array.from(table.querySelectorAll('tr'));

  rowEls.forEach((tr, rowIndex) => {
    if (!slots[rowIndex]) slots[rowIndex] = [];
    let colIndex = 0;

    tr.querySelectorAll('th, td').forEach(cellEl => {
      while (slots[rowIndex][colIndex] !== undefined) colIndex += 1;

      const colspan = Math.max(1, Number.parseInt(cellEl.getAttribute('colspan') || '1', 10) || 1);
      const rowspan = Math.max(1, Number.parseInt(cellEl.getAttribute('rowspan') || '1', 10) || 1);
      const pasteCell = buildPasteCell(cellEl, classStyles);

      for (let dr = 0; dr < rowspan; dr++) {
        const targetRow = rowIndex + dr;
        if (!slots[targetRow]) slots[targetRow] = [];
        for (let dc = 0; dc < colspan; dc++) {
          const targetCol = colIndex + dc;
          if (dr === 0 && dc === 0) {
            slots[targetRow][targetCol] = pasteCell;
          } else {
            slots[targetRow][targetCol] = OCCUPIED;
          }
        }
      }

      if (colspan > 1 || rowspan > 1) {
        merges.push({
          startRow: rowIndex,
          startCol: colIndex,
          endRow: rowIndex + rowspan - 1,
          endCol: colIndex + colspan - 1,
        });
      }

      colIndex += colspan;
    });
  });

  const grid = normalizeClipboardGrid(convertSlotMatrix(slots));
  if (grid.length === 0) return null;
  return { grid, merges };
}

function estimateTableSize(table: Element): { rows: number; cols: number } {
  const rowEls = table.querySelectorAll('tr');
  let cols = 0;
  rowEls.forEach(tr => {
    let rowCols = 0;
    tr.querySelectorAll('th, td').forEach(cell => {
      rowCols += Math.max(1, Number.parseInt(cell.getAttribute('colspan') || '1', 10) || 1);
    });
    cols = Math.max(cols, rowCols);
  });
  return { rows: rowEls.length, cols };
}

function findBestHtmlTable(
  doc: Document,
  expectedRows?: number,
  expectedCols?: number,
): HTMLTableElement | null {
  const tables = Array.from(doc.querySelectorAll('table'));
  if (tables.length === 0) return null;
  if (tables.length === 1) return tables[0];

  let best = tables[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const table of tables) {
    const { rows, cols } = estimateTableSize(table);
    let score = rows * cols;
    if (expectedRows && expectedCols) {
      if (rows === expectedRows && cols === expectedCols) score += 100000;
      score -= Math.abs(rows - expectedRows) * 1000 + Math.abs(cols - expectedCols) * 100;
    }
    if (score > bestScore) {
      best = table;
      bestScore = score;
    }
  }
  return best;
}

/** @deprecated 使用 parseHtmlTablePayload */
export function parseHtmlTableGrid(html: string): ClipboardPasteGrid | null {
  return parseHtmlTablePayload(html)?.grid ?? null;
}

function readClipboardTextSyncDuringGesture(): string {
  if (typeof document === 'undefined') return '';
  try {
    const ta = document.createElement('textarea');
    ta.setAttribute('aria-hidden', 'true');
    ta.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:none;outline:none;opacity:0.01';
    document.body.appendChild(ta);
    ta.focus({ preventScroll: true });
    const ok = document.execCommand('paste');
    const text = normalizeNewlines(ta.value);
    document.body.removeChild(ta);
    if (ok && text.trim()) return text;
  } catch {
    // execCommand paste 不可用
  }
  return '';
}

function parseClipboardFromText(text: string): ClipboardPastePayload | null {
  const grid = normalizeClipboardGrid(tsvToPasteGrid(text));
  if (grid.length === 0) return null;
  return { grid, merges: [] };
}

function parseClipboardFromHtml(html: string, plain?: string): ClipboardPastePayload | null {
  return buildPayloadFromParts(plain || '', html);
}

/** 从 DataTransfer 同步解析表格（TSV 定结构，HTML 补样式/合并） */
export function parseClipboardGrid(dt: DataTransfer | null | undefined): ClipboardPastePayload | null {
  if (!dt) return null;

  let plain = '';
  let html = '';
  try {
    plain = dt.getData('text/plain') || dt.getData('text') || dt.getData('text/csv') || '';
  } catch {
    // ignore
  }
  try {
    html = dt.getData('text/html') || '';
  } catch {
    // ignore
  }

  // 部分环境 types 有值但 getData 需按 types 逐项读取
  if (!plain && !html) {
    try {
      const types = Array.from(dt.types || []);
      for (const type of types) {
        const lower = type.toLowerCase();
        if (!plain && (lower === 'text/plain' || lower === 'text' || lower === 'text/csv')) {
          plain = dt.getData(type) || '';
        }
        if (!html && lower === 'text/html') {
          html = dt.getData(type) || '';
        }
      }
    } catch {
      // ignore
    }
  }

  return buildPayloadFromParts(plain, html);
}

/** 异步读取系统剪贴板中的表格数据 */
export async function readClipboardGridAsync(dt?: DataTransfer | null): Promise<ClipboardPastePayload | null> {
  const fromEvent = dt ? parseClipboardGrid(dt) : null;
  if (fromEvent) return fromEvent;

  let plain = '';
  let html = '';

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes('text/plain')) {
          plain = await (await item.getType('text/plain')).text();
        }
      }
      for (const item of items) {
        if (item.types.includes('text/html')) {
          html = await (await item.getType('text/html')).text();
        }
      }
      const fromParts = buildPayloadFromParts(plain, html);
      if (fromParts) return fromParts;
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      plain = await navigator.clipboard.readText();
      const fromPlain = parseClipboardFromText(plain);
      if (fromPlain) return fromPlain;
    }
  } catch {
    // 权限或环境不支持
  }

  const syncText = readClipboardTextSyncDuringGesture();
  if (syncText.trim()) {
    return parseClipboardFromText(syncText);
  }

  return null;
}

/** 预处理 Excel 等粘贴的显示文本，便于类型推断 */
export function normalizePastedCellText(text: string): string {
  const trimmed = text.trim();
  if (/^\([\d,]+\.?\d*\)$/.test(trimmed)) {
    return `-${trimmed.slice(1, -1).replace(/,/g, '')}`;
  }
  if (/^-?[\d,]+\.?\d*$/.test(trimmed) && trimmed.includes(',')) {
    return trimmed.replace(/,/g, '');
  }
  if (/^-?\d+(\.\d+)?%$/.test(trimmed)) {
    const num = Number(trimmed.replace('%', ''));
    if (!Number.isNaN(num)) return String(num / 100);
  }
  return text;
}
