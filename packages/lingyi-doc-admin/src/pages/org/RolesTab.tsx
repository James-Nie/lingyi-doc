import React, { useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  Input,
  Modal,
  Select,
  Table,
  Tag,
  message,
  type MenuProps,
  type TableColumnsType,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import {
  assignMembersToRole,
  createRole,
  deleteRole,
  removeMemberFromRole,
  updateMember,
  updateRole,
} from '../../api/org';
import { authStore } from '../../stores/authStore';
import type { OrganizationNode, PositionGroupNode, TenantMember, TenantRoleNode } from '../../types/org';
import { RoleFormModal, roleToFormValues, type RoleFormValues } from './components/RoleFormModal';
import { SelectMembersModal } from './components/SelectMembersModal';
import {
  avatarColor,
  buildOrgNameMap,
  buildPositionNameMap,
  filterMembers,
  memberInitials,
  tenantRolePermissionLabel,
} from './utils';

interface RolesTabProps {
  tenantId?: string;
  orgs: OrganizationNode[];
  members: TenantMember[];
  roles: TenantRoleNode[];
  positionGroups: PositionGroupNode[];
  loading: boolean;
  onReload: () => void;
}

export const RolesTab: React.FC<RolesTabProps> = ({
  tenantId,
  orgs,
  members,
  roles,
  positionGroups,
  loading,
  onReload,
}) => {
  const canWrite = authStore.hasPermission('tenant:member:write');
  const [selectedRoleId, setSelectedRoleId] = useState<string>();
  const [searchKeyword, setSearchKeyword] = useState('');
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<TenantRoleNode | null>(null);
  const [selectMembersOpen, setSelectMembersOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string>();

  const orgNameMap = useMemo(() => buildOrgNameMap(orgs), [orgs]);
  const positionNameMap = useMemo(() => buildPositionNameMap(positionGroups), [positionGroups]);

  const selectedRole = roles.find(r => r.id === selectedRoleId) ?? roles[0];
  const effectiveRoleId = selectedRole?.id;

  React.useEffect(() => {
    if (!selectedRoleId && roles[0]) {
      setSelectedRoleId(roles[0].id);
    }
  }, [roles, selectedRoleId]);

  const filteredMembers = useMemo(() => {
    if (!effectiveRoleId) return [];
    return filterMembers(
      members.filter(m => m.roleId === effectiveRoleId),
      { keyword: searchKeyword },
    );
  }, [members, effectiveRoleId, searchKeyword]);

  const handleCreateRole = async (values: RoleFormValues) => {
    if (!tenantId) return;
    setSubmitting(true);
    try {
      const role = await createRole(tenantId, values) as { id: string };
      message.success('角色已创建');
      setRoleModalOpen(false);
      setSelectedRoleId(role.id);
      onReload();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateRole = async (values: RoleFormValues) => {
    if (!tenantId || !editingRole) return;
    setSubmitting(true);
    try {
      await updateRole(tenantId, editingRole.id, values);
      message.success('角色已更新');
      setEditingRole(null);
      onReload();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新失败');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDeleteRole = (role: TenantRoleNode) => {
    if (!tenantId) return;
    if (role.isSystem) {
      message.warning('系统角色不可删除');
      return;
    }
    Modal.confirm({
      title: '删除角色',
      content: (role.memberCount ?? 0) > 0
        ? `确定删除「${role.name}」吗？请先移除角色成员。`
        : `确定删除「${role.name}」吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteRole(tenantId, role.id);
          message.success('角色已删除');
          if (selectedRoleId === role.id) setSelectedRoleId(undefined);
          onReload();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  };

  const handleAssignMembers = async (userIds: string[]) => {
    if (!tenantId || !effectiveRoleId || !userIds.length) return;
    setSubmitting(true);
    try {
      await assignMembersToRole(tenantId, effectiveRoleId, userIds);
      message.success(`已添加 ${userIds.length} 名成员`);
      setSelectMembersOpen(false);
      onReload();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '添加失败');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmRemoveMember = (member: TenantMember) => {
    if (!tenantId || !effectiveRoleId) return;
    Modal.confirm({
      title: '移除成员',
      content: `确定将「${member.displayName}」从该角色移除吗？移除后将变为普通成员角色。`,
      okText: '移除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await removeMemberFromRole(tenantId, effectiveRoleId, member.userId);
          message.success('成员已移除');
          onReload();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '移除失败');
        }
      },
    });
  };

  const handleMemberRoleChange = async (member: TenantMember, roleId: string) => {
    if (!tenantId || roleId === member.roleId) return;
    setUpdatingUserId(member.userId);
    try {
      await updateMember(tenantId, member.userId, { roleId });
      message.success('成员角色已更新');
      onReload();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新失败');
    } finally {
      setUpdatingUserId(undefined);
    }
  };

  const buildRoleActionMenu = (role: TenantRoleNode): MenuProps['items'] => [
    {
      key: 'edit',
      label: '编辑',
      icon: <EditOutlined />,
      onClick: () => setEditingRole(role),
    },
    {
      key: 'delete',
      label: '删除',
      icon: <DeleteOutlined />,
      danger: true,
      disabled: role.isSystem,
      onClick: () => confirmDeleteRole(role),
    },
  ];

  const columns: TableColumnsType<TenantMember> = [
    {
      title: '姓名',
      dataIndex: 'displayName',
      render: (_, row) => (
        <div className="org-members-name-cell">
          <div className="org-members-avatar" style={{ background: avatarColor(row.userId) }}>
            {memberInitials(row.displayName)}
          </div>
          <span>{row.displayName}</span>
        </div>
      ),
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
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (status: number) => (
        <Tag color={status === 1 ? 'success' : 'default'}>{status === 1 ? '正常' : '已禁用'}</Tag>
      ),
    },
    {
      title: '角色',
      width: 150,
      render: (_, row) => (
        canWrite
          ? (
            <Select
              size="small"
              value={row.roleId ?? undefined}
              loading={updatingUserId === row.userId}
              options={roles.map(r => ({ value: r.id, label: r.name }))}
              onChange={value => void handleMemberRoleChange(row, value)}
            />
          )
          : roles.find(r => r.id === row.roleId)?.name ?? '—'
      ),
    },
    {
      title: '操作',
      width: 80,
      render: (_, row) => (
        canWrite
          ? <Button type="link" size="small" danger onClick={() => confirmRemoveMember(row)}>移除</Button>
          : <Button type="link" size="small" disabled>移除</Button>
      ),
    },
  ];

  return (
    <div className="org-tab-body">
      <aside className="org-members-sidebar">
        <div className="org-sidebar-header">
          <span>角色</span>
          {canWrite && (
            <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => setRoleModalOpen(true)} />
          )}
        </div>
        <div className="org-role-list">
          {roles.map(role => (
            <div
              key={role.id}
              className={`org-role-item-row${effectiveRoleId === role.id ? ' active' : ''}`}
            >
              <button
                type="button"
                className="org-role-item"
                onClick={() => setSelectedRoleId(role.id)}
              >
                <span className="org-role-item-name">{role.name}</span>
                <span className="org-role-item-count">{role.memberCount ?? 0}</span>
              </button>
              {canWrite && (
                <Dropdown menu={{ items: buildRoleActionMenu(role) }} trigger={['click']} placement="bottomRight">
                  <button
                    type="button"
                    className="org-position-action-btn org-members-tree-more"
                    aria-label="角色操作"
                    onClick={e => e.stopPropagation()}
                  >
                    <MoreOutlined />
                  </button>
                </Dropdown>
              )}
            </div>
          ))}
        </div>
      </aside>

      <main className="org-members-main">
        <div className="org-members-header">
          <div className="org-members-header-title-row">
            <SafetyCertificateOutlined style={{ color: '#1677ff', marginRight: 8 }} />
            <h2 className="org-members-header-title">{selectedRole?.name ?? '角色'}</h2>
            {selectedRole?.isSystem && <Tag>系统角色</Tag>}
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!canWrite || !effectiveRoleId}
            onClick={() => setSelectMembersOpen(true)}
          >
            添加
          </Button>
        </div>

        {selectedRole && (
          <div className="org-role-desc-card">
            <p className="org-role-desc-text">{selectedRole.description || '暂无描述'}</p>
            <div className="org-role-perm-tags">
              {selectedRole.permissions.length
                ? selectedRole.permissions.map(perm => (
                  <Tag key={perm}>{tenantRolePermissionLabel(perm)}</Tag>
                ))
                : <Tag>无管理权限</Tag>}
            </div>
          </div>
        )}

        <div className="org-members-toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            placeholder="搜索成员"
            style={{ width: 220 }}
            value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
          />
          <span className="org-member-count">{filteredMembers.length} 个成员</span>
        </div>

        <Table
          rowKey="userId"
          loading={loading}
          dataSource={filteredMembers}
          columns={columns}
          locale={{ emptyText: '暂无成员' }}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
          scroll={{ x: 860 }}
        />
      </main>

      <RoleFormModal
        open={roleModalOpen}
        loading={submitting}
        onCancel={() => setRoleModalOpen(false)}
        onSubmit={handleCreateRole}
      />

      <RoleFormModal
        open={!!editingRole}
        title="编辑角色"
        isSystem={editingRole?.isSystem}
        initial={editingRole ? roleToFormValues(editingRole) : undefined}
        loading={submitting}
        onCancel={() => setEditingRole(null)}
        onSubmit={handleUpdateRole}
      />

      <SelectMembersModal
        open={selectMembersOpen}
        members={members}
        orgs={orgs}
        excludeRoleId={effectiveRoleId}
        loading={submitting}
        onCancel={() => setSelectMembersOpen(false)}
        onConfirm={handleAssignMembers}
      />
    </div>
  );
};
