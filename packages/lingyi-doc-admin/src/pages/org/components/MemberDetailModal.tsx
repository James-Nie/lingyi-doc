import React, { useEffect, useMemo, useState } from 'react';
import { Descriptions, Modal } from 'antd';
import type { OrganizationNode, PositionGroupNode, TenantMember, TenantRoleNode } from '../../../types/org';
import { listRoles } from '../../../api/org';
import { buildOrgNameMap, buildPositionNameMap, formatPhone } from '../utils';

interface MemberDetailModalProps {
  open: boolean;
  member: TenantMember | null;
  tenantId: string;
  orgs: OrganizationNode[];
  positionGroups: PositionGroupNode[];
  onClose: () => void;
}

export const MemberDetailModal: React.FC<MemberDetailModalProps> = ({
  open,
  member,
  tenantId,
  orgs,
  positionGroups,
  onClose,
}) => {
  const [roles, setRoles] = useState<TenantRoleNode[]>([]);

  useEffect(() => {
    if (open) {
      listRoles(tenantId).then(setRoles).catch(() => {});
    }
  }, [open, tenantId]);

  const orgNameMap = useMemo(() => buildOrgNameMap(orgs), [orgs]);
  const positionNameMap = useMemo(() => buildPositionNameMap(positionGroups), [positionGroups]);
  const roleNameMap = useMemo(() => {
    const map = new Map<string, string>();
    roles.forEach(r => map.set(r.id, r.name));
    return map;
  }, [roles]);

  if (!member) return null;

  const genderLabel = (g: number | null) => {
    if (g === 1) return '男';
    if (g === 2) return '女';
    return '—';
  };

  const statusLabel = (s: number) => (s === 1 ? '正常' : '已禁用');

  return (
    <Modal
      title="成员详情"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width={640}
    >
      <Descriptions column={2} bordered size="small">
        <Descriptions.Item label="姓名">{member.displayName}</Descriptions.Item>
        <Descriptions.Item label="用户名">
          {member.phone ?? member.email.replace(/@member\.local$/, '')}
        </Descriptions.Item>
        <Descriptions.Item label="工号">{member.employeeId || '—'}</Descriptions.Item>
        <Descriptions.Item label="手机号">{formatPhone(member.phone)}</Descriptions.Item>
        <Descriptions.Item label="邮箱">
          {member.email.endsWith('@member.local') ? '—' : member.email}
        </Descriptions.Item>
        <Descriptions.Item label="性别">{genderLabel(member.gender)}</Descriptions.Item>
        <Descriptions.Item label="部门">
          {member.orgId ? (orgNameMap.get(member.orgId) ?? '—') : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="职位">
          {member.positionId ? (positionNameMap.get(member.positionId) ?? '—') : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="状态">{statusLabel(member.status)}</Descriptions.Item>
        <Descriptions.Item label="角色">
          {member.roleId ? (roleNameMap.get(member.roleId) ?? '—') : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="加入时间">
          {new Date(member.joinedAt).toLocaleDateString('zh-CN')}
        </Descriptions.Item>
      </Descriptions>
    </Modal>
  );
};