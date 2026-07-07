import React, { useCallback, useEffect, useState } from 'react';
import { Button, Input, Select, Space, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { adminFetch } from '../../stores/authStore';
import {
  DEMO_STATUS_COLORS,
  DEMO_STATUS_LABELS,
  type DemoRequestItem,
  type DemoRequestStatus,
} from './demoConstants';

export const DemoRequestsPage: React.FC = () => {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<DemoRequestStatus | ''>('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DemoRequestItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (keyword.trim()) params.set('keyword', keyword.trim());
      if (status) params.set('status', status);
      const res = await adminFetch<{ items: DemoRequestItem[]; total: number }>(
        `/api/v1/admin/demo-requests?${params.toString()}`,
      );
      setData(res.items);
      setTotal(res.total);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, page, status]);

  useEffect(() => { void load(); }, [load]);

  const columns: ColumnsType<DemoRequestItem> = [
    { title: '姓名', dataIndex: 'name', width: 100 },
    { title: '联系电话', dataIndex: 'phone', width: 130 },
    { title: '公司', dataIndex: 'company', ellipsis: true },
    {
      title: '申请产品',
      dataIndex: 'products',
      ellipsis: true,
      render: (products: string[]) => products.join('、'),
    },
    {
      title: '处理状态',
      dataIndex: 'status',
      width: 100,
      render: (s: DemoRequestStatus) => (
        <Tag color={DEMO_STATUS_COLORS[s]}>{DEMO_STATUS_LABELS[s]}</Tag>
      ),
    },
    {
      title: '是否已处理',
      dataIndex: 'isProcessed',
      width: 100,
      render: (v: boolean) => (
        <Tag color={v ? 'green' : 'default'}>{v ? '是' : '否'}</Tag>
      ),
    },
    {
      title: '处理人',
      dataIndex: 'processedByName',
      width: 100,
      render: (v: string | null) => v || '—',
    },
    {
      title: '提交时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (v: number) => new Date(v).toLocaleString(),
    },
    {
      title: '操作',
      width: 90,
      render: (_, row) => (
        <Button type="link" size="small" onClick={() => navigate(`/demo-requests/${row.id}`)}>
          查看详情
        </Button>
      ),
    },
  ];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>商机管理</h2>
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="搜索姓名、电话、公司"
          allowClear
          style={{ width: 260 }}
          onSearch={v => { setKeyword(v); setPage(1); }}
        />
        <Select
          placeholder="处理状态"
          allowClear
          style={{ width: 140 }}
          value={status || undefined}
          options={[
            { label: '待处理', value: 'pending' },
            { label: '跟进中', value: 'contacted' },
            { label: '已处理', value: 'closed' },
          ]}
          onChange={v => { setStatus(v ?? ''); setPage(1); }}
        />
        <Button onClick={() => void load()}>刷新</Button>
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data}
        pagination={{ current: page, total, pageSize: 20, onChange: setPage }}
      />
    </div>
  );
};
