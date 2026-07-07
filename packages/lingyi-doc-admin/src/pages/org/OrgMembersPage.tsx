import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Tree,
  message,
  type MenuProps,
  type TableColumnsType,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import {
  ApartmentOutlined,
  CheckCircleFilled,
  EllipsisOutlined,
  MoreOutlined,
  PlusOutlined,
  SettingOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { adminFetch, authStore } from '../../stores/authStore';
import './org-members.css';

interface TenantOption {
  id: string;
  name: string;
}

interface OrganizationNode {
  id: string;
  tenantId: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  children?: OrganizationNode[];
}

interface TenantMember {
  userId: string;
  email: string;
  displayName: string;
  phone: string | null;
  tenantRole: number;
  orgId: string | null;
  status: number;
  joinedAt: number;
}

const AVATAR_COLORS = ['#7c5cfc', '#f56a00', '#00b96b', '#1677ff', '#eb2f96'];

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function memberInitials(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  if (t.length <= 2) return t;
  return t.slice(-2);
}

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return `+86 ${digits}`;
  return phone;
}

function findOrgNode(nodes: OrganizationNode[], id: string): OrganizationNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findOrgNode(node.children ?? [], id);
    if (child) return child;
  }
  return null;
}

function collectOrgIds(node: OrganizationNode, includeSelf = true): string[] {
  const ids = includeSelf ? [node.id] : [];
  for (const child of node.children ?? []) {
    ids.push(...collectOrgIds(child, true));
  }
  return ids;
}

function buildOrgNameMap(nodes: OrganizationNode[]): Map<string, string> {
  const map = new Map<string, string>();
  const walk = (list: OrganizationNode[]) => {
    for (const node of list) {
      map.set(node.id, node.name);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(nodes);
  return map;
}

function toTreeData(nodes: OrganizationNode[], isRoot = false): DataNode[] {
  return nodes.map((node) => ({
    key: node.id,
    title: (
      <div className="org-members-tree-node">
        <div className="org-members-tree-node-label">
          {isRoot ? <ApartmentOutlined style={{ color: '#1677ff' }} /> : <TeamOutlined style={{ color: '#8c8c8c' }} />}
          <span title={node.name}>{node.name}</span>
        </div>
        <Dropdown
          menu={{ items: [{ key: 'edit', label: '编辑部门', disabled: true }, { key: 'delete', label: '删除部门', disabled: true }] }}
          trigger={['click']}
        >
          <EllipsisOutlined className="org-members-tree-more" onClick={(e) => e.stopPropagation()} />
        </Dropdown>
      </div>
    ),
    children: node.children?.length ? toTreeData(node.children) : undefined,
  }));
}

export const OrgMembersPage: React.FC = () => {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantId, setTenantId] = useState<string>();
  const [orgs, setOrgs] = useState<OrganizationNode[]>([]);
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [directOnly, setDirectOnly] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const canReadTenants = authStore.hasPermission('platform:tenant:read');
  const canWriteOrg = authStore.hasPermission('tenant:org:write');
  const canWriteMember = authStore.hasPermission('tenant:member:write');

  useEffect(() => {
    if (!canReadTenants) return;
    (async () => {
      try {
        const data = await adminFetch<{ items: TenantOption[] }>('/api/v1/admin/tenants');
        const list = data.items.map((t) => ({ id: t.id, name: t.name }));
        setTenants(list);
        if (list[0]) setTenantId(list[0].id);
      } catch {
        /* 私有化可能无 platform tenant read */
      }
    })();
  }, [canReadTenants]);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      setLoading(true);
      try {
        const [orgRes, memberRes] = await Promise.all([
          adminFetch<{ items: OrganizationNode[] }>(`/api/v1/admin/tenants/${tenantId}/organizations`),
          adminFetch<{ items: TenantMember[] }>(`/api/v1/admin/tenants/${tenantId}/members`),
        ]);
        setOrgs(orgRes.items);
        setMembers(memberRes.items);
        const firstOrg = orgRes.items[0];
        setSelectedOrgId(firstOrg?.id);
        setSelectedRowKeys([]);
      } catch (err) {
        message.error(err instanceof Error ? err.message : '加载失败');
      } finally {
        setLoading(false);
      }
    })();
  }, [tenantId]);

  const orgNameMap = useMemo(() => buildOrgNameMap(orgs), [orgs]);

  const selectedOrg = useMemo(
    () => (selectedOrgId ? findOrgNode(orgs, selectedOrgId) : null),
    [orgs, selectedOrgId],
  );

  const filteredMembers = useMemo(() => {
    let list = members;

    if (selectedOrg) {
      const allowedOrgIds = directOnly
        ? [selectedOrg.id]
        : collectOrgIds(selectedOrg, true);
      list = list.filter((m) => m.orgId && allowedOrgIds.includes(m.orgId));
    }

    if (statusFilter === 'active') list = list.filter((m) => m.status === 1);
    if (statusFilter === 'disabled') list = list.filter((m) => m.status !== 1);

    const kw = searchKeyword.trim().toLowerCase();
    if (kw) {
      list = list.filter((m) =>
        m.displayName.toLowerCase().includes(kw)
        || m.email.toLowerCase().includes(kw)
        || (m.phone ?? '').includes(kw),
      );
    }

    return list;
  }, [members, selectedOrg, directOnly, statusFilter, searchKeyword]);

  const treeData = useMemo(() => toTreeData(orgs, true), [orgs]);

  const headerTitle = selectedOrg?.name ?? tenants.find((t) => t.id === tenantId)?.name ?? '成员与部门';

  const batchMenuItems: MenuProps['items'] = [
    { key: 'resign', label: '批量操作离职', danger: true, disabled: !canWriteMember },
    { key: 'move', label: '批量变更部门', disabled: !canWriteMember },
    { key: 'import', label: '批量导入/导出', disabled: true },
  ];

  const columns: TableColumnsType<TenantMember> = [
    {
      title: '姓名',
      dataIndex: 'displayName',
      render: (_, row) => (
        <div className="org-members-name-cell">
          <div
            className="org-members-avatar"
            style={{ background: avatarColor(row.userId) }}
          >
            {memberInitials(row.displayName)}
          </div>
          <span>{row.displayName}</span>
        </div>
      ),
    },
    {
      title: '账号状态',
      dataIndex: 'status',
      width: 120,
      render: (v: number) => (
        v === 1 ? (
          <Tag color="processing" className="org-members-status-tag" icon={<CheckCircleFilled />}>
            正常
          </Tag>
        ) : (
          <Tag color="default">已禁用</Tag>
        )
      ),
    },
    {
      title: '手机号码',
      dataIndex: 'phone',
      width: 160,
      render: (v: string | null) => formatPhone(v),
    },
    {
      title: '部门',
      dataIndex: 'orgId',
      ellipsis: true,
      render: (orgId: string | null) => (orgId ? orgNameMap.get(orgId) ?? '—' : '—'),
    },
    {
      title: '操作',
      width: 120,
      render: () => (
        <Space size={4}>
          <Button type="link" size="small" style={{ padding: 0 }}>详情</Button>
          <Dropdown menu={{ items: [{ key: 'edit', label: '编辑', disabled: true }] }}>
            <Button type="text" size="small" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <div className="org-members-page">
      {tenants.length > 1 && (
        <div className="org-members-tenant-bar">
          <Select
            style={{ width: 320 }}
            value={tenantId}
            placeholder="选择企业租户"
            options={tenants.map((t) => ({ value: t.id, label: t.name }))}
            onChange={setTenantId}
          />
        </div>
      )}

      <div className="org-members-body">
        <aside className="org-members-sidebar">
          <div className="org-members-sidebar-search">
            <Input.Search
              allowClear
              placeholder="请输入姓名、邮箱..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
          </div>
          <div className="org-members-tree-wrap">
            <Tree
              blockNode
              showIcon={false}
              selectedKeys={selectedOrgId ? [selectedOrgId] : []}
              treeData={treeData}
              onSelect={(keys) => {
                if (keys[0]) setSelectedOrgId(String(keys[0]));
              }}
            />
          </div>
          <div className="org-members-sidebar-footer">
            <Button
              block
              icon={<PlusOutlined />}
              disabled={!canWriteOrg || !tenantId}
              onClick={() => message.info('新建部门功能开发中')}
            >
              新建部门
            </Button>
          </div>
        </aside>

        <main className="org-members-main">
          <div className="org-members-header">
            <h2 className="org-members-header-title">{headerTitle}</h2>
            <div className="org-members-header-count">总人数 {filteredMembers.length}</div>
          </div>

          <div className="org-members-toolbar">
            <div className="org-members-toolbar-left">
              <Select
                value={statusFilter}
                style={{ width: 140 }}
                options={[
                  { value: 'all', label: '账号状态 全部' },
                  { value: 'active', label: '账号状态 正常' },
                  { value: 'disabled', label: '账号状态 已禁用' },
                ]}
                onChange={setStatusFilter}
              />
              <Select
                value={directOnly ? 'direct' : 'all'}
                style={{ width: 200 }}
                options={[
                  { value: 'all', label: '展示全部下级成员' },
                  { value: 'direct', label: '仅展示部门直属成员' },
                ]}
                onChange={(v) => setDirectOnly(v === 'direct')}
              />
              <Button type="text" icon={<SettingOutlined />} />
            </div>
            <div className="org-members-toolbar-right">
              <Dropdown menu={{ items: batchMenuItems }}>
                <Button danger disabled={!selectedRowKeys.length || !canWriteMember}>
                  批量操作离职
                </Button>
              </Dropdown>
              <Button disabled={!canWriteMember || !selectedRowKeys.length}>批量变更部门</Button>
              <Button disabled>批量导入/导出</Button>
              <Button icon={<UserAddOutlined />} disabled={!canWriteMember}>邀请成员</Button>
              <Button type="primary" icon={<PlusOutlined />} disabled={!canWriteMember}>
                添加成员
              </Button>
            </div>
          </div>

          <Table
            rowKey="userId"
            loading={loading}
            dataSource={filteredMembers}
            columns={columns}
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
            rowSelection={{
              selectedRowKeys,
              onChange: setSelectedRowKeys,
            }}
            scroll={{ x: 800 }}
          />
        </main>
      </div>
    </div>
  );
};
