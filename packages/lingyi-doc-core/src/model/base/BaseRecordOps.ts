import type { BaseSheetModel, CellValue, ColumnDef, RecordRow } from '../../types/index';
import { getCellText } from '../../types/index';
import {
  appendRecordCreateHistory,
  appendRecordHistoryChange,
  cellValuesEqual,
} from '../../utils/recordHistory';
import { ensureSheetRows } from '../../utils/rowTree';

export function ensureRowRecords(sheet: BaseSheetModel): void {
  sheet.rows = ensureSheetRows(sheet.rows, sheet.rowCount);
}

export function getRecordTitle(
  sheet: BaseSheetModel,
  getCell: (row: number, col: number) => { value: import('../../types/index').CellValue } | undefined,
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
}

export function markBaseRowsCreated(sheet: BaseSheetModel, index: number, count: number): void {
  ensureRowRecords(sheet);
  for (let row = index; row < index + count; row++) {
    const record: RecordRow | undefined = sheet.rows[row];
    if (record) appendRecordCreateHistory(record);
  }
}
