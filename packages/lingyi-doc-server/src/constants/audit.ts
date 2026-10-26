/**
 * 统一审计动作登记表。
 *
 * 规范：`<domain>.<object>_<verb>`
 * - 禁止在业务代码中散落字符串字面量，一律引用此处常量，保证「代码写入的动作」与「前端筛选/展示的动作」一致
 * - `module` 由 action 前缀推导（见 moduleOfAction），不单独传入，避免两处口径漂移
 * - 新增动作必须同时登记中文名，否则前端筛选下拉会显示原始码
 *
 * 关联：docs/design/admin-console-p0-p1-design.md §6.1
 */

export const AUDIT_ACTIONS = {
  // 管理员与角色管理
  ADMIN_CREATE: 'admin.create',
  ADMIN_ASSIGN: 'admin.assign',
  ADMIN_ROLE_UPDATE: 'admin.role_update',
  ADMIN_REMOVE: 'admin.remove',
  ADMIN_ROLE_CREATE: 'admin.role_create',
  ADMIN_ROLE_UPDATE_DEF: 'admin.role_update_def',
  ADMIN_ROLE_DELETE: 'admin.role_delete',
  ADMIN_ROLE_PERMS_UPDATE: 'admin.role_perms_update',

  // 管理组（P0-3）
  ADMIN_GROUP_CREATE: 'admin_group.create',
  ADMIN_GROUP_UPDATE: 'admin_group.update',
  ADMIN_GROUP_DELETE: 'admin_group.delete',
  ADMIN_GROUP_MEMBERS_UPDATE: 'admin_group.members_update',
  ADMIN_GROUP_ROLES_UPDATE: 'admin_group.roles_update',

  // 系统配置与安全策略
  CONFIG_UPDATE: 'config.update',
  SECURITY_POLICY_UPDATE: 'security.password_policy_update',
  SECURITY_SHARE_POLICY_UPDATE: 'security.share_policy_update',

  // 会话
  SESSION_REVOKE: 'session.revoke',

  // C 端用户（P0-6）
  USER_STATUS_UPDATE: 'user.status_update',
  USER_UNLOCK: 'user.unlock',
  USER_FORCE_LOGOUT: 'user.force_logout',
  USER_PASSWORD_RESET: 'user.password_reset',

  // 租户域（P0-7 补齐：此前完全不写审计）
  TENANT_MEMBER_ADD: 'tenant.member_add',
  TENANT_MEMBER_INVITE: 'tenant.member_invite',
  TENANT_MEMBER_UPDATE: 'tenant.member_update',
  TENANT_MEMBER_REMOVE: 'tenant.member_remove',
  TENANT_ORG_CREATE: 'tenant.org_create',
  TENANT_ORG_UPDATE: 'tenant.org_update',
  TENANT_ORG_DELETE: 'tenant.org_delete',
  TENANT_POSITION_GROUP_CREATE: 'tenant.position_group_create',
  TENANT_POSITION_GROUP_UPDATE: 'tenant.position_group_update',
  TENANT_POSITION_GROUP_DELETE: 'tenant.position_group_delete',
  TENANT_POSITION_CREATE: 'tenant.position_create',
  TENANT_POSITION_UPDATE: 'tenant.position_update',
  TENANT_POSITION_DELETE: 'tenant.position_delete',
  TENANT_POSITION_ASSIGN: 'tenant.position_assign',
  TENANT_ROLE_CREATE: 'tenant.role_create',
  TENANT_ROLE_UPDATE: 'tenant.role_update',
  TENANT_ROLE_DELETE: 'tenant.role_delete',
  TENANT_ROLE_MEMBERS_UPDATE: 'tenant.role_members_update',

  // 内容治理（P0-1）
  DOCUMENT_TRANSFER: 'document.transfer',
  DOCUMENT_ARCHIVE: 'document.archive',
  DOCUMENT_DELETE: 'document.delete',
  DOCUMENT_RESTORE: 'document.restore',
  DOCUMENT_PURGE: 'document.purge',
  DOCUMENT_EXPORT: 'document.export',

  // 模板
  TEMPLATE_CREATE: 'template.create',
  TEMPLATE_UPDATE: 'template.update',
  TEMPLATE_STATUS: 'template.status',
  TEMPLATE_DELETE: 'template.delete',

  // API 密钥
  API_KEY_CREATE: 'api_key.create',
  API_KEY_REVOKE: 'api_key.revoke',

  // 商机
  DEMO_REQUEST_PROCESS: 'demo_request.process',

  // 审计自身（等保 8.1.4.3 c/d：清理动作必须留痕）
  AUDIT_CLEANUP: 'audit.cleanup',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/** 动作码 → 中文名。用于前端筛选下拉与列表展示 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'admin.create': '创建管理员',
  'admin.assign': '分配管理员角色',
  'admin.role_update': '变更管理员角色',
  'admin.remove': '移除管理员',
  'admin.role_create': '创建角色',
  'admin.role_update_def': '编辑角色',
  'admin.role_delete': '删除角色',
  'admin.role_perms_update': '调整角色权限',
  'admin_group.create': '创建管理组',
  'admin_group.update': '编辑管理组',
  'admin_group.delete': '删除管理组',
  'admin_group.members_update': '调整管理组成员',
  'admin_group.roles_update': '调整管理组角色',
  'config.update': '修改系统配置',
  'security.password_policy_update': '修改口令策略',
  'security.share_policy_update': '修改外发安全策略',
  'session.revoke': '撤销会话',
  'user.status_update': '启用/禁用用户',
  'user.unlock': '解锁用户',
  'user.force_logout': '强制用户下线',
  'user.password_reset': '重置用户密码',
  'tenant.member_add': '新增成员',
  'tenant.member_invite': '邀请成员',
  'tenant.member_update': '编辑成员',
  'tenant.member_remove': '移除成员',
  'tenant.org_create': '新建部门',
  'tenant.org_update': '编辑部门',
  'tenant.org_delete': '删除部门',
  'tenant.position_group_create': '新建职位分组',
  'tenant.position_group_update': '编辑职位分组',
  'tenant.position_group_delete': '删除职位分组',
  'tenant.position_create': '新建职位',
  'tenant.position_update': '编辑职位',
  'tenant.position_delete': '删除职位',
  'tenant.position_assign': '分配成员职位',
  'tenant.role_create': '新建组织角色',
  'tenant.role_update': '编辑组织角色',
  'tenant.role_delete': '删除组织角色',
  'tenant.role_members_update': '调整角色成员',
  'document.transfer': '转移文档所有权',
  'document.archive': '归档文档',
  'document.delete': '删除文档',
  'document.restore': '恢复文档',
  'document.purge': '彻底删除文档',
  'document.export': '导出文档清单',
  'template.create': '创建模板',
  'template.update': '编辑模板',
  'template.status': '变更模板状态',
  'template.delete': '删除模板',
  'api_key.create': '创建 API 密钥',
  'api_key.revoke': '撤销 API 密钥',
  'demo_request.process': '处理预约演示',
  'audit.cleanup': '清理审计日志',
};

/** 按业务模块归并前端筛选分组 */
export const AUDIT_MODULE_LABELS: Record<string, string> = {
  admin: '管理员',
  admin_group: '管理组',
  config: '系统配置',
  security: '安全策略',
  session: '会话',
  user: 'C 端用户',
  tenant: '租户组织',
  document: '内容治理',
  template: '模板',
  api_key: 'API 密钥',
  demo_request: '商机',
  audit: '审计',
};

export const AUDIT_RESULT_LABELS: Record<string, string> = {
  success: '成功',
  failure: '失败',
};

/** 由动作码推导模块名（admin_group.create → admin_group） */
export function moduleOfAction(action: string): string {
  const idx = action.indexOf('.');
  return idx > 0 ? action.slice(0, idx) : action;
}

/** 动作码的中文展示名，未登记时回退为原始码 */
export function labelOfAction(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}
