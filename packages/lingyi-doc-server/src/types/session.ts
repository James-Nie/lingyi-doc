import type { AccountMode, DeployType, IdentityType } from './deploy';
import type { UserSource, DocumentScope } from './database';

export type TenantRole = 1 | 2 | 3;

/** C 端登录身份 / 租户上下文（JWT + auth_sessions） */
export interface ConsumerSessionContext {
  userSource: UserSource;
  currentIdentityType: IdentityType;
  currentTenantId: string | null;
  tenantRole: TenantRole | null;
  deployType: DeployType;
  accountMode: AccountMode;
}

export const DEFAULT_CONSUMER_SESSION: ConsumerSessionContext = {
  userSource: 1,
  currentIdentityType: 'personal',
  currentTenantId: null,
  tenantRole: null,
  deployType: 1,
  accountMode: 1,
};

export interface SessionInfo extends ConsumerSessionContext {
  allowMultiTenantSwitch: boolean;
}

export interface TenantSummary {
  id: string;
  name: string;
  tenantRole: TenantRole;
  isAllowMultiSwitch: boolean;
  /** 当前用户在该租户下所属角色的权限集合（用于判断后台管理访问权） */
  permissions?: string[];
}

export interface DbTenant {
  id: string;
  name: string;
  status: number;
  admin_user_id: string | null;
  deploy_type: number;
  is_physical_isolate: boolean;
  account_mode: number;
  is_allow_multi_switch: boolean;
  db_instance_id: string | null;
  storage_cluster_id: string | null;
  private_config: unknown | null;
  created_at: Date;
  updated_at: Date;
}

export interface DbTenantMember {
  id: number;
  tenant_id: string;
  user_id: string;
  user_source: number;
  org_id: string | null;
  tenant_role: number;
  status: number;
  joined_at: Date;
}

export interface DbOrganization {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  leader_user_id?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface OrganizationNode {
  id: string;
  tenantId: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  leaderUserId?: string | null;
  children?: OrganizationNode[];
}

export interface TenantMemberPublic {
  tenantId?: string;
  userId: string;
  email: string;
  displayName: string;
  phone: string | null;
  tenantRole: TenantRole;
  orgId: string | null;
  positionId: string | null;
  roleId: string | null;
  employeeId: string | null;
  gender: number | null;
  status: number;
  joinedAt: number;
}

/** 文档访问上下文（由 req.auth 派生） */
export interface DocumentAccessContext {
  userId: string;
  identityType: IdentityType;
  tenantId: string | null;
}

export function documentLocation(scope: DocumentScope, tenantName?: string | null): string {
  if (scope === 2) return tenantName ? `${tenantName} · 团队文档` : '团队文档库';
  return '我的文档库';
}
