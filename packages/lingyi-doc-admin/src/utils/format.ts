import dayjs from 'dayjs';

/**
 * 统一时间/状态格式化（对应评审缺陷：全站 toLocaleString / toLocaleDateString / 时间戳混用）。
 * 新页面一律使用此处函数，避免同一页面出现两种时间格式。
 */

export function formatDateTime(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss');
}

export function formatDate(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return dayjs(value).format('YYYY-MM-DD');
}

export function formatRelative(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return dayjs(value).format('MM-DD HH:mm');
}

/** 文档类型中文名（与后端 DOC_TYPES 白名单保持一致） */
export const DOC_TYPE_LABELS: Record<string, string> = {
  richtext: '文档',
  freeform: '自由画布',
  base: '多维表格',
  mindnote: '思维笔记',
  slides: '幻灯片',
  whiteboard: '画板',
  questionnaire: '问卷',
};

export function docTypeLabel(type: string): string {
  return DOC_TYPE_LABELS[type] ?? type;
}

/** 管理员范围类型展示 */
export function scopeTypeLabel(type: 'all' | 'org'): string {
  return type === 'all' ? '全平台' : '按部门';
}

/** 组织角色（tenant_role）展示：项目已下线 1=超管 */
export const TENANT_ROLE_LABELS: Record<number, string> = {
  2: '管理员',
  3: '普通成员',
};

export function tenantRoleLabel(role: number): string {
  return TENANT_ROLE_LABELS[role] ?? `未知(${role})`;
}

/** 用户状态展示 */
export function userStatusLabel(status: string): string {
  return status === 'active' ? '正常' : '已禁用';
}
