import React, { useCallback, useEffect, useState } from 'react';
import { Button, Input, Popconfirm, Select, Space, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { adminFetch, authStore } from '../../stores/authStore';
import {
  TEMPLATE_DOC_TYPE_LABELS,
  TEMPLATE_STATUS_COLORS,
  TEMPLATE_STATUS_LABELS,
  type TemplateDocType,
  type TemplateListItem,
  type TemplateStatus,
} from './templateConstants';

export const TemplatesPage: React.FC = () => {
  const navigate = useNavigate();
  const canWrite = authStore.hasPermission('template:write');
  const [keyword, setKeyword] = useState('');
  const [docType, setDocType] = useState<TemplateDocType | ''>('');
  const [status, setStatus] = useState<TemplateStatus | ''>('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TemplateListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (keyword.trim()) params.set('keyword', keyword.trim());
      if (docType) params.set('docType', docType);
      if (status) params.set('status', status);
      const res = await adminFetch<{ items: TemplateListItem[]; total: number }>(
        `/api/v1/admin/templates?${params.toString()}`,
      );
      setData(res.items);
      setTotal(res.total);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [docType, keyword, page, status]);

  useEffect(() => { void load(); }, [load]);

  const handleStatusChange = async (id: string, nextStatus: TemplateStatus) => {
    try {
      await adminFetch(`/api/v1/admin/templates/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      message.success('状态已更新');
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await adminFetch(`/api/v1/admin/templates/${id}`, { method: 'DELETE' });
      message.success('已删除');
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const columns: ColumnsType<TemplateListItem> = [
    { title: 'ID', dataIndex: 'id', width: 160, ellipsis: true },
    { title: '标题', dataIndex: 'title', ellipsis: true },
    {
      title: '类型',
      dataIndex: 'docType',
      width: 100,
      render: (v: TemplateDocType) => TEMPLATE_DOC_TYPE_LABELS[v] ?? v,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: TemplateStatus) => (
        <Tag color={TEMPLATE_STATUS_COLORS[s]}>{TEMPLATE_STATUS_LABELS[s]}</Tag>
      ),
    },
    {
      title: '分类',
      dataIndex: 'categories',
      ellipsis: true,
      render: (cats: string[]) => cats.join(', '),
    },
    { title: '排序', dataIndex: 'sortOrder', width: 70 },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 170,
      render: (v: number) => new Date(v).toLocaleString(),
    },
    {
      title: '操作',
      key: 'actions',
      width: 260,
      render: (_, row) => (
        <Space size="small" wrap>
          <Button type="link" size="small" onClick={() => navigate(`/templates/${row.id}`)}>
            查看
          </Button>
          {canWrite && (
            <Button type="link" size="small" onClick={() => navigate(`/templates/${row.id}/edit`)}>
              编辑
            </Button>
          )}
          {canWrite && row.status !== 'published' && (
            <Button type="link" size="small" onClick={() => void handleStatusChange(row.id, 'published')}>
              发布
            </Button>
          )}
          {canWrite && row.status === 'published' && (
            <Button type="link" size="small" onClick={() => void handleStatusChange(row.id, 'archived')}>
              下架
            </Button>
          )}
          {canWrite && (
            <Popconfirm title="确认删除该模板？" onConfirm={() => void handleDelete(row.id)}>
              <Button type="link" size="small" danger>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space wrap>
          <Input.Search
            placeholder="搜索标题 / ID"
            allowClear
            style={{ width: 220 }}
            onSearch={(v) => { setKeyword(v); setPage(1); }}
          />
          <Select
            placeholder="文档类型"
            allowClear
            style={{ width: 130 }}
            value={docType || undefined}
            onChange={(v) => { setDocType(v ?? ''); setPage(1); }}
            options={Object.entries(TEMPLATE_DOC_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <Select
            placeholder="状态"
            allowClear
            style={{ width: 120 }}
            value={status || undefined}
            onChange={(v) => { setStatus(v ?? ''); setPage(1); }}
            options={Object.entries(TEMPLATE_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </Space>
        {canWrite && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/templates/new')}>
            新建模板
          </Button>
        )}
      </div>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data}
        pagination={{
          current: page,
          total,
          pageSize: 20,
          onChange: setPage,
          showTotal: (t) => `共 ${t} 条`,
        }}
      />
    </div>
  );
};
