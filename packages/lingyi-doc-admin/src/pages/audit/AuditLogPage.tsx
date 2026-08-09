import React, { useEffect, useState } from 'react';
import { Button, Table, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined } from '@ant-design/icons';
import { adminFetch } from '../../stores/authStore';

interface AuditRow {
  id: number;
  operatorId: string;
  operatorName: string | null;
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
  const [exporting, setExporting] = useState(false);

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
    { title: '操作人', dataIndex: 'operatorName', width: 160, ellipsis: true, render: (name: string | null, row) => name || row.operatorId || '—' },
    { title: 'IP', dataIndex: 'ip', width: 140 },
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (v: number) => new Date(v).toLocaleString(),
    },
  ];

  const handleExport = () => {
    setExporting(true);
    const token = localStorage.getItem('lingyi_doc_admin_access');
    const params = new URLSearchParams({ page: '1', pageSize: '10000' });
    fetch(`/api/v1/admin/audit-logs/export?${params.toString()}`, {
      headers: { Authorization: token ? `Bearer ${token}` : '' },
    })
      .then(res => {
        if (!res.ok) throw new Error('导出失败');
        return res.blob();
      })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        message.success('导出成功');
      })
      .catch(err => message.error(err instanceof Error ? err.message : '导出失败'))
      .finally(() => setExporting(false));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 0, marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>审计日志</h2>
        <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
          导出 CSV
        </Button>
      </div>
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
