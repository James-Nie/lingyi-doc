import React, { useEffect, useState } from 'react';
import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { adminFetch } from '../../stores/authStore';

interface AuditRow {
  id: number;
  operatorId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  createdAt: number;
}

export const AuditLogPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    adminFetch<{ items: AuditRow[]; total: number }>(`/api/v1/admin/audit-logs?page=${page}&pageSize=20`)
      .then(res => {
        setData(res.items);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [page]);

  const columns: ColumnsType<AuditRow> = [
    { title: '操作', dataIndex: 'action', width: 180 },
    { title: '目标类型', dataIndex: 'targetType', width: 120 },
    { title: '目标 ID', dataIndex: 'targetId', ellipsis: true },
    { title: '操作人', dataIndex: 'operatorId', width: 280, ellipsis: true },
    { title: 'IP', dataIndex: 'ip', width: 140 },
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (v: number) => new Date(v).toLocaleString(),
    },
  ];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>审计日志</h2>
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
