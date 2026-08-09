import React, { useEffect, useState } from 'react';
import { Button, Modal, Space, Typography, message } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, TeamOutlined } from '@ant-design/icons';
import { TenantApi, type TenantInvitation } from '../../api/tenant';
import { authStore } from '../../stores/authStore';

function tenantRoleLabel(role: number): string {
  if (role === 1) return '超级管理员';
  if (role === 2) return '管理员';
  return '成员';
}

export const InvitationBanner: React.FC = () => {
  const [invitations, setInvitations] = useState<TenantInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchInvitations = async () => {
    if (!authStore.getState().accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await TenantApi.listInvitations();
      setInvitations(data.items);
    } catch {
      setError('加载邀请失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchInvitations();
  }, []);

  const handleAccept = async (tenantId: string) => {
    setProcessingId(tenantId);
    try {
      await TenantApi.acceptInvitation(tenantId);
      message.success('已加入该组织');
      setInvitations(prev => prev.filter(i => i.tenantId !== tenantId));
      await authStore.refreshMe();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '接受失败');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (tenantId: string) => {
    Modal.confirm({
      title: '拒绝邀请',
      content: '确定拒绝该组织的邀请吗？',
      okText: '拒绝',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setProcessingId(tenantId);
        try {
          await TenantApi.rejectInvitation(tenantId);
          message.success('已拒绝邀请');
          setInvitations(prev => prev.filter(i => i.tenantId !== tenantId));
        } catch (err) {
          message.error(err instanceof Error ? err.message : '拒绝失败');
        } finally {
          setProcessingId(null);
        }
      },
    });
  };

  if (loading && invitations.length === 0) return null;
  if (error) return null;
  if (invitations.length === 0) return null;

  return (
    <div style={{
      marginBottom: 20,
      padding: '16px 20px',
      background: '#fff7f0',
      border: '1px solid #ffd8bf',
      borderRadius: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <TeamOutlined style={{ color: '#fa8c16', fontSize: 18 }} />
        <span style={{ fontSize: 15, fontWeight: 500, color: '#1f2329' }}>
          待确认的邀请
        </span>
        <span style={{ fontSize: 13, color: '#8f959e' }}>
          ({invitations.length} 条)
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {invitations.map(inv => (
          <div
            key={inv.tenantId}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', background: '#fff', borderRadius: 8,
              border: '1px solid #ffe7ba',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Typography.Text strong>{inv.tenantName}</Typography.Text>
              <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                {tenantRoleLabel(inv.tenantRole)}
              </Typography.Text>
            </div>
            <Space>
              <Button
                type="primary"
                size="small"
                icon={<CheckCircleOutlined />}
                loading={processingId === inv.tenantId}
                onClick={() => { void handleAccept(inv.tenantId); }}
              >
                接受
              </Button>
              <Button
                size="small"
                icon={<CloseCircleOutlined />}
                loading={processingId === inv.tenantId}
                onClick={() => { void handleReject(inv.tenantId); }}
              >
                拒绝
              </Button>
            </Space>
          </div>
        ))}
      </div>
    </div>
  );
};