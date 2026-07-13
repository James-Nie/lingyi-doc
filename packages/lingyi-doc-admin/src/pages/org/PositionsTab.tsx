import React, { useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  Input,
  Modal,
  Table,
  message,
  type MenuProps,
  type TableColumnsType,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
  RightOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  assignMembersToPosition,
  createPosition,
  createPositionGroup,
  deletePosition,
  deletePositionGroup,
  removeMemberFromPosition,
  updatePosition,
  updatePositionGroup,
} from '../../api/org';
import { authStore } from '../../stores/authStore';
import type { OrganizationNode, PositionGroupNode, PositionNode, TenantMember } from '../../types/org';
import { PositionFormModal } from './components/PositionFormModal';
import { PositionGroupFormModal } from './components/PositionGroupFormModal';
import { SelectMembersModal } from './components/SelectMembersModal';
import {
  avatarColor,
  buildOrgNameMap,
  filterMembers,
  memberInitials,
  positionAvatarEmoji,
} from './utils';

interface PositionsTabProps {
  tenantId?: string;
  orgs: OrganizationNode[];
  members: TenantMember[];
  positionGroups: PositionGroupNode[];
  loading: boolean;
  onReload: () => void;
}

export const PositionsTab: React.FC<PositionsTabProps> = ({
  tenantId,
  orgs,
  members,
  positionGroups,
  loading,
  onReload,
}) => {
  const canWrite = authStore.hasPermission('tenant:org:write');
  const canWriteMember = authStore.hasPermission('tenant:member:write');
  const currentUserId = authStore.getState().user?.id;
  const [selectedPositionId, setSelectedPositionId] = useState<string>();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(positionGroups.map(g => g.id)));
  const [searchKeyword, setSearchKeyword] = useState('');
  const [positionModalOpen, setPositionModalOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [selectMembersOpen, setSelectMembersOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<PositionNode | null>(null);
  const [editingGroup, setEditingGroup] = useState<PositionGroupNode | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const orgNameMap = useMemo(() => buildOrgNameMap(orgs), [orgs]);

  const allPositions = useMemo(
    () => positionGroups.flatMap(g => g.positions.map(p => ({ ...p, groupName: g.name }))),
    [positionGroups],
  );

  const selectedPosition = allPositions.find(p => p.id === selectedPositionId) ?? allPositions[0];
  const effectivePositionId = selectedPosition?.id;

  React.useEffect(() => {
    if (!selectedPositionId && allPositions[0]) {
      setSelectedPositionId(allPositions[0].id);
    }
  }, [allPositions, selectedPositionId]);

  const filteredMembers = useMemo(() => {
    if (!effectivePositionId) return [];
    return filterMembers(members, {
      positionId: effectivePositionId,
      keyword: searchKeyword,
    });
  }, [members, effectivePositionId, searchKeyword]);

  const memberCount = (positionId: string) =>
    members.filter(m => m.positionId === positionId).length;

  const handleCreate = async (values: { name: string; groupId: string; avatarKey: string }) => {
    if (!tenantId) return;
    setSubmitting(true);
    try {
      await createPosition(tenantId, values);
      message.success('职位已创建');
      setPositionModalOpen(false);
      onReload();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdatePosition = async (values: { name: string; groupId: string; avatarKey: string }) => {
    if (!tenantId || !editingPosition) return;
    setSubmitting(true);
    try {
      await updatePosition(tenantId, editingPosition.id, values);
      message.success('职位已更新');
      setEditingPosition(null);
      onReload();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateGroup = async (values: { name: string }) => {
    if (!tenantId) return;
    setSubmitting(true);
    try {
      const group = await createPositionGroup(tenantId, values.name) as { id: string };
      message.success('分组已创建');
      setGroupModalOpen(false);
      setExpandedGroups(prev => new Set([...prev, group.id]));
      onReload();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateGroup = async (values: { name: string }) => {
    if (!tenantId || !editingGroup) return;
    setSubmitting(true);
    try {
      await updatePositionGroup(tenantId, editingGroup.id, values.name);
      message.success('分组已更新');
      setEditingGroup(null);
      onReload();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新失败');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmRemoveMember = (member: TenantMember) => {
    if (!tenantId || !effectivePositionId) return;
    Modal.confirm({
      title: '移除成员',
      content: `确定将「${member.displayName}」从该职位移除吗？`,
      okText: '移除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await removeMemberFromPosition(tenantId, effectivePositionId, member.userId);
          message.success('成员已移除');
          onReload();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '移除失败');
        }
      },
    });
  };

  const handleAssignMembers = async (userIds: string[]) => {
    if (!tenantId || !effectivePositionId || !userIds.length) return;
    setSubmitting(true);
    try {
      await assignMembersToPosition(tenantId, effectivePositionId, userIds);
      message.success(`已添加 ${userIds.length} 名成员`);
      setSelectMembersOpen(false);
      onReload();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '添加失败');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDeletePosition = (pos: PositionNode) => {
    if (!tenantId) return;
    const count = memberCount(pos.id);
    Modal.confirm({
      title: '删除职位',
      content: count > 0
        ? `确定删除「${pos.name}」吗？该职位下有 ${count} 名成员，删除后成员的职位将被清空。`
        : `确定删除「${pos.name}」吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deletePosition(tenantId, pos.id);
          message.success('职位已删除');
          if (selectedPositionId === pos.id) {
            setSelectedPositionId(undefined);
          }
          onReload();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  };

  const confirmDeleteGroup = (group: PositionGroupNode) => {
    if (!tenantId) return;
    const positionCount = group.positions.length;
    const memberTotal = group.positions.reduce((sum, p) => sum + memberCount(p.id), 0);
    Modal.confirm({
      title: '删除分组',
      content: positionCount > 0
        ? `确定删除「${group.name}」吗？将同时删除其下 ${positionCount} 个职位${memberTotal > 0 ? `，${memberTotal} 名成员的职位将被清空` : ''}。`
        : `确定删除「${group.name}」吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deletePositionGroup(tenantId, group.id);
          message.success('分组已删除');
          if (group.positions.some(p => p.id === selectedPositionId)) {
            setSelectedPositionId(undefined);
          }
          onReload();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  };

  const buildActionMenu = (
    onEdit: () => void,
    onDelete: () => void,
  ): MenuProps['items'] => [
    {
      key: 'edit',
      label: '编辑',
      icon: <EditOutlined />,
      onClick: onEdit,
    },
    {
      key: 'delete',
      label: '删除',
      icon: <DeleteOutlined />,
      danger: true,
      onClick: onDelete,
    },
  ];

  const addMenuItems: MenuProps['items'] = [
    {
      key: 'position',
      label: '新建职位',
      icon: <PlusOutlined />,
      onClick: () => setPositionModalOpen(true),
    },
    {
      key: 'group',
      label: '新建分组',
      icon: <RightOutlined />,
      onClick: () => setGroupModalOpen(true),
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
      render: (orgId: string | null) => (orgId ? orgNameMap.get(orgId) ?? '—' : '—'),
    },
    {
      title: '操作',
      width: 80,
      render: (_, row) => (
        canWriteMember
          ? <Button type="link" size="small" danger onClick={() => confirmRemoveMember(row)}>移除</Button>
          : <Button type="link" size="small" disabled>移除</Button>
      ),
    },
  ];

  return (
    <div className="org-tab-body">
      <aside className="org-members-sidebar">
        <div className="org-sidebar-header">
          <span>职位</span>
          {canWrite && (
            <Dropdown menu={{ items: addMenuItems }} trigger={['click']} placement="bottomRight">
              <button type="button" className="org-sidebar-add-btn" aria-label="新建">
                <PlusOutlined />
              </button>
            </Dropdown>
          )}
        </div>
        <div className="org-position-list">
          {positionGroups.map(group => {
            const expanded = expandedGroups.has(group.id);
            return (
              <div key={group.id} className="org-position-group">
                <div className="org-position-group-title-row">
                  <button
                    type="button"
                    className="org-position-group-title"
                    onClick={() => {
                      setExpandedGroups(prev => {
                        const next = new Set(prev);
                        if (next.has(group.id)) next.delete(group.id);
                        else next.add(group.id);
                        return next;
                      });
                    }}
                  >
                    <span>{expanded ? '▾' : '▸'}</span>
                    {group.name}
                  </button>
                  {canWrite && (
                    <Dropdown
                      menu={{ items: buildActionMenu(
                        () => setEditingGroup(group),
                        () => confirmDeleteGroup(group),
                      ) }}
                      trigger={['click']}
                      placement="bottomRight"
                    >
                      <button
                        type="button"
                        className="org-position-action-btn"
                        aria-label="分组操作"
                        onClick={e => e.stopPropagation()}
                      >
                        <MoreOutlined />
                      </button>
                    </Dropdown>
                  )}
                </div>
                {expanded && group.positions.map(pos => (
                  <div
                    key={pos.id}
                    className={`org-position-item-row${effectivePositionId === pos.id ? ' active' : ''}`}
                  >
                    <button
                      type="button"
                      className="org-position-item"
                      onClick={() => setSelectedPositionId(pos.id)}
                    >
                      <span className="org-position-item-avatar">{positionAvatarEmoji(pos.avatarKey)}</span>
                      <span className="org-position-item-name">{pos.name}</span>
                      <span className="org-position-item-count">· {memberCount(pos.id)}</span>
                    </button>
                    {canWrite && (
                      <Dropdown
                        menu={{ items: buildActionMenu(
                          () => setEditingPosition(pos),
                          () => confirmDeletePosition(pos),
                        ) }}
                        trigger={['click']}
                        placement="bottomRight"
                      >
                        <button
                          type="button"
                          className="org-position-action-btn"
                          aria-label="职位操作"
                          onClick={e => e.stopPropagation()}
                        >
                          <MoreOutlined />
                        </button>
                      </Dropdown>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </aside>

      <main className="org-members-main">
        <div className="org-members-header">
          <div className="org-members-header-title-row">
            <UserOutlined style={{ color: '#1677ff', marginRight: 8 }} />
            <h2 className="org-members-header-title">{selectedPosition?.name ?? '职位'}</h2>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!canWriteMember || !effectivePositionId}
            onClick={() => setSelectMembersOpen(true)}
          >
            添加
          </Button>
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
          <span className="org-member-count">{filteredMembers.length} 个成员</span>
        </div>

        <Table
          rowKey="userId"
          loading={loading}
          dataSource={filteredMembers}
          columns={columns}
          locale={{ emptyText: '暂无数据' }}
          pagination={false}
        />
      </main>

      <PositionFormModal
        open={positionModalOpen}
        groups={positionGroups}
        defaultGroupId={selectedPosition?.groupId}
        loading={submitting}
        onCancel={() => setPositionModalOpen(false)}
        onSubmit={handleCreate}
      />

      <PositionFormModal
        open={!!editingPosition}
        title="编辑职位"
        groups={positionGroups}
        initialValues={editingPosition ? {
          name: editingPosition.name,
          groupId: editingPosition.groupId,
          avatarKey: editingPosition.avatarKey,
        } : undefined}
        loading={submitting}
        onCancel={() => setEditingPosition(null)}
        onSubmit={handleUpdatePosition}
      />

      <PositionGroupFormModal
        open={groupModalOpen}
        loading={submitting}
        onCancel={() => setGroupModalOpen(false)}
        onSubmit={handleCreateGroup}
      />

      <PositionGroupFormModal
        open={!!editingGroup}
        title="编辑分组"
        initialName={editingGroup?.name}
        loading={submitting}
        onCancel={() => setEditingGroup(null)}
        onSubmit={handleUpdateGroup}
      />

      <SelectMembersModal
        open={selectMembersOpen}
        members={members}
        orgs={orgs}
        excludePositionId={effectivePositionId}
        currentUserId={currentUserId}
        loading={submitting}
        onCancel={() => setSelectMembersOpen(false)}
        onConfirm={handleAssignMembers}
      />
    </div>
  );
};
