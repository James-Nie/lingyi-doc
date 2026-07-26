import type { CellRange, ColumnFilterCondition, FreeformSheetModel } from '@lingyi-doc/core-types';
import type { Operation } from '../types';

export interface ColumnFilterState {
  enabled: boolean;
  filterCols: number[];
  filters: ColumnFilterCondition[];
}

export function snapshotColumnFilterState(sheet: FreeformSheetModel): ColumnFilterState {
  return {
    enabled: !!sheet.columnFilterEnabled,
    filterCols: [...(sheet.columnFilterCols ?? [])],
    filters: (sheet.columnFilters ?? []).map(f => ({
      ...f,
      selectedValues: f.selectedValues ? [...f.selectedValues] : undefined,
    })),
  };
}

export function applyColumnFilterState(sheet: FreeformSheetModel, state: ColumnFilterState): void {
  sheet.columnFilterEnabled = state.enabled;
  sheet.columnFilterCols = [...state.filterCols];
  sheet.columnFilters = state.filters.map(f => ({
    ...f,
    selectedValues: f.selectedValues ? [...f.selectedValues] : undefined,
  }));
}

function pushColumnFilterUndo(
  before: ColumnFilterState,
  sheet: FreeformSheetModel,
  notifyChange: (range: CellRange | null) => void,
  pushUndo: (op: Operation) => void,
): void {
  const after = snapshotColumnFilterState(sheet);
  const same = before.enabled === after.enabled
    && JSON.stringify(before.filterCols) === JSON.stringify(after.filterCols)
    && JSON.stringify(before.filters) === JSON.stringify(after.filters);
  if (same) return;
  pushUndo({
    type: 'columnFilter',
    undo: () => {
      applyColumnFilterState(sheet, before);
      notifyChange(null);
    },
    redo: () => {
      applyColumnFilterState(sheet, after);
      notifyChange(null);
    },
  });
}

export function getColumnFilters(sheet: FreeformSheetModel | null): ColumnFilterCondition[] {
  if (!sheet) return [];
  return sheet.columnFilters ?? [];
}

export function isColumnFilterEnabled(sheet: FreeformSheetModel | null): boolean {
  if (!sheet) return false;
  return (sheet.columnFilterCols?.length ?? 0) > 0 || !!sheet.columnFilterEnabled;
}

export function getColumnFilterIconCols(sheet: FreeformSheetModel | null, colCount: number): number[] {
  if (!sheet) return [];
  const cols = sheet.columnFilterCols;
  if (cols?.length) return cols;
  if (sheet.columnFilterEnabled) {
    return Array.from({ length: colCount }, (_, i) => i);
  }
  return [];
}

export function enableColumnFiltersForCols(
  sheet: FreeformSheetModel,
  cols: number[],
  colCount: number,
  notifyChange: (range: CellRange | null) => void,
  pushUndo: (op: Operation) => void,
): void {
  const unique = [...new Set(cols.filter(c => c >= 0 && c < colCount))].sort((a, b) => a - b);
  if (unique.length === 0) return;
  const before = snapshotColumnFilterState(sheet);
  sheet.columnFilterCols = unique;
  sheet.columnFilterEnabled = true;
  notifyChange(null);
  pushColumnFilterUndo(before, sheet, notifyChange, pushUndo);
}

export function disableColumnFilters(
  sheet: FreeformSheetModel,
  notifyChange: (range: CellRange | null) => void,
  pushUndo: (op: Operation) => void,
): void {
  if (!sheet.columnFilterEnabled && !(sheet.columnFilters?.length) && !(sheet.columnFilterCols?.length)) return;
  const before = snapshotColumnFilterState(sheet);
  sheet.columnFilterEnabled = false;
  sheet.columnFilterCols = [];
  sheet.columnFilters = [];
  notifyChange(null);
  pushColumnFilterUndo(before, sheet, notifyChange, pushUndo);
}

export function setColumnFilters(
  sheet: FreeformSheetModel,
  conditions: ColumnFilterCondition[],
  notifyChange: (range: CellRange | null) => void,
  pushUndo: (op: Operation) => void,
): void {
  const before = snapshotColumnFilterState(sheet);
  sheet.columnFilters = conditions;
  notifyChange(null);
  pushColumnFilterUndo(before, sheet, notifyChange, pushUndo);
}

export function clearColumnFilters(
  sheet: FreeformSheetModel,
  notifyChange: (range: CellRange | null) => void,
  pushUndo: (op: Operation) => void,
): void {
  if (!(sheet.columnFilters?.length)) return;
  const before = snapshotColumnFilterState(sheet);
  sheet.columnFilters = [];
  notifyChange(null);
  pushColumnFilterUndo(before, sheet, notifyChange, pushUndo);
}

export function setColumnFilterForCol(
  sheet: FreeformSheetModel,
  col: number,
  condition: ColumnFilterCondition | null,
  notifyChange: (range: CellRange | null) => void,
  pushUndo: (op: Operation) => void,
): void {
  const before = snapshotColumnFilterState(sheet);
  const rest = (sheet.columnFilters ?? []).filter(f => f.col !== col);
  if (condition) rest.push(condition);
  sheet.columnFilters = rest;
  notifyChange(null);
  pushColumnFilterUndo(before, sheet, notifyChange, pushUndo);
}

export function remapColumnFiltersOnPermutation(
  sheet: FreeformSheetModel,
  remapCol: (c: number) => number,
): void {
  if (sheet.columnFilters?.length) {
    sheet.columnFilters = sheet.columnFilters.map(f => ({ ...f, col: remapCol(f.col) }));
  }
  if (sheet.columnFilterCols?.length) {
    sheet.columnFilterCols = sheet.columnFilterCols.map(remapCol).sort((a, b) => a - b);
  }
}
