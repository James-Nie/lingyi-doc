import type { CellValue, SelectOption } from '../types/index';

/** 根据 id 或 name 查找选项 */
export function findSelectOption(
  options: SelectOption[] | undefined,
  value: string,
): SelectOption | undefined {
  if (!value || !options?.length) return undefined;
  return options.find(o => o.id === value || o.name === value);
}

/** 获取选项展示名称 */
export function getSelectDisplayName(
  options: SelectOption[] | undefined,
  value: string,
): string {
  return findSelectOption(options, value)?.name || value;
}

/** 将单元格值规范为选项 id（兼容历史 name 存储） */
export function normalizeSelectOptionId(
  options: SelectOption[] | undefined,
  value: string,
): string {
  return findSelectOption(options, value)?.id || value;
}

/** 解析多选单元格值为选项 id 列表 */
export function parseMultiSelectOptionIds(
  value: CellValue,
  options?: SelectOption[],
): string[] {
  let raw: string[] = [];
  if (value.type === 'text') {
    raw = value.text.split(',').map(s => s.trim()).filter(Boolean);
  } else if (value.type === 'richtext') {
    raw = value.segments.map(s => s.text).join('').split(',').map(s => s.trim()).filter(Boolean);
  }
  return raw.map(v => normalizeSelectOptionId(options, v));
}

/** 多选 id 列表序列化为单元格存储 */
export function serializeMultiSelectOptionIds(ids: string[]): string {
  return ids.filter(Boolean).join(', ');
}

/** 解析多选展示名称列表 */
export function getMultiSelectDisplayNames(
  value: CellValue,
  options?: SelectOption[],
): string[] {
  return parseMultiSelectOptionIds(value, options).map(id => getSelectDisplayName(options, id));
}
