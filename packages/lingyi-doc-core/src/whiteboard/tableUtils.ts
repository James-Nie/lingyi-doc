import type { TableElement, WhiteboardPoint } from './types';

export const TABLE_GUTTER = 20;
export const TABLE_MIN_CELL_W = 60;
export const TABLE_MIN_CELL_H = 32;
export const TABLE_INSERT_HIT = 8;

export function getTableDimensions(el: TableElement): { rows: number; cols: number; cellW: number; cellH: number } {
  const rows = el.cells.length;
  const cols = el.cells[0]?.length ?? el.cols;
  return {
    rows,
    cols,
    cellW: el.width / Math.max(cols, 1),
    cellH: el.height / Math.max(rows, 1),
  };
}

export function hitTableCell(el: TableElement, pt: WhiteboardPoint): { row: number; col: number } | null {
  const { rows, cols, cellW, cellH } = getTableDimensions(el);
  if (pt.x < el.x || pt.y < el.y || pt.x > el.x + el.width || pt.y > el.y + el.height) return null;
  const col = Math.min(cols - 1, Math.max(0, Math.floor((pt.x - el.x) / cellW)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor((pt.y - el.y) / cellH)));
  return { row, col };
}

export function hitTableColInsert(el: TableElement, pt: WhiteboardPoint): number | null {
  const { cols, cellW } = getTableDimensions(el);
  const gutterLeft = el.x - TABLE_GUTTER;
  const gutterRight = el.x + el.width;
  const gutterTop = el.y - TABLE_GUTTER;
  const gutterBottom = el.y;
  if (pt.x < gutterLeft || pt.x > gutterRight || pt.y < gutterTop || pt.y > gutterBottom) return null;
  for (let i = 1; i < cols; i++) {
    const boundary = el.x + i * cellW;
    if (Math.abs(pt.x - boundary) <= TABLE_INSERT_HIT) return i;
  }
  return null;
}

export function hitTableRowInsert(el: TableElement, pt: WhiteboardPoint): number | null {
  const { rows, cellH } = getTableDimensions(el);
  const gutterLeft = el.x - TABLE_GUTTER;
  const gutterRight = el.x;
  const gutterTop = el.y - TABLE_GUTTER;
  const gutterBottom = el.y + el.height;
  if (pt.x < gutterLeft || pt.x > gutterRight || pt.y < gutterTop || pt.y > gutterBottom) return null;
  for (let i = 1; i < rows; i++) {
    const boundary = el.y + i * cellH;
    if (Math.abs(pt.y - boundary) <= TABLE_INSERT_HIT) return i;
  }
  return null;
}

export function insertTableRow(el: TableElement, at: number): TableElement {
  const { cols, cellH } = getTableDimensions(el);
  const cells = el.cells.map(row => [...row]);
  cells.splice(at, 0, Array.from({ length: cols }, () => ''));
  return {
    ...el,
    rows: cells.length,
    cells,
    height: cellH * cells.length,
  };
}

export function insertTableCol(el: TableElement, at: number): TableElement {
  const { cellW } = getTableDimensions(el);
  const cells = el.cells.map(row => {
    const next = [...row];
    next.splice(at, 0, '');
    return next;
  });
  const cols = cells[0]?.length ?? el.cols;
  return {
    ...el,
    cols,
    cells,
    width: cellW * cols,
  };
}

export function tableCellCanvasRect(el: TableElement, row: number, col: number) {
  const { cellW, cellH } = getTableDimensions(el);
  return {
    x: el.x + col * cellW,
    y: el.y + row * cellH,
    w: cellW,
    h: cellH,
  };
}
