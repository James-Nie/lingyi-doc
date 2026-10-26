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
  /** 是否系统预置角色（系统角色不可改权限点、不可删除） */
  isSystem?: boolean;
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
  // GET /api/v1/admin/roles 自 P0-3 起返回 { items, total }（含权限点与引用情况），
  // 此处兼容旧的分页包裹写法，避免调用方（管理员管理页的角色下拉）被破坏
  const res = await adminFetch<{ items: SystemRole[] } | SystemRole[]>('/api/v1/admin/roles');
  return Array.isArray(res) ? res : (res.items ?? []);
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