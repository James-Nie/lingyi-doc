import type { WbTableCellStyle, TableElement, WhiteboardPoint } from './types';

export const TABLE_GUTTER = 20;
export const TABLE_MIN_CELL_W = 60;
export const TABLE_MIN_CELL_H = 32;
export const TABLE_INSERT_HIT = 8;
/** 整表外框改大小命中容差 */
export const TABLE_RESIZE_EDGE_HIT = 8;
/** 行列分隔线（调列宽/行高）命中容差 */
export const TABLE_DIVIDER_HIT = 5;

export function getTableColCount(el: TableElement): number {
  return el.cells[0]?.length ?? el.cols;
}

export function getTableRowCount(el: TableElement): number {
  return el.cells.length;
}

/** 解析各列宽度；缺省则均分 */
export function getTableColWidths(el: TableElement): number[] {
  const cols = Math.max(1, getTableColCount(el));
  if (el.colWidths && el.colWidths.length === cols) {
    return el.colWidths.map(w => Math.max(TABLE_MIN_CELL_W, w));
  }
  const cellW = el.width / cols;
  return Array.from({ length: cols }, () => Math.max(TABLE_MIN_CELL_W, cellW));
}

/** 解析各行高度；缺省则均分 */
export function getTableRowHeights(el: TableElement): number[] {
  const rows = Math.max(1, getTableRowCount(el));
  if (el.rowHeights && el.rowHeights.length === rows) {
    return el.rowHeights.map(h => Math.max(TABLE_MIN_CELL_H, h));
  }
  const cellH = el.height / rows;
  return Array.from({ length: rows }, () => Math.max(TABLE_MIN_CELL_H, cellH));
}

export function getTableColOffsets(el: TableElement): number[] {
  const widths = getTableColWidths(el);
  const offsets: number[] = [0];
  for (let i = 0; i < widths.length; i++) {
    offsets.push(offsets[i] + widths[i]);
  }
  return offsets;
}

export function getTableRowOffsets(el: TableElement): number[] {
  const heights = getTableRowHeights(el);
  const offsets: number[] = [0];
  for (let i = 0; i < heights.length; i++) {
    offsets.push(offsets[i] + heights[i]);
  }
  return offsets;
}

/** 兼容：均分场景的宽高参考值 */
export function getTableDimensions(el: TableElement): { rows: number; cols: number; cellW: number; cellH: number } {
  const rows = getTableRowCount(el);
  const cols = getTableColCount(el);
  return {
    rows,
    cols,
    cellW: el.width / Math.max(cols, 1),
    cellH: el.height / Math.max(rows, 1),
  };
}

function indexAtOffset(offsets: number[], local: number): number {
  for (let i = 0; i < offsets.length - 1; i++) {
    if (local < offsets[i + 1]) return i;
  }
  return Math.max(0, offsets.length - 2);
}

/** 锚点单元格的合并跨度（至少 1） */
export function getTableCellSpan(el: TableElement, row: number, col: number): { rowSpan: number; colSpan: number } {
  const style = el.cellStyles?.[row]?.[col];
  const rows = getTableRowCount(el);
  const cols = getTableColCount(el);
  const rowSpan = Math.max(1, Math.min(style?.rowSpan ?? 1, rows - row));
  const colSpan = Math.max(1, Math.min(style?.colSpan ?? 1, cols - col));
  return { rowSpan, colSpan };
}

/** 若 (row,col) 被左侧/上方合并锚点覆盖，返回该锚点；否则返回自身 */
export function resolveTableCellAnchor(
  el: TableElement,
  row: number,
  col: number,
): { row: number; col: number } {
  const rows = getTableRowCount(el);
  const cols = getTableColCount(el);
  for (let ri = 0; ri < rows; ri++) {
    for (let ci = 0; ci < cols; ci++) {
      const { rowSpan, colSpan } = getTableCellSpan(el, ri, ci);
      if (rowSpan === 1 && colSpan === 1 && !(ri === row && ci === col)) continue;
      if (row >= ri && row < ri + rowSpan && col >= ci && col < ci + colSpan) {
        return { row: ri, col: ci };
      }
    }
  }
  return { row, col };
}

export function isTableCellCovered(el: TableElement, row: number, col: number): boolean {
  const anchor = resolveTableCellAnchor(el, row, col);
  return anchor.row !== row || anchor.col !== col;
}

export function hitTableCell(el: TableElement, pt: WhiteboardPoint): { row: number; col: number } | null {
  if (pt.x < el.x || pt.y < el.y || pt.x > el.x + el.width || pt.y > el.y + el.height) return null;
  const geo = {
    col: indexAtOffset(getTableColOffsets(el), pt.x - el.x),
    row: indexAtOffset(getTableRowOffsets(el), pt.y - el.y),
  };
  return resolveTableCellAnchor(el, geo.row, geo.col);
}

export function hitTableColHeader(el: TableElement, pt: WhiteboardPoint): number | null {
  if (pt.y < el.y - TABLE_GUTTER || pt.y > el.y) return null;
  if (pt.x < el.x || pt.x > el.x + el.width) return null;
  return indexAtOffset(getTableColOffsets(el), pt.x - el.x);
}

export function hitTableRowHeader(el: TableElement, pt: WhiteboardPoint): number | null {
  if (pt.x < el.x - TABLE_GUTTER || pt.x > el.x) return null;
  if (pt.y < el.y || pt.y > el.y + el.height) return null;
  return indexAtOffset(getTableRowOffsets(el), pt.y - el.y);
}

export function hitTableColInsert(el: TableElement, pt: WhiteboardPoint): number | null {
  const cols = getTableColCount(el);
  const offsets = getTableColOffsets(el);
  if (pt.x < el.x - TABLE_GUTTER || pt.x > el.x + el.width) return null;
  if (pt.y < el.y - TABLE_GUTTER || pt.y > el.y) return null;
  for (let i = 1; i < cols; i++) {
    if (Math.abs(pt.x - (el.x + offsets[i])) <= TABLE_INSERT_HIT) return i;
  }
  return null;
}

export function hitTableRowInsert(el: TableElement, pt: WhiteboardPoint): number | null {
  const rows = getTableRowCount(el);
  const offsets = getTableRowOffsets(el);
  if (pt.x < el.x - TABLE_GUTTER || pt.x > el.x) return null;
  if (pt.y < el.y - TABLE_GUTTER || pt.y > el.y + el.height) return null;
  for (let i = 1; i < rows; i++) {
    if (Math.abs(pt.y - (el.y + offsets[i])) <= TABLE_INSERT_HIT) return i;
  }
  return null;
}

/**
 * 命中竖直边框线（调整左侧列宽）。
 * 含内部竖线与最右侧外缘（用于调末列宽）；四角留给整表改大小。
 */
export function hitTableColDivider(
  el: TableElement,
  pt: WhiteboardPoint,
  pad = TABLE_DIVIDER_HIT,
): number | null {
  const cols = getTableColCount(el);
  if (cols < 1) return null;
  // 避开四角区域
  if (pt.y < el.y + pad || pt.y > el.y + el.height - pad) return null;
  if (pt.x < el.x - pad || pt.x > el.x + el.width + pad) return null;

  const offsets = getTableColOffsets(el);
  // 内部线 + 最右外缘：1 .. cols
  for (let i = 1; i <= cols; i++) {
    const boundary = el.x + offsets[i];
    if (Math.abs(pt.x - boundary) <= pad) return i - 1;
  }
  return null;
}

/**
 * 命中水平边框线（调整上方行高）。
 * 含内部横线与最下外缘；四角留给整表改大小。
 */
export function hitTableRowDivider(
  el: TableElement,
  pt: WhiteboardPoint,
  pad = TABLE_DIVIDER_HIT,
): number | null {
  const rows = getTableRowCount(el);
  if (rows < 1) return null;
  if (pt.x < el.x + pad || pt.x > el.x + el.width - pad) return null;
  if (pt.y < el.y - pad || pt.y > el.y + el.height + pad) return null;

  const offsets = getTableRowOffsets(el);
  for (let i = 1; i <= rows; i++) {
    const boundary = el.y + offsets[i];
    if (Math.abs(pt.y - boundary) <= pad) return i - 1;
  }
  return null;
}

export type TableResizeHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

/** 整表四边/四角命中；右/下边中点会被列宽/行高分隔线优先拦截 */
export function hitTableResizeEdge(
  el: TableElement,
  pt: WhiteboardPoint,
  pad = TABLE_RESIZE_EDGE_HIT,
): TableResizeHandle | null {
  const { x, y, width: w, height: h } = el;
  const nearL = Math.abs(pt.x - x) <= pad;
  const nearR = Math.abs(pt.x - (x + w)) <= pad;
  const nearT = Math.abs(pt.y - y) <= pad;
  const nearB = Math.abs(pt.y - (y + h)) <= pad;
  const inX = pt.x >= x - pad && pt.x <= x + w + pad;
  const inY = pt.y >= y - pad && pt.y <= y + h + pad;

  if (nearT && nearL) return 'nw';
  if (nearT && nearR) return 'ne';
  if (nearB && nearL) return 'sw';
  if (nearB && nearR) return 'se';
  // 左/上边仍可整表缩放；右/下中点留给列宽/行高
  if (nearT && inX) return 'n';
  if (nearL && inY) return 'w';
  return null;
}

export function insertTableRow(el: TableElement, at: number): TableElement {
  const cols = getTableColCount(el);
  const heights = getTableRowHeights(el);
  const insertH = heights[Math.min(at, heights.length - 1)] ?? TABLE_MIN_CELL_H;
  const cells = el.cells.map(row => [...row]);
  cells.splice(at, 0, Array.from({ length: cols }, () => ''));
  const rowHeights = [...heights];
  rowHeights.splice(at, 0, insertH);
  const cellStyles = ensureCellStyles(el, cells.length, cols);
  cellStyles.splice(at, 0, Array.from({ length: cols }, () => null));
  return {
    ...el,
    rows: cells.length,
    cells,
    cellStyles,
    rowHeights,
    height: rowHeights.reduce((s, h) => s + h, 0),
    colWidths: getTableColWidths(el),
  };
}

export function insertTableCol(el: TableElement, at: number): TableElement {
  const widths = getTableColWidths(el);
  const insertW = widths[Math.min(at, widths.length - 1)] ?? TABLE_MIN_CELL_W;
  const cells = el.cells.map(row => {
    const next = [...row];
    next.splice(at, 0, '');
    return next;
  });
  const cols = cells[0]?.length ?? el.cols;
  const rows = cells.length;
  const colWidths = [...widths];
  colWidths.splice(at, 0, insertW);
  const cellStyles = ensureCellStyles(el, rows, cols - 1);
  for (const row of cellStyles) row.splice(at, 0, null);
  return {
    ...el,
    cols,
    cells,
    cellStyles,
    colWidths,
    width: colWidths.reduce((s, w) => s + w, 0),
    rowHeights: getTableRowHeights(el),
  };
}

export function moveTableCol(el: TableElement, from: number, to: number): TableElement {
  const cols = getTableColCount(el);
  if (from < 0 || from >= cols || to < 0 || to >= cols || from === to) return el;
  const cells = el.cells.map(row => {
    const next = [...row];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  });
  const colWidths = getTableColWidths(el);
  const [w] = colWidths.splice(from, 1);
  colWidths.splice(to, 0, w);
  const cellStyles = ensureCellStyles(el, cells.length, cols);
  for (const row of cellStyles) {
    const [s] = row.splice(from, 1);
    row.splice(to, 0, s);
  }
  return { ...el, cells, cols, colWidths, rowHeights: getTableRowHeights(el), cellStyles };
}

export function moveTableRow(el: TableElement, from: number, to: number): TableElement {
  const rows = getTableRowCount(el);
  if (from < 0 || from >= rows || to < 0 || to >= rows || from === to) return el;
  const cells = el.cells.map(row => [...row]);
  const [item] = cells.splice(from, 1);
  cells.splice(to, 0, item);
  const rowHeights = getTableRowHeights(el);
  const [h] = rowHeights.splice(from, 1);
  rowHeights.splice(to, 0, h);
  const cols = getTableColCount(el);
  const cellStyles = ensureCellStyles(el, rows, cols);
  const [s] = cellStyles.splice(from, 1);
  cellStyles.splice(to, 0, s);
  return { ...el, cells, rows: cells.length, rowHeights, colWidths: getTableColWidths(el), cellStyles };
}

export function resizeTableCol(el: TableElement, col: number, newWidth: number): TableElement {
  const colWidths = getTableColWidths(el);
  if (col < 0 || col >= colWidths.length) return el;
  colWidths[col] = Math.max(TABLE_MIN_CELL_W, newWidth);
  return {
    ...el,
    colWidths,
    width: colWidths.reduce((s, w) => s + w, 0),
    rowHeights: getTableRowHeights(el),
  };
}

export function resizeTableRow(el: TableElement, row: number, newHeight: number): TableElement {
  const rowHeights = getTableRowHeights(el);
  if (row < 0 || row >= rowHeights.length) return el;
  rowHeights[row] = Math.max(TABLE_MIN_CELL_H, newHeight);
  return {
    ...el,
    rowHeights,
    height: rowHeights.reduce((s, h) => s + h, 0),
    colWidths: getTableColWidths(el),
  };
}

/** 整表外框改大小时等比缩放各列/行 */
export function scaleTableSizes(
  el: TableElement,
  nextWidth: number,
  nextHeight: number,
): Pick<TableElement, 'colWidths' | 'rowHeights' | 'width' | 'height'> {
  const cols = getTableColCount(el);
  const rows = getTableRowCount(el);
  const sx = nextWidth / Math.max(1, el.width);
  const sy = nextHeight / Math.max(1, el.height);
  const colWidths = getTableColWidths(el).map(w => Math.max(TABLE_MIN_CELL_W, w * sx));
  const rowHeights = getTableRowHeights(el).map(h => Math.max(TABLE_MIN_CELL_H, h * sy));
  const sumW = colWidths.reduce((s, w) => s + w, 0);
  if (cols > 0) colWidths[cols - 1] = Math.max(TABLE_MIN_CELL_W, colWidths[cols - 1] + (nextWidth - sumW));
  const sumH = rowHeights.reduce((s, h) => s + h, 0);
  if (rows > 0) rowHeights[rows - 1] = Math.max(TABLE_MIN_CELL_H, rowHeights[rows - 1] + (nextHeight - sumH));
  return {
    colWidths,
    rowHeights,
    width: colWidths.reduce((s, w) => s + w, 0),
    height: rowHeights.reduce((s, h) => s + h, 0),
  };
}

export function tableColDropIndex(el: TableElement, localX: number): number {
  const widths = getTableColWidths(el);
  if (!widths.length) return 0;
  let acc = 0;
  for (let i = 0; i < widths.length; i++) {
    if (localX < acc + widths[i] / 2) return i;
    acc += widths[i];
  }
  return widths.length - 1;
}

export function tableRowDropIndex(el: TableElement, localY: number): number {
  const heights = getTableRowHeights(el);
  if (!heights.length) return 0;
  let acc = 0;
  for (let i = 0; i < heights.length; i++) {
    if (localY < acc + heights[i] / 2) return i;
    acc += heights[i];
  }
  return heights.length - 1;
}

export function tableCellCanvasRect(el: TableElement, row: number, col: number) {
  const anchor = resolveTableCellAnchor(el, row, col);
  const { rowSpan, colSpan } = getTableCellSpan(el, anchor.row, anchor.col);
  const colOffsets = getTableColOffsets(el);
  const rowOffsets = getTableRowOffsets(el);
  const widths = getTableColWidths(el);
  const heights = getTableRowHeights(el);
  let w = 0;
  for (let c = anchor.col; c < anchor.col + colSpan; c++) w += widths[c] ?? 0;
  let h = 0;
  for (let r = anchor.row; r < anchor.row + rowSpan; r++) h += heights[r] ?? 0;
  return {
    x: el.x + (colOffsets[anchor.col] ?? 0),
    y: el.y + (rowOffsets[anchor.row] ?? 0),
    w,
    h,
  };
}

export function tableColCanvasRect(el: TableElement, col: number) {
  const colOffsets = getTableColOffsets(el);
  const widths = getTableColWidths(el);
  return {
    x: el.x + (colOffsets[col] ?? 0),
    y: el.y,
    w: widths[col] ?? 0,
    h: el.height,
  };
}

export function tableRowCanvasRect(el: TableElement, row: number) {
  const rowOffsets = getTableRowOffsets(el);
  const heights = getTableRowHeights(el);
  return {
    x: el.x,
    y: el.y + (rowOffsets[row] ?? 0),
    w: el.width,
    h: heights[row] ?? 0,
  };
}

export type TableCellRange = { r0: number; c0: number; r1: number; c1: number };

export function normalizeTableCellRange(
  a: { row: number; col: number },
  b: { row: number; col: number },
): TableCellRange {
  return {
    r0: Math.min(a.row, b.row),
    c0: Math.min(a.col, b.col),
    r1: Math.max(a.row, b.row),
    c1: Math.max(a.col, b.col),
  };
}

export function tableCellRangeCanvasRect(el: TableElement, range: TableCellRange) {
  const tl = tableCellCanvasRect(el, range.r0, range.c0);
  const br = tableCellCanvasRect(el, range.r1, range.c1);
  return {
    x: tl.x,
    y: tl.y,
    w: br.x + br.w - tl.x,
    h: br.y + br.h - tl.y,
  };
}

export function ensureCellStyles(
  el: TableElement,
  rows = getTableRowCount(el),
  cols = getTableColCount(el),
): (WbTableCellStyle | null)[][] {
  const src = el.cellStyles;
  return Array.from({ length: rows }, (_, ri) => (
    Array.from({ length: cols }, (_, ci) => src?.[ri]?.[ci] ?? null)
  ));
}

export function resolveTableCellStyle(el: TableElement, row: number, col: number): WbTableCellStyle {
  const anchor = resolveTableCellAnchor(el, row, col);
  const cell = el.cellStyles?.[anchor.row]?.[anchor.col] ?? null;
  const { rowSpan, colSpan } = getTableCellSpan(el, anchor.row, anchor.col);
  return {
    fontSize: cell?.fontSize ?? el.fontSize ?? 14,
    color: cell?.color ?? el.color ?? '#1f2329',
    fontWeight: cell?.fontWeight ?? el.fontWeight ?? 400,
    fontStyle: cell?.fontStyle ?? el.fontStyle ?? 'normal',
    textUnderline: cell?.textUnderline ?? el.textUnderline,
    textLineThrough: cell?.textLineThrough ?? el.textLineThrough,
    textAlign: cell?.textAlign ?? el.textAlign ?? 'center',
    textVerticalAlign: cell?.textVerticalAlign ?? el.textVerticalAlign ?? 'center',
    textHighlight: cell?.textHighlight ?? el.textHighlight,
    fill: cell?.fill ?? el.fill ?? '#ffffff',
    rowSpan,
    colSpan,
    textOrientation: cell?.textOrientation ?? 'horizontal',
  };
}

const CELL_STYLE_KEYS: (keyof WbTableCellStyle)[] = [
  'fontSize', 'color', 'fontWeight', 'fontStyle',
  'textUnderline', 'textLineThrough', 'textAlign', 'textVerticalAlign',
  'textHighlight', 'fill', 'textOrientation',
];

/** 将样式 patch 写入指定单元格范围（不改表级 stroke） */
export function applyTableCellStylePatch(
  el: TableElement,
  range: TableCellRange,
  patch: WbTableCellStyle,
): TableElement {
  const rows = getTableRowCount(el);
  const cols = getTableColCount(el);
  const cellStyles = ensureCellStyles(el, rows, cols);
  for (let r = range.r0; r <= range.r1; r++) {
    for (let c = range.c0; c <= range.c1; c++) {
      const prev = cellStyles[r][c] ?? {};
      const next: WbTableCellStyle = { ...prev };
      for (const key of CELL_STYLE_KEYS) {
        if (patch[key] !== undefined) (next as Record<string, unknown>)[key] = patch[key];
      }
      cellStyles[r][c] = next;
    }
  }
  return { ...el, cellStyles };
}

export function tableSelectionRangeFromUi(
  el: TableElement,
  ui: { kind: string; row?: number; col?: number; r0?: number; c0?: number; r1?: number; c1?: number } | null,
): TableCellRange | null {
  if (!ui) return null;
  if (ui.kind === 'cell' && ui.row != null && ui.col != null) {
    return { r0: ui.row, c0: ui.col, r1: ui.row, c1: ui.col };
  }
  if (ui.kind === 'cells' && ui.r0 != null && ui.c0 != null && ui.r1 != null && ui.c1 != null) {
    return normalizeTableCellRange(
      { row: ui.r0, col: ui.c0 },
      { row: ui.r1, col: ui.c1 },
    );
  }
  if (ui.kind === 'col' && ui.col != null) {
    return { r0: 0, c0: ui.col, r1: getTableRowCount(el) - 1, c1: ui.col };
  }
  if (ui.kind === 'row' && ui.row != null) {
    return { r0: ui.row, c0: 0, r1: ui.row, c1: getTableColCount(el) - 1 };
  }
  return null;
}
