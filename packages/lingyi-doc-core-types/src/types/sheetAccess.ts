import type { CellRange, ColumnDef, ColumnFilterCondition, RecordRow } from './index';
import { isBaseSheet, isFreeformSheet } from './sheetGuards';

export function getSheetMergeRanges(sheet: import('./index').SheetModel): CellRange[] {
  return isFreeformSheet(sheet) ? sheet.mergeRanges : [];
}

export function getSheetColumnDefs(sheet: import('./index').SheetModel): ColumnDef[] {
  return isBaseSheet(sheet) ? sheet.columnDefs : [];
}

export function getSheetRows(sheet: import('./index').SheetModel): RecordRow[] {
  return isBaseSheet(sheet) ? sheet.rows : [];
}

export function getSheetColumnFilters(sheet: import('./index').SheetModel): ColumnFilterCondition[] {
  return isFreeformSheet(sheet) ? (sheet.columnFilters ?? []) : [];
}
