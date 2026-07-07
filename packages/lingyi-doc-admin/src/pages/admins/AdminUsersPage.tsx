import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, Modal, Select, Space, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { adminFetch, authStore } from '../../stores/authStore';

interface AdminRow {
  id: string;
  email: string;
  displayName: string;
  status: string;
  roles: Array<{ code: string; name: string }>;
  createdAt: number;
}

interface RoleOption {
  id: string;
  code: string;
  name: string;
}

export const AdminUsersPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AdminRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch<{ items: AdminRow[] }>('/api/v1/admin/admins?pageSize=50');
      setData(res.items);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    adminFetch<RoleOption[]>('/api/v1/admin/roles').then(setRoles).catch(() => {});
  }, [load]);

  const onCreate = async () => {
    const values = await form.validateFields();
    try {
      await adminFetch('/api/v1/admin/admins', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      message.success('管理员已创建');
      setOpen(false);
      form.resetFields();
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '创建失败');
    }
  };

  const columns: ColumnsType<AdminRow> = [
    { title: '昵称', dataIndex: 'displayName' },
    { title: '邮箱', dataIndex: 'email' },
    {
      title: '角色',
      dataIndex: 'roles',
      render: (roles: AdminRow['roles']) => roles?.map(r => (
        <Tag key={r.code}>{r.name}</Tag>
      )),
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (s: string) => (
        <Tag color={s === 'active' ? 'green' : 'red'}>{s === 'active' ? '正常' : s}</Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      render: (v: number) => new Date(v).toLocaleString(),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>管理员账号</h2>
        {authStore.hasPermission('admin_user:write') && (
          <Button type="primary" onClick={() => setOpen(true)}>新建管理员</Button>
        )}
      </div>
      <Table rowKey="id" loading={loading} columns={columns} dataSource={data} pagination={false} />

      <Modal title="新建管理员" open={open} onCancel={() => setOpen(false)} onOk={() => void onCreate()}>
        <Form form={form} layout="vertical">
          <Form.Item name="displayName" label="昵称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ required: true }, { type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, min: 8 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="roleCode" label="角色" rules={[{ required: true }]}>
            <Select options={roles.map(r => ({ value: r.code, label: r.name }))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
