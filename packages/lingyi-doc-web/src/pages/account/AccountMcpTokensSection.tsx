import React, { useEffect, useState } from 'react';
import { Button, Input, Modal, Popconfirm, Select, Space, Table, Tag, message } from 'antd';
import {
  createMcpToken,
  deleteMcpToken,
  fetchMcpTokenAudit,
  fetchMcpTokens,
  updateMcpToken,
  type McpAuditItem,
  type McpTokenItem,
  type McpTokenPreset,
} from '../../api/mcp';

const PRESET_OPTIONS: Array<{ value: McpTokenPreset; label: string }> = [
  { value: 'readonly', label: '只读（查看 + RAG 检索）' },
  { value: 'editor', label: '编辑（读写文档/知识库 + RAG）' },
  { value: 'full', label: '完全控制' },
];

const PRESET_SCOPES: Record<McpTokenPreset, string[]> = {
  readonly: ['kb:read', 'doc:read', 'ai:rag'],
  editor: ['kb:read', 'kb:write', 'doc:read', 'doc:write', 'ai:rag'],
  full: ['kb:read', 'kb:write', 'doc:read', 'doc:write', 'ai:rag'],
};

function inferPreset(scopes: string[]): McpTokenPreset {
  const sorted = [...scopes].sort().join(',');
  if (sorted === [...PRESET_SCOPES.readonly].sort().join(',')) return 'readonly';
  if (sorted === [...PRESET_SCOPES.editor].sort().join(',')) return 'editor';
  if (sorted === [...PRESET_SCOPES.full].sort().join(',')) return 'full';
  return 'editor';
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

export const AccountMcpTokensSection: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [tokens, setTokens] = useState<McpTokenItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingToken, setEditingToken] = useState<McpTokenItem | null>(null);
  const [name, setName] = useState('');
  const [preset, setPreset] = useState<McpTokenPreset>('editor');
  const [plainToken, setPlainToken] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditRows, setAuditRows] = useState<McpAuditItem[]>([]);
  const [auditTokenName, setAuditTokenName] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchMcpTokens();
      setTokens(data);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openCreate = () => {
    setEditingToken(null);
    setName('');
    setPreset('editor');
    setModalOpen(true);
  };

  const openEdit = (row: McpTokenItem) => {
    setEditingToken(row);
    setName(row.name);
    setPreset(inferPreset(row.scopes));
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingToken(null);
    setName('');
    setPreset('editor');
  };

  const handleSave = async () => {
    if (!name.trim()) {
      message.warning('请填写 Token 名称');
      return;
    }
    setSaving(true);
    try {
      if (editingToken) {
        await updateMcpToken(editingToken.id, {
          name: name.trim(),
          preset,
        });
        message.success('Token 已更新');
        closeModal();
      } else {
        const result = await createMcpToken({ name: name.trim(), preset });
        setPlainToken(result.plainToken);
        message.success('Token 已创建');
        closeModal();
      }
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMcpToken(id);
      message.success('已删除');
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const showAudit = async (row: McpTokenItem) => {
    setAuditTokenName(row.name);
    setAuditOpen(true);
    setAuditLoading(true);
    try {
      const data = await fetchMcpTokenAudit(row.id);
      setAuditRows(data);
    } catch {
      setAuditRows([]);
    } finally {
      setAuditLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>MCP Token</h3>
          <p style={{ margin: '6px 0 0', color: '#8f959e', fontSize: 13 }}>
            用于 Cursor、Claude Desktop 等 MCP 客户端接入零一文档
          </p>
        </div>
        <Button type="primary" onClick={openCreate}>创建 Token</Button>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={tokens}
        pagination={false}
        scroll={{ x: 900 }}
        columns={[
          { title: '名称', dataIndex: 'name', ellipsis: true },
          { title: '前缀', dataIndex: 'tokenPrefix', width: 120 },
          {
            title: '权限',
            dataIndex: 'scopes',
            render: (scopes: string[]) => scopes.map((s) => <Tag key={s}>{s}</Tag>),
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 80,
            render: (v: string) => (
              <Tag color={v === 'active' ? 'green' : 'default'}>{v === 'active' ? '有效' : v}</Tag>
            ),
          },
          {
            title: '过期时间',
            dataIndex: 'expiresAt',
            width: 160,
            render: (v: string | null) => formatTime(v),
          },
          {
            title: '最近使用',
            dataIndex: 'lastUsedAt',
            width: 160,
            render: (v: string | null) => formatTime(v),
          },
          {
            title: '操作',
            width: 210,
            fixed: 'right',
            render: (_, row) => (
              <Space size={4}>
                <Button size="small" onClick={() => openEdit(row)}>编辑</Button>
                <Button size="small" onClick={() => void showAudit(row)}>日志</Button>
                <Popconfirm
                  title="确认删除该 Token？"
                  description="删除后不可恢复，使用该 Token 的客户端将立即失效。"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => void handleDelete(row.id)}
                >
                  <Button size="small" danger>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <div style={{ background: '#f5f6f7', borderRadius: 8, padding: 16, fontSize: 13, color: '#646a73' }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Cursor 配置示例</div>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{`{
  "mcpServers": {
    "lingyi-doc": {
      "url": "http://localhost:3000/api/v1/mcp",
      "headers": {
        "Authorization": "Bearer <你的 mcp_token>"
      }
    }
  }
}`}</pre>
      </div>

      <Modal
        title={editingToken ? '编辑 MCP Token' : '创建 MCP Token'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => void handleSave()}
        confirmLoading={saving}
        okText={editingToken ? '保存' : '创建'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ marginBottom: 6 }}>名称</div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：Cursor 本地开发"
              maxLength={100}
            />
          </div>
          <div>
            <div style={{ marginBottom: 6 }}>权限套餐</div>
            <Select
              style={{ width: '100%' }}
              value={preset}
              options={PRESET_OPTIONS}
              onChange={setPreset}
            />
          </div>
          {editingToken && (
            <p style={{ margin: 0, color: '#8f959e', fontSize: 12 }}>
              修改权限即时生效；明文 Token 无法再次查看，无需重新生成。
            </p>
          )}
        </div>
      </Modal>

      <Modal
        title={`调用日志 - ${auditTokenName}`}
        open={auditOpen}
        footer={null}
        onCancel={() => setAuditOpen(false)}
        width={720}
      >
        <Table
          size="small"
          loading={auditLoading}
          rowKey="id"
          dataSource={auditRows}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: '时间', dataIndex: 'createdAt', render: (v: string) => formatTime(v) },
            { title: 'Tool', dataIndex: 'toolName' },
            {
              title: '状态',
              dataIndex: 'status',
              render: (v: string) => (
                <Tag color={v === 'success' ? 'green' : 'red'}>{v}</Tag>
              ),
            },
            { title: '延迟', dataIndex: 'latencyMs', render: (v: number) => `${v} ms` },
          ]}
        />
      </Modal>

      <Modal
        title="请保存 Token"
        open={!!plainToken}
        onCancel={() => setPlainToken(null)}
        footer={<Button type="primary" onClick={() => setPlainToken(null)}>我已保存</Button>}
      >
        <p style={{ color: '#ff4d4f' }}>明文 Token 仅显示一次，关闭后无法再次查看。</p>
        <Input.TextArea rows={3} value={plainToken ?? ''} readOnly />
      </Modal>
    </div>
  );
};
