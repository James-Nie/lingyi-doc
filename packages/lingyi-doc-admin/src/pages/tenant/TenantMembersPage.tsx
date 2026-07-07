import React, { useEffect, useState } from 'react';
import { Select, Table, Typography } from 'antd';
import { adminFetch } from '../../stores/authStore';

interface TenantOption {
  id: string;
  name: string;
}

interface TenantMember {
  userId: string;
  email: string;
  displayName: string;
  tenantRole: number;
  orgId: string | null;
  status: number;
  joinedAt: number;
}

export const TenantMembersPage: React.FC = () => {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantId, setTenantId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<TenantMember[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await adminFetch<{ items: TenantOption[] }>('/api/v1/admin/tenants');
        setTenants(data.items.map(t => ({ id: t.id, name: t.name })));
        if (data.items[0]) setTenantId(data.items[0].id);
      } catch {
        /* 私有化可能无 platform tenant read，忽略 */
      }
    })();
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      setLoading(true);
      try {
        const data = await adminFetch<{ items: TenantMember[] }>(`/api/v1/admin/tenants/${tenantId}/members`);
        setMembers(data.items);
      } finally {
        setLoading(false);
      }
    })();
  }, [tenantId]);

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>租户成员</Typography.Title>
      {tenants.length > 1 && (
        <Select
          style={{ width: 280, marginBottom: 16 }}
          value={tenantId}
          options={tenants.map(t => ({ value: t.id, label: t.name }))}
          onChange={setTenantId}
        />
      )}
      <Table
        rowKey="userId"
        loading={loading}
        dataSource={members}
        pagination={false}
        columns={[
          { title: '姓名', dataIndex: 'displayName' },
          { title: '邮箱', dataIndex: 'email' },
          { title: '角色', dataIndex: 'tenantRole', render: (v: number) => ({ 1: '超管', 2: '管理员', 3: '成员' }[v] ?? v) },
          { title: '状态', dataIndex: 'status', render: (v: number) => (v === 1 ? '正常' : '禁用') },
          { title: '加入时间', dataIndex: 'joinedAt', render: (v: number) => new Date(v).toLocaleString() },
        ]}
      />
    </div>
  );
};
