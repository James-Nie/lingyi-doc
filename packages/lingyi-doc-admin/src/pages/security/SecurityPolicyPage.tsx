import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ExclamationCircleOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { adminFetch, authStore } from '../../stores/authStore';
import { sharePolicyApi, type SharePolicy } from '../../api/adminConsole';
import { formatDateTime } from '../../utils/format';

interface PasswordPolicy {
  passwordMinLength: number;
  passwordRequireMixed: boolean;
  registerEnabled: boolean;
  maxLoginAttempts: number;
  lockDurationMinutes: number;
}

interface SessionItem {
  id: string;
  userId: string;
  displayName: string | null;
  email: string | null;
  clientType: string;
  deviceInfo: string | null;
  ip: string | null;
  createdAt: number;
  expiresAt: number;
}

/**
 * 安全策略（P0-2 + 既有能力整合）。
 *
 * 三个 Tab：
 * - 外发管控（P0-2 新增）：租户级外链/水印/下载复制打印的强制策略
 * - 口令与登录：既有密码策略
 * - 活跃会话：既有会话列表 + 撤销
 */
export const SecurityPolicyPage: React.FC = () => {
  const [tab, setTab] = useState('share');

  const [loading, setLoading] = useState(false);
  const [policy, setPolicy] = useState<PasswordPolicy | null>(null);
  const [saving, setSaving] = useState(false);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [sessionPage, setSessionPage] = useState(1);
  const [sessionLoading, setSessionLoading] = useState(false);

  const [sharePolicy, setSharePolicy] = useState<SharePolicy | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);
  const [shareForm] = Form.useForm<SharePolicy>();

  const canWritePassword = authStore.hasPermission('config:write');
  const canWriteShare = authStore.hasPermission('security:policy:write');

  const loadPolicy = useCallback(async () => {
    setLoading(true);
    try {
      setPolicy(await adminFetch<PasswordPolicy>('/api/v1/admin/security/password-policy'));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载安全策略失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSessions = useCallback(async (page: number) => {
    setSessionLoading(true);
    try {
      const res = await adminFetch<{ items: SessionItem[]; total: number }>(
        `/api/v1/admin/security/sessions?page=${page}&pageSize=10`,
      );
      setSessions(res.items);
      setSessionTotal(res.total);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载会话列表失败');
    } finally {
      setSessionLoading(false);
    }
  }, []);

  const loadSharePolicy = useCallback(async () => {
    setShareLoading(true);
    try {
      const res = await sharePolicyApi.get();
      setSharePolicy(res);
      shareForm.setFieldsValue(res);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载外发策略失败');
    } finally {
      setShareLoading(false);
    }
  }, [shareForm]);

  useEffect(() => { void loadPolicy(); }, [loadPolicy]);
  useEffect(() => { void loadSessions(sessionPage); }, [loadSessions, sessionPage]);
  useEffect(() => { void loadSharePolicy(); }, [loadSharePolicy]);

  const savePolicy = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      await adminFetch('/api/v1/admin/security/password-policy', {
        method: 'PUT',
        body: JSON.stringify(values),
      });
      message.success('安全策略已更新');
      void loadPolicy();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const saveSharePolicy = async () => {
    const values = await shareForm.validateFields();
    const patch: Partial<SharePolicy> = {
      linkShareEnabled: values.linkShareEnabled,
      allowExternalShare: values.allowExternalShare,
      maxExpireDays: values.maxExpireDays,
      forceDisableDownload: values.forceDisableDownload,
      forceDisableCopy: values.forceDisableCopy,
      forceDisablePrint: values.forceDisablePrint,
      forceWatermark: values.forceWatermark,
      watermarkText: values.watermarkText ?? null,
      requirePassword: values.requirePassword,
    };
    Modal.confirm({
      title: '确认保存外发管控策略',
      content: (
        <div>
          <p>该策略会<b>立即对全租户生效</b>，并作为上限/下限钳制用户已设置的单文档分享配置。</p>
          <p>例：开启「强制禁止下载」后，用户端无法再打开下载开关，已开启的外链也会被强制关闭下载。</p>
        </div>
      ),
      okText: '确认保存',
      cancelText: '取消',
      onOk: async () => {
        setShareSaving(true);
        try {
          const saved = await sharePolicyApi.update(patch);
          setSharePolicy(saved);
          shareForm.setFieldsValue(saved);
          message.success('外发管控策略已更新');
        } catch (err) {
          message.error(err instanceof Error ? err.message : '保存失败');
        } finally {
          setShareSaving(false);
        }
      },
    });
  };

  const revokeSession = (sessionId: string, label: string) => {
    Modal.confirm({
      title: '确认撤销会话',
      content: `将立即使「${label}」的该登录会话失效，对方需要重新登录。`,
      okText: '撤销',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await adminFetch(`/api/v1/admin/security/sessions/${sessionId}`, { method: 'DELETE' });
          message.success('会话已撤销');
          void loadSessions(sessionPage);
        } catch (err) {
          message.error(err instanceof Error ? err.message : '撤销失败');
        }
      },
    });
  };

  const sessionColumns: ColumnsType<SessionItem> = [
    { title: '用户', dataIndex: 'displayName', width: 140, render: (name: string | null, row) => name || row.email || '—' },
    { title: '客户端类型', dataIndex: 'clientType', width: 110 },
    { title: '设备信息', dataIndex: 'deviceInfo', ellipsis: true, render: (v: string | null) => v || '—' },
    { title: 'IP', dataIndex: 'ip', width: 130, render: (v: string | null) => v || '—' },
    { title: '登录时间', dataIndex: 'createdAt', width: 170, render: (v: number) => formatDateTime(v) },
    {
      title: '状态',
      width: 80,
      render: (_: unknown, row) =>
        row.expiresAt < Date.now() ? <Tag>已过期</Tag> : <Tag color="green">活跃</Tag>,
    },
    {
      title: '操作',
      width: 80,
      render: (_: unknown, row) => (
        <Button
          size="small"
          danger
          onClick={() => revokeSession(row.id, row.displayName || row.email || row.userId)}
        >
          撤销
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Card
        tabList={[
          { key: 'share', tab: '外发管控' },
          { key: 'password', tab: '口令与登录' },
          { key: 'sessions', tab: '活跃会话' },
        ]}
        activeTabKey={tab}
        onTabChange={setTab}
      >
        {tab === 'share' && (
          <Spin spinning={shareLoading}>
            <Alert
              type="info"
              showIcon
              icon={<SafetyCertificateOutlined />}
              style={{ marginBottom: 20 }}
              message="外发管控对全租户生效"
              description={
                sharePolicy?.isDefault
                  ? '当前租户尚未配置，展示的是系统默认值（全部放开）。保存后即为该租户的实际策略。'
                  : `当前策略最近更新：${formatDateTime(sharePolicy?.updatedAt ?? null)}`
              }
            />
            <Form form={shareForm} layout="vertical" style={{ maxWidth: 640 }} disabled={!canWriteShare}>
              <Divider titlePlacement="start" plain>外链开关</Divider>
              <Form.Item
                label="允许创建外链分享"
                name="linkShareEnabled"
                valuePropName="checked"
                extra="关闭后，用户端所有文档的「链接分享」入口都会被拒绝，成员协作分享不受影响。"
              >
                <Switch />
              </Form.Item>
              <Form.Item
                label="允许分享到企业外"
                name="allowExternalShare"
                valuePropName="checked"
                extra="关闭后，外链仅企业内成员可访问，同时禁止二次转发。"
              >
                <Switch />
              </Form.Item>
              <Form.Item
                label="链接有效期上限（天）"
                name="maxExpireDays"
                extra="0 表示不限。设置后，用户设定的有效期会被钳制到该上限；未设置有效期的链接会自动带上该期限。"
              >
                <InputNumber min={0} max={3650} style={{ width: 200 }} addonAfter="天" />
              </Form.Item>
              <Form.Item
                label="强制外链设置访问口令"
                name="requirePassword"
                valuePropName="checked"
                extra="开启后，未设置口令的外链无法开启或更新。"
              >
                <Switch />
              </Form.Item>

              <Divider titlePlacement="start" plain>内容防护（强制，用户不可关闭）</Divider>
              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item label="禁止下载" name="forceDisableDownload" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="禁止复制" name="forceDisableCopy" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="禁止打印" name="forceDisablePrint" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="强制水印" name="forceWatermark" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item
                label="水印文案"
                name="watermarkText"
                extra="支持占位符 {user}（访问者）、{name}（文档名）、{time}（访问时间）。开启强制水印但留空时会自动使用「{user} {time}」。"
              >
                <Input maxLength={200} placeholder="{user} {time}" />
              </Form.Item>

              <Form.Item>
                <Tooltip title={canWriteShare ? '' : '需要 security:policy:write 权限'}>
                  <Button
                    type="primary"
                    loading={shareSaving}
                    disabled={!canWriteShare}
                    onClick={() => void saveSharePolicy()}
                  >
                    保存外发管控策略
                  </Button>
                </Tooltip>
              </Form.Item>
            </Form>
          </Spin>
        )}

        {tab === 'password' && (
          loading && !policy ? (
            <Spin style={{ display: 'block', marginTop: 40 }} />
          ) : (
            <Form
              layout="vertical"
              initialValues={policy ?? undefined}
              onFinish={savePolicy}
              style={{ maxWidth: 500 }}
              disabled={!canWritePassword}
            >
              <Form.Item
                label="密码最小长度"
                name="passwordMinLength"
                rules={[{ required: true, message: '请输入密码最小长度' }]}
              >
                <InputNumber min={6} max={32} style={{ width: 200 }} />
              </Form.Item>
              <Form.Item label="密码必须包含字母和数字" name="passwordRequireMixed" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item label="允许 C 端自助注册" name="registerEnabled" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item
                label={
                  <span>
                    最大登录尝试次数&nbsp;
                    <Tooltip title="超过此次数后账号将被临时锁定">
                      <ExclamationCircleOutlined style={{ color: '#999' }} />
                    </Tooltip>
                  </span>
                }
                name="maxLoginAttempts"
                rules={[{ required: true, message: '请输入最大登录尝试次数' }]}
              >
                <InputNumber min={1} max={50} style={{ width: 200 }} />
              </Form.Item>
              <Form.Item
                label="账号锁定时间（分钟）"
                name="lockDurationMinutes"
                rules={[{ required: true, message: '请输入锁定时间' }]}
              >
                <InputNumber min={1} max={1440} style={{ width: 200 }} />
              </Form.Item>
              <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
                被锁定的用户可在「组织与人员 → 用户账号」中手动解锁。
              </Typography.Paragraph>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={saving}>
                  保存设置
                </Button>
              </Form.Item>
            </Form>
          )
        )}

        {tab === 'sessions' && (
          <Table
            rowKey="id"
            loading={sessionLoading}
            columns={sessionColumns}
            dataSource={sessions}
            locale={{ emptyText: '暂无活跃会话' }}
            pagination={{
              current: sessionPage,
              total: sessionTotal,
              pageSize: 10,
              onChange: setSessionPage,
              showTotal: (t) => `共 ${t} 条`,
            }}
          />
        )}
      </Card>
    </div>
  );
};
