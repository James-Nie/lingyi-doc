import React, { useEffect, useState } from 'react';
import { Button, Card, Col, Input, Modal, Progress, Row, Statistic, Table, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { adminFetch } from '../../stores/authStore';

interface TenantStorage {
  tenantId: string;
  tenantName: string;
  quotaBytes: number;
  usedBytes: number;
  usedPercent: number;
  docCount: number;
}

interface StorageOverview {
  items: TenantStorage[];
  totalBytes: number;
}

export const StorageManagementPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<StorageOverview | null>(null);
  const [editModal, setEditModal] = useState<{ visible: boolean; tenant: TenantStorage | null }>({
    visible: false,
    tenant: null,
  });
  const [editQuota, setEditQuota] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminFetch<StorageOverview>('/api/v1/admin/storage/overview');
      setOverview(res);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const saveQuota = async () => {
    if (!editModal.tenant) return;
    const quotaMB = Number(editQuota);
    if (!quotaMB || quotaMB < 1) {
      message.error('配额至少为 1 MB');
      return;
    }
    try {
      await adminFetch(`/api/v1/admin/storage/tenants/${editModal.tenant.tenantId}/quota`, {
        method: 'PUT',
        body: JSON.stringify({ quotaBytes: quotaMB * 1024 * 1024 }),
      });
      message.success('配额已更新');
      setEditModal({ visible: false, tenant: null });
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新失败');
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  const totalUsed = overview?.totalBytes ?? 0;
  const totalQuota = overview?.items.reduce((s, t) => s + t.quotaBytes, 0) ?? 0;
  const totalPercent = totalQuota > 0 ? Math.round((totalUsed / totalQuota) * 100) : 0;

  const columns: ColumnsType<TenantStorage> = [
    { title: '租户名称', dataIndex: 'tenantName', width: 200 },
    {
      title: '存储使用量',
      render: (_, row) => (
        <span>
          {formatBytes(row.usedBytes)} / {formatBytes(row.quotaBytes)}
        </span>
      ),
    },
    {
      title: '使用率',
      width: 200,
      render: (_, row) => (
        <Progress
          percent={row.usedPercent}
          size="small"
          status={row.usedPercent >= 90 ? 'exception' : row.usedPercent >= 80 ? 'active' : 'normal'}
        />
      ),
    },
    { title: '文档数', dataIndex: 'docCount', width: 100 },
    {
      title: '操作',
      width: 120,
      render: (_, row) => (
        <Button
          size="small"
          onClick={() => {
            setEditModal({ visible: true, tenant: row });
            setEditQuota(String(Math.round(row.quotaBytes / 1048576)));
          }}
        >
          调整配额
        </Button>
      ),
    },
  ];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>存储容量管理</h2>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic title="总存储空间" value={formatBytes(totalQuota)} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="已使用" value={formatBytes(totalUsed)} valueStyle={{ color: totalPercent >= 90 ? '#cf1322' : undefined }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="总使用率" value={totalPercent} suffix="%" />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="租户数量" value={overview?.items.length ?? 0} />
          </Card>
        </Col>
      </Row>
      <Table
        rowKey="tenantId"
        loading={loading}
        columns={columns}
        dataSource={overview?.items ?? []}
        pagination={false}
      />
      <Modal
        title="调整存储配额"
        open={editModal.visible}
        onOk={saveQuota}
        onCancel={() => setEditModal({ visible: false, tenant: null })}
        okText="保存"
        cancelText="取消"
      >
        {editModal.tenant && (
          <div>
            <p>租户：{editModal.tenant.tenantName}</p>
            <p>当前使用：{formatBytes(editModal.tenant.usedBytes)}</p>
            <div style={{ marginTop: 16 }}>
              <span>配额（MB）：</span>
              <Input
                type="number"
                value={editQuota}
                onChange={e => setEditQuota(e.target.value)}
                style={{ width: 200 }}
                min={1}
              />
            </div>
            <p style={{ marginTop: 8, color: '#888', fontSize: 12 }}>
              提示：1 GB = 1024 MB，建议根据实际使用情况合理分配
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
};