import React, { useCallback, useEffect, useState } from 'react';
import { Card, Empty, Spin, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { fetchLoginSessions, type LoginSessionItem } from '../../api/account';
import { formatCreatedAt } from '../../utils/formatDate';

const STATUS_META: Record<LoginSessionItem['status'], { label: string; color: string }> = {
  active: { label: '有效', color: 'success' },
  expired: { label: '已过期', color: 'default' },
  revoked: { label: '已登出', color: 'warning' },
};

function shortenDeviceInfo(raw: string | null): string {
  if (!raw) return '未知设备';
  const trimmed = raw.trim();
  if (trimmed.length <= 80) return trimmed;
  return `${trimmed.slice(0, 77)}...`;
}

export const AccountLoginLogsSection: React.FC = () => {
  const [items, setItems] = useState<LoginSessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLoginSessions();
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<LoginSessionItem> = [
    {
      title: '登录时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (ts: number) => formatCreatedAt(ts),
    },
    {
      title: 'IP 地址',
      dataIndex: 'ip',
      width: 140,
      render: (ip: string | null) => ip || '—',
    },
    {
      title: '设备 / 浏览器',
      dataIndex: 'deviceInfo',
      ellipsis: true,
      render: (info: string | null) => shortenDeviceInfo(info),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (status: LoginSessionItem['status'], row) => {
        const meta = STATUS_META[status];
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Tag color={meta.color}>{meta.label}</Tag>
            {row.isCurrent && <Tag color="processing">当前设备</Tag>}
          </span>
        );
      },
    },
  ];

  return (
    <Card title="登录日志" bordered={false} extra={<span style={{ color: '#8f959e', fontSize: 13 }}>最近 50 条</span>}>
      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center' }}>
          <Spin />
        </div>
      ) : error ? (
        <Empty description={error} />
      ) : items.length === 0 ? (
        <Empty description="暂无登录记录" />
      ) : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={items}
          pagination={false}
          size="middle"
        />
      )}
    </Card>
  );
};
