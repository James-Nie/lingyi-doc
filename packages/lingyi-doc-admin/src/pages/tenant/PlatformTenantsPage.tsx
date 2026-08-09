import React, { useEffect, useState } from 'react';
import { Table, Typography } from 'antd';
import { adminFetch } from '../../stores/authStore';

interface PlatformTenant {
  id: string;
  name: string;
  status: number;
  deployType: number;
  adminUserId: string | null;
  createdAt: number;
}

export const PlatformTenantsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PlatformTenant[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await adminFetch<{ items: PlatformTenant[]; total: number }>('/api/v1/admin/tenants');
        setItems(data.items);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>平台租户</Typography.Title>
      <Typography.Paragraph type="secondary">SaaS 环境下全部企业租户列表（平台超管视角）</Typography.Paragraph>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={items}
        pagination={false}
        columns={[
          { title: '企业名称', dataIndex: 'name' },
          { title: '租户 ID', dataIndex: 'id', ellipsis: true },
          { title: '状态', dataIndex: 'status', render: (v: number) => (v === 1 ? '正常' : '禁用') },
          { title: '部署类型', dataIndex: 'deployType', render: (v: number) => ({ 1: 'SaaS', 2: '私有化', 3: '专属云' }[v] ?? v) },
          { title: '创建时间', dataIndex: 'createdAt', render: (v: number) => new Date(v).toLocaleString() },
        ]}
      />
    </div>
  );
};
