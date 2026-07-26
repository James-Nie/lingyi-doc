import type { ColumnDef } from '@lingyi-doc/core-types';

/** 解析列宽：0 表示隐藏列，不能用 || 回退默认值 */
export function resolveColumnWidth(
  col: number,
  columnWidths: Map<number, number>,
  defaultWidth: number,
): number {
  const w = columnWidths.get(col);
  return w !== undefined ? w : defaultWidth;
}

export function isColumnHidden(
  col: number,
  columnDefs?: ColumnDef[],
  columnWidths?: Map<number, number>,
): boolean {
  if (columnDefs?.[col]?.hidden) return true;
  return columnWidths?.get(col) === 0;
}
