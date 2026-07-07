import React, { useCallback, useEffect, useState } from 'react';
import { Button, Input, Space, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { adminFetch, authStore } from '../../stores/authStore';

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  status: string;
  createdAt: number;
  lastLoginAt: number | null;
  personalPlan: 1 | 2 | 3;
  effectivePlan: 'free' | 'vip' | 'trial';
  planLabel: string;
  planExpired: boolean;
  vipExpireAt: number | null;
}

function planTagColor(plan: UserRow['effectivePlan'], expired: boolean): string {
  if (expired) return 'default';
  if (plan === 'vip') return 'gold';
  if (plan === 'trial') return 'blue';
  return 'default';
}

function formatVipExpireAt(row: UserRow): string {
  if (row.personalPlan === 1) return '—';
  if (row.vipExpireAt == null) return '永久有效';
  return new Date(row.vipExpireAt).toLocaleString();
}

export const ConsumerUsersPage: React.FC = () => {
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch<{ items: UserRow[]; total: number }>(
        `/api/v1/admin/users?keyword=${encodeURIComponent(keyword)}&page=${page}&pageSize=20`,
      );
      setData(res.items);
      setTotal(res.total);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, page]);

  useEffect(() => { void load(); }, [load]);

  const toggleStatus = async (user: UserRow) => {
    const next = user.status === 'active' ? 'suspended' : 'active';
    try {
      await adminFetch(`/api/v1/admin/users/${user.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      message.success('状态已更新');
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  const columns: ColumnsType<UserRow> = [
    { title: '昵称', dataIndex: 'displayName' },
    { title: '邮箱', dataIndex: 'email' },
    {
      title: '账号类型',
      dataIndex: 'planLabel',
      render: (_: string, row) => (
        <Tag color={planTagColor(row.effectivePlan, row.planExpired)}>{row.planLabel}</Tag>
      ),
    },
    {
      title: '会员/试用到期',
      key: 'vipExpireAt',
      render: (_, row) => formatVipExpireAt(row),
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (s: string) => (
        <Tag color={s === 'active' ? 'green' : 'red'}>{s === 'active' ? '正常' : '已禁用'}</Tag>
      ),
    },
    {
      title: '注册时间',
      dataIndex: 'createdAt',
      render: (v: number) => new Date(v).toLocaleString(),
    },
    {
      title: '最近登录',
      dataIndex: 'lastLoginAt',
      render: (v: number | null) => (v ? new Date(v).toLocaleString() : '—'),
    },
    {
      title: '操作',
      render: (_, row) => (
        authStore.hasPermission('user:suspend') ? (
          <Button size="small" onClick={() => void toggleStatus(row)}>
            {row.status === 'active' ? '禁用' : '启用'}
          </Button>
        ) : null
      ),
    },
  ];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>C 端用户管理</h2>
      <p style={{ color: '#8c8c8c', marginBottom: 16 }}>
        C 端用户密码由用户在「账号设置」中自行修改，管理端不提供重置密码功能。
      </p>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="搜索邮箱或昵称"
          allowClear
          onSearch={v => { setKeyword(v); setPage(1); }}
          style={{ width: 280 }}
        />
      </Space>
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
        }}
      />
    </div>
  );
};
