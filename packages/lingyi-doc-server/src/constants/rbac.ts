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
} as const;

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
  ],
  [ADMIN_ROLE_CODES.SUPPORT]: [
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.USER_READ,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DEMO_READ,
    PERMISSIONS.TEMPLATE_READ,
  ],
  [ADMIN_ROLE_CODES.AUDITOR]: [
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.AI_USAGE_READ,
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
];
