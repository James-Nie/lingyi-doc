import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
  DeleteOutlined,
  ExportOutlined,
  InboxOutlined,
  ReloadOutlined,
  SwapOutlined,
  UndoOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { authStore } from '../../stores/authStore';
import {
  documentApi,
  type AdminDocumentDetail,
  type AdminDocumentItem,
  type AdminDocumentStats,
  type DocumentListQuery,
} from '../../api/adminConsole';
import { DOC_TYPE_LABELS, docTypeLabel, formatDateTime } from '../../utils/format';
import { TransferOwnerModal } from './components/TransferOwnerModal';

const { Search } = Input;

type TabKey = 'active' | 'archived' | 'trash';

const TAB_LABEL: Record<TabKey, string> = {
  active: '文档治理',
  archived: '已归档',
  trash: '回收站',
};

/** 从当前筛选条件派生查询参数；回收站/归档用 deleted/archived 区分 */
function buildQuery(tab: TabKey, filters: Filters, page: number, pageSize: number): DocumentListQuery {
  return {
    keyword: filters.keyword || undefined,
    docType: filters.docType || undefined,
    scope: filters.scope,
    deleted: tab === 'trash' ? 'true' : 'false',
    archived: tab === 'archived' ? 'true' : tab === 'active' ? 'false' : undefined,
    startDate: filters.range?.[0] ? `${filters.range[0]}T00:00:00` : undefined,
    endDate: filters.range?.[1] ? `${filters.range[1]}T23:59:59` : undefined,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    page,
    pageSize,
  };
}

interface Filters {
  keyword?: string;
  docType?: string;
  scope?: number;
  range?: [string, string] | null;
  sortBy?: DocumentListQuery['sortBy'];
  sortOrder?: DocumentListQuery['sortOrder'];
}

const scopeTag = (scope: number) =>
  scope === 2 ? <Tag color="blue">企业</Tag> : <Tag>个人</Tag>;

export const DocumentsPage: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('active');
  const [filters, setFilters] = useState<Filters>({ sortBy: 'created_at', sortOrder: 'DESC' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [items, setItems] = useState<AdminDocumentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<AdminDocumentStats | null>(null);
  const [scopeType, setScopeType] = useState<string>('all');
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);

  const [detail, setDetail] = useState<AdminDocumentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferIds, setTransferIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const canWrite = authStore.hasPermission('document:write');
  const canPurge = authStore.hasPermission('document:purge');
  const canExport = authStore.hasPermission('document:export');

  const loadStats = useCallback(async () => {
    try {
      setStats(await documentApi.stats());
    } catch (err) {
      message.error(err instanceof Error ? err.message : '统计加载失败');
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await documentApi.list(buildQuery(tab, filters, page, pageSize));
      setItems(res.items);
      setTotal(res.total);
      setScopeType(res.scopeType ?? 'all');
      setSelectedKeys([]);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '列表加载失败');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [tab, filters, page, pageSize]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const refreshAll = () => {
    void loadStats();
    void loadList();
  };

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      setDetail(await documentApi.detail(id));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleTransferConfirm = async (targetOwnerId: string) => {
    setBusy(true);
    try {
      const res = await documentApi.transfer(transferIds, targetOwnerId);
      message.success(`已转移 ${res.affected} 个文档${res.rejected.length ? `，${res.rejected.length} 个不在管理范围内被跳过` : ''}`);
      setTransferOpen(false);
      refreshAll();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '转移失败');
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = (archived: boolean) => {
    const ids = selectedKeys.map(String);
    Modal.confirm({
      title: archived ? '确认归档' : '确认取消归档',
      content: archived
        ? `将归档 ${ids.length} 个文档。归档后文档会移出文档治理默认列表，内容与协作关系不受影响。`
        : `将取消归档 ${ids.length} 个文档，它们会回到文档治理列表。`,
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await documentApi.archive(ids, archived);
          message.success(`已处理 ${res.affected} 个文档`);
          refreshAll();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '操作失败');
        }
      },
    });
  };

  const handleDelete = () => {
    const ids = selectedKeys.map(String);
    Modal.confirm({
      title: '确认删除',
      content: `将 ${ids.length} 个文档移入回收站（软删除，可在回收站恢复）。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await documentApi.remove(ids);
          message.success(`已删除 ${res.affected} 个文档`);
          refreshAll();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  };

  const handleRestore = async () => {
    const ids = selectedKeys.map(String);
    try {
      const res = await documentApi.restore(ids);
      message.success(`已恢复 ${res.affected} 个文档`);
      refreshAll();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '恢复失败');
    }
  };

  /** 彻底删除：双重确认（等保场景下不可逆操作必须二次确认 + 文案说明后果） */
  const handlePurge = () => {
    const ids = selectedKeys.map(String);
    Modal.confirm({
      title: '⚠️ 彻底删除文档',
      content: (
        <div>
          <p>将 <b>永久删除</b> {ids.length} 个文档，此操作<b>不可恢复</b>，会连带清除文档内容、快照、协作记录、分享记录与 AI 索引。</p>
          <p>仅回收站中的文档可被彻底删除。</p>
        </div>
      ),
      okText: '我确认彻底删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await documentApi.purge(ids);
          message.success(`已彻底删除 ${res.purged} 个文档${res.skipped.length ? `，${res.skipped.length} 个未在回收站被跳过` : ''}`);
          refreshAll();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '彻底删除失败');
        }
      },
    });
  };

  const exportCsv = async () => {
    try {
      const raw = authStore.getAccessToken();
      const url = documentApi.exportUrl(buildQuery(tab, filters, 1, 10000));
      const res = await fetch(url, { headers: raw ? { Authorization: `Bearer ${raw}` } : {} });
      if (!res.ok) throw new Error('导出失败');
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `documents-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      message.success('导出已开始');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '导出失败');
    }
  };

  const columns: TableColumnsType<AdminDocumentItem> = useMemo(() => [
    {
      title: '文档',
      dataIndex: 'title',
      ellipsis: true,
      render: (title: string, record) => (
        <Space direction="vertical" size={0}>
          <a onClick={() => void openDetail(record.id)}>{title || '(无标题)'}</a>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{record.id}</span>
        </Space>
      ),
    },
    { title: '类型', dataIndex: 'docType', width: 100, render: (v: string) => docTypeLabel(v) },
    { title: '范围', dataIndex: 'scope', width: 80, render: (v: number) => scopeTag(v) },
    {
      title: '所有者',
      dataIndex: 'ownerName',
      width: 140,
      ellipsis: true,
      render: (name: string | null, record) => (
        <Space size={4}>
          <UserOutlined style={{ color: '#8c8c8c' }} />
          <span>{name ?? '—'}</span>
          {record.orgName && <Tag>{record.orgName}</Tag>}
        </Space>
      ),
    },
    {
      title: '活跃分享',
      dataIndex: 'activeShareCount',
      width: 90,
      align: 'center',
      render: (n: number) => (n > 0 ? <Tag color="orange">{n}</Tag> : '—'),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 170,
      sorter: true,
      render: (v: number | null) => formatDateTime(v),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 170,
      render: (v: number | null) => formatDateTime(v),
    },
    ...(tab === 'archived'
      ? [{
          title: '归档时间',
          dataIndex: 'archivedAt',
          width: 170,
          render: (v: number | null) => formatDateTime(v),
        }]
      : []),
    ...(tab === 'trash'
      ? [{
          title: '删除时间',
          dataIndex: 'deletedAt',
          width: 170,
          render: (v: number | null) => formatDateTime(v),
        }]
      : []),
    {
      title: '操作',
      width: 90,
      fixed: 'right',
      render: (_: unknown, record) => (
        <Button type="link" size="small" onClick={() => void openDetail(record.id)}>
          详情
        </Button>
      ),
    },
  ], [tab]);

  const selectedCount = selectedKeys.length;

  return (
    <div>
      {scopeType === 'orgs' && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="你的管理范围为「按部门」"
          description="列表只展示管理范围内部门的文档；个人文档（不属于任何部门）不在可见范围。这是按最小权限原则设计的。"
        />
      )}

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={4}><Statistic title="文档总数" value={stats?.total ?? 0} loading={!stats} /></Col>
          <Col span={4}><Statistic title="企业文档" value={stats?.teamDocuments ?? 0} loading={!stats} /></Col>
          <Col span={4}><Statistic title="个人文档" value={stats?.personalDocuments ?? 0} loading={!stats} /></Col>
          <Col span={4}><Statistic title="已归档" value={stats?.archived ?? 0} loading={!stats} /></Col>
          <Col span={4}><Statistic title="回收站" value={stats?.trashed ?? 0} loading={!stats} /></Col>
          <Col span={4}><Statistic title="活跃分享" value={stats?.activeShares ?? 0} loading={!stats} /></Col>
        </Row>
      </Card>

      <Card
        tabList={[
          { key: 'active', tab: TAB_LABEL.active },
          { key: 'archived', tab: TAB_LABEL.archived },
          { key: 'trash', tab: `${TAB_LABEL.trash}${stats?.trashed ? ` (${stats.trashed})` : ''}` },
        ]}
        activeTabKey={tab}
        onTabChange={(key) => {
          setTab(key as TabKey);
          setPage(1);
          setSelectedKeys([]);
        }}
      >
        <Space wrap style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
          <Space wrap>
            <Search
              allowClear
              placeholder="搜索标题 / 文档ID / 所有者"
              style={{ width: 260 }}
              onSearch={(value) => {
                setFilters((f) => ({ ...f, keyword: value.trim() || undefined }));
                setPage(1);
              }}
            />
            <Select
              allowClear
              placeholder="文档类型"
              style={{ width: 140 }}
              value={filters.docType}
              onChange={(value) => {
                setFilters((f) => ({ ...f, docType: value }));
                setPage(1);
              }}
              options={Object.entries(DOC_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
            />
            <Select
              allowClear
              placeholder="归属范围"
              style={{ width: 130 }}
              value={filters.scope}
              onChange={(value) => {
                setFilters((f) => ({ ...f, scope: value }));
                setPage(1);
              }}
              options={[
                { value: 1, label: '个人' },
                { value: 2, label: '企业' },
              ]}
            />
            <Select
              style={{ width: 170 }}
              value={`${filters.sortBy}:${filters.sortOrder}`}
              onChange={(value) => {
                const [sortBy, sortOrder] = value.split(':');
                setFilters((f) => ({
                  ...f,
                  sortBy: sortBy as DocumentListQuery['sortBy'],
                  sortOrder: sortOrder as DocumentListQuery['sortOrder'],
                }));
              }}
              options={[
                { value: 'created_at:DESC', label: '按创建时间倒序' },
                { value: 'created_at:ASC', label: '按创建时间正序' },
                { value: 'updated_at:DESC', label: '按更新时间倒序' },
                { value: 'title:ASC', label: '按标题排序' },
                { value: 'last_visited_at:DESC', label: '按最近访问倒序' },
              ]}
            />
          </Space>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={refreshAll}>刷新</Button>
            {canExport && <Button icon={<ExportOutlined />} onClick={() => void exportCsv()}>导出 CSV</Button>}
          </Space>
        </Space>

        {selectedCount > 0 && (
          <Alert
            style={{ marginBottom: 12 }}
            type="info"
            showIcon
            message={
              <Space wrap>
                <span>已选 {selectedCount} 项</span>
                {canWrite && tab !== 'trash' && (
                  <>
                    <Button
                      size="small"
                      icon={<SwapOutlined />}
                      onClick={() => {
                        setTransferIds(selectedKeys.map(String));
                        setTransferOpen(true);
                      }}
                    >
                      转移所有权
                    </Button>
                    <Button
                      size="small"
                      icon={<InboxOutlined />}
                      onClick={() => handleArchive(tab === 'active')}
                    >
                      {tab === 'active' ? '归档' : '取消归档'}
                    </Button>
                    <Button size="small" danger icon={<DeleteOutlined />} onClick={handleDelete}>
                      移入回收站
                    </Button>
                  </>
                )}
                {canWrite && tab === 'trash' && (
                  <>
                    <Button size="small" icon={<UndoOutlined />} onClick={() => void handleRestore()}>
                      恢复
                    </Button>
                    {canPurge && (
                      <Tooltip title="不可恢复，需 document:purge 权限">
                        <Button size="small" danger icon={<DeleteOutlined />} onClick={handlePurge}>
                          彻底删除
                        </Button>
                      </Tooltip>
                    )}
                  </>
                )}
              </Space>
            }
          />
        )}

        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          dataSource={items}
          columns={columns}
          rowSelection={
            canWrite
              ? { selectedRowKeys: selectedKeys, onChange: setSelectedKeys }
              : undefined
          }
          locale={{ emptyText: <Empty description={tab === 'trash' ? '回收站为空' : '暂无文档'} /> }}
          scroll={{ x: 1300 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      </Card>

      <Drawer
        title={detail ? `文档详情 · ${detail.title || '(无标题)'}` : '文档详情'}
        width={560}
        open={!!detail || detailLoading}
        onClose={() => setDetail(null)}
        loading={detailLoading}
      >
        {detail && (
          <>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="文档 ID">{detail.id}</Descriptions.Item>
              <Descriptions.Item label="类型">{docTypeLabel(detail.docType)}</Descriptions.Item>
              <Descriptions.Item label="归属范围">{scopeTag(detail.scope)}</Descriptions.Item>
              <Descriptions.Item label="所有者">{detail.ownerName ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="租户">{detail.tenantName ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="部门">{detail.orgName ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="当前版本">v{detail.currentVersion}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{formatDateTime(detail.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{formatDateTime(detail.updatedAt)}</Descriptions.Item>
              <Descriptions.Item label="最近访问">{formatDateTime(detail.lastVisitedAt)}</Descriptions.Item>
              <Descriptions.Item label="归档时间">{formatDateTime(detail.archivedAt)}</Descriptions.Item>
              <Descriptions.Item label="协作者数">{detail.collaboratorCount}</Descriptions.Item>
              <Descriptions.Item label="访问次数">{detail.visitCount}</Descriptions.Item>
              <Descriptions.Item label="状态">
                {detail.isDeleted ? <Tag color="red">回收站中</Tag> : <Tag color="green">正常</Tag>}
              </Descriptions.Item>
            </Descriptions>
            <div style={{ marginTop: 16 }}>
              <b>外链分享</b>
              {detail.share ? (
                <Descriptions column={1} size="small" bordered style={{ marginTop: 8 }}>
                  <Descriptions.Item label="状态">
                    {detail.share.status ? <Tag color="green">已开启</Tag> : <Tag>已关闭</Tag>}
                  </Descriptions.Item>
                  <Descriptions.Item label="权限">{detail.share.permissionLevel}</Descriptions.Item>
                  <Descriptions.Item label="有效期">{formatDateTime(detail.share.expireTime)}</Descriptions.Item>
                  <Descriptions.Item label="访问口令">{detail.share.hasPassword ? '已设置' : '未设置'}</Descriptions.Item>
                  <Descriptions.Item label="下载 / 复制 / 打印">
                    {[detail.share.allowDownload ? '下载' : null, detail.share.allowCopy ? '复制' : null, detail.share.allowPrint ? '打印' : null]
                      .filter(Boolean)
                      .join('、') || '全部禁止'}
                  </Descriptions.Item>
                  <Descriptions.Item label="水印">{detail.share.watermarkEnabled ? '已开启' : '未开启'}</Descriptions.Item>
                </Descriptions>
              ) : (
                <p style={{ color: '#8c8c8c', marginTop: 8 }}>该文档未创建外链分享</p>
              )}
            </div>
          </>
        )}
      </Drawer>

      <TransferOwnerModal
        open={transferOpen}
        docCount={transferIds.length}
        loading={busy}
        onCancel={() => setTransferOpen(false)}
        onConfirm={handleTransferConfirm}
      />
    </div>
  );
};

export default DocumentsPage;
