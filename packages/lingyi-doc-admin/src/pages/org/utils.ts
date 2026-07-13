import type { DataNode } from 'antd/es/tree';
import type { OrganizationNode, PositionGroupNode, PositionNode, TenantMember } from '../../types/org';
import { ApartmentOutlined, TeamOutlined } from '@ant-design/icons';
import React from 'react';

export const AVATAR_COLORS = ['#7c5cfc', '#f56a00', '#00b96b', '#1677ff', '#eb2f96', '#13c2c2'];

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function memberInitials(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  if (t.length <= 2) return t;
  return t.slice(-2);
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits;
  return phone;
}

export function findOrgNode(nodes: OrganizationNode[], id: string): OrganizationNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findOrgNode(node.children ?? [], id);
    if (child) return child;
  }
  return null;
}

export function collectOrgIds(node: OrganizationNode, includeSelf = true): string[] {
  const ids = includeSelf ? [node.id] : [];
  for (const child of node.children ?? []) {
    ids.push(...collectOrgIds(child, true));
  }
  return ids;
}

export function buildOrgNameMap(nodes: OrganizationNode[]): Map<string, string> {
  const map = new Map<string, string>();
  const walk = (list: OrganizationNode[]) => {
    for (const node of list) {
      map.set(node.id, getOrgDisplayName(node));
      if (node.children?.length) walk(node.children);
    }
  };
  walk(nodes);
  return map;
}

export const TENANT_SPACE_ORG_NAME = '租户空间';

export const TENANT_ROLE_PERMISSION_OPTIONS = [
  { code: 'tenant:org:read', label: '查看组织' },
  { code: 'tenant:org:write', label: '管理组织' },
  { code: 'tenant:member:read', label: '查看成员' },
  { code: 'tenant:member:write', label: '管理成员' },
  { code: 'tenant:document:read', label: '查看团队文档' },
] as const;

export function tenantRolePermissionLabel(code: string): string {
  return TENANT_ROLE_PERMISSION_OPTIONS.find(p => p.code === code)?.label ?? code;
}

export function tenantRoleLabel(roleId: string | null, roles: Array<{ id: string; name: string }>): string {
  if (!roleId) return '—';
  return roles.find(r => r.id === roleId)?.name ?? '—';
}

export function isRootOrg(node: OrganizationNode): boolean {
  return node.parentId === null;
}

export function getOrgDisplayName(node: OrganizationNode): string {
  return isRootOrg(node) ? TENANT_SPACE_ORG_NAME : node.name;
}

export function buildPositionNameMap(groups: PositionGroupNode[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const g of groups) {
    for (const p of g.positions) map.set(p.id, p.name);
  }
  return map;
}

export function flattenPositions(groups: PositionGroupNode[]): PositionNode[] {
  return groups.flatMap(g => g.positions);
}

export function orgToTreeSelectOptions(
  nodes: OrganizationNode[],
  depth = 0,
  excludeIds?: Set<string>,
): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  for (const node of nodes) {
    if (!excludeIds?.has(node.id)) {
      out.push({ value: node.id, label: `${'　'.repeat(depth)}${getOrgDisplayName(node)}` });
    }
    if (node.children?.length) out.push(...orgToTreeSelectOptions(node.children, depth + 1, excludeIds));
  }
  return out;
}

export function orgToTreeData(
  nodes: OrganizationNode[],
  isRoot = false,
  renderTitle?: (node: OrganizationNode) => React.ReactNode,
): DataNode[] {
  return nodes.map((node) => ({
    key: node.id,
    title: renderTitle ? renderTitle(node) : getOrgDisplayName(node),
    icon: isRoot ? React.createElement(ApartmentOutlined, { style: { color: '#1677ff' } }) : React.createElement(TeamOutlined, { style: { color: '#8c8c8c' } }),
    children: node.children?.length ? orgToTreeData(node.children, false, renderTitle) : undefined,
  }));
}

export const POSITION_AVATARS = Array.from({ length: 18 }, (_, i) => ({
  key: `avatar_${i}`,
  emoji: ['👨‍💼', '👩‍💼', '👨‍💻', '👩‍💻', '👨‍🔧', '👩‍🔧', '👨‍🎨', '👩‍🎨', '👨‍🏫', '👩‍🏫', '🧑‍💼', '🧑‍💻', '🧑‍🔬', '🧑‍🎨', '👨‍🚀', '👩‍🚀', '🧑‍🚀', '🧑‍🏫'][i],
}));

export function positionAvatarEmoji(avatarKey?: string): string {
  return POSITION_AVATARS.find(a => a.key === avatarKey)?.emoji ?? '👤';
}

export function filterMembers(
  members: TenantMember[],
  opts: {
    orgIds?: string[] | null;
    positionId?: string | null;
    statusFilter?: 'all' | 'active' | 'disabled';
    keyword?: string;
  },
): TenantMember[] {
  let list = members;
  if (opts.orgIds?.length) {
    list = list.filter(m => m.orgId && opts.orgIds!.includes(m.orgId));
  }
  if (opts.positionId) {
    list = list.filter(m => m.positionId === opts.positionId);
  }
  if (opts.statusFilter === 'active') list = list.filter(m => m.status === 1);
  if (opts.statusFilter === 'disabled') list = list.filter(m => m.status !== 1);
  const kw = (opts.keyword ?? '').trim().toLowerCase();
  if (kw) {
    list = list.filter(m =>
      m.displayName.toLowerCase().includes(kw)
      || m.email.toLowerCase().includes(kw)
      || (m.phone ?? '').includes(kw)
      || (m.employeeId ?? '').toLowerCase().includes(kw),
    );
  }
  return list;
}
