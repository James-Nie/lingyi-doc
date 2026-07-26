import type { CellRange } from '@lingyi-doc/core-types';

function rectBounds(range: CellRange): {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
} {
  return {
    minRow: Math.min(range.start.row, range.end.row),
    maxRow: Math.max(range.start.row, range.end.row),
    minCol: Math.min(range.start.col, range.end.col),
    maxCol: Math.max(range.start.col, range.end.col),
  };
}

function rectsIntersect(
  a: { minRow: number; maxRow: number; minCol: number; maxCol: number },
  b: { minRow: number; maxRow: number; minCol: number; maxCol: number },
): boolean {
  return a.minRow <= b.maxRow && a.maxRow >= b.minRow
    && a.minCol <= b.maxCol && a.maxCol >= b.minCol;
}

/**
 * 将选区扩展为完整包含所有与之相交的合并区域（飞书/Excel 风格）。
 * 避免出现「只选中合并单元格一部分」的非法选区。
 */
export function normalizeSelectionForMerges(
  range: CellRange,
  mergeRanges: CellRange[],
): CellRange {
  if (mergeRanges.length === 0) return range;

  let bounds = rectBounds(range);
  let changed = true;

  while (changed) {
    changed = false;
    for (const merge of mergeRanges) {
      const mergeBounds = rectBounds(merge);
      if (!rectsIntersect(bounds, mergeBounds)) continue;

      const next = {
        minRow: Math.min(bounds.minRow, mergeBounds.minRow),
        maxRow: Math.max(bounds.maxRow, mergeBounds.maxRow),
        minCol: Math.min(bounds.minCol, mergeBounds.minCol),
        maxCol: Math.max(bounds.maxCol, mergeBounds.maxCol),
      };

      if (
        next.minRow !== bounds.minRow
        || next.maxRow !== bounds.maxRow
        || next.minCol !== bounds.minCol
        || next.maxCol !== bounds.maxCol
      ) {
        bounds = next;
        changed = true;
      }
    }
  }

  return {
    sheetId: range.sheetId,
    start: { row: bounds.minRow, col: bounds.minCol },
    end: { row: bounds.maxRow, col: bounds.maxCol },
  };
}
