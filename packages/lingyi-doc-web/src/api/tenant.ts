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

export interface TenantInvitation {
  tenantId: string;
  tenantName: string;
  tenantRole: number;
  status: number;
  invitedAt: number;
}

export const TenantApi = {
  listMembers(tenantId: string): Promise<{ items: TenantMemberItem[]; total: number }> {
    return authFetch(`/api/v1/c/tenants/${tenantId}/members`);
  },

  listOrganizations(tenantId: string): Promise<{ items: OrganizationNode[] }> {
    return authFetch(`/api/v1/c/tenants/${tenantId}/organizations`);
  },

  listInvitations(): Promise<{ items: TenantInvitation[] }> {
    return authFetch('/api/v1/c/tenants/invitations');
  },

  acceptInvitation(tenantId: string) {
    return authFetch(`/api/v1/c/tenants/${tenantId}/accept`, {
      method: 'POST',
    });
  },

  rejectInvitation(tenantId: string) {
    return authFetch(`/api/v1/c/tenants/${tenantId}/reject`, {
      method: 'POST',
    });
  },
};
