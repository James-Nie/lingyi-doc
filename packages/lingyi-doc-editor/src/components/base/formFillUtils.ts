import type { CellValue } from '@lingyi-doc/core';

/** 判断表单填写值是否为空（用于必填校验） */
export function isEmptyCellValue(value: CellValue | undefined): boolean {
  if (!value || value.type === 'empty') return true;
  if (value.type === 'text') return value.text.trim() === '';
  return false;
}
