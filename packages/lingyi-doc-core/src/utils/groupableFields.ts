import type { ColumnDef, ColumnType } from '../types/index';

/** 可作为分组字段的列类型 */
export const GROUPABLE_COLUMN_TYPES: ColumnType[] = [
  'text',
  'number',
  'currency',
  'percent',
  'select',
  'multiSelect',
  'date',
  'datetime',
  'boolean',
  'user',
  'link',
  'phone',
  'email',
  'autoNumber',
];

export function isGroupableColumn(def: ColumnDef): boolean {
  return GROUPABLE_COLUMN_TYPES.includes(def.type);
}

export function filterGroupableColumns(columnDefs: ColumnDef[]): ColumnDef[] {
  return columnDefs.filter(isGroupableColumn);
}
