export interface TenantOption {
  id: string;
  name: string;
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

export interface TenantMember {
  userId: string;
  email: string;
  displayName: string;
  phone: string | null;
  tenantRole: number;
  roleId: string | null;
  orgId: string | null;
  positionId: string | null;
  employeeId: string | null;
  gender: number | null;
  status: number;
  joinedAt: number;
}

export interface TenantRoleNode {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  systemRole: number | null;
  sortOrder: number;
  memberCount?: number;
}

export interface PositionNode {
  id: string;
  tenantId: string;
  groupId: string;
  name: string;
  avatarKey: string;
  sortOrder: number;
  memberCount?: number;
}

export interface PositionGroupNode {
  id: string;
  tenantId: string;
  name: string;
  sortOrder: number;
  positions: PositionNode[];
}

export interface AddMemberInput {
  displayName: string;
  username: string;
  contact: string;
  password: string;
  orgId?: string | null;
  positionId?: string | null;
  gender?: number | null;
  employeeId?: string | null;
  tenantRole?: number;
}

export interface UpdateMemberInput {
  tenantRole?: number;
  roleId?: string | null;
  orgId?: string | null;
  positionId?: string | null;
  employeeId?: string | null;
  gender?: number | null;
  status?: number;
}

export interface CreateRoleInput {
  name: string;
  description?: string | null;
  permissions?: string[];
}

export interface UpdateRoleInput {
  name?: string;
  description?: string | null;
  permissions?: string[];
}

export interface CreateOrgInput {
  name: string;
  parentId?: string | null;
  leaderUserId?: string | null;
}

export interface CreatePositionInput {
  name: string;
  groupId: string;
  avatarKey?: string;
}
