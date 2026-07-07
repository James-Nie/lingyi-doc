import type { DocInfoOperationCategory, DocInfoOperationRecord } from '../types/document-info';

const ACTION_LABELS: Record<string, string> = {
  create: '开启了文档分享',
  close: '关闭了文档分享',
  add_collaborator: '添加了协作者',
  remove_collaborator: '移除了协作者',
  apply_join: '申请了文档协作权限',
  approve_join: '通过了协作申请',
  reject_join: '拒绝了协作申请',
  duplicate: '创建了文档副本',
  download: '下载了文档',
  export: '下载了文档',
};

export function formatAuditOperation(input: {
  id: string;
  operatorId: string;
  operatorName: string;
  action: string;
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
  createdAt: Date;
}): DocInfoOperationRecord {
  const category = resolveOperationCategory(input.action, input.beforeJson, input.afterJson);
  return {
    id: input.id,
    operatorId: input.operatorId,
    operatorName: input.operatorName || '未知用户',
    action: input.action,
    category,
    summary: buildOperationSummary(input.action, input.beforeJson, input.afterJson),
    createdAt: input.createdAt.getTime(),
  };
}

function resolveOperationCategory(
  action: string,
  beforeJson?: Record<string, unknown> | null,
  afterJson?: Record<string, unknown> | null,
): DocInfoOperationCategory {
  if (action === 'duplicate') return 'duplicate';
  if (action === 'download' || action === 'export') return 'download';
  if (action === 'update' && isPermissionUpdate(beforeJson, afterJson)) return 'permission';
  if (['create', 'close', 'add_collaborator', 'remove_collaborator', 'apply_join', 'approve_join', 'reject_join', 'update'].includes(action)) {
    return 'share';
  }
  return 'share';
}

function isPermissionUpdate(
  beforeJson?: Record<string, unknown> | null,
  afterJson?: Record<string, unknown> | null,
): boolean {
  const keys = ['permissionLevel', 'memberPermissionLevel', 'status', 'memberShareStatus'];
  return keys.some(key => beforeJson?.[key] !== afterJson?.[key]);
}

function buildOperationSummary(
  action: string,
  beforeJson?: Record<string, unknown> | null,
  afterJson?: Record<string, unknown> | null,
): string {
  if (action === 'update' && isPermissionUpdate(beforeJson, afterJson)) {
    const beforeLevel = readPermissionLabel(beforeJson?.permissionLevel ?? beforeJson?.memberPermissionLevel);
    const afterLevel = readPermissionLabel(afterJson?.permissionLevel ?? afterJson?.memberPermissionLevel);
    if (beforeLevel && afterLevel && beforeLevel !== afterLevel) {
      return `把当前页面的链接分享的状态由「${beforeLevel}」变更为「${afterLevel}」`;
    }
    if (beforeJson?.status !== afterJson?.status) {
      const beforeStatus = afterJson?.status === 'active' ? '关闭' : '开启';
      const afterStatus = afterJson?.status === 'active' ? '开启' : '关闭';
      return `把文档分享状态由「${beforeStatus}」变更为「${afterStatus}」`;
    }
    return '更新了文档分享设置';
  }

  if (action === 'add_collaborator') {
    const name = typeof afterJson?.displayName === 'string' ? afterJson.displayName : '协作者';
    return `添加了协作者「${name}」`;
  }

  if (action === 'remove_collaborator') {
    const name = typeof beforeJson?.displayName === 'string' ? beforeJson.displayName : '协作者';
    return `移除了协作者「${name}」`;
  }

  return ACTION_LABELS[action] ?? `执行了操作「${action}」`;
}

function readPermissionLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const map: Record<string, string> = {
    read: '组织内获得链接的人可阅读',
    edit: '组织内获得链接的人可编辑',
    comment: '组织内获得链接的人可评论',
    manage: '组织内获得链接的人可管理',
    none: '禁止访问',
  };
  return map[value] ?? null;
}
