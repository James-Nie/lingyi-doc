import React, { useEffect, useState } from 'react';
import { Button, Card, Col, Form, InputNumber, message, Row, Spin, Switch, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { adminFetch } from '../../stores/authStore';

interface PasswordPolicy {
  passwordMinLength: number;
  passwordRequireMixed: boolean;
  registerEnabled: boolean;
  maxLoginAttempts: number;
  lockDurationMinutes: number;
}

interface SessionItem {
  id: string;
  userId: string;
  displayName: string | null;
  email: string | null;
  clientType: string;
  deviceInfo: string | null;
  ip: string | null;
  createdAt: number;
  expiresAt: number;
}

export const SecurityPolicyPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [policy, setPolicy] = useState<PasswordPolicy | null>(null);
  const [saving, setSaving] = useState(false);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [sessionPage, setSessionPage] = useState(1);
  const [sessionLoading, setSessionLoading] = useState(false);

  const loadPolicy = async () => {
    setLoading(true);
    try {
      const res = await adminFetch<PasswordPolicy>('/api/v1/admin/security/password-policy');
      setPolicy(res);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载安全策略失败');
    } finally {
      setLoading(false);
    }
  };

  const loadSessions = async (page: number) => {
    setSessionLoading(true);
    try {
      const res = await adminFetch<{ items: SessionItem[]; total: number }>(
        `/api/v1/admin/security/sessions?page=${page}&pageSize=10`,
      );
      setSessions(res.items);
      setSessionTotal(res.total);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载会话列表失败');
    } finally {
      setSessionLoading(false);
    }
  };

  useEffect(() => { void loadPolicy(); }, []);
  useEffect(() => { void loadSessions(sessionPage); }, [sessionPage]);

  const savePolicy = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      await adminFetch('/api/v1/admin/security/password-policy', {
        method: 'PUT',
        body: JSON.stringify(values),
      });
      message.success('安全策略已更新');
      void loadPolicy();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const revokeSession = async (sessionId: string) => {
    try {
      await adminFetch(`/api/v1/admin/security/sessions/${sessionId}`, {
        method: 'DELETE',
      });
      message.success('会话已撤销');
      void loadSessions(sessionPage);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '撤销失败');
    }
  };

  const sessionColumns: ColumnsType<SessionItem> = [
    { title: '用户', dataIndex: 'displayName', width: 140, render: (name: string | null, row) => name || row.email || '—' },
    { title: '客户端类型', dataIndex: 'clientType', width: 120 },
    { title: '设备信息', dataIndex: 'deviceInfo', ellipsis: true },
    { title: 'IP', dataIndex: 'ip', width: 140 },
    {
      title: '登录时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (v: number) => new Date(v).toLocaleString(),
    },
    {
      title: '状态',
      width: 80,
      render: (_, row) => {
        const expired = row.expiresAt < Date.now();
        return expired ? <Tag color="default">已过期</Tag> : <Tag color="green">活跃</Tag>;
      },
    },
    {
      title: '操作',
      width: 80,
      render: (_, row) => (
        <Button size="small" danger onClick={() => revokeSession(row.id)}>
          撤销
        </Button>
      ),
    },
  ];

  if (loading && !policy) {
    return <Spin style={{ display: 'block', marginTop: 80 }} />;
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>账号安全策略</h2>
      <Card title="密码策略" style={{ marginBottom: 24 }}>
        <Form
          layout="vertical"
          initialValues={policy ?? undefined}
          onFinish={savePolicy}
          style={{ maxWidth: 500 }}
        >
          <Form.Item
            label="密码最小长度"
            name="passwordMinLength"
            rules={[{ required: true, message: '请输入密码最小长度' }]}
          >
            <InputNumber min={6} max={32} style={{ width: 200 }} />
          </Form.Item>
          <Form.Item
            label="密码必须包含字母和数字"
            name="passwordRequireMixed"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            label="允许 C 端自助注册"
            name="registerEnabled"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            label={
              <span>
                最大登录尝试次数&nbsp;
                <Tooltip title="超过此次数后账号将被临时锁定">
                  <ExclamationCircleOutlined style={{ color: '#999' }} />
                </Tooltip>
              </span>
            }
            name="maxLoginAttempts"
            rules={[{ required: true, message: '请输入最大登录尝试次数' }]}
          >
            <InputNumber min={1} max={50} style={{ width: 200 }} />
          </Form.Item>
          <Form.Item
            label="账号锁定时间（分钟）"
            name="lockDurationMinutes"
            rules={[{ required: true, message: '请输入锁定时间' }]}
          >
            <InputNumber min={1} max={1440} style={{ width: 200 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={saving}>
              保存设置
            </Button>
          </Form.Item>
        </Form>
      </Card>
      <Card title="活跃会话管理">
        <Table
          rowKey="id"
          loading={sessionLoading}
          columns={sessionColumns}
          dataSource={sessions}
          pagination={{
            current: sessionPage,
            total: sessionTotal,
            pageSize: 10,
            onChange: setSessionPage,
            showTotal: (t) => `共 ${t} 条`,
          }}
        />
      </Card>
    </div>
  );
};