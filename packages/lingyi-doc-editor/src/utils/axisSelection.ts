import type { CellCoord, CellRange } from '@lingyi-doc/core';

export function buildFullColumnRange(
  sheetId: string,
  startCol: number,
  endCol: number,
  rowCount: number,
): CellRange {
  const minCol = Math.min(startCol, endCol);
  const maxCol = Math.max(startCol, endCol);
  return {
    sheetId,
    start: { row: 0, col: minCol },
    end: { row: Math.max(0, rowCount - 1), col: maxCol },
  };
}

export function buildFullRowRange(
  sheetId: string,
  startRow: number,
  endRow: number,
  colCount: number,
): CellRange {
  const minRow = Math.min(startRow, endRow);
  const maxRow = Math.max(startRow, endRow);
  return {
    sheetId,
    start: { row: minRow, col: 0 },
    end: { row: maxRow, col: Math.max(0, colCount - 1) },
  };
}

export function getContiguousColumnIndices(sel: CellRange | null, rowCount: number): number[] {
  if (!sel || rowCount < 1) return [];
  if (sel.start.row !== 0 || sel.end.row !== rowCount - 1) return [];
  const cols: number[] = [];
  for (let c = sel.start.col; c <= sel.end.col; c++) cols.push(c);
  return cols;
}

export function getContiguousRowIndices(sel: CellRange | null, colCount: number): number[] {
  if (!sel || colCount < 1) return [];
  if (sel.start.col !== 0 || sel.end.col !== colCount - 1) return [];
  const rows: number[] = [];
  for (let r = sel.start.row; r <= sel.end.row; r++) rows.push(r);
  return rows;
}

/** Command/Ctrl + 点击：切换离散列/行 */
export function toggleDiscreteIndex(discrete: number[], index: number, contiguous: number[]): number[] {
  const base = discrete.length > 0 ? discrete : contiguous;
  const set = new Set(base);
  if (set.has(index)) set.delete(index);
  else set.add(index);
  return [...set].sort((a, b) => a - b);
}

export function resolveSelectedColumnIndices(
  discreteCols: number[],
  sel: CellRange | null,
  rowCount: number,
): number[] {
  if (discreteCols.length > 0) return discreteCols;
  return getContiguousColumnIndices(sel, rowCount);
}

export function resolveSelectedRowIndices(
  discreteRows: number[],
  sel: CellRange | null,
  colCount: number,
): number[] {
  if (discreteRows.length > 0) return discreteRows;
  return getContiguousRowIndices(sel, colCount);
}

export function isColumnAxisSelected(
  col: number,
  discreteCols: number[],
  sel: CellRange | null,
  rowCount: number,
): boolean {
  if (discreteCols.length > 0) return discreteCols.includes(col);
  return getContiguousColumnIndices(sel, rowCount).includes(col);
}

export function isRowAxisSelected(
  row: number,
  discreteRows: number[],
  sel: CellRange | null,
  colCount: number,
): boolean {
  if (discreteRows.length > 0) return discreteRows.includes(row);
  return getContiguousRowIndices(sel, colCount).includes(row);
}

export function isFullRowSelection(
  sel: CellRange | null,
  colCount: number,
  discreteRows: number[],
): boolean {
  if (discreteRows.length > 0) return true;
  if (!sel || colCount < 1) return false;
  const minCol = Math.min(sel.start.col, sel.end.col);
  const maxCol = Math.max(sel.start.col, sel.end.col);
  return minCol === 0 && maxCol === colCount - 1;
}

export function getRowSelectionBounds(rows: number[]): { start: number; end: number; count: number } {
  if (rows.length === 0) return { start: 0, end: 0, count: 0 };
  const sorted = [...rows].sort((a, b) => a - b);
  return { start: sorted[0], end: sorted[sorted.length - 1], count: rows.length };
}

export function isFullColumnSelection(
  sel: CellRange | null,
  rowCount: number,
  discreteCols: number[],
): boolean {
  if (discreteCols.length > 0) return true;
  if (!sel || rowCount < 1) return false;
  const minRow = Math.min(sel.start.row, sel.end.row);
  const maxRow = Math.max(sel.start.row, sel.end.row);
  return minRow === 0 && maxRow === rowCount - 1;
}

export function getColumnSelectionBounds(cols: number[]): { start: number; end: number; count: number } {
  return getRowSelectionBounds(cols);
}

/** 判断点击坐标是否落在当前选区内（含整行/整列/离散多选） */
export function isClickInCurrentSelection(
  coord: CellCoord,
  sel: CellRange | null,
  discreteCells: CellCoord[],
  discreteRows: number[],
  discreteCols: number[],
  rowCount: number,
  colCount: number,
): boolean {
  if (discreteCells.length > 1) {
    return discreteCells.some(c => c.row === coord.row && c.col === coord.col);
  }
  if (isFullRowSelection(sel, colCount, discreteRows)
    && isRowAxisSelected(coord.row, discreteRows, sel, colCount)) {
    return true;
  }
  if (isFullColumnSelection(sel, rowCount, discreteCols)
    && isColumnAxisSelected(coord.col, discreteCols, sel, rowCount)) {
    return true;
  }
  if (!sel) return false;
  const startRow = Math.min(sel.start.row, sel.end.row);
  const endRow = Math.max(sel.start.row, sel.end.row);
  const startCol = Math.min(sel.start.col, sel.end.col);
  const endCol = Math.max(sel.start.col, sel.end.col);
  return coord.row >= startRow && coord.row <= endRow
    && coord.col >= startCol && coord.col <= endCol;
}

/** 将离散索引合并为连续区间，用于统一绘制选区外框 */
export function groupContiguousIndices(indices: number[]): Array<{ start: number; end: number }> {
  if (indices.length === 0) return [];
  const sorted = [...indices].sort((a, b) => a - b);
  const groups: Array<{ start: number; end: number }> = [];
  let start = sorted[0];
  let end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      groups.push({ start, end });
      start = sorted[i];
      end = sorted[i];
    }
  }
  groups.push({ start, end });
  return groups;
}

/** 获取拖拽手柄所在的连续选中区间（整块拖动） */
export function getAxisDragBlock(
  index: number,
  axis: 'col' | 'row',
  discreteCols: number[],
  discreteRows: number[],
  sel: CellRange | null,
  rowCount: number,
  colCount: number,
): { start: number; end: number } {
  const indices = axis === 'col'
    ? resolveSelectedColumnIndices(discreteCols, sel, rowCount)
    : resolveSelectedRowIndices(discreteRows, sel, colCount);
  if (!indices.includes(index)) return { start: index, end: index };
  const group = groupContiguousIndices(indices).find(g => index >= g.start && index <= g.end);
  return group ?? { start: index, end: index };
}

/** 块移动后计算新选区起始索引 */
export function computeAxisBlockDestStart(
  blockStart: number,
  blockEnd: number,
  insertIndex: number,
): number {
  const blockLen = blockEnd - blockStart + 1;
  if (insertIndex <= blockStart) return insertIndex;
  return insertIndex - blockLen;
}
