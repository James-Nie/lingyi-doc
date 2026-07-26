import { authFetch } from '../stores/authStore';

export interface TenantMemberItem {
  userId: string;
  displayName: string;
  email: string;
  phone?: string | null;
  tenantRole: number;
  orgId?: string | null;
  status?: number;
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

export const TenantApi = {
  listMembers(tenantId: string): Promise<{ items: TenantMemberItem[]; total: number }> {
    return authFetch(`/api/v1/c/tenants/${tenantId}/members`);
  },

  listOrganizations(tenantId: string): Promise<{ items: OrganizationNode[] }> {
    return authFetch(`/api/v1/c/tenants/${tenantId}/organizations`);
  },
};
