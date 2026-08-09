import React, { useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  Input,
  Modal,
  Select,
  Table,
  Tree,
  message,
  type MenuProps,
  type TableColumnsType,
} from 'antd';
import {
  ApartmentOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  EyeOutlined,
  MoreOutlined,
  PlusOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import {
  createOrganization,
  deleteMember,
  deleteOrganization,
  updateOrganization,
} from '../../api/org';
import { authStore } from '../../stores/authStore';
import type { OrganizationNode, PositionGroupNode, TenantMember } from '../../types/org';
import { MemberFormModal, type AddMemberResult } from './components/MemberFormModal';
import { InviteMemberModal } from './components/InviteMemberModal';
import { MemberDetailModal } from './components/MemberDetailModal';
import { OrgFormModal } from './components/OrgFormModal';
import {
  avatarColor,
  buildOrgNameMap,
  buildPositionNameMap,
  collectOrgIds,
  filterMembers,
  findOrgNode,
  formatPhone,
  getOrgDisplayName,
  isRootOrg,
  memberInitials,
  orgToTreeData,
} from './utils';

interface MembersTabProps {
  tenantId?: string;
  orgs: OrganizationNode[];
  members: TenantMember[];
  positionGroups: PositionGroupNode[];
  loading: boolean;
  onReload: () => void;
}

export const MembersTab: React.FC<MembersTabProps> = ({
  tenantId,
  orgs,
  members,
  positionGroups,
  loading,
  onReload,
}) => {
  const canWriteOrg = authStore.hasPermission('tenant:org:write');
  const canWriteMember = authStore.hasPermission('tenant:member:write');

  const [selectedOrgId, setSelectedOrgId] = useState<string>();
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [orgModalOpen, setOrgModalOpen] = useState(false);
  const [orgModalMode, setOrgModalMode] = useState<'create' | 'edit'>('create');
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
  // 添加 / 编辑成员共用一个弹窗，通过 mode 区分
  const [memberFormOpen, setMemberFormOpen] = useState(false);
  const [memberFormMode, setMemberFormMode] = useState<'create' | 'edit'>('create');
  const [editingMember, setEditingMember] = useState<TenantMember | null>(null);
  const [addResult, setAddResult] = useState<AddMemberResult | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [detailMemberOpen, setDetailMemberOpen] = useState(false);
  const [detailMember, setDetailMember] = useState<TenantMember | null>(null);

  const effectiveOrgId = selectedOrgId ?? orgs[0]?.id;
  const selectedOrg = effectiveOrgId ? findOrgNode(orgs, effectiveOrgId) : null;
  const orgNameMap = useMemo(() => buildOrgNameMap(orgs), [orgs]);
  const positionNameMap = useMemo(() => buildPositionNameMap(positionGroups), [positionGroups]);

  const filteredMembers = useMemo(() => {
    const orgIds = selectedOrg ? collectOrgIds(selectedOrg, true) : null;
    return filterMembers(members, {
      orgIds,
      statusFilter,
      keyword: searchKeyword,
    });
  }, [members, selectedOrg, statusFilter, searchKeyword]);

  const unassignedCount = useMemo(
    () => members.filter(m => !m.orgId).length,
    [members],
  );

  const openCreateOrg = () => {
    setOrgModalMode('create');
    setEditingOrgId(null);
    setOrgModalOpen(true);
  };

  const openEditOrg = (orgId: string) => {
    setOrgModalMode('edit');
    setEditingOrgId(orgId);
    setOrgModalOpen(true);
  };

  const memberCountInOrg = (orgId: string) =>
    members.filter(m => m.orgId === orgId).length;

  const childOrgCount = (orgId: string) => {
    const node = findOrgNode(orgs, orgId);
    return node?.children?.length ?? 0;
  };

  const confirmDeleteOrg = (org: OrganizationNode) => {
    if (!tenantId) return;
    if (isRootOrg(org)) {
      message.warning('不能删除根部门');
      return;
    }
    const childCount = childOrgCount(org.id);
    if (childCount > 0) {
      message.warning('请先删除子部门');
      return;
    }
    const memberCount = memberCountInOrg(org.id);
    Modal.confirm({
      title: '删除部门',
      content: memberCount > 0
        ? `确定删除「${getOrgDisplayName(org)}」吗？该部门下有 ${memberCount} 名成员，删除后成员将变为未分配部门。`
        : `确定删除「${getOrgDisplayName(org)}」吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteOrganization(tenantId, org.id);
          message.success('部门已删除');
          if (selectedOrgId === org.id) {
            setSelectedOrgId(undefined);
          }
          onReload();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  };

  const confirmRemoveMember = (member: TenantMember) => {
    Modal.confirm({
      title: '移除成员',
      content: `确定将「${member.displayName}」从当前企业空间移除吗？移除后该成员将无法访问本空间资源。`,
      okText: '移除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        if (!tenantId) return;
        try {
          await deleteMember(tenantId, member.userId);
          message.success('成员已移除');
          onReload();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '移除失败');
        }
      },
    });
  };

  const buildOrgActionMenu = (org: OrganizationNode): MenuProps['items'] => {
    const items: MenuProps['items'] = [
      {
        key: 'edit',
        label: '编辑',
        icon: <EditOutlined />,
        onClick: () => openEditOrg(org.id),
      },
    ];
    if (!isRootOrg(org)) {
      items.push({
        key: 'delete',
        label: '删除',
        icon: <DeleteOutlined />,
        danger: true,
        onClick: () => confirmDeleteOrg(org),
      });
    }
    return items;
  };

  const renderOrgTreeTitle = (node: OrganizationNode) => (
    <div className="org-members-tree-node">
      <div className="org-members-tree-node-label">
        <span>{getOrgDisplayName(node)}</span>
      </div>
      {canWriteOrg && (
        <Dropdown
          menu={{ items: buildOrgActionMenu(node) }}
          trigger={['click']}
          placement="bottomRight"
        >
          <button
            type="button"
            className="org-members-tree-more org-position-action-btn"
            aria-label="部门操作"
            onClick={e => e.stopPropagation()}
          >
            <MoreOutlined />
          </button>
        </Dropdown>
      )}
    </div>
  );

  const treeData = useMemo(
    () => orgToTreeData(orgs, true, canWriteOrg ? renderOrgTreeTitle : undefined),
    [orgs, canWriteOrg, members],
  );

  const handleOrgSubmit = async (values: { name: string; parentId?: string | null; leaderUserId?: string | null }) => {
    if (!tenantId) {
      message.error('租户信息未加载，请刷新页面重试');
      return;
    }
    setSubmitting(true);
    try {
      if (orgModalMode === 'create') {
        await createOrganization(tenantId, values);
        message.success('部门已创建');
      } else if (editingOrgId) {
        const org = findOrgNode(orgs, editingOrgId);
        if (org && isRootOrg(org)) {
          await updateOrganization(tenantId, editingOrgId, { leaderUserId: values.leaderUserId });
        } else {
          await updateOrganization(tenantId, editingOrgId, values);
        }
        message.success('部门已更新');
      }
      setOrgModalOpen(false);
      onReload();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMember = (result: AddMemberResult) => {
    onReload();
    setAddResult(result);
  };

  const handleCloseAddResult = () => {
    setAddResult(null);
    setMemberFormOpen(false);
  };

  const openCreateMember = () => {
    setMemberFormMode('create');
    setEditingMember(null);
    setMemberFormOpen(true);
  };

  const openEditMember = (member: TenantMember) => {
    setMemberFormMode('edit');
    setEditingMember(member);
    setMemberFormOpen(true);
  };

  const addMenuItems: MenuProps['items'] = [
    { key: 'single', label: '添加成员', onClick: () => openCreateMember() },
    { key: 'invite', label: '邀请已有用户', onClick: () => setInviteModalOpen(true) },
    { key: 'batch', label: '批量导入', disabled: true },
  ];

  const columns: TableColumnsType<TenantMember> = [
    {
      title: '姓名',
      dataIndex: 'displayName',
      render: (v: string | null) => v || '—',
    },
    {
      title: '用户名',
      dataIndex: 'email',
      ellipsis: true,
      render: (email: string, row) => row.phone ?? email.replace(/@member\.local$/, ''),
    },
    {
      title: '工号',
      dataIndex: 'employeeId',
      width: 100,
      render: (v: string | null) => v || '—',
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      width: 130,
      render: (v: string | null) => formatPhone(v),
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      ellipsis: true,
      render: (v: string) => (v.endsWith('@member.local') ? '—' : v),
    },
    {
      title: '部门',
      dataIndex: 'orgId',
      ellipsis: true,
      render: (orgId: string | null) => (orgId ? orgNameMap.get(orgId) ?? '—' : '—'),
    },
    {
      title: '职位',
      dataIndex: 'positionId',
      ellipsis: true,
      render: (positionId: string | null) => (positionId ? positionNameMap.get(positionId) ?? '—' : '—'),
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            type="link"
            size="small"
            onClick={() => openEditMember(row)}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => {
              setDetailMember(row);
              setDetailMemberOpen(true);
            }}
          >
            详情
          </Button>
          {canWriteMember && (
            <Button
              type="link"
              size="small"
              danger
              onClick={() => confirmRemoveMember(row)}
            >
              移除
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="org-tab-body">
      <aside className="org-members-sidebar">
        <div className="org-sidebar-header">
          <span>部门</span>
          {canWriteOrg && (
            <Button type="text" size="small" icon={<PlusOutlined />} onClick={openCreateOrg} />
          )}
        </div>
        <div className="org-members-tree-wrap">
          <Tree
            blockNode
            showIcon
            selectedKeys={effectiveOrgId ? [effectiveOrgId] : []}
            treeData={treeData}
            onSelect={(keys) => {
              if (keys[0]) setSelectedOrgId(String(keys[0]));
            }}
          />
          
        </div>
      </aside>

      <main className="org-members-main">
        <div className="org-members-header">
          <div className="org-members-header-title-row">
            <ApartmentOutlined style={{ color: '#1677ff', marginRight: 8 }} />
            <h2 className="org-members-header-title">
              {selectedOrgId === '__unassigned__'
                ? '未分配部门'
                : selectedOrg
                  ? getOrgDisplayName(selectedOrg)
                  : '全部成员'}
            </h2>
          </div>
          <Dropdown menu={{ items: addMenuItems }} disabled={!canWriteMember}>
            <Button type="primary" icon={<PlusOutlined />} disabled={!canWriteMember}>
              添加 <DownOutlined />
            </Button>
          </Dropdown>
        </div>

        <div className="org-members-toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            placeholder="搜索 (⌘+G)"
            style={{ width: 220 }}
            value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
          />
          <Select
            value={statusFilter}
            style={{ width: 140 }}
            options={[
              { value: 'all', label: '登录状态' },
              { value: 'active', label: '正常' },
              { value: 'disabled', label: '已禁用' },
            ]}
            onChange={setStatusFilter}
          />
          <span className="org-member-count">{filteredMembers.length} 个成员</span>
        </div>

        <Table
          rowKey="userId"
          loading={loading}
          dataSource={selectedOrgId === '__unassigned__'
            ? filterMembers(members, { orgIds: null, statusFilter, keyword: searchKeyword }).filter(m => !m.orgId)
            : filteredMembers}
          columns={columns}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
          scroll={{ x: 900 }}
        />
      </main>

      <OrgFormModal
        open={orgModalOpen}
        mode={orgModalMode}
        orgs={orgs}
        members={members}
        excludeOrgId={orgModalMode === 'edit' ? editingOrgId ?? undefined : undefined}
        loading={submitting}
        initial={editingOrgId ? {
          name: findOrgNode(orgs, editingOrgId)?.name,
          parentId: findOrgNode(orgs, editingOrgId)?.parentId,
          leaderUserId: findOrgNode(orgs, editingOrgId)?.leaderUserId,
        } : { parentId: effectiveOrgId && effectiveOrgId !== '__unassigned__' ? effectiveOrgId : orgs[0]?.id }}
        onCancel={() => setOrgModalOpen(false)}
        onSubmit={handleOrgSubmit}
      />

      <MemberFormModal
        open={memberFormOpen}
        mode={memberFormMode}
        tenantId={tenantId ?? ''}
        orgs={orgs}
        positionGroups={positionGroups}
        member={editingMember}
        defaultOrgId={effectiveOrgId !== '__unassigned__' ? effectiveOrgId : null}
        result={addResult}
        onCancel={() => {
          setMemberFormOpen(false);
          setEditingMember(null);
        }}
        onSaved={() => {
          setMemberFormOpen(false);
          setEditingMember(null);
          onReload();
        }}
        onCloseResult={handleCloseAddResult}
      />

      <InviteMemberModal
        open={inviteModalOpen}
        tenantId={tenantId ?? ''}
        orgs={orgs}
        positionGroups={positionGroups}
        defaultOrgId={effectiveOrgId !== '__unassigned__' ? effectiveOrgId : null}
        onCancel={() => setInviteModalOpen(false)}
        onInvited={() => {
          setInviteModalOpen(false);
          onReload();
        }}
      />

      <MemberDetailModal
        open={detailMemberOpen}
        member={detailMember}
        tenantId={tenantId ?? ''}
        orgs={orgs}
        positionGroups={positionGroups}
        onClose={() => {
          setDetailMemberOpen(false);
          setDetailMember(null);
        }}
      />
    </div>
  );
};
