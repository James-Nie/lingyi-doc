import type { CellRange, CellValue, DataValidation } from '../types/index';
import { cellInRange, rangesOverlap } from './dropdownValidation';

export interface DateValidationConfig {
  includeTime?: boolean;
  allowReminder?: boolean;
}

/** 获取单元格上的日期验证规则 */
export function getDateValidationAt(
  validations: DataValidation[] | undefined,
  row: number,
  col: number,
): DataValidation | null {
  if (!validations?.length) return null;
  for (const validation of validations) {
    if (validation.type === 'date' && cellInRange(row, col, validation.range)) {
      return validation;
    }
  }
  return null;
}

/** 查找与选区相交的日期验证规则 */
export function findDateValidationOverlapping(
  validations: DataValidation[] | undefined,
  range: CellRange,
): DataValidation | null {
  if (!validations?.length) return null;
  for (const validation of validations) {
    if (validation.type === 'date' && rangesOverlap(validation.range, range)) {
      return validation;
    }
  }
  return null;
}

export function isDateValidation(
  validation: DataValidation,
): validation is DataValidation & { type: 'date' } {
  return validation.type === 'date';
}

/** 普通表格日期单元格显示格式（如 2026/7/4 0:00:00） */
export function formatFreeformDateCellText(timestamp: number, includeTime: boolean): string {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (!includeTime) return `${y}/${m}/${day}`;
  const h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  const sec = String(d.getSeconds()).padStart(2, '0');
  return `${y}/${m}/${day} ${h}:${min}:${sec}`;
}

export function cellValueIncludeTime(value: CellValue | undefined): boolean {
  if (!value || value.type !== 'date') return false;
  return value.format.kind === 'datetime' || value.format.kind === 'time';
}

export function validationToDateConfig(validation: DataValidation | null): DateValidationConfig {
  if (!validation || validation.type !== 'date') {
    return { includeTime: false, allowReminder: false };
  }
  return {
    includeTime: validation.includeTime ?? false,
    allowReminder: validation.allowReminder ?? false,
  };
}
