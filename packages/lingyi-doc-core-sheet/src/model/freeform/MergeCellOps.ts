import type { CellData, CellRange, FreeformSheetModel } from '@lingyi-doc/core-types';
import { coordToKey } from '@lingyi-doc/core-types';
import type { Operation } from '../types';

export function rangesOverlap(a: CellRange, b: CellRange): boolean {
  return !(
    a.end.row < b.start.row ||
    b.end.row < a.start.row ||
    a.end.col < b.start.col ||
    b.end.col < a.start.col
  );
}

export function findMergeConflict(
  sheet: FreeformSheetModel,
  row: number,
  col: number,
): CellRange | null {
  for (const range of sheet.mergeRanges) {
    if (row >= range.start.row && row <= range.end.row &&
        col >= range.start.col && col <= range.end.col) {
      const master = range.master || range.start;
      if (master.row === row && master.col === col) return null;
      return range;
    }
  }
  return null;
}

export function isInMergedCell(
  sheet: FreeformSheetModel,
  row: number,
  col: number,
): CellRange | null {
  for (const range of sheet.mergeRanges) {
    if (row >= range.start.row && row <= range.end.row &&
        col >= range.start.col && col <= range.end.col) {
      return range;
    }
  }
  return null;
}

export function resolveMergedMasterCell(
  sheet: FreeformSheetModel,
  row: number,
  col: number,
): CellData | undefined {
  for (const range of sheet.mergeRanges) {
    if (row >= range.start.row && row <= range.end.row &&
        col >= range.start.col && col <= range.end.col) {
      const master = range.master || range.start;
      if (master.row !== row || master.col !== col) {
        return sheet.cells.get(coordToKey(master));
      }
    }
  }
  return undefined;
}

export function mergeCells(
  sheet: FreeformSheetModel,
  range: CellRange,
  notifyChange: (range: CellRange | null) => void,
  pushUndo: (op: Operation) => void,
): CellRange {
  const { minRow, maxRow, minCol, maxCol } = {
    minRow: range.start.row, maxRow: range.end.row,
    minCol: range.start.col, maxCol: range.end.col,
  };

  if (minRow === maxRow && minCol === maxCol) {
    throw new Error('单单元格不可合并');
  }

  for (const existing of sheet.mergeRanges) {
    if (rangesOverlap(range, existing)) {
      throw new Error('合并区域存在重叠');
    }
  }

  const rowCount = maxRow - minRow + 1;
  const colCount = maxCol - minCol + 1;
  if (rowCount > 100 || colCount > 100) {
    throw new Error('合并区域过大（最大100x100）');
  }

  const originChildCells = new Map<string, CellData>();
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      if (r === minRow && c === minCol) continue;
      const key = coordToKey({ row: r, col: c });
      const existing = sheet.cells.get(key);
      originChildCells.set(key, existing || { value: { type: 'empty' }, isMergedChild: false });
    }
  }

  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      if (r === minRow && c === minCol) continue;
      const key = coordToKey({ row: r, col: c });
      sheet.cells.set(key, { value: { type: 'empty' }, isMergedChild: true });
    }
  }

  const newMerge: CellRange = {
    sheetId: range.sheetId,
    start: { row: minRow, col: minCol },
    end: { row: maxRow, col: maxCol },
    master: { row: minRow, col: minCol },
  };
  sheet.mergeRanges.push(newMerge);

  pushUndo({
    type: 'mergeCells',
    undo: () => {
      sheet.mergeRanges = sheet.mergeRanges.filter(r => r !== newMerge);
      for (const [key, cell] of originChildCells) {
        sheet.cells.set(key, { ...cell, isMergedChild: false });
      }
      notifyChange(range);
    },
    redo: () => {
      sheet.mergeRanges.push(newMerge);
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          if (r === minRow && c === minCol) continue;
          sheet.cells.set(coordToKey({ row: r, col: c }), { value: { type: 'empty' }, isMergedChild: true });
        }
      }
      notifyChange(range);
    },
  });

  notifyChange(null);
  return newMerge;
}

export function unmergeCells(
  sheet: FreeformSheetModel,
  row: number,
  col: number,
  notifyChange: (range: CellRange | null) => void,
  pushUndo: (op: Operation) => void,
): void {
  let targetMerge: CellRange | null = null;
  for (const range of sheet.mergeRanges) {
    if (row >= range.start.row && row <= range.end.row &&
        col >= range.start.col && col <= range.end.col) {
      const master = range.master || range.start;
      if (master.row === row && master.col === col) {
        targetMerge = range;
        break;
      }
    }
  }

  if (!targetMerge) {
    throw new Error('当前单元格未合并或非主格，不可拆分');
  }

  const { startRow, endRow, startCol, endCol } = {
    startRow: targetMerge.start.row, endRow: targetMerge.end.row,
    startCol: targetMerge.start.col, endCol: targetMerge.end.col,
  };

  const originChildCells = new Map<string, CellData>();
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      if (r === startRow && c === startCol) continue;
      const key = coordToKey({ row: r, col: c });
      const childCell = sheet.cells.get(key);
      originChildCells.set(key, childCell ? { ...childCell } : { value: { type: 'empty' }, isMergedChild: false });
    }
  }

  sheet.mergeRanges = sheet.mergeRanges.filter(r => r !== targetMerge);

  const restoredRange: CellRange = {
    sheetId: targetMerge.sheetId,
    start: { row: startRow, col: startCol },
    end: { row: endRow, col: endCol },
  };
  for (const [key, cell] of originChildCells) {
    sheet.cells.set(key, { ...cell, isMergedChild: false });
  }

  pushUndo({
    type: 'unmergeCells',
    undo: () => {
      sheet.mergeRanges.push(targetMerge!);
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          if (r === startRow && c === startCol) continue;
          sheet.cells.set(coordToKey({ row: r, col: c }), { value: { type: 'empty' }, isMergedChild: true });
        }
      }
      notifyChange(restoredRange);
    },
    redo: () => {
      sheet.mergeRanges = sheet.mergeRanges.filter(r => r !== targetMerge);
      for (const [key, cell] of originChildCells) {
        sheet.cells.set(key, { ...cell, isMergedChild: false });
      }
      notifyChange(restoredRange);
    },
  });

  notifyChange(null);
}

export function remapMergeRangesOnRowPermutation(
  sheet: FreeformSheetModel,
  remapRow: (r: number) => number,
): void {
  sheet.mergeRanges = sheet.mergeRanges.map(range => {
    const nr: CellRange = {
      ...range,
      start: { ...range.start, row: remapRow(range.start.row) },
      end: { ...range.end, row: remapRow(range.end.row) },
      master: range.master ? { ...range.master, row: remapRow(range.master.row) } : undefined,
    };
    return nr;
  });
}

export function remapMergeRangesOnColumnPermutation(
  sheet: FreeformSheetModel,
  remapCol: (c: number) => number,
): void {
  sheet.mergeRanges = sheet.mergeRanges.map(range => {
    const nr: CellRange = {
      ...range,
      start: { ...range.start, col: remapCol(range.start.col) },
      end: { ...range.end, col: remapCol(range.end.col) },
      master: range.master ? { ...range.master, col: remapCol(range.master.col) } : undefined,
    };
    return nr;
  });
}

export function shiftMergeRangesOnInsertRows(
  sheet: FreeformSheetModel,
  index: number,
  count: number,
): void {
  sheet.mergeRanges = sheet.mergeRanges.map(range => {
    const newRange: CellRange = { ...range, start: { ...range.start }, end: { ...range.end }, master: range.master ? { ...range.master } : undefined };
    if (newRange.start.row >= index) newRange.start.row += count;
    if (newRange.end.row >= index) newRange.end.row += count;
    if (newRange.master && newRange.master.row >= index) newRange.master.row += count;
    return newRange;
  });
}

export function shiftMergeRangesOnInsertColumns(
  sheet: FreeformSheetModel,
  index: number,
  count: number,
): void {
  sheet.mergeRanges = sheet.mergeRanges.map(range => {
    const newRange: CellRange = { ...range, start: { ...range.start }, end: { ...range.end }, master: range.master ? { ...range.master } : undefined };
    if (newRange.start.col >= index) newRange.start.col += count;
    if (newRange.end.col >= index) newRange.end.col += count;
    if (newRange.master && newRange.master.col >= index) newRange.master.col += count;
    return newRange;
  });
}

export function filterMergeRangesOnDeleteColumns(
  sheet: FreeformSheetModel,
  index: number,
  count: number,
): void {
  sheet.mergeRanges = sheet.mergeRanges.filter(range => {
    const newRange: CellRange = { ...range, start: { ...range.start }, end: { ...range.end }, master: range.master ? { ...range.master } : undefined };
    if (newRange.start.col >= index) newRange.start.col -= count;
    if (newRange.end.col >= index) newRange.end.col -= count;
    if (newRange.master && newRange.master.col >= index) newRange.master.col -= count;
    return newRange.start.col >= 0 && newRange.end.col >= 0;
  }).map(r => {
    if (r.start.col >= index) r.start.col -= count;
    if (r.end.col >= index) r.end.col -= count;
    if (r.master && r.master.col >= index) r.master.col -= count;
    return r;
  });
}
