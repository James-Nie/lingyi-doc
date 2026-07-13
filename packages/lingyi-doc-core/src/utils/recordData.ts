import type { ColumnDef } from '../types/index';
import { getGroupKey, GROUP_EMPTY_KEY } from './recordGrouping';

/** 记录行是否至少有一个非空字段值 */
export function recordRowHasFieldData(
  getFieldValue: (recordRow: number, col: number) => unknown,
  columnDefs: ColumnDef[],
  recordRow: number,
): boolean {
  for (let c = 0; c < columnDefs.length; c++) {
    const value = getFieldValue(recordRow, c);
    if (getGroupKey(value) !== GROUP_EMPTY_KEY) return true;
  }
  return false;
}

/** 指定列中记录行是否至少有一个非空字段值 */
export function recordRowHasFieldDataForColumns(
  getFieldValue: (recordRow: number, col: number) => unknown,
  columnIndices: number[],
  recordRow: number,
): boolean {
  for (const col of columnIndices) {
    const value = getFieldValue(recordRow, col);
    if (getGroupKey(value) !== GROUP_EMPTY_KEY) return true;
  }
  return false;
}

/** 查找第一条尚无表单字段数据的记录行；若均已占用则返回 rowCount */
export function findFirstEmptyRecordRow(
  rowCount: number,
  columnIndices: number[],
  getFieldValue: (recordRow: number, col: number) => unknown,
): number {
  for (let r = 0; r < rowCount; r++) {
    if (!recordRowHasFieldDataForColumns(getFieldValue, columnIndices, r)) return r;
  }
  return rowCount;
}
