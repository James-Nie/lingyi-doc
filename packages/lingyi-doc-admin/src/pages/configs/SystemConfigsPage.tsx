import React, { useEffect, useState } from 'react';
import { Button, Input, Space, Switch, Table, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { adminFetch, authStore } from '../../stores/authStore';

interface ConfigRow {
  key: string;
  value: unknown;
  description: string | null;
  updatedAt: number;
}

export const SystemConfigsPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ConfigRow[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminFetch<{ items: ConfigRow[] }>('/api/v1/admin/configs');
      setData(res.items);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const save = async (row: ConfigRow) => {
    try {
      let value: unknown = editValue;
      if (typeof row.value === 'boolean') value = editValue === 'true';
      else if (typeof row.value === 'number') value = Number(editValue);
      else {
        try { value = JSON.parse(editValue); } catch { /* keep string */ }
      }
      await adminFetch(`/api/v1/admin/configs/${encodeURIComponent(row.key)}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      });
      message.success('已保存');
      setEditingKey(null);
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    }
  };

  const columns: ColumnsType<ConfigRow> = [
    { title: '配置项', dataIndex: 'key', width: 220 },
    { title: '说明', dataIndex: 'description' },
    {
      title: '值',
      dataIndex: 'value',
      render: (value: unknown, row) => {
        if (editingKey === row.key) {
          if (typeof value === 'boolean') {
            return (
              <Switch
                checked={editValue === 'true'}
                onChange={checked => setEditValue(String(checked))}
              />
            );
          }
          return (
            <Input
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              style={{ width: 200 }}
            />
          );
        }
        return String(value);
      },
    },
    {
      title: '操作',
      render: (_, row) => {
        if (!authStore.hasPermission('config:write')) return null;
        if (editingKey === row.key) {
          return (
            <Space>
              <Button size="small" type="primary" onClick={() => void save(row)}>保存</Button>
              <Button size="small" onClick={() => setEditingKey(null)}>取消</Button>
            </Space>
          );
        }
        return (
          <Button
            size="small"
            onClick={() => {
              setEditingKey(row.key);
              setEditValue(String(row.value));
            }}
          >
            编辑
          </Button>
        );
      },
    },
  ];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>系统配置</h2>
      <Table rowKey="key" loading={loading} columns={columns} dataSource={data} pagination={false} />
    </div>
  );
};
