export type UserType = 'consumer' | 'admin';
export type UserStatus = 'active' | 'suspended' | 'pending';
export type ClientType = 'consumer' | 'admin';
export type UserSource = 1 | 2;
export type DocumentScope = 1 | 2;

import type { EffectivePlan, MembershipPlanCode } from './membership';

export interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  avatar_url: string | null;
  phone: string | null;
  oauth_union_id: string | null;
  ldap_uuid: string | null;
  personal_setting: unknown | null;
  locale: string | null;
  is_active: number;
  user_type: UserType;
  user_source: UserSource;
  status: UserStatus;
  last_login_at: Date | null;
  login_fail_count: number;
  locked_until: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface DbAdminRole {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_system: number;
  created_at: Date;
}

export interface DbAuditLog {
  id: number;
  operator_id: string;
  operator_name?: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: unknown;
  ip: string | null;
  user_agent: string | null;
  created_at: Date;
}

export interface DbSystemConfig {
  config_key: string;
  config_value: unknown;
  description: string | null;
  updated_by: string | null;
  updated_at: Date;
}

export type DemoRequestStatus = 'pending' | 'contacted' | 'closed';

export interface DbDemoRequest {
  id: string;
  name: string;
  phone: string;
  company: string;
  company_size: string;
  scenario: string;
  products: unknown;
  questions: string;
  status: DemoRequestStatus;
  ip: string | null;
  user_agent: string | null;
  submitted_by: string | null;
  contacted_at: Date | null;
  admin_note: string | null;
  processed_by: string | null;
  processed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  userType: UserType;
  userSource: UserSource;
  status: UserStatus;
  createdAt: number;
  lastLoginAt: number | null;
}

/** 管理端 C 端用户列表（含个人会员信息） */
export interface AdminConsumerUser extends PublicUser {
  personalPlan: MembershipPlanCode;
  effectivePlan: EffectivePlan;
  planLabel: string;
  planExpired: boolean;
  vipExpireAt: number | null;
}

export interface AdminMeUser extends PublicUser {
  roles: Array<{ code: string; name: string }>;
  permissions: string[];
}

export interface DbDocument {
  id: string;
  title: string;
  description: string | null;
  doc_type: string;
  scope: DocumentScope;
  owner_id: string | null;
  tenant_id: string | null;
  org_id: string | null;
  current_version: number;
  content_json: unknown | null;
  storage_size: number;
  is_deleted: number;
  created_at: Date;
  updated_at: Date;
  last_visited_at: Date | null;
}

import type { DocSharePermissionLevel } from './document-share';

export type DocumentPermission = 'owner' | DocSharePermissionLevel;
export type DocumentViewMode = 'edit' | 'preview';

/** 文档基本信息补丁（不碰 content_json / current_version） */
export interface DocumentMetaPatch {
  title?: string;
  description?: string | null;
  // 后续可扩展：cover / icon / tags 等
}

export interface DocumentMetaResult {
  id: string;
  title: string;
  description: string | null;
  /** 内容版本，元信息更新时不变 */
  version: number;
  updatedAt: number;
}

export interface DocumentRecord {
  id: string;
  title: string;
  docType: string;
  version: number;
  data: unknown | null;
  ownerId?: string | null;
  ownerName?: string | null;
  tenantId?: string | null;
  orgId?: string | null;
  scope?: DocumentScope;
  location?: string;
  createdAt: number;
  updatedAt: number;
  lastVisitedAt?: number | null;
  permission?: DocumentPermission;
  canEdit?: boolean;
  viewMode?: DocumentViewMode;
  _meta?: { version: number; savedAt?: number };
}

export interface DocumentListItem {
  id: string;
  title: string;
  docType: string;
  ownerId?: string | null;
  ownerName?: string | null;
  tenantId?: string | null;
  scope?: DocumentScope;
  location: string;
  createdAt: number;
  updatedAt: number;
  lastVisitedAt: number;
  /** 公开路径片段，列表可直接跳转，无需再调 path 接口 */
  docSlug?: string | null;
  spaceSlug?: string | null;
  bookSlug?: string | null;
  sharePermission?: import('./document-share').DocSharePermissionLevel;
  sharedByName?: string;
}

export interface RecycleBinItem {
  id: string;
  title: string;
  docType: string;
  operatorName: string;
  deletedAt: number;
  daysRemaining: number;
}

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        email: string;
        userType: UserType;
        userSource?: UserSource;
        audience: ClientType;
        roles?: string[];
        permissions?: string[];
        currentIdentityType?: import('./deploy').IdentityType;
        currentTenantId?: string | null;
        tenantRole?: import('./session').TenantRole | null;
        deployType?: import('./deploy').DeployType;
        accountMode?: import('./deploy').AccountMode;
      };
    }
  }
}
