import type { BaseSheetModel, CellValue, ColumnDef, ColumnType, RecordRow } from '@lingyi-doc/core-types';
import { formatRecordOperator } from './recordHistory';

export const SYSTEM_COLUMN_TYPES = [
  'createdBy',
  'updatedBy',
  'createdTime',
  'updatedTime',
] as const;

export type SystemColumnType = (typeof SYSTEM_COLUMN_TYPES)[number];

export function isSystemColumnType(type: ColumnType | string | undefined): type is SystemColumnType {
  return !!type && (SYSTEM_COLUMN_TYPES as readonly string[]).includes(type);
}

export function systemFieldCellValue(type: SystemColumnType, record: RecordRow): CellValue {
  switch (type) {
    case 'createdBy':
      return { type: 'text', text: formatRecordOperator(record._createdBy) };
    case 'updatedBy':
      return { type: 'text', text: formatRecordOperator(record._updatedBy) };
    case 'createdTime':
      return {
        type: 'date',
        timestamp: record._createdAt,
        format: { kind: 'datetime' },
      };
    case 'updatedTime':
      return {
        type: 'date',
        timestamp: record._updatedAt,
        format: { kind: 'datetime' },
      };
  }
}

/** 将行元数据同步到系统字段单元格 */
export function syncSystemFieldCellsForRow(
  sheet: BaseSheetModel,
  row: number,
  setCell: (row: number, col: number, value: CellValue) => void,
  options?: { onlyUpdated?: boolean },
): void {
  const record = sheet.rows[row];
  if (!record) return;
  for (let c = 0; c < sheet.columnDefs.length; c++) {
    const colDef = sheet.columnDefs[c];
    if (!isSystemColumnType(colDef.type)) continue;
    if (options?.onlyUpdated && (colDef.type === 'createdBy' || colDef.type === 'createdTime')) {
      continue;
    }
    setCell(row, c, systemFieldCellValue(colDef.type, record));
  }
}

/** 新增系统字段列后，按已有行元数据回填 */
export function backfillSystemFieldColumn(
  sheet: BaseSheetModel,
  colIndex: number,
  setCell: (row: number, col: number, value: CellValue) => void,
): void {
  const colDef = sheet.columnDefs[colIndex];
  if (!colDef || !isSystemColumnType(colDef.type)) return;
  for (let row = 0; row < sheet.rows.length; row++) {
    const record = sheet.rows[row];
    if (!record) continue;
    setCell(row, colIndex, systemFieldCellValue(colDef.type, record));
  }
}

/** 创建系统字段时的默认列宽 / 日期格式 */
export function applySystemColumnDefaults(field: ColumnDef): ColumnDef {
  if (field.type === 'createdBy' || field.type === 'updatedBy') {
    return { ...field, width: field.width ?? 140 };
  }
  if (field.type === 'createdTime' || field.type === 'updatedTime') {
    return {
      ...field,
      width: field.width ?? 150,
      format: field.format || 'YYYY/MM/DD HH:mm',
    };
  }
  return field;
}
