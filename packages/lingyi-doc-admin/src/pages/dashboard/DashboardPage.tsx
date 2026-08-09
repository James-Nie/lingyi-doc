import React, { useEffect, useMemo, useState } from 'react';
import { Card, Col, Row, Statistic } from 'antd';
import { adminFetch } from '../../stores/authStore';
import { TrendLineChart, formatStorageBytes } from '../../components/TrendLineChart';

interface DashboardStats {
  users: { totalConsumers: number; activeConsumers: number; totalAdmins: number };
  documents: { total: number };
  collaboration: { rooms: number; connections: number };
  system: { uptime: number; databaseConnected: boolean };
}

interface DashboardTrendPoint {
  date: string;
  users: number;
  activeUsers: number;
  documents: number;
  storageBytes: number;
}

export const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [trends, setTrends] = useState<DashboardTrendPoint[]>([]);

  useEffect(() => {
    adminFetch<DashboardStats>('/api/v1/admin/dashboard/stats')
      .then(setStats)
      .catch(() => { /* ignore */ });
    adminFetch<{ points: DashboardTrendPoint[] }>('/api/v1/admin/dashboard/trends?days=7')
      .then((res) => setTrends(res.points ?? []))
      .catch(() => { /* ignore */ });
  }, []);

  const trendSeries = useMemo(() => ({
    users: trends.map((p) => ({ date: p.date, value: p.users })),
    activeUsers: trends.map((p) => ({ date: p.date, value: p.activeUsers })),
    documents: trends.map((p) => ({ date: p.date, value: p.documents })),
    storage: trends.map((p) => ({ date: p.date, value: p.storageBytes })),
  }), [trends]);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>概览</h2>
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card><Statistic title="C 端用户总数" value={stats?.users.totalConsumers ?? '—'} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="7 日活跃用户" value={stats?.users.activeConsumers ?? '—'} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="文档总数" value={stats?.documents.total ?? '—'} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="在线协同连接" value={stats?.collaboration.connections ?? '—'} /></Card>
        </Col>
      </Row>

      <h3 style={{ margin: '24px 0 12px', fontSize: 16, fontWeight: 500 }}>最近 7 天趋势</h3>
      <Row gutter={[16, 16]}>
        <Col span={12}>
          <Card>
            <TrendLineChart title="用户数" points={trendSeries.users} color="#1677ff" />
          </Card>
        </Col>
        <Col span={12}>
          <Card>
            <TrendLineChart title="活跃用户" points={trendSeries.activeUsers} color="#52c41a" />
          </Card>
        </Col>
        <Col span={12}>
          <Card>
            <TrendLineChart title="文档数" points={trendSeries.documents} color="#722ed1" />
          </Card>
        </Col>
        <Col span={12}>
          <Card>
            <TrendLineChart
              title="文档存储大小"
              points={trendSeries.storage}
              color="#fa8c16"
              formatValue={formatStorageBytes}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card title="系统状态">
            <p>数据库：{stats?.system.databaseConnected ? '已连接' : '未连接'}</p>
            <p>运行时长：{stats ? `${Math.floor(stats.system.uptime / 3600)} 小时` : '—'}</p>
            <p>管理员账号：{stats?.users.totalAdmins ?? '—'}</p>
          </Card>
        </Col>
      </Row>
    </div>
  );
};
