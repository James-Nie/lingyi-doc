import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Row } from 'antd';
import {
  ApiOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  ReloadOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { adminFetch } from '../../stores/authStore';
import { TrendLineChart, formatStorageBytes } from '../../components/TrendLineChart';
import { AdminPageHeader } from '../../components/AdminPageHeader';
import { StatCard } from '../../components/StatCard';
import { StatusTag } from '../../components/StatusTag';

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

/**
 * 图表配色：统一走品牌蓝的明度阶梯。
 * 此前是 #52c41a（绿）/ #722ed1（紫）/ #fa8c16（橙）四种色相混用 ——
 * 语义色在后台里只该表达状态，图表用它们会让用户误以为「绿 = 正常、橙 = 警告」。
 */
const CHART_COLORS = {
  users: '#1677FF',
  activeUsers: '#3C89FF',
  documents: '#94BFFF',
  storage: '#0B5FD9',
} as const;

export const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [trends, setTrends] = useState<DashboardTrendPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [s, t] = await Promise.all([
        adminFetch<DashboardStats>('/api/v1/admin/dashboard/stats'),
        adminFetch<{ points: DashboardTrendPoint[] }>('/api/v1/admin/dashboard/trends?days=7'),
      ]);
      setStats(s);
      setTrends(t.points ?? []);
    } catch (err) {
      // 修复静默 catch：失败必须可见，并给出重试入口
      setError(err instanceof Error ? err.message : '数据加载失败');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const trendSeries = useMemo(() => ({
    users: trends.map((p) => ({ date: p.date, value: p.users })),
    activeUsers: trends.map((p) => ({ date: p.date, value: p.activeUsers })),
    documents: trends.map((p) => ({ date: p.date, value: p.documents })),
    storage: trends.map((p) => ({ date: p.date, value: p.storageBytes })),
  }), [trends]);

  const dbOk = stats?.system.databaseConnected === true;

  return (
    <div>
      <AdminPageHeader
        title="概览"
        description="平台运行概况与最近 7 天关键指标"
        extra={
          <Button icon={<ReloadOutlined aria-hidden="true" />} loading={refreshing} onClick={() => void load()}>
            刷新
          </Button>
        }
      />

      {error && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="数据加载失败"
          description={error}
          action={<Button size="small" danger onClick={() => void load()}>重试</Button>}
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            icon={<TeamOutlined aria-hidden="true" />}
            tone="primary"
            label="C 端用户总数"
            value={stats ? stats.users.totalConsumers.toLocaleString() : '—'}
            loading={!stats}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            icon={<ThunderboltOutlined aria-hidden="true" />}
            tone="success"
            label="7 日活跃用户"
            value={stats ? stats.users.activeConsumers.toLocaleString() : '—'}
            loading={!stats}
            hint={stats ? `占总量 ${stats.users.totalConsumers ? Math.round((stats.users.activeConsumers / stats.users.totalConsumers) * 100) : 0}%` : undefined}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            icon={<FileTextOutlined aria-hidden="true" />}
            tone="neutral"
            label="文档总数"
            value={stats ? stats.documents.total.toLocaleString() : '—'}
            loading={!stats}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            icon={<ApiOutlined aria-hidden="true" />}
            tone="primary"
            label="在线协同连接"
            value={stats ? stats.collaboration.connections.toLocaleString() : '—'}
            loading={!stats}
            hint={stats ? `分布在 ${stats.collaboration.rooms} 个房间` : undefined}
          />
        </Col>
      </Row>

      <h3 className="admin-section-title">最近 7 天趋势</h3>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card>
            <TrendLineChart title="用户数" points={trendSeries.users} color={CHART_COLORS.users} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card>
            <TrendLineChart title="活跃用户" points={trendSeries.activeUsers} color={CHART_COLORS.activeUsers} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card>
            <TrendLineChart title="文档数" points={trendSeries.documents} color={CHART_COLORS.documents} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card>
            <TrendLineChart
              title="文档存储大小"
              points={trendSeries.storage}
              color={CHART_COLORS.storage}
              formatValue={formatStorageBytes}
            />
          </Card>
        </Col>
      </Row>

      <h3 className="admin-section-title">系统状态</h3>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card>
            <ul className="admin-status-list">
              <li>
                <span className="admin-status-list__label">
                  <DatabaseOutlined aria-hidden="true" /> 数据库
                </span>
                <StatusTag tone={dbOk ? 'success' : 'danger'} dot>{dbOk ? '已连接' : '未连接'}</StatusTag>
              </li>
              <li>
                <span className="admin-status-list__label">
                  <ClockCircleOutlined aria-hidden="true" /> 运行时长
                </span>
                <span className="admin-status-list__value">
                  {stats ? `${Math.floor(stats.system.uptime / 3600)} 小时` : '—'}
                </span>
              </li>
              <li>
                <span className="admin-status-list__label">
                  <TeamOutlined aria-hidden="true" /> 管理员账号
                </span>
                <span className="admin-status-list__value">{stats?.users.totalAdmins ?? '—'}</span>
              </li>
            </ul>
          </Card>
        </Col>
      </Row>
    </div>
  );
};
