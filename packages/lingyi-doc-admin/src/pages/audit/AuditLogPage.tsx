import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
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
  Typography,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { ExportOutlined, FilterOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { authStore } from '../../stores/authStore';
import {
  auditApi,
  type AuditFacets,
  type AuditListQuery,
  type AuditLogDetail,
  type AuditLogItem,
  type AuditRetention,
} from '../../api/adminConsole';
import { formatDateTime } from '../../utils/format';

const { RangePicker } = DatePicker;

const PAGE_SIZE_DEFAULT = 20;

/**
 * 审计日志（P0-7 / 等保三级 8.1.4.3）。
 *
 * 修复评审缺陷 F8（页面零筛选）：补齐时间区间、模块、事件、结果、操作人、
 * 关键字六类筛选，并提供详情抽屉与保留策略管理。
 */
export const AuditLogPage: React.FC = () => {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [loading, setLoading] = useState(false);

  const [facets, setFacets] = useState<AuditFacets | null>(null);
  const [retention, setRetention] = useState<AuditRetention | null>(null);

  const [moduleFilter, setModuleFilter] = useState<string | undefined>();
  const [actionFilter, setActionFilter] = useState<string | undefined>();
  const [resultFilter, setResultFilter] = useState<string | undefined>();
  const [operatorFilter, setOperatorFilter] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);

  const [detail, setDetail] = useState<AuditLogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [retentionOpen, setRetentionOpen] = useState(false);
  const [retentionInput, setRetentionInput] = useState<number>(180);
  const [retentionSaving, setRetentionSaving] = useState(false);

  const canRead = authStore.hasPermission('audit:read');
  const canExport = authStore.hasPermission('audit:read');
  const canManage = authStore.hasPermission('audit:manage');

  const buildQuery = useCallback((p = page, ps = pageSize): AuditListQuery => ({
    module: moduleFilter,
    action: actionFilter,
    result: resultFilter,
    operatorId: operatorFilter,
    keyword: keyword || undefined,
    startDate: range?.[0] ? range[0].startOf('day').toISOString() : undefined,
    endDate: range?.[1] ? range[1].endOf('day').toISOString() : undefined,
    sortOrder: 'DESC',
    page: p,
    pageSize: ps,
  }), [moduleFilter, actionFilter, resultFilter, operatorFilter, keyword, range, page, pageSize]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await auditApi.list(buildQuery());
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载失败');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void (async () => {
      try {
        setFacets(await auditApi.facets(90));
      } catch { /* 筛选项失败不阻塞列表 */ }
      try {
        setRetention(await auditApi.retention());
      } catch { /* 无 config:read 时静默 */ }
    })();
  }, []);

  const resetFilters = () => {
    setModuleFilter(undefined);
    setActionFilter(undefined);
    setResultFilter(undefined);
    setOperatorFilter(undefined);
    setKeyword('');
    setRange(null);
    setPage(1);
  };

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      setDetail(await auditApi.detail(id));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const exportCsv = async () => {
    try {
      const query = buildQuery(1, 10000);
      const raw = authStore.getAccessToken();
      const url = auditApi.exportUrl(query);
      const res = await fetch(url, { headers: raw ? { Authorization: `Bearer ${raw}` } : {} });
      if (!res.ok) throw new Error('导出失败');
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      message.success('导出已开始（同时写入审计）');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '导出失败');
    }
  };

  const saveRetention = async () => {
    setRetentionSaving(true);
    try {
      await auditApi.updateRetention(retentionInput);
      message.success('保留策略已更新');
      setRetention(await auditApi.retention());
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新失败');
    } finally {
      setRetentionSaving(false);
    }
  };

  const runCleanup = () => {
    Modal.confirm({
      title: '按保留策略清理过期审计日志',
      content: `将删除 ${retentionInput} 天之前的审计记录。清理动作本身会写入一条审计日志，且保留天数不得低于 ${retention?.minDays ?? 180} 天。`,
      okText: '执行清理',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await auditApi.cleanup(retentionInput);
          message.success(`已清理 ${res.deleted ?? 0} 条（清理前共 ${res.beforeTotal ?? '—'} 条）`);
          setRetention(await auditApi.retention());
          void loadList();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '清理失败');
        }
      },
    });
  };

  const columns: TableColumnsType<AuditLogItem> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (v: number) => formatDateTime(v),
    },
    {
      title: '事件',
      dataIndex: 'actionLabel',
      ellipsis: true,
      render: (label: string, record) => (
        <Space direction="vertical" size={0}>
          <span>{label}</span>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{record.action}</span>
        </Space>
      ),
    },
    {
      title: '模块',
      dataIndex: 'module',
      width: 110,
      render: (m: string | null) => {
        const hit = facets?.modules.find((x) => x.value === m);
        return <Tag>{hit?.label ?? m ?? '—'}</Tag>;
      },
    },
    {
      title: '结果',
      dataIndex: 'result',
      width: 80,
      render: (r: string) => (r === 'failure' ? <Tag color="red">失败</Tag> : <Tag color="green">成功</Tag>),
    },
    {
      title: '操作人',
      dataIndex: 'operatorName',
      width: 130,
      ellipsis: true,
      render: (name: string | null, record) => name ?? record.operatorId,
    },
    {
      title: '目标',
      dataIndex: 'targetId',
      ellipsis: true,
      render: (id: string | null, record) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{record.targetType ?? '—'}</span>
          <span>{id ?? '—'}</span>
        </Space>
      ),
    },
    { title: 'IP', dataIndex: 'ip', width: 130, render: (v: string | null) => v ?? '—' },
    {
      title: '操作',
      width: 80,
      fixed: 'right',
      render: (_: unknown, record) => (
        <Button type="link" size="small" onClick={() => void openDetail(record.id)}>详情</Button>
      ),
    },
  ];

  if (!canRead) {
    return <Empty description="你没有查看审计日志的权限（audit:read）" />;
  }

  return (
    <div>
      {retention && (
        <Card style={{ marginBottom: 16 }}>
          <Row gutter={16} align="middle">
            <Col span={4}>
              <Statistic title="审计记录总量" value={retention.total} />
            </Col>
            <Col span={5}>
              <Statistic title="最早记录" value={retention.earliestCreatedAt ? formatDateTime(retention.earliestCreatedAt) : '—'} />
            </Col>
            <Col span={4}>
              <Statistic title="保留天数" value={retention.retentionDays} suffix="天" />
            </Col>
            <Col span={4}>
              <Statistic title="超出保留期" value={retention.expiredCount} />
            </Col>
            <Col span={7} style={{ textAlign: 'right' }}>
              {canManage && (
                <Space>
                  <Button
                    icon={<SettingOutlined />}
                    onClick={() => {
                      setRetentionInput(retention.retentionDays);
                      setRetentionOpen(true);
                    }}
                  >
                    保留策略
                  </Button>
                  <Button danger onClick={runCleanup}>按策略清理</Button>
                </Space>
              )}
            </Col>
          </Row>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
            {retention.complianceNote}
            {retention.lastCleanupAt ? ` · 上次清理：${formatDateTime(retention.lastCleanupAt)}` : ''}
          </Typography.Text>
        </Card>
      )}

      <Card
        title={
          <Space>
            <FilterOutlined />
            <span>审计日志</span>
          </Space>
        }
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void loadList()}>刷新</Button>
            <Button type="link" onClick={resetFilters}>重置筛选</Button>
            {canExport && (
              <Button icon={<ExportOutlined />} onClick={() => void exportCsv()}>导出 CSV</Button>
            )}
          </Space>
        }
      >
        <Space wrap style={{ marginBottom: 16 }}>
          <RangePicker
            value={range}
            onChange={(v) => {
              setRange(v && v[0] && v[1] ? [v[0], v[1]] : null);
              setPage(1);
            }}
            allowClear
          />
          <Select
            allowClear
            placeholder="模块"
            style={{ width: 140 }}
            value={moduleFilter}
            onChange={(v) => {
              setModuleFilter(v);
              setActionFilter(undefined);
              setPage(1);
            }}
            options={facets?.modules ?? []}
          />
          <Select
            allowClear
            showSearch
            placeholder="事件类型"
            style={{ width: 200 }}
            value={actionFilter}
            onChange={(v) => {
              setActionFilter(v);
              setPage(1);
            }}
            optionFilterProp="label"
            options={(facets?.actions ?? [])
              .filter((a) => !moduleFilter || a.module === moduleFilter)
              .map((a) => ({ value: a.value, label: `${a.label}（${a.count}）` }))}
          />
          <Select
            allowClear
            placeholder="结果"
            style={{ width: 100 }}
            value={resultFilter}
            onChange={(v) => {
              setResultFilter(v);
              setPage(1);
            }}
            options={facets?.results ?? []}
          />
          <Select
            allowClear
            showSearch
            placeholder="操作人"
            style={{ width: 160 }}
            value={operatorFilter}
            onChange={(v) => {
              setOperatorFilter(v);
              setPage(1);
            }}
            optionFilterProp="label"
            options={(facets?.operators ?? []).map((o) => ({
              value: o.userId,
              label: `${o.displayName ?? o.userId.slice(0, 8)}（${o.count}）`,
            }))}
          />
          <Input.Search
            allowClear
            placeholder="搜索目标 ID / 事件码"
            style={{ width: 220 }}
            onSearch={(v) => {
              setKeyword(v.trim());
              setPage(1);
            }}
          />
        </Space>

        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          dataSource={items}
          columns={columns}
          locale={{ emptyText: <Empty description="没有符合条件的审计记录" /> }}
          scroll={{ x: 1200 }}
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
        title="审计详情"
        width={520}
        open={!!detail || detailLoading}
        onClose={() => setDetail(null)}
        loading={detailLoading}
      >
        {detail && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="日志 ID">{detail.id}</Descriptions.Item>
            <Descriptions.Item label="时间">{formatDateTime(detail.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="事件码">{detail.action}</Descriptions.Item>
            <Descriptions.Item label="事件名称">{detail.actionLabel}</Descriptions.Item>
            <Descriptions.Item label="模块">
              {detail.moduleLabel ?? detail.module ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="结果">
              {detail.result === 'failure' ? <Tag color="red">失败</Tag> : <Tag color="green">成功</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="操作人">
              {detail.operatorName ?? '—'}
              <br />
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>{detail.operatorId}</span>
            </Descriptions.Item>
            <Descriptions.Item label="目标类型">{detail.targetType ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="目标 ID">{detail.targetId ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="IP">{detail.ip ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="User-Agent">
              <span style={{ wordBreak: 'break-all', fontSize: 12 }}>{detail.userAgent ?? '—'}</span>
            </Descriptions.Item>
          </Descriptions>
        )}
        {detail && (
          <div style={{ marginTop: 16 }}>
            <b>变更详情</b>
            <pre
              style={{
                marginTop: 8,
                padding: 12,
                background: '#fafafa',
                borderRadius: 6,
                fontSize: 12,
                maxHeight: 320,
                overflow: 'auto',
              }}
            >
              {JSON.stringify(detail.detail ?? null, null, 2)}
            </pre>
          </div>
        )}
      </Drawer>

      <Modal
        title="审计日志保留策略"
        open={retentionOpen}
        onCancel={() => setRetentionOpen(false)}
        onOk={() => void saveRetention()}
        confirmLoading={retentionSaving}
        okText="保存"
      >
        <p style={{ color: '#595959' }}>
          保留天数下限为 {retention?.minDays ?? 180} 天（等保三级 + 网络安全法第 21 条要求日志留存不少于 6 个月）。
          上限 {retention?.maxDays ?? 3650} 天。
        </p>
        <Input
          type="number"
          min={retention?.minDays ?? 180}
          max={retention?.maxDays ?? 3650}
          value={retentionInput}
          onChange={(e) => setRetentionInput(Number(e.target.value))}
          addonAfter="天"
        />
      </Modal>
    </div>
  );
};

export default AuditLogPage;
