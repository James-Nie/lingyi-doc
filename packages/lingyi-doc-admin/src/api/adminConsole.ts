import { adminFetch } from '../stores/authStore';

/** 统一分页响应（P0 起新接口一律使用该结构，修复评审 F11 的分页契约不一致） */
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ================================================================
// P0-1 内容治理台
// ================================================================

export interface AdminDocumentItem {
  id: string;
  title: string;
  docType: string;
  scope: number;
  ownerId: string | null;
  ownerName: string | null;
  tenantId: string | null;
  tenantName: string | null;
  orgId: string | null;
  orgName: string | null;
  currentVersion: number;
  isDeleted: boolean;
  deletedAt: number | null;
  archivedAt: number | null;
  lastVisitedAt: number | null;
  createdAt: number | null;
  updatedAt: number | null;
  activeShareCount: number;
}

export interface AdminDocumentStats {
  total: number;
  teamDocuments: number;
  personalDocuments: number;
  archived: number;
  trashed: number;
  activeShares: number;
}

export interface AdminDocumentDetail extends AdminDocumentItem {
  collaboratorCount: number;
  visitCount: number;
  lastVisitAt: number | null;
  share: {
    status: boolean;
    permissionLevel: string;
    expireTime: number | null;
    hasPassword: boolean;
    allowDownload: boolean;
    allowCopy: boolean;
    allowPrint: boolean;
    watermarkEnabled: boolean;
  } | null;
}

export interface DocumentListQuery {
  keyword?: string;
  docType?: string;
  scope?: number;
  tenantId?: string;
  orgId?: string;
  ownerId?: string;
  deleted?: 'true' | 'false';
  archived?: 'true' | 'false';
  startDate?: string;
  endDate?: string;
  sortBy?: 'created_at' | 'updated_at' | 'title' | 'last_visited_at';
  sortOrder?: 'ASC' | 'DESC';
  page?: number;
  pageSize?: number;
}

function qs(params: object): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const documentApi = {
  stats: () => adminFetch<AdminDocumentStats>('/api/v1/admin/documents/stats'),
  list: (query: DocumentListQuery) =>
    adminFetch<Paged<AdminDocumentItem> & { scopeType: string }>(`/api/v1/admin/documents${qs(query)}`),
  detail: (id: string) => adminFetch<AdminDocumentDetail>(`/api/v1/admin/documents/${encodeURIComponent(id)}`),
  exportUrl: (query: DocumentListQuery) => `/api/v1/admin/documents/export${qs(query)}`,
  transfer: (docIds: string[], targetOwnerId: string) =>
    adminFetch<{ success: boolean; affected: number; rejected: string[] }>('/api/v1/admin/documents/transfer', {
      method: 'POST',
      body: JSON.stringify({ docIds, targetOwnerId }),
    }),
  archive: (docIds: string[], archived: boolean) =>
    adminFetch<{ success: boolean; affected: number }>('/api/v1/admin/documents/archive', {
      method: 'POST',
      body: JSON.stringify({ docIds, archived }),
    }),
  remove: (docIds: string[]) =>
    adminFetch<{ success: boolean; affected: number }>('/api/v1/admin/documents/delete', {
      method: 'POST',
      body: JSON.stringify({ docIds }),
    }),
  restore: (docIds: string[]) =>
    adminFetch<{ success: boolean; affected: number }>('/api/v1/admin/documents/restore', {
      method: 'POST',
      body: JSON.stringify({ docIds }),
    }),
  purge: (docIds: string[]) =>
    adminFetch<{ success: boolean; purged: number; skipped: string[] }>('/api/v1/admin/documents/purge', {
      method: 'POST',
      body: JSON.stringify({ docIds }),
    }),
};

// ================================================================
// P0-2 外发与安全管控
// ================================================================

export interface SharePolicy {
  tenantId: string;
  linkShareEnabled: boolean;
  allowExternalShare: boolean;
  maxExpireDays: number;
  forceDisableDownload: boolean;
  forceDisableCopy: boolean;
  forceDisablePrint: boolean;
  forceWatermark: boolean;
  watermarkText: string | null;
  requirePassword: boolean;
  updatedBy: string | null;
  updatedAt: number | null;
  isDefault: boolean;
}

export interface SharePolicyEffective extends SharePolicy {
  uiHints: {
    hideExternalShareOption: boolean;
    disableLinkShare: boolean;
    disableUnlimitedExpire: boolean;
    lockDownloadSwitch: boolean;
    lockCopySwitch: boolean;
    lockPrintSwitch: boolean;
    lockWatermarkSwitch: boolean;
  };
}

export const sharePolicyApi = {
  get: (tenantId?: string) => adminFetch<SharePolicy>(`/api/v1/admin/security/share-policy${qs({ tenantId })}`),
  effective: (tenantId?: string) =>
    adminFetch<SharePolicyEffective>(`/api/v1/admin/security/share-policy/effective${qs({ tenantId })}`),
  update: (patch: Partial<SharePolicy>, tenantId?: string) =>
    adminFetch<SharePolicy>(`/api/v1/admin/security/share-policy${qs({ tenantId })}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
};

// ================================================================
// P0-3 角色 / 权限点 / 管理组
// ================================================================

export interface PermissionItem {
  code: string;
  name: string;
  superAdminOnly: boolean;
}

export interface PermissionGroup {
  group: string;
  label: string;
  items: PermissionItem[];
}

export interface AdminRoleItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
  groupCount: number;
  superAdminOnlyPermissions: string[];
}

export interface AdminGroupItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  scopeType: 'all' | 'org';
  isSystem: boolean;
  memberCount: number;
  /** 成员用户 ID 列表，覆盖式保存成员时必须回填，否则会误清空 */
  memberIds: string[];
  roles: Array<{ id: string; code: string; name: string }>;
  orgs: Array<{ id: string; name: string; includeChildren: boolean }>;
  createdAt: number;
  updatedAt: number;
}

export type AdminScope = { type: 'all' } | { type: 'orgs'; orgIds: string[] } | { type: 'none' };

export interface MeScope {
  scope: AdminScope;
  permissions: string[];
  roles: Array<{ code: string; name: string }>;
  groups: Array<{ id: string; code: string; name: string; scopeType: string }>;
}

export const roleApi = {
  permissions: () => adminFetch<{ groups: PermissionGroup[]; total: number }>('/api/v1/admin/permissions'),
  list: () => adminFetch<{ items: AdminRoleItem[]; total: number }>('/api/v1/admin/roles'),
  create: (payload: { code: string; name: string; description?: string | null; permissionCodes: string[] }) =>
    adminFetch<{ id: string; rejectedSuperAdminOnly: string[] }>('/api/v1/admin/roles', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  update: (id: string, payload: { name?: string; description?: string | null; permissionCodes?: string[] }) =>
    adminFetch<{ success: boolean; rejectedSuperAdminOnly: string[] }>(
      `/api/v1/admin/roles/${encodeURIComponent(id)}`,
      { method: 'PUT', body: JSON.stringify(payload) },
    ),
  remove: (id: string) =>
    adminFetch<{ success: boolean }>(`/api/v1/admin/roles/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export const groupApi = {
  list: () => adminFetch<{ items: AdminGroupItem[]; total: number }>('/api/v1/admin/groups'),
  detail: (id: string) => adminFetch<AdminGroupItem>(`/api/v1/admin/groups/${encodeURIComponent(id)}`),
  create: (payload: { code: string; name: string; description?: string | null; scopeType: 'all' | 'org' }) =>
    adminFetch<AdminGroupItem>('/api/v1/admin/groups', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: { name?: string; description?: string | null; scopeType?: 'all' | 'org' }) =>
    adminFetch<AdminGroupItem>(`/api/v1/admin/groups/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  remove: (id: string) =>
    adminFetch<{ success: boolean }>(`/api/v1/admin/groups/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  setRoles: (id: string, roleIds: string[]) =>
    adminFetch<{ success: boolean }>(`/api/v1/admin/groups/${encodeURIComponent(id)}/roles`, {
      method: 'PUT',
      body: JSON.stringify({ roleIds }),
    }),
  setMembers: (id: string, userIds: string[]) =>
    adminFetch<{ success: boolean; memberCount: number; invalidRejected: string[] }>(
      `/api/v1/admin/groups/${encodeURIComponent(id)}/members`,
      { method: 'PUT', body: JSON.stringify({ userIds }) },
    ),
  setOrgs: (id: string, orgs: Array<{ orgId: string; includeChildren: boolean }>) =>
    adminFetch<{ success: boolean; orgCount: number; invalidRejected: string[] }>(
      `/api/v1/admin/groups/${encodeURIComponent(id)}/orgs`,
      { method: 'PUT', body: JSON.stringify({ orgs }) },
    ),
  meScope: () => adminFetch<MeScope>('/api/v1/admin/me/scope'),
};

// ================================================================
// P0-6 C 端用户管理
// ================================================================

export interface ConsumerUserItem {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  phone?: string | null;
  masked?: boolean;
  lastLoginAt?: number | null;
}

export interface ConsumerUserStats {
  total: number;
  active: number;
  suspended: number;
  locked: number;
  newLast7d: number;
  localAccounts: number;
  oauthAccounts: number;
}

export interface ConsumerUserDetail extends ConsumerUserItem {
  lastLoginAt: number | null;
  loginFailCount: number;
  lockedUntil: number | null;
  needChangePassword: boolean;
  importedFrom: string | null;
  lastOauthLoginAt: number | null;
  createdAt: number | null;
  memberships: Array<{
    tenantId: string;
    tenantName: string;
    orgId: string | null;
    orgName: string | null;
    positionId: string | null;
    positionName: string | null;
    tenantRole: number;
    status: number;
    joinedAt: number | null;
  }>;
  sessionCount: number;
  documentCount: number;
  oauthBindings: Array<{
    provider: string;
    providerUserId: string;
    boundAt: number | null;
    lastUsedAt: number | null;
  }>;
}

export const consumerUserApi = {
  list: (query: { keyword?: string; status?: string; page?: number; pageSize?: number }) =>
    adminFetch<Paged<ConsumerUserItem>>(`/api/v1/admin/users${qs(query)}`),
  stats: () => adminFetch<ConsumerUserStats>('/api/v1/admin/users/stats'),
  detail: (userId: string) => adminFetch<ConsumerUserDetail>(`/api/v1/admin/users/${encodeURIComponent(userId)}`),
  updateStatus: (userId: string, status: 'active' | 'suspended', reason?: string) =>
    adminFetch<{ success: boolean; revokedSessions: number }>(
      `/api/v1/admin/users/${encodeURIComponent(userId)}/status`,
      { method: 'PATCH', body: JSON.stringify({ status, reason }) },
    ),
  unlock: (userId: string) =>
    adminFetch<{ success: boolean }>(`/api/v1/admin/users/${encodeURIComponent(userId)}/unlock`, { method: 'POST' }),
  forceLogout: (userId: string) =>
    adminFetch<{ success: boolean; revoked: number }>(
      `/api/v1/admin/users/${encodeURIComponent(userId)}/force-logout`,
      { method: 'POST' },
    ),
  resetPassword: (userId: string, password?: string) =>
    adminFetch<{ success: boolean; tempPassword: string; revokedSessions: number }>(
      `/api/v1/admin/users/${encodeURIComponent(userId)}/reset-password`,
      { method: 'POST', body: JSON.stringify({ password }) },
    ),
};

// ================================================================
// P0-7 审计日志
// ================================================================

export interface AuditLogItem {
  id: number;
  operatorId: string;
  operatorName: string | null;
  action: string;
  actionLabel: string;
  module: string | null;
  result: string;
  targetType: string | null;
  targetId: string | null;
  detail: unknown;
  ip: string | null;
  createdAt: number;
}

export interface AuditLogDetail extends AuditLogItem {
  userAgent: string | null;
  moduleLabel: string | null;
}

export interface AuditFacets {
  days: number;
  modules: Array<{ value: string; label: string }>;
  actions: Array<{ value: string; label: string; module: string; count: number }>;
  operators: Array<{ userId: string; displayName: string | null; count: number }>;
  results: Array<{ value: string; label: string }>;
}

export interface AuditRetention {
  retentionDays: number;
  minDays: number;
  maxDays: number;
  lastCleanupAt: string | null;
  total: number;
  earliestCreatedAt: number | null;
  expiredCount: number;
  complianceNote: string;
}

export interface AuditListQuery {
  operatorId?: string;
  action?: string;
  actionKeyword?: string;
  module?: string;
  result?: string;
  targetType?: string;
  keyword?: string;
  startDate?: string;
  endDate?: string;
  sortOrder?: 'ASC' | 'DESC';
  page?: number;
  pageSize?: number;
}

export const auditApi = {
  list: (query: AuditListQuery) => adminFetch<Paged<AuditLogItem>>(`/api/v1/admin/audit-logs${qs(query)}`),
  detail: (id: number) => adminFetch<AuditLogDetail>(`/api/v1/admin/audit-logs/${id}`),
  facets: (days = 90) => adminFetch<AuditFacets>(`/api/v1/admin/audit-logs/facets${qs({ days })}`),
  exportUrl: (query: AuditListQuery) => `/api/v1/admin/audit-logs/export${qs(query)}`,
  retention: () => adminFetch<AuditRetention>('/api/v1/admin/audit-logs/retention'),
  updateRetention: (retentionDays: number) =>
    adminFetch<{ success: boolean; retentionDays: number }>('/api/v1/admin/audit-logs/retention', {
      method: 'PUT',
      body: JSON.stringify({ retentionDays }),
    }),
  cleanup: (retentionDays: number, dryRun = false) =>
    adminFetch<{ success: boolean; deleted?: number; wouldDelete?: number; beforeTotal?: number; cutoff: string }>(
      '/api/v1/admin/audit-logs/cleanup',
      { method: 'POST', body: JSON.stringify({ retentionDays, dryRun }) },
    ),
};
