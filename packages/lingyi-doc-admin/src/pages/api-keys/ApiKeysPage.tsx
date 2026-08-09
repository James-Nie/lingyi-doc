import React, { useEffect, useState } from 'react';
import { Button, Card, Input, Modal, Table, Tag, message, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { KeyOutlined, PlusOutlined } from '@ant-design/icons';
import { adminFetch } from '../../stores/authStore';

const { Paragraph, Text } = Typography;

interface ApiKeyItem {
  id: string;
  tenantId: string | null;
  name: string;
  keyPrefix: string;
  permissions: string[];
  status: string;
  expiresAt: number | null;
  lastUsedAt: number | null;
  lastUsedIp: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: number;
  revokedAt: number | null;
}

export const ApiKeysPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiKeyItem[]>([]);
  const [createModal, setCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdResult, setCreatedResult] = useState<{ name: string; rawKey: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminFetch<{ items: ApiKeyItem[]; total: number }>('/api/v1/admin/api-keys');
      setData(res.items);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleCreate = async () => {
    if (!newKeyName.trim()) {
      message.error('请输入密钥名称');
      return;
    }
    setCreating(true);
    try {
      const res = await adminFetch<{ id: string; name: string; keyPrefix: string; rawKey: string }>(
        '/api/v1/admin/api-keys',
        { method: 'POST', body: JSON.stringify({ name: newKeyName.trim() }) },
      );
      setCreatedResult({ name: res.name, rawKey: res.rawKey });
      setNewKeyName('');
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string, name: string) => {
    Modal.confirm({
      title: '确认撤销',
      content: `确定要撤销 API 密钥"${name}"吗？撤销后使用该密钥的集成将立即失效。`,
      okText: '确认撤销',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await adminFetch(`/api/v1/admin/api-keys/${id}`, { method: 'DELETE' });
          message.success('密钥已撤销');
          void load();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '撤销失败');
        }
      },
    });
  };

  const columns: ColumnsType<ApiKeyItem> = [
    { title: '名称', dataIndex: 'name', width: 180 },
    {
      title: '密钥前缀',
      dataIndex: 'keyPrefix',
      width: 160,
      render: (prefix: string) => <Text code>{prefix}...</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: string) =>
        status === 'active' ? <Tag color="green">活跃</Tag> : <Tag color="red">已撤销</Tag>,
    },
    {
      title: '最后使用',
      width: 180,
      render: (_, row) =>
        row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString() : '—',
    },
    {
      title: '创建者',
      dataIndex: 'createdByName',
      width: 140,
      render: (name: string | null) => name || '—',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (v: number) => new Date(v).toLocaleString(),
    },
    {
      title: '操作',
      width: 100,
      render: (_, row) =>
        row.status === 'active' ? (
          <Button size="small" danger onClick={() => handleRevoke(row.id, row.name)}>
            撤销
          </Button>
        ) : (
          <Tag color="default">已撤销</Tag>
        ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>API 集成管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModal(true)}>
          创建密钥
        </Button>
      </div>
      <Card>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={data}
          pagination={false}
        />
      </Card>
      <Modal
        title="创建 API 密钥"
        open={createModal}
        onCancel={() => {
          setCreateModal(false);
          setCreatedResult(null);
          setNewKeyName('');
        }}
        footer={null}
        width={520}
      >
        {createdResult ? (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Text>密钥名称：<Text strong>{createdResult.name}</Text></Text>
            </div>
            <div style={{ marginBottom: 8 }}>
              <Text type="danger">请立即复制并安全保存此密钥，关闭后将无法再次查看。</Text>
            </div>
            <div style={{ background: '#f5f5f5', padding: '12px 16px', borderRadius: 6, marginBottom: 16 }}>
              <Paragraph
                copyable={{ text: createdResult.rawKey }}
                style={{ margin: 0, fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all' }}
              >
                {createdResult.rawKey}
              </Paragraph>
            </div>
            <Button
              type="primary"
              onClick={() => {
                setCreateModal(false);
                setCreatedResult(null);
              }}
            >
              我已保存，关闭
            </Button>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Text>创建新的 API 密钥用于第三方系统集成。</Text>
            </div>
            <Input
              placeholder="请输入密钥名称，例如：飞书集成"
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              onPressEnter={handleCreate}
              style={{ marginBottom: 16 }}
            />
            <Button type="primary" loading={creating} onClick={handleCreate} icon={<KeyOutlined />}>
              创建密钥
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
};