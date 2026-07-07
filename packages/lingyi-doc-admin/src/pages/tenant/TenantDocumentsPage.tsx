import React, { useEffect, useState } from 'react';
import { Select, Table, Typography } from 'antd';
import { adminFetch } from '../../stores/authStore';

interface TenantOption { id: string; name: string }

interface TeamDoc {
  id: string;
  title: string;
  docType: string;
  ownerName: string;
  updatedAt: number;
}

export const TenantDocumentsPage: React.FC = () => {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantId, setTenantId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<TeamDoc[]>([]);

  useEffect(() => {
    (async () => {
      const data = await adminFetch<{ items: TenantOption[] }>('/api/v1/admin/tenants');
      setTenants(data.items.map(t => ({ id: t.id, name: t.name })));
      if (data.items[0]) setTenantId(data.items[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      setLoading(true);
      try {
        const data = await adminFetch<{ items: TeamDoc[] }>(`/api/v1/admin/tenants/${tenantId}/documents`);
        setDocs(data.items);
      } finally {
        setLoading(false);
      }
    })();
  }, [tenantId]);

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>团队文档</Typography.Title>
      {tenants.length > 1 && (
        <Select
          style={{ width: 280, marginBottom: 16 }}
          value={tenantId}
          options={tenants.map(t => ({ value: t.id, label: t.name }))}
          onChange={setTenantId}
        />
      )}
      <Table
        rowKey="id"
        loading={loading}
        dataSource={docs}
        pagination={false}
        columns={[
          { title: '标题', dataIndex: 'title' },
          { title: '类型', dataIndex: 'docType' },
          { title: '创建人', dataIndex: 'ownerName' },
          { title: '更新时间', dataIndex: 'updatedAt', render: (v: number) => new Date(v).toLocaleString() },
        ]}
      />
    </div>
  );
};
