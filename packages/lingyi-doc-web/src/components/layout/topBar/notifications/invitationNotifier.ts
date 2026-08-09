import { Modal, message } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, TeamOutlined } from '@ant-design/icons';
import React from 'react';
import { TenantApi } from '../../../../api/tenant';
import { authStore } from '../../../../stores/authStore';
import type { NotificationItem } from './types';

function tenantRoleLabel(role: number): string {
  if (role === 1) return '超级管理员';
  if (role === 2) return '管理员';
  return '成员';
}

export const INVITATION_TYPE = 'invitation';

export async function fetchInvitationNotifications(): Promise<NotificationItem[]> {
  if (!authStore.getState().accessToken) return [];
  try {
    const data = await TenantApi.listInvitations();
    return data.items.map((inv) => ({
      id: inv.tenantId,
      type: INVITATION_TYPE,
      title: inv.tenantName,
      description: `角色：${tenantRoleLabel(inv.tenantRole)}`,
      icon: React.createElement(TeamOutlined, { style: { color: '#fa8c16', fontSize: 16 } }),
      actions: [
        {
          key: 'accept',
          label: '接受',
          type: 'primary',
          icon: React.createElement(CheckCircleOutlined),
          loading: false,
          onClick: async () => {
            try {
              await TenantApi.acceptInvitation(inv.tenantId);
              message.success('已加入该组织');
              await authStore.refreshMe();
            } catch (err) {
              message.error(err instanceof Error ? err.message : '接受失败');
            }
          },
        },
        {
          key: 'reject',
          label: '拒绝',
          icon: React.createElement(CloseCircleOutlined),
          loading: false,
          onClick: () => {
            Modal.confirm({
              title: '拒绝邀请',
              content: '确定拒绝该组织的邀请吗？',
              okText: '拒绝',
              okType: 'danger',
              cancelText: '取消',
              onOk: async () => {
                try {
                  await TenantApi.rejectInvitation(inv.tenantId);
                  message.success('已拒绝邀请');
                } catch (err) {
                  message.error(err instanceof Error ? err.message : '拒绝失败');
                }
              },
            });
          },
        },
      ],
      createdAt: inv.invitedAt,
    }));
  } catch {
    return [];
  }
}