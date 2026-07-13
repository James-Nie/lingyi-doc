import React, { useEffect, useMemo, useState } from 'react';
import { ApartmentOutlined, CheckOutlined, CloseOutlined, MailOutlined, PhoneOutlined, UserAddOutlined } from '@ant-design/icons';
import { Empty, Input, Modal, Tag } from 'antd';
import type { OrganizationNode, TenantMember } from '../../../types/org';
import {
  avatarColor,
  buildOrgNameMap,
  collectOrgIds,
  filterMembers,
  findOrgNode,
  formatPhone,
  getOrgDisplayName,
  memberInitials,
} from '../utils';

type SelectTab = 'members' | 'departments' | 'teams';

interface SelectMembersModalProps {
  open: boolean;
  members: TenantMember[];
  orgs: OrganizationNode[];
  excludePositionId?: string;
  excludeRoleId?: string;
  currentUserId?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (userIds: string[]) => void;
}

export const SelectMembersModal: React.FC<SelectMembersModalProps> = ({
  open,
  members,
  orgs,
  excludePositionId,
  excludeRoleId,
  currentUserId,
  loading,
  onCancel,
  onConfirm,
}) => {
  const [activeTab, setActiveTab] = useState<SelectTab>('members');
  const [keyword, setKeyword] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewUserId, setPreviewUserId] = useState<string>();

  const orgNameMap = useMemo(() => buildOrgNameMap(orgs), [orgs]);

  const availableMembers = useMemo(
    () => members.filter(m => m.status === 1 && m.positionId !== excludePositionId && m.roleId !== excludeRoleId),
    [members, excludePositionId, excludeRoleId],
  );

  const filteredMembers = useMemo(
    () => filterMembers(availableMembers, { keyword }),
    [availableMembers, keyword],
  );

  const selectedMembers = useMemo(
    () => selectedIds
      .map(id => availableMembers.find(m => m.userId === id))
      .filter((m): m is TenantMember => !!m),
    [selectedIds, availableMembers],
  );

  const previewMember = useMemo(() => {
    if (previewUserId) {
      return availableMembers.find(m => m.userId === previewUserId) ?? selectedMembers[0];
    }
    return selectedMembers[0];
  }, [previewUserId, selectedMembers, availableMembers]);

  useEffect(() => {
    if (!open) return;
    setActiveTab('members');
    setKeyword('');
    setSelectedIds([]);
    setPreviewUserId(undefined);
  }, [open]);

  const toggleMember = (userId: string) => {
    setSelectedIds(prev => {
      const next = prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId];
      return next;
    });
    setPreviewUserId(userId);
  };

  const toggleDepartment = (orgId: string) => {
    const node = findOrgNode(orgs, orgId);
    if (!node) return;
    const orgIds = collectOrgIds(node, true);
    const deptMemberIds = availableMembers
      .filter(m => m.orgId && orgIds.includes(m.orgId))
      .map(m => m.userId);
    if (!deptMemberIds.length) return;

    setSelectedIds(prev => {
      const allSelected = deptMemberIds.every(id => prev.includes(id));
      if (allSelected) {
        return prev.filter(id => !deptMemberIds.includes(id));
      }
      return [...new Set([...prev, ...deptMemberIds])];
    });
  };

  const deptRows = useMemo(() => {
    const rows: Array<{ id: string; name: string; depth: number; memberCount: number }> = [];
    const walk = (nodes: OrganizationNode[], depth: number) => {
      for (const node of nodes) {
        const orgIds = collectOrgIds(node, true);
        const memberCount = availableMembers.filter(m => m.orgId && orgIds.includes(m.orgId)).length;
        rows.push({ id: node.id, name: getOrgDisplayName(node), depth, memberCount });
        if (node.children?.length) walk(node.children, depth + 1);
      }
    };
    walk(orgs, 0);
    return rows.filter(row => !keyword.trim() || row.name.toLowerCase().includes(keyword.trim().toLowerCase()));
  }, [orgs, availableMembers, keyword]);

  const renderMemberRow = (member: TenantMember) => {
    const selected = selectedIds.includes(member.userId);
    return (
      <button
        key={member.userId}
        type="button"
        className={`select-members-item${selected ? ' selected' : ''}`}
        onClick={() => toggleMember(member.userId)}
      >
        <div className="org-members-avatar select-members-item-avatar" style={{ background: avatarColor(member.userId) }}>
          {memberInitials(member.displayName)}
        </div>
        <span className="select-members-item-name">{member.displayName}</span>
        {currentUserId === member.userId && (
          <Tag className="select-members-self-tag">我自己</Tag>
        )}
        {selected && <CheckOutlined className="select-members-item-check" />}
      </button>
    );
  };

  return (
    <Modal
      title="选择成员"
      open={open}
      width={880}
      confirmLoading={loading}
      onCancel={onCancel}
      onOk={() => onConfirm(selectedIds)}
      okText="确定"
      cancelText="取消"
      okButtonProps={{ disabled: selectedIds.length === 0 }}
      destroyOnClose
      className="select-members-modal-root"
    >
      <div className="select-members-modal">
        <div className="select-members-left">
          <Input
            allowClear
            placeholder="搜索"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
          />
          <div className="select-members-tabs-row">
            <div className="select-members-tabs">
              {([
                ['members', '成员'],
                ['departments', '部门'],
                ['teams', '团队'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`select-members-tab${activeTab === key ? ' active' : ''}`}
                  onClick={() => setActiveTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="button" className="select-members-invite" disabled>
              <UserAddOutlined />
              邀请成员
            </button>
          </div>
          <div className="select-members-list">
            {activeTab === 'members' && (
              filteredMembers.length
                ? filteredMembers.map(renderMemberRow)
                : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无成员" />
            )}
            {activeTab === 'departments' && (
              deptRows.length
                ? deptRows.map(row => {
                  const node = findOrgNode(orgs, row.id);
                  if (!node) return null;
                  const orgIds = collectOrgIds(node, true);
                  const deptMemberIds = availableMembers
                    .filter(m => m.orgId && orgIds.includes(m.orgId))
                    .map(m => m.userId);
                  const allSelected = deptMemberIds.length > 0 && deptMemberIds.every(id => selectedIds.includes(id));
                  return (
                    <button
                      key={row.id}
                      type="button"
                      className={`select-members-dept-item${allSelected ? ' selected' : ''}`}
                      style={{ paddingLeft: 12 + row.depth * 16 }}
                      onClick={() => toggleDepartment(row.id)}
                      disabled={row.memberCount === 0}
                    >
                      <span>{row.name}</span>
                      <span className="select-members-dept-count">{row.memberCount}</span>
                      {allSelected && <CheckOutlined className="select-members-item-check" />}
                    </button>
                  );
                })
                : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无部门" />
            )}
            {activeTab === 'teams' && (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无团队" />
            )}
          </div>
        </div>

        <div className="select-members-right">
          <div className="select-members-selected-header">已选择 · {selectedIds.length}</div>
          <div className="select-members-selected-list">
            {selectedMembers.map(member => (
              <div key={member.userId} className="select-members-selected-item">
                <button
                  type="button"
                  className="select-members-selected-main"
                  onClick={() => setPreviewUserId(member.userId)}
                >
                  <div className="org-members-avatar select-members-item-avatar" style={{ background: avatarColor(member.userId) }}>
                    {memberInitials(member.displayName)}
                  </div>
                  <span>{member.displayName}</span>
                </button>
                <button
                  type="button"
                  className="select-members-selected-remove"
                  aria-label="移除"
                  onClick={() => setSelectedIds(prev => prev.filter(id => id !== member.userId))}
                >
                  <CloseOutlined />
                </button>
              </div>
            ))}
          </div>

          {previewMember ? (
            <div className="select-members-preview">
              <div
                className="select-members-preview-avatar"
                style={{ background: avatarColor(previewMember.userId) }}
              >
                {memberInitials(previewMember.displayName)}
              </div>
              <div className="select-members-preview-name">{previewMember.displayName}</div>
              <div className="select-members-preview-sub">
                {formatPhone(previewMember.phone) !== '—' ? formatPhone(previewMember.phone) : previewMember.email.replace(/@member\.local$/, '')}
              </div>
              <div className="select-members-preview-meta">
                <div><ApartmentOutlined /> {previewMember.orgId ? orgNameMap.get(previewMember.orgId) ?? '—' : '—'}</div>
                <div><PhoneOutlined /> {formatPhone(previewMember.phone)}</div>
                <div><MailOutlined /> {previewMember.email.endsWith('@member.local') ? '—' : previewMember.email}</div>
                <div>工号 {previewMember.employeeId || '—'}</div>
              </div>
            </div>
          ) : (
            <div className="select-members-preview-empty">请选择成员</div>
          )}
        </div>
      </div>
    </Modal>
  );
};
