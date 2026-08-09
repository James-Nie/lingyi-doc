import React, { useEffect, useState } from 'react';
import { Card, Statistic, Table, Tag } from 'antd';
import {
  fetchAiDailyUsage,
  fetchAiRecentUsage,
  fetchAiUsageSummary,
  type AiUsageDailyItem,
  type AiUsageRecentItem,
  type AiUsageSummary,
} from '../../api/ai';
import { formatCreatedAt } from '../../utils/formatDate';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export const AccountAiUsageSection: React.FC = () => {
  const [summary, setSummary] = useState<AiUsageSummary | null>(null);
  const [daily, setDaily] = useState<AiUsageDailyItem[]>([]);
  const [recent, setRecent] = useState<AiUsageRecentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [s, d, r] = await Promise.all([
          fetchAiUsageSummary(),
          fetchAiDailyUsage(),
          fetchAiRecentUsage(15),
        ]);
        setSummary(s);
        setDaily(d);
        setRecent(r);
      } catch {
        // AI 模块未启用或无数据
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (!loading && !summary) {
    return (
      <Card bordered={false}>
        <p style={{ color: '#8f959e', margin: 0 }}>暂无 AI 用量数据，或 AI 模块未启用。</p>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="用量概览" bordered={false} loading={loading}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
          <Statistic title="今日请求" value={summary?.todayRequests ?? 0} />
          <Statistic title="今日 Token" value={formatTokens(summary?.todayTokens ?? 0)} />
          <Statistic title="累计请求" value={summary?.totalRequests ?? 0} />
          <Statistic title="累计 Token" value={formatTokens(summary?.totalTokens ?? 0)} />
          <Statistic title="平均延迟" value={summary?.avgLatencyMs ?? 0} suffix="ms" />
          <Statistic
            title="错误率"
            value={((summary?.errorRate ?? 0) * 100).toFixed(1)}
            suffix="%"
          />
        </div>
      </Card>

      <Card title="近 30 日趋势" bordered={false} loading={loading}>
        <Table
          size="small"
          pagination={false}
          rowKey="date"
          dataSource={daily}
          columns={[
            { title: '日期', dataIndex: 'date', width: 120 },
            { title: '请求数', dataIndex: 'requests', width: 80 },
            { title: 'Token', dataIndex: 'tokens', render: (v: string) => formatTokens(parseInt(v || '0', 10)) },
            { title: '平均延迟', dataIndex: 'avgLatency', render: (v: string) => `${Math.round(parseFloat(v || '0'))} ms` },
            { title: '错误', dataIndex: 'errors', width: 60 },
          ]}
          scroll={{ x: 480 }}
        />
      </Card>

      <Card title="最近调用" bordered={false} loading={loading}>
        <Table
          size="small"
          pagination={false}
          rowKey="id"
          dataSource={recent}
          columns={[
            {
              title: '时间',
              dataIndex: 'createdAt',
              width: 160,
              render: (v: string) => formatCreatedAt(new Date(v).getTime()),
            },
            { title: '模型', dataIndex: 'model', ellipsis: true },
            { title: '来源', dataIndex: 'source', width: 72 },
            {
              title: 'Token',
              dataIndex: 'totalTokens',
              width: 80,
              render: (v: number) => formatTokens(v),
            },
            { title: '延迟', dataIndex: 'latency', width: 72, render: (v: number) => `${v} ms` },
            {
              title: '状态',
              dataIndex: 'status',
              width: 72,
              render: (v: string) => (
                <Tag color={v === 'success' ? 'green' : 'red'}>{v === 'success' ? '成功' : '失败'}</Tag>
              ),
            },
          ]}
          scroll={{ x: 640 }}
        />
      </Card>
    </div>
  );
};
