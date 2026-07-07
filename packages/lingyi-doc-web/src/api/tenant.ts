import { authFetch } from '../stores/authStore';

export interface TenantMemberItem {
  userId: string;
  displayName: string;
  email: string;
  tenantRole: number;
}

export const TenantApi = {
  listMembers(tenantId: string): Promise<{ items: TenantMemberItem[]; total: number }> {
    return authFetch(`/api/v1/c/tenants/${tenantId}/members`);
  },
};
