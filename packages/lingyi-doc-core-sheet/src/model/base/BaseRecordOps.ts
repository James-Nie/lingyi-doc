import type { BaseSheetModel, CellValue, ColumnDef, RecordRow } from '@lingyi-doc/core-types';
import { getCellText } from '@lingyi-doc/core-types';
import {
  appendRecordCreateHistory,
  appendRecordHistoryChange,
  cellValuesEqual,
} from '../../utils/recordHistory';
import { ensureSheetRows } from '../../utils/rowTree';
import { syncSystemFieldCellsForRow } from '../../utils/systemFields';

export function ensureRowRecords(sheet: BaseSheetModel): void {
  sheet.rows = ensureSheetRows(sheet.rows, sheet.rowCount);
}

export function getRecordTitle(
  sheet: BaseSheetModel,
  getCell: (row: number, col: number) => { value: import('@lingyi-doc/core-types').CellValue } | undefined,
  row: number,
): string {
  const titleCol = sheet.columnDefs.find(c => c.type === 'text') || sheet.columnDefs[0];
  if (!titleCol) return '未命名记录';
  const colIndex = sheet.columnDefs.findIndex(c => c.id === titleCol.id);
  const cell = getCell(row, colIndex);
  const text = getCellText(cell?.value ?? { type: 'empty' });
  return text.trim() || '未命名记录';
}

export function maybeRecordFieldChange(
  sheet: BaseSheetModel,
  row: number,
  col: number,
  before: CellValue,
  after: CellValue,
  skipHistory?: boolean,
  onSyncSystemFields?: (row: number) => void,
): void {
  if (skipHistory || cellValuesEqual(before, after)) return;
  ensureRowRecords(sheet);
  const record = sheet.rows[row];
  const colDef: ColumnDef | undefined = sheet.columnDefs[col];
  if (!record || !colDef) return;
  appendRecordHistoryChange(record, {
    action: 'update',
    fieldId: colDef.id,
    before: before.type === 'empty' ? undefined : before,
    after: after.type === 'empty' ? undefined : after,
  });
  onSyncSystemFields?.(row);
}

export function markBaseRowsCreated(
  sheet: BaseSheetModel,
  index: number,
  count: number,
  onSyncSystemFields?: (row: number) => void,
): void {
  ensureRowRecords(sheet);
  for (let row = index; row < index + count; row++) {
    const record: RecordRow | undefined = sheet.rows[row];
    if (record) appendRecordCreateHistory(record);
    onSyncSystemFields?.(row);
  }
}

/** 供 FreeTable 注入的系统字段写回 */
export function writeSystemFieldsForRow(
  sheet: BaseSheetModel,
  row: number,
  setCell: (row: number, col: number, value: CellValue) => void,
  onlyUpdated = false,
): void {
  syncSystemFieldCellsForRow(sheet, row, setCell, { onlyUpdated });
}
