import type { CellRange, DataValidation, SelectOption } from '@lingyi-doc/core-types';

export const DEFAULT_DROPDOWN_OPTION_COLORS = ['#B4A7FF', '#FFB86C', '#69C0FF'];

/** 判断坐标是否在选区内 */
export function cellInRange(row: number, col: number, range: CellRange): boolean {
  return row >= range.start.row && row <= range.end.row
    && col >= range.start.col && col <= range.end.col;
}

/** 判断两个选区是否相交 */
export function rangesOverlap(a: CellRange, b: CellRange): boolean {
  return !(
    a.end.row < b.start.row
    || b.end.row < a.start.row
    || a.end.col < b.start.col
    || b.end.col < a.start.col
  );
}

/** 获取单元格上的下拉列表验证规则 */
export function getDropdownValidationAt(
  validations: DataValidation[] | undefined,
  row: number,
  col: number,
): DataValidation | null {
  if (!validations?.length) return null;
  for (const validation of validations) {
    if (validation.type === 'dropdownList' && cellInRange(row, col, validation.range)) {
      return validation;
    }
  }
  return null;
}

/** 查找与选区相交的下拉列表验证规则 */
export function findDropdownValidationOverlapping(
  validations: DataValidation[] | undefined,
  range: CellRange,
): DataValidation | null {
  if (!validations?.length) return null;
  for (const validation of validations) {
    if (validation.type === 'dropdownList' && rangesOverlap(validation.range, range)) {
      return validation;
    }
  }
  return null;
}

export function isDropdownListValidation(
  validation: DataValidation,
): validation is DataValidation & { type: 'dropdownList'; options: SelectOption[] } {
  return validation.type === 'dropdownList';
}

/** 创建默认下拉选项（3 个带默认名称的选项） */
export function createDefaultDropdownOptions(): SelectOption[] {
  const ts = Date.now();
  return DEFAULT_DROPDOWN_OPTION_COLORS.map((color, index) => ({
    id: `opt_${ts}_${index}`,
    name: `选项${index + 1}`,
    color,
  }));
}

/** 规范化下拉选项：保留全部条目，空名称自动补「选项N」 */
export function normalizeDropdownOptions(options: SelectOption[]): SelectOption[] {
  const source = options.length > 0 ? options : createDefaultDropdownOptions();
  const ts = Date.now();
  return source.map((option, index) => ({
    ...option,
    id: option.id?.trim() || `opt_${ts}_${index}`,
    name: option.name.trim() || `选项${index + 1}`,
    color: option.color || DEFAULT_DROPDOWN_OPTION_COLORS[index % DEFAULT_DROPDOWN_OPTION_COLORS.length],
  }));
}
