import { adminFetch } from '../stores/authStore';

export interface AdminUserItem {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  userType: string;
  status: string;
  roles: Array<{ code: string; name: string }>;
}

export interface SystemRole {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

export async function listAdmins(
  page: number,
  pageSize: number,
): Promise<{ items: AdminUserItem[]; total: number }> {
  return adminFetch(`/api/v1/admin/admins?page=${page}&pageSize=${pageSize}`);
}

export async function assignAdminRole(userId: string, roleCode: string): Promise<void> {
  await adminFetch('/api/v1/admin/admins/assign', {
    method: 'POST',
    body: JSON.stringify({ userId, roleCode }),
  });
}

export async function updateAdminRole(userId: string, roleCode: string): Promise<void> {
  await adminFetch(`/api/v1/admin/admins/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ roleCode }),
  });
}

export async function removeAdmin(userId: string): Promise<void> {
  await adminFetch(`/api/v1/admin/admins/${userId}`, {
    method: 'DELETE',
  });
}

export async function listSystemRoles(): Promise<SystemRole[]> {
  return adminFetch('/api/v1/admin/roles');
}

export async function searchUsers(
  keyword: string,
  page: number,
  pageSize: number,
): Promise<{ items: Array<{ id: string; email: string; displayName: string }>; total: number }> {
  return adminFetch(
    `/api/v1/admin/users?keyword=${encodeURIComponent(keyword)}&page=${page}&pageSize=${pageSize}`,
  );
}