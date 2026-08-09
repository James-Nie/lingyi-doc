import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Col, Input, Row, Segmented, Statistic, Table, Tag } from 'antd';
import {
  fetchAiDailyUsage,
  fetchAiRecentUsage,
  fetchAiUsageByAgent,
  fetchAiUsageByModel,
  fetchAiUsageSummary,
  type AiUsageByAgentItem,
  type AiUsageByModelItem,
  type AiUsageDailyItem,
  type AiUsageRecentItem,
  type AiUsageSummary,
  type AiUsageTrendPeriod,
} from '../../api/ai';
import { AiUsageTrendChart } from '../../components/AiUsageTrendChart';

const TREND_PERIOD_OPTIONS: Array<{ label: string; value: AiUsageTrendPeriod }> = [
  { label: '按日', value: 'day' },
  { label: '按周', value: 'week' },
  { label: '按月', value: 'month' },
];

const TREND_PERIOD_HINT: Record<AiUsageTrendPeriod, string> = {
  day: '今日 24 小时',
  week: '近 7 日（按天）',
  month: '近 30 日（按天）',
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { hour12: false });
}

function parseTrendItem(item: AiUsageDailyItem) {
  return {
    period: item.period,
    label: item.label,
    tokens: parseInt(item.tokens || '0', 10),
    requests: parseInt(item.requests || '0', 10),
    errors: parseInt(item.errors || '0', 10),
    avgLatency: parseFloat(item.avgLatency || '0'),
  };
}

export const AiUsageMonitorPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [trendLoading, setTrendLoading] = useState(false);
  const [summary, setSummary] = useState<AiUsageSummary | null>(null);
  const [trend, setTrend] = useState<AiUsageDailyItem[]>([]);
  const [trendPeriod, setTrendPeriod] = useState<AiUsageTrendPeriod>('day');
  const [byModel, setByModel] = useState<AiUsageByModelItem[]>([]);
  const [byAgent, setByAgent] = useState<AiUsageByAgentItem[]>([]);
  const [recent, setRecent] = useState<AiUsageRecentItem[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [model, setModel] = useState('');

  const filter = useMemo(() => ({
    tenantId: tenantId.trim() || undefined,
    model: model.trim() || undefined,
  }), [tenantId, model]);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const [s, m, a, r] = await Promise.all([
        fetchAiUsageSummary(filter),
        fetchAiUsageByModel(filter),
        fetchAiUsageByAgent(filter),
        fetchAiRecentUsage(30, filter),
      ]);
      setSummary(s);
      setByModel(m);
      setByAgent(a);
      setRecent(r);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const loadTrend = useCallback(async () => {
    setTrendLoading(true);
    try {
      const data = await fetchAiDailyUsage(filter, trendPeriod);
      setTrend(data);
    } catch {
      setTrend([]);
    } finally {
      setTrendLoading(false);
    }
  }, [filter, trendPeriod]);

  useEffect(() => { void loadOverview(); }, [loadOverview]);
  useEffect(() => { void loadTrend(); }, [loadTrend]);

  const trendPoints = useMemo(() => trend.map(parseTrendItem), [trend]);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>AI Token 监控</h2>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <div style={{ marginBottom: 4, color: '#8c8c8c', fontSize: 12 }}>租户 ID（可选）</div>
            <Input
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="筛选指定租户"
              allowClear
            />
          </Col>
          <Col span={8}>
            <div style={{ marginBottom: 4, color: '#8c8c8c', fontSize: 12 }}>模型（可选）</div>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="筛选指定模型"
              allowClear
            />
          </Col>
        </Row>
      </Card>

      {!loading && !summary ? (
        <Card>
          <p style={{ color: '#8f959e', margin: 0 }}>暂无 AI 用量数据，或 AI 模块未启用。</p>
        </Card>
      ) : (
        <>
          <Card title="全平台用量概览" loading={loading} style={{ marginBottom: 16 }}>
            <Row gutter={[16, 16]}>
              <Col span={4}>
                <Statistic title="今日请求" value={summary?.todayRequests ?? 0} />
              </Col>
              <Col span={4}>
                <Statistic title="今日 Token" value={formatTokens(summary?.todayTokens ?? 0)} />
              </Col>
              <Col span={4}>
                <Statistic title="累计请求" value={summary?.totalRequests ?? 0} />
              </Col>
              <Col span={4}>
                <Statistic title="累计 Token" value={formatTokens(summary?.totalTokens ?? 0)} />
              </Col>
              <Col span={4}>
                <Statistic title="平均延迟" value={summary?.avgLatencyMs ?? 0} suffix="ms" />
              </Col>
              <Col span={4}>
                <Statistic
                  title="错误率"
                  value={((summary?.errorRate ?? 0) * 100).toFixed(1)}
                  suffix="%"
                />
              </Col>
            </Row>
          </Card>

          <Card
            title="用量趋势"
            style={{ marginBottom: 16 }}
            extra={(
              <Segmented
                options={TREND_PERIOD_OPTIONS}
                value={trendPeriod}
                onChange={(v) => setTrendPeriod(v as AiUsageTrendPeriod)}
              />
            )}
          >
            <div style={{ marginBottom: 12, color: '#8c8c8c', fontSize: 12 }}>
              {TREND_PERIOD_HINT[trendPeriod]} · 鼠标悬停查看详情
            </div>
            <AiUsageTrendChart
              data={trendPoints}
              loading={trendLoading}
            />
          </Card>

          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col span={12}>
              <Card title="按模型统计" loading={loading}>
                <Table
                  size="small"
                  pagination={false}
                  rowKey="model"
                  dataSource={byModel}
                  columns={[
                    { title: '模型', dataIndex: 'model', ellipsis: true },
                    { title: '请求', dataIndex: 'requests', width: 72 },
                    {
                      title: 'Token',
                      dataIndex: 'tokens',
                      width: 88,
                      render: (v: string) => formatTokens(parseInt(v || '0', 10)),
                    },
                    {
                      title: '延迟',
                      dataIndex: 'avgLatency',
                      width: 80,
                      render: (v: string) => `${Math.round(parseFloat(v || '0'))} ms`,
                    },
                  ]}
                  scroll={{ x: 360 }}
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card title="按智能体统计" loading={loading}>
                <Table
                  size="small"
                  pagination={false}
                  rowKey={(row) => row.agentId ?? '__none__'}
                  dataSource={byAgent}
                  columns={[
                    {
                      title: '智能体 ID',
                      dataIndex: 'agentId',
                      ellipsis: true,
                      render: (v: string | null) => v ?? <Tag>未关联</Tag>,
                    },
                    { title: '请求', dataIndex: 'requests', width: 72 },
                    {
                      title: 'Token',
                      dataIndex: 'tokens',
                      width: 88,
                      render: (v: string) => formatTokens(parseInt(v || '0', 10)),
                    },
                  ]}
                  scroll={{ x: 360 }}
                />
              </Card>
            </Col>
          </Row>

          <Card title="最近调用" loading={loading}>
            <Table
              size="small"
              pagination={{ pageSize: 15 }}
              rowKey="id"
              dataSource={recent}
              columns={[
                {
                  title: '时间',
                  dataIndex: 'createdAt',
                  width: 160,
                  render: (v: string) => formatTime(v),
                },
                { title: '模型', dataIndex: 'model', ellipsis: true },
                { title: '来源', dataIndex: 'source', width: 72 },
                {
                  title: '用户',
                  dataIndex: 'userId',
                  width: 100,
                  ellipsis: true,
                  render: (v: string | null) => v?.slice(0, 8) ?? '—',
                },
                {
                  title: 'Token',
                  dataIndex: 'totalTokens',
                  width: 80,
                  render: (v: number) => formatTokens(v),
                },
                {
                  title: '延迟',
                  dataIndex: 'latency',
                  width: 72,
                  render: (v: number) => `${v} ms`,
                },
                {
                  title: '状态',
                  dataIndex: 'status',
                  width: 72,
                  render: (v: string) => (
                    <Tag color={v === 'success' ? 'green' : 'red'}>
                      {v === 'success' ? '成功' : '失败'}
                    </Tag>
                  ),
                },
              ]}
              scroll={{ x: 800 }}
            />
          </Card>
        </>
      )}
    </div>
  );
};
