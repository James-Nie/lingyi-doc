export const ADMIN_ROLE_CODES = {
  SUPER_ADMIN: 'super_admin',
  OPERATOR: 'operator',
  SUPPORT: 'support',
  AUDITOR: 'auditor',
} as const;

export const PERMISSIONS = {
  DASHBOARD_READ: 'dashboard:read',
  USER_READ: 'user:read',
  USER_WRITE: 'user:write',
  USER_SUSPEND: 'user:suspend',
  ADMIN_USER_READ: 'admin_user:read',
  ADMIN_USER_WRITE: 'admin_user:write',
  CONFIG_READ: 'config:read',
  CONFIG_WRITE: 'config:write',
  DOCUMENT_READ: 'document:read',
  AUDIT_READ: 'audit:read',
  ANALYTICS_READ: 'analytics:read',
  DEMO_READ: 'demo:read',
  DEMO_WRITE: 'demo:write',
  PLATFORM_TENANT_READ: 'platform:tenant:read',
  TENANT_ORG_READ: 'tenant:org:read',
  TENANT_ORG_WRITE: 'tenant:org:write',
  TENANT_MEMBER_READ: 'tenant:member:read',
  TENANT_MEMBER_WRITE: 'tenant:member:write',
  TENANT_DOCUMENT_READ: 'tenant:document:read',
  TEMPLATE_READ: 'template:read',
  TEMPLATE_WRITE: 'template:write',
  AI_CONFIG_READ: 'ai:config:read',
  AI_CONFIG_WRITE: 'ai:config:write',
  AI_USAGE_READ: 'ai:usage:read',
  STORAGE_READ: 'storage:read',
  STORAGE_WRITE: 'storage:write',
  API_KEY_READ: 'api_key:read',
  API_KEY_WRITE: 'api_key:write',
  // ---- 2026-09-19 新增：管理后台 P0 能力建设 ----
  DOCUMENT_WRITE: 'document:write',
  DOCUMENT_EXPORT: 'document:export',
  DOCUMENT_PURGE: 'document:purge',
  AUDIT_MANAGE: 'audit:manage',
  ADMIN_GROUP_READ: 'admin_group:read',
  ADMIN_GROUP_WRITE: 'admin_group:write',
  SECURITY_POLICY_READ: 'security:policy:read',
  SECURITY_POLICY_WRITE: 'security:policy:write',
} as const;

/** 权限点分组元数据：用于前端权限勾选面板的分组展示 */
export const PERMISSION_GROUPS: Array<{ group: string; label: string; codes: string[] }> = [
  { group: 'dashboard', label: '概览', codes: [PERMISSIONS.DASHBOARD_READ] },
  { group: 'users', label: 'C 端用户', codes: [PERMISSIONS.USER_READ, PERMISSIONS.USER_WRITE, PERMISSIONS.USER_SUSPEND] },
  { group: 'documents', label: '内容治理', codes: [PERMISSIONS.DOCUMENT_READ, PERMISSIONS.DOCUMENT_WRITE, PERMISSIONS.DOCUMENT_EXPORT, PERMISSIONS.DOCUMENT_PURGE] },
  { group: 'templates', label: '模板管理', codes: [PERMISSIONS.TEMPLATE_READ, PERMISSIONS.TEMPLATE_WRITE] },
  { group: 'admins', label: '管理员与权限', codes: [PERMISSIONS.ADMIN_USER_READ, PERMISSIONS.ADMIN_USER_WRITE, PERMISSIONS.ADMIN_GROUP_READ, PERMISSIONS.ADMIN_GROUP_WRITE] },
  { group: 'security', label: '安全策略', codes: [PERMISSIONS.SECURITY_POLICY_READ, PERMISSIONS.SECURITY_POLICY_WRITE, PERMISSIONS.CONFIG_READ, PERMISSIONS.CONFIG_WRITE] },
  { group: 'audit', label: '审计与合规', codes: [PERMISSIONS.AUDIT_READ, PERMISSIONS.AUDIT_MANAGE] },
  { group: 'tenant', label: '租户与组织', codes: [PERMISSIONS.PLATFORM_TENANT_READ, PERMISSIONS.TENANT_ORG_READ, PERMISSIONS.TENANT_ORG_WRITE, PERMISSIONS.TENANT_MEMBER_READ, PERMISSIONS.TENANT_MEMBER_WRITE, PERMISSIONS.TENANT_DOCUMENT_READ] },
  { group: 'analytics', label: '运营数据', codes: [PERMISSIONS.ANALYTICS_READ, PERMISSIONS.STORAGE_READ, PERMISSIONS.STORAGE_WRITE, PERMISSIONS.AI_USAGE_READ] },
  { group: 'ai', label: 'AI 管理', codes: [PERMISSIONS.AI_CONFIG_READ, PERMISSIONS.AI_CONFIG_WRITE] },
  { group: 'integration', label: '集成与开放', codes: [PERMISSIONS.API_KEY_READ, PERMISSIONS.API_KEY_WRITE] },
  { group: 'demo', label: '商机管理', codes: [PERMISSIONS.DEMO_READ, PERMISSIONS.DEMO_WRITE] },
];

/** 仅超级管理员可持有的高危权限，不允许下放到自定义角色（等保 8.1.4.2 d 最小权限/权限分离） */
export const SUPER_ADMIN_ONLY_PERMISSIONS: string[] = [
  PERMISSIONS.DOCUMENT_PURGE,
  PERMISSIONS.AUDIT_MANAGE,
  PERMISSIONS.ADMIN_USER_WRITE,
  PERMISSIONS.ADMIN_GROUP_WRITE,
  PERMISSIONS.SECURITY_POLICY_WRITE,
  PERMISSIONS.CONFIG_WRITE,
];

export const ALL_PERMISSIONS: Array<{ code: string; name: string; module: string }> = [
  { code: PERMISSIONS.DASHBOARD_READ, name: '查看概览', module: 'dashboard' },
  { code: PERMISSIONS.USER_READ, name: '查看 C 端用户', module: 'users' },
  { code: PERMISSIONS.USER_WRITE, name: '编辑 C 端用户', module: 'users' },
  { code: PERMISSIONS.USER_SUSPEND, name: '禁用/启用用户', module: 'users' },
  { code: PERMISSIONS.ADMIN_USER_READ, name: '查看管理员', module: 'admins' },
  { code: PERMISSIONS.ADMIN_USER_WRITE, name: '管理管理员', module: 'admins' },
  { code: PERMISSIONS.CONFIG_READ, name: '查看系统配置', module: 'configs' },
  { code: PERMISSIONS.CONFIG_WRITE, name: '修改系统配置', module: 'configs' },
  { code: PERMISSIONS.DOCUMENT_READ, name: '查看文档元数据', module: 'documents' },
  { code: PERMISSIONS.AUDIT_READ, name: '查看审计日志', module: 'audit' },
  { code: PERMISSIONS.ANALYTICS_READ, name: '查看运营数据', module: 'analytics' },
  { code: PERMISSIONS.DEMO_READ, name: '查看预约演示', module: 'demo' },
  { code: PERMISSIONS.DEMO_WRITE, name: '处理预约演示', module: 'demo' },
  { code: PERMISSIONS.PLATFORM_TENANT_READ, name: '查看平台租户', module: 'tenants' },
  { code: PERMISSIONS.TENANT_ORG_READ, name: '查看租户组织', module: 'tenant' },
  { code: PERMISSIONS.TENANT_ORG_WRITE, name: '管理租户组织', module: 'tenant' },
  { code: PERMISSIONS.TENANT_MEMBER_READ, name: '查看租户成员', module: 'tenant' },
  { code: PERMISSIONS.TENANT_MEMBER_WRITE, name: '管理租户成员', module: 'tenant' },
  { code: PERMISSIONS.TENANT_DOCUMENT_READ, name: '查看租户文档', module: 'tenant' },
  { code: PERMISSIONS.TEMPLATE_READ, name: '查看文档模板', module: 'templates' },
  { code: PERMISSIONS.TEMPLATE_WRITE, name: '管理文档模板', module: 'templates' },
  { code: PERMISSIONS.AI_CONFIG_READ, name: '查看 AI 模型配置', module: 'ai' },
  { code: PERMISSIONS.AI_CONFIG_WRITE, name: '管理 AI 模型配置', module: 'ai' },
  { code: PERMISSIONS.AI_USAGE_READ, name: '查看 AI 用量监控', module: 'ai' },
  { code: PERMISSIONS.STORAGE_READ, name: '查看存储容量', module: 'storage' },
  { code: PERMISSIONS.STORAGE_WRITE, name: '管理存储配额', module: 'storage' },
  { code: PERMISSIONS.API_KEY_READ, name: '查看 API 密钥', module: 'api_keys' },
  { code: PERMISSIONS.API_KEY_WRITE, name: '管理 API 密钥', module: 'api_keys' },
  // ---- 2026-09-19 新增 ----
  { code: PERMISSIONS.DOCUMENT_WRITE, name: '治理文档（转移/归档/删除）', module: 'documents' },
  { code: PERMISSIONS.DOCUMENT_EXPORT, name: '导出文档清单', module: 'documents' },
  { code: PERMISSIONS.DOCUMENT_PURGE, name: '彻底删除文档（回收站）', module: 'documents' },
  { code: PERMISSIONS.AUDIT_MANAGE, name: '管理审计日志保留策略', module: 'audit' },
  { code: PERMISSIONS.ADMIN_GROUP_READ, name: '查看管理组', module: 'admin_groups' },
  { code: PERMISSIONS.ADMIN_GROUP_WRITE, name: '管理管理组与范围', module: 'admin_groups' },
  { code: PERMISSIONS.SECURITY_POLICY_READ, name: '查看外发安全策略', module: 'security' },
  { code: PERMISSIONS.SECURITY_POLICY_WRITE, name: '配置外发安全策略', module: 'security' },
];

export const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  [ADMIN_ROLE_CODES.SUPER_ADMIN]: ALL_PERMISSIONS.map(p => p.code),
  [ADMIN_ROLE_CODES.OPERATOR]: [
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_WRITE,
    PERMISSIONS.USER_SUSPEND,
    PERMISSIONS.CONFIG_READ,
    PERMISSIONS.CONFIG_WRITE,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.DEMO_READ,
    PERMISSIONS.DEMO_WRITE,
    PERMISSIONS.PLATFORM_TENANT_READ,
    PERMISSIONS.TENANT_ORG_READ,
    PERMISSIONS.TENANT_ORG_WRITE,
    PERMISSIONS.TENANT_MEMBER_READ,
    PERMISSIONS.TENANT_MEMBER_WRITE,
    PERMISSIONS.TENANT_DOCUMENT_READ,
    PERMISSIONS.TEMPLATE_READ,
    PERMISSIONS.TEMPLATE_WRITE,
    PERMISSIONS.AI_CONFIG_READ,
    PERMISSIONS.AI_CONFIG_WRITE,
    PERMISSIONS.AI_USAGE_READ,
    PERMISSIONS.STORAGE_READ,
    PERMISSIONS.API_KEY_READ,
    PERMISSIONS.API_KEY_WRITE,
    PERMISSIONS.DOCUMENT_WRITE,
    PERMISSIONS.DOCUMENT_EXPORT,
    PERMISSIONS.ADMIN_GROUP_READ,
    PERMISSIONS.SECURITY_POLICY_READ,
  ],
  [ADMIN_ROLE_CODES.SUPPORT]: [
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.USER_READ,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DEMO_READ,
    PERMISSIONS.TEMPLATE_READ,
    PERMISSIONS.ADMIN_GROUP_READ,
  ],
  [ADMIN_ROLE_CODES.AUDITOR]: [
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.AI_USAGE_READ,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_EXPORT,
    PERMISSIONS.SECURITY_POLICY_READ,
  ],
};

/** 租户后台（后台「租户管理」模块）的权限集合。持有其中任一权限的角色即视为具备后台管理访问权 */
export const TENANT_BACKEND_PERMISSIONS: string[] = [
  PERMISSIONS.TENANT_ORG_READ,
  PERMISSIONS.TENANT_ORG_WRITE,
  PERMISSIONS.TENANT_MEMBER_READ,
  PERMISSIONS.TENANT_MEMBER_WRITE,
  PERMISSIONS.TENANT_DOCUMENT_READ,
];

/** 权限列表中是否包含任意后台管理模块权限 */
export function hasTenantBackendPermission(permissions?: string[] | null): boolean {
  return Array.isArray(permissions) && permissions.some(p => TENANT_BACKEND_PERMISSIONS.includes(p));
}

export const DEFAULT_SYSTEM_CONFIGS: Array<{
  key: string;
  value: unknown;
  description: string;
}> = [
  {
    key: 'auth.register_enabled',
    value: true,
    description: '是否允许 C 端自助注册',
  },
  {
    key: 'auth.max_login_attempts',
    value: 5,
    description: '连续登录失败次数上限（达到后锁定）',
  },
  {
    key: 'auth.lock_duration_minutes',
    value: 10,
    description: '账号锁定时长（分钟）',
  },
  {
    key: 'quota.default_storage_mb',
    value: 1024,
    description: '默认存储配额（MB）',
  },
  {
    key: 'feature.collab_enabled',
    value: true,
    description: '是否启用协同编辑',
  },
  {
    key: 'audit.retention_days',
    value: 180,
    description: '审计日志保留天数（等保三级 + 网络安全法第 21 条要求日志留存不少于 6 个月，下限 180）',
  },
  // 注意：`system_configs.config_value` 是 NOT NULL 的 json 列，
  // 不能以 `value: null` 作为种子（会触发 not-null 约束错误并中断整批种子初始化）。
  // `audit.last_cleanup_at` 因此不预置，读取时由 getValue(key, null) 兜底为 null。
];

/** 审计日志保留天数下限：等保三级 + 网络安全法要求 ≥ 6 个月 */
export const AUDIT_RETENTION_MIN_DAYS = 180;
/** 审计日志保留天数上限：防止误配为超大值导致无界增长 */
export const AUDIT_RETENTION_MAX_DAYS = 3650;
