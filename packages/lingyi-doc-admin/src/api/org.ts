import { adminFetch } from '../stores/authStore';
import type {
  AddMemberInput,
  CreateOrgInput,
  CreatePositionInput,
  OrganizationNode,
  PositionGroupNode,
  TenantMember,
  TenantOption,
  TenantRoleNode,
  UpdateMemberInput,
  CreateRoleInput,
  UpdateRoleInput,
} from '../types/org';

export async function listTenants(): Promise<TenantOption[]> {
  const data = await adminFetch<{ items: TenantOption[] }>('/api/v1/admin/tenants/workspace');
  return data.items;
}

export async function listOrganizations(tenantId: string): Promise<OrganizationNode[]> {
  const data = await adminFetch<{ items: OrganizationNode[] }>(`/api/v1/admin/tenants/${tenantId}/organizations`);
  return data.items;
}

export async function createOrganization(tenantId: string, input: CreateOrgInput) {
  return adminFetch(`/api/v1/admin/tenants/${tenantId}/organizations`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateOrganization(tenantId: string, orgId: string, input: Partial<CreateOrgInput>) {
  return adminFetch(`/api/v1/admin/tenants/${tenantId}/organizations/${orgId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteOrganization(tenantId: string, orgId: string) {
  return adminFetch(`/api/v1/admin/tenants/${tenantId}/organizations/${orgId}`, {
    method: 'DELETE',
  });
}

export async function listMembers(tenantId: string): Promise<TenantMember[]> {
  const data = await adminFetch<{ items: TenantMember[] }>(`/api/v1/admin/tenants/${tenantId}/members`);
  return data.items;
}

export async function addMember(tenantId: string, input: AddMemberInput) {
  return adminFetch(`/api/v1/admin/tenants/${tenantId}/members`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateMember(tenantId: string, userId: string, input: UpdateMemberInput) {
  return adminFetch(`/api/v1/admin/tenants/${tenantId}/members/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function listPositions(tenantId: string): Promise<PositionGroupNode[]> {
  const data = await adminFetch<{ items: PositionGroupNode[] }>(`/api/v1/admin/tenants/${tenantId}/positions`);
  return data.items;
}

export async function createPosition(tenantId: string, input: CreatePositionInput) {
  return adminFetch(`/api/v1/admin/tenants/${tenantId}/positions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function createPositionGroup(tenantId: string, name: string) {
  return adminFetch(`/api/v1/admin/tenants/${tenantId}/position-groups`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function updatePositionGroup(tenantId: string, groupId: string, name: string) {
  return adminFetch(`/api/v1/admin/tenants/${tenantId}/position-groups/${groupId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function deletePositionGroup(tenantId: string, groupId: string) {
  return adminFetch(`/api/v1/admin/tenants/${tenantId}/position-groups/${groupId}`, {
    method: 'DELETE',
  });
}

export async function updatePosition(
  tenantId: string,
  positionId: string,
  input: Partial<CreatePositionInput>,
) {
  return adminFetch(`/api/v1/admin/tenants/${tenantId}/positions/${positionId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deletePosition(tenantId: string, positionId: string) {
  return adminFetch(`/api/v1/admin/tenants/${tenantId}/positions/${positionId}`, {
    method: 'DELETE',
  });
}

export async function assignMembersToPosition(tenantId: string, positionId: string, userIds: string[]) {
  return adminFetch(`/api/v1/admin/tenants/${tenantId}/positions/${positionId}/members`, {
    method: 'POST',
    body: JSON.stringify({ userIds }),
  });
}

export async function removeMemberFromPosition(tenantId: string, positionId: string, userId: string) {
  return adminFetch(`/api/v1/admin/tenants/${tenantId}/positions/${positionId}/members/${userId}`, {
    method: 'DELETE',
  });
}

export async function listRoles(tenantId: string): Promise<TenantRoleNode[]> {
  const data = await adminFetch<{ items: TenantRoleNode[] }>(`/api/v1/admin/tenants/${tenantId}/roles`);
  return data.items;
}

export async function createRole(tenantId: string, input: CreateRoleInput) {
  return adminFetch(`/api/v1/admin/tenants/${tenantId}/roles`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateRole(tenantId: string, roleId: string, input: UpdateRoleInput) {
  return adminFetch(`/api/v1/admin/tenants/${tenantId}/roles/${roleId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteRole(tenantId: string, roleId: string) {
  return adminFetch(`/api/v1/admin/tenants/${tenantId}/roles/${roleId}`, {
    method: 'DELETE',
  });
}

export async function assignMembersToRole(tenantId: string, roleId: string, userIds: string[]) {
  return adminFetch(`/api/v1/admin/tenants/${tenantId}/roles/${roleId}/members`, {
    method: 'POST',
    body: JSON.stringify({ userIds }),
  });
}

export async function removeMemberFromRole(tenantId: string, roleId: string, userId: string) {
  return adminFetch(`/api/v1/admin/tenants/${tenantId}/roles/${roleId}/members/${userId}`, {
    method: 'DELETE',
  });
}
