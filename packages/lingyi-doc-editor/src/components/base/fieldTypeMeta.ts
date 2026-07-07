import type { ColumnType } from '@lingyi-doc/core';

export const FIELD_TYPE_META: Array<{ type: ColumnType; name: string; icon: string; category: 'basic' | 'common' | 'advanced' }> = [
  { type: 'text', name: '文本', icon: 'A≡', category: 'basic' },
  { type: 'select', name: '单选', icon: '◉', category: 'basic' },
  { type: 'multiSelect', name: '多选', icon: '☑', category: 'basic' },
  { type: 'date', name: '日期', icon: '📅', category: 'basic' },
  { type: 'attachment', name: '附件', icon: '📎', category: 'basic' },
  { type: 'number', name: '数字', icon: '123', category: 'basic' },
  { type: 'user', name: '人员', icon: '👤', category: 'basic' },
  { type: 'rating', name: '评分', icon: '★', category: 'common' },
  { type: 'progress', name: '进度', icon: '▓', category: 'common' },
  { type: 'boolean', name: '复选框', icon: '☐', category: 'common' },
  { type: 'link', name: '超链接', icon: '🔗', category: 'common' },
  { type: 'phone', name: '电话号码', icon: '📞', category: 'common' },
  { type: 'email', name: 'Email', icon: '@', category: 'common' },
  { type: 'currency', name: '货币', icon: '¥', category: 'common' },
  { type: 'percent', name: '百分比', icon: '%', category: 'common' },
  { type: 'datetime', name: '日期时间', icon: '📅', category: 'basic' },
  { type: 'formula', name: '公式', icon: 'ƒ', category: 'advanced' },
  { type: 'autoNumber', name: '自动编号', icon: '#', category: 'advanced' },
];

export function getFieldTypeMeta(type: ColumnType) {
  return FIELD_TYPE_META.find(f => f.type === type) || { type, name: type, icon: '?', category: 'basic' as const };
}

export const FIELD_TYPE_CATEGORIES = [
  { key: 'basic' as const, label: '基础题型' },
  { key: 'common' as const, label: '常用题型' },
  { key: 'advanced' as const, label: '高级题型' },
];

/** 表单左侧「新增题目」面板展示的字段类型（按分类） */
export const FORM_PALETTE_CREATABLE_TYPES: Record<'basic' | 'common' | 'advanced', ColumnType[]> = {
  basic: ['text', 'select', 'multiSelect', 'date', 'attachment', 'number', 'user'],
  common: ['rating', 'progress', 'boolean', 'link', 'phone', 'email', 'currency'],
  advanced: ['formula', 'autoNumber'],
};
