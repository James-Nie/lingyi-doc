import type { ColumnType } from '@lingyi-doc/core-types';

export type FieldTypeCategory = 'regular' | 'business';

export const FIELD_TYPE_META: Array<{ type: ColumnType; name: string; category: FieldTypeCategory }> = [
  // 常规
  { type: 'text', name: '文本', category: 'regular' },
  { type: 'multilineText', name: '多行文本', category: 'regular' },
  { type: 'select', name: '单选', category: 'regular' },
  { type: 'multiSelect', name: '多选', category: 'regular' },
  { type: 'user', name: '人员', category: 'regular' },
  { type: 'date', name: '日期', category: 'regular' },
  { type: 'datetime', name: '日期时间', category: 'regular' },
  { type: 'attachment', name: '附件', category: 'regular' },
  { type: 'number', name: '数字', category: 'regular' },
  { type: 'boolean', name: '复选框', category: 'regular' },
  { type: 'link', name: '超链接', category: 'regular' },
  { type: 'formula', name: '公式', category: 'regular' },
  // 业务
  { type: 'autoNumber', name: '自动编号', category: 'business' },
  { type: 'phone', name: '电话号码', category: 'business' },
  { type: 'email', name: 'Email', category: 'business' },
  { type: 'progress', name: '进度', category: 'business' },
  { type: 'currency', name: '货币', category: 'business' },
  { type: 'rating', name: '评分', category: 'business' },
  { type: 'percent', name: '百分比', category: 'business' },
  { type: 'createdBy', name: '创建人', category: 'business' },
  { type: 'updatedBy', name: '更新人', category: 'business' },
  { type: 'createdTime', name: '创建时间', category: 'business' },
  { type: 'updatedTime', name: '更新时间', category: 'business' },
];

export function getFieldTypeMeta(type: ColumnType) {
  return FIELD_TYPE_META.find(f => f.type === type) || { type, name: type, category: 'regular' as const };
}

export const FIELD_TYPE_CATEGORIES: Array<{ key: FieldTypeCategory; label: string }> = [
  { key: 'regular', label: '常规' },
  { key: 'business', label: '业务' },
];

/** 字段类型选择器 / 表单面板展示顺序 */
export const FIELD_PALETTE_TYPES: Record<FieldTypeCategory, ColumnType[]> = {
  regular: ['text', 'multilineText', 'select', 'multiSelect', 'user', 'date', 'datetime', 'attachment', 'number', 'boolean', 'link', 'formula'],
  business: [
    'autoNumber', 'phone', 'email', 'progress', 'currency', 'rating', 'percent',
    'createdBy', 'updatedBy', 'createdTime', 'updatedTime',
  ],
};

/** @deprecated 使用 FIELD_PALETTE_TYPES */
export const FORM_PALETTE_CREATABLE_TYPES = FIELD_PALETTE_TYPES;
