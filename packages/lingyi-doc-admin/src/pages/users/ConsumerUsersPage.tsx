import React, { useCallback, useEffect, useState } from 'react';
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
  Segmented,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
  DisconnectOutlined,
  KeyOutlined,
  ReloadOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import {
  LockOutlined,
  PlusCircleOutlined,
  SafetyOutlined,
  StopOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { AdminPageHeader } from '../../components/AdminPageHeader';
import { StatCard } from '../../components/StatCard';
import { StatusTag } from '../../components/StatusTag';
import { authStore } from '../../stores/authStore';
import {
  consumerUserApi,
  type ConsumerUserDetail,
  type ConsumerUserItem,
  type ConsumerUserStats,
} from '../../api/adminConsole';
import { formatDateTime, tenantRoleLabel, userStatusLabel } from '../../utils/format';

const { Search } = Input;

type StatusFilter = 'all' | 'active' | 'suspended';

/**
 * C 端用户管理（P0-6）。
 *
 * 补齐评审缺陷 F2：后端 `/admin/users`、`user:suspend` 权限码与概览页的
 * 「C 端用户总数」此前都在，但前端没有任何入口 —— 管理员只能看数字不能管理。
 *
 * 脱敏约定（等保三级 8.1.4.11）：列表默认返回掩码后的邮箱/手机号，
 * 完整值只有持有 `user:write` 的角色在**详情接口**才能取得。
 */
export const ConsumerUsersPage: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [items, setItems] = useState<ConsumerUserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<ConsumerUserStats | null>(null);

  const [detail, setDetail] = useState<ConsumerUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const canSuspend = authStore.hasPermission('user:suspend');
  const canWrite = authStore.hasPermission('user:write');

  const loadStats = useCallback(async () => {
    try {
      setStats(await consumerUserApi.stats());
    } catch (err) {
      message.error(err instanceof Error ? err.message : '统计加载失败');
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await consumerUserApi.list({
        keyword: keyword || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        page,
        pageSize,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '列表加载失败');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [keyword, statusFilter, page, pageSize]);

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

  const openDetail = async (userId: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      setDetail(await consumerUserApi.detail(userId));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const changeStatus = (record: ConsumerUserItem, next: 'active' | 'suspended') => {
    const disabling = next === 'suspended';
    let reason = '';
    Modal.confirm({
      title: disabling ? '确认禁用该用户' : '确认启用该用户',
      content: disabling ? (
        <div>
          <p>禁用后该用户将无法登录，且<b>其所有活跃会话会被立即吊销</b>。</p>
          <Input.TextArea
            rows={2}
            maxLength={200}
            showCount
            placeholder="禁用原因（会记入审计日志，建议填写）"
            onChange={(e) => { reason = e.target.value; }}
          />
        </div>
      ) : (
        `启用后「${record.displayName}」可重新登录。`
      ),
      okText: disabling ? '禁用' : '启用',
      okType: disabling ? 'danger' : 'primary',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await consumerUserApi.updateStatus(record.id, next, reason || undefined);
          message.success(
            disabling
              ? `已禁用${res.revokedSessions ? `，吊销 ${res.revokedSessions} 个会话` : ''}`
              : '已启用',
          );
          refreshAll();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '操作失败');
        }
      },
    });
  };

  const unlock = async (record: ConsumerUserItem) => {
    try {
      await consumerUserApi.unlock(record.id);
      message.success('已解锁并清零失败次数');
      refreshAll();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '解锁失败');
    }
  };

  const forceLogout = (record: ConsumerUserItem) => {
    Modal.confirm({
      title: '确认强制下线',
      content: `将吊销「${record.displayName}」的全部登录会话，其需要重新登录。`,
      okText: '强制下线',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await consumerUserApi.forceLogout(record.id);
          message.success(`已吊销 ${res.revoked} 个会话`);
          refreshAll();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '强制下线失败');
        }
      },
    });
  };

  const resetPassword = (record: ConsumerUserItem) => {
    Modal.confirm({
      title: '重置用户密码',
      content: (
        <div>
          <p>将生成一次性初始口令，用户下次登录后<b>必须修改密码</b>；同时吊销其全部会话。</p>
          <p>口令只在生成后展示一次，请立即转交用户。</p>
        </div>
      ),
      okText: '生成并重置',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await consumerUserApi.resetPassword(record.id);
          setTempPassword(res.tempPassword);
          refreshAll();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '重置失败');
        }
      },
    });
  };

  const columns: TableColumnsType<ConsumerUserItem> = [
    {
      title: '用户',
      dataIndex: 'displayName',
      ellipsis: true,
      render: (name: string, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Link onClick={() => void openDetail(record.id)}>{name}</Typography.Link>
          {/* 完整 UUID 对管理员没有识别价值，还把行高撑到两行以上；
              截断为前 8 位，完整值在详情里看 */}
          <Tooltip title={record.id}>
            <span className="admin-cell-sub">{record.id.slice(0, 8)}…</span>
          </Tooltip>
        </Space>
      ),
    },
    {
      title: '邮箱（脱敏）',
      dataIndex: 'email',
      ellipsis: true,
      render: (email: string) => (
        <Tooltip title="等保三级要求最小化展示个人信息，完整值需 user:write 权限在详情中查看">
          <span>{email || '—'}</span>
        </Tooltip>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: string) => (
        <StatusTag tone={status === 'active' ? 'success' : 'neutral'} dot>
          {userStatusLabel(status)}
        </StatusTag>
      ),
    },
    {
      title: '最近登录',
      dataIndex: 'lastLoginAt',
      width: 170,
      render: (v: number | null) => formatDateTime(v),
    },
    {
      title: '操作',
      width: 260,
      fixed: 'right',
      render: (_: unknown, record) => (
        <Space size={0} wrap>
          {canSuspend && (
            record.status === 'active' ? (
              <Button type="link" size="small" danger onClick={() => changeStatus(record, 'suspended')}>
                禁用
              </Button>
            ) : (
              <Button type="link" size="small" onClick={() => changeStatus(record, 'active')}>
                启用
              </Button>
            )
          )}
          {canWrite && (
            <>
              <Button type="link" size="small" onClick={() => void unlock(record)}>解锁</Button>
              <Button type="link" size="small" danger onClick={() => forceLogout(record)}>强制下线</Button>
              <Button type="link" size="small" onClick={() => resetPassword(record)}>重置密码</Button>
            </>
          )}
          <Button type="link" size="small" onClick={() => void openDetail(record.id)}>详情</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <AdminPageHeader
        title="用户账号"
        description="管理 C 端用户账号、登录状态与安全操作"
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={8} xxl={4}>
          <StatCard icon={<TeamOutlined aria-hidden="true" />} tone="primary" label="用户总数" value={stats?.total ?? 0} loading={!stats} />
        </Col>
        <Col xs={24} sm={12} lg={8} xxl={4}>
          <StatCard icon={<UserOutlined aria-hidden="true" />} tone="success" label="正常" value={stats?.active ?? 0} loading={!stats} hint={stats ? `占 ${(stats.total ? Math.round((stats.active / stats.total) * 100) : 0)}%` : undefined} />
        </Col>
        <Col xs={24} sm={12} lg={8} xxl={4}>
          <StatCard icon={<StopOutlined aria-hidden="true" />} tone="neutral" label="已禁用" value={stats?.suspended ?? 0} loading={!stats} />
        </Col>
        <Col xs={24} sm={12} lg={8} xxl={4}>
          <StatCard icon={<LockOutlined aria-hidden="true" />} tone={stats?.locked ? 'warning' : 'neutral'} label="锁定中" value={stats?.locked ?? 0} loading={!stats} />
        </Col>
        <Col xs={24} sm={12} lg={8} xxl={4}>
          <StatCard icon={<PlusCircleOutlined aria-hidden="true" />} tone="primary" label="近 7 日新增" value={stats?.newLast7d ?? 0} loading={!stats} />
        </Col>
        <Col xs={24} sm={12} lg={8} xxl={4}>
          <StatCard icon={<SafetyOutlined aria-hidden="true" />} tone="neutral" label="扫码登录账号" value={stats?.oauthAccounts ?? 0} loading={!stats} />
        </Col>
      </Row>

      <Card title="用户列表">
        <Space wrap style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
          <Space wrap>
            <Search
              allowClear
              placeholder="搜索姓名 / 邮箱 / 手机号"
              style={{ width: 240 }}
              onSearch={(value) => {
                setKeyword(value.trim());
                setPage(1);
              }}
            />
            <Segmented
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v as StatusFilter);
                setPage(1);
              }}
              options={[
                { label: '全部', value: 'all' },
                { label: '正常', value: 'active' },
                { label: '已禁用', value: 'suspended' },
              ]}
            />
          </Space>
          <Button icon={<ReloadOutlined />} onClick={refreshAll}>刷新</Button>
        </Space>

        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          dataSource={items}
          columns={columns}
          locale={{ emptyText: <Empty description="暂无用户" /> }}
          scroll={{ x: 1000 }}
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
        title={detail ? `用户详情 · ${detail.displayName}` : '用户详情'}
        width={560}
        open={!!detail || detailLoading}
        onClose={() => setDetail(null)}
        loading={detailLoading}
      >
        {detail && (
          <>
            {detail.masked && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message="个人信息已脱敏（当前账号无 user:write 权限）"
              />
            )}
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="用户 ID">{detail.id}</Descriptions.Item>
              <Descriptions.Item label="姓名">{detail.displayName}</Descriptions.Item>
              <Descriptions.Item label="邮箱">{detail.email || '—'}</Descriptions.Item>
              <Descriptions.Item label="手机号">{detail.phone || '—'}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={detail.status === 'active' ? 'success' : 'default'}>
                  {userStatusLabel(detail.status)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="注册时间">{formatDateTime(detail.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="最近登录">{formatDateTime(detail.lastLoginAt)}</Descriptions.Item>
              <Descriptions.Item label="登录失败次数">{detail.loginFailCount}</Descriptions.Item>
              <Descriptions.Item label="锁定至">{formatDateTime(detail.lockedUntil)}</Descriptions.Item>
              <Descriptions.Item label="需修改密码">{detail.needChangePassword ? '是' : '否'}</Descriptions.Item>
              <Descriptions.Item label="账号来源">{detail.importedFrom ?? '本地注册'}</Descriptions.Item>
              <Descriptions.Item label="活跃会话数">{detail.sessionCount}</Descriptions.Item>
              <Descriptions.Item label="文档数">{detail.documentCount}</Descriptions.Item>
            </Descriptions>

            <div style={{ marginTop: 16 }}>
              <b>所属组织</b>
              {detail.memberships.length ? (
                <Table
                  size="small"
                  style={{ marginTop: 8 }}
                  rowKey={(r) => `${r.tenantId}-${r.orgId ?? 'none'}`}
                  pagination={false}
                  dataSource={detail.memberships}
                  columns={[
                    { title: '租户', dataIndex: 'tenantName', ellipsis: true },
                    { title: '部门', dataIndex: 'orgName', width: 120, render: (v: string | null) => v ?? '—' },
                    { title: '职位', dataIndex: 'positionName', width: 110, render: (v: string | null) => v ?? '—' },
                    {
                      title: '角色',
                      dataIndex: 'tenantRole',
                      width: 100,
                      render: (v: number) => tenantRoleLabel(v),
                    },
                  ]}
                />
              ) : (
                <p style={{ color: '#8c8c8c' }}>未加入任何组织</p>
              )}
            </div>

            {detail.oauthBindings.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <b>第三方账号绑定</b>
                <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                  {detail.oauthBindings.map((b) => (
                    <li key={`${b.provider}-${b.providerUserId}`}>
                      {b.provider} · 绑定于 {formatDateTime(b.boundAt)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Space style={{ marginTop: 20 }} wrap>
              {canWrite && (
                <>
                  <Button icon={<UnlockOutlined />} onClick={() => void unlock(detail)}>解锁</Button>
                  <Button icon={<DisconnectOutlined />} onClick={() => forceLogout(detail)}>强制下线</Button>
                  <Button icon={<KeyOutlined />} danger onClick={() => resetPassword(detail)}>重置密码</Button>
                </>
              )}
            </Space>
          </>
        )}
      </Drawer>

      <Modal
        title="一次性初始口令"
        open={!!tempPassword}
        onCancel={() => setTempPassword(null)}
        onOk={() => setTempPassword(null)}
        okText="我已记录，关闭"
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="口令只展示这一次"
          description="关闭后无法再次查看。用户下次登录会被强制要求修改密码。"
        />
        <Typography.Paragraph copyable={{ text: tempPassword ?? '' }} style={{ fontSize: 16 }}>
          <code>{tempPassword}</code>
        </Typography.Paragraph>
      </Modal>
    </div>
  );
};

export default ConsumerUsersPage;
