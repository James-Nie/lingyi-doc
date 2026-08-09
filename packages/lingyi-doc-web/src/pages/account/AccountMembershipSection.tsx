import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Alert, Card, Descriptions, Progress, Spin, Tag } from 'antd';
import { fetchMembershipSummary, type MembershipSummary } from '../../api/membership';
import { authStore } from '../../stores/authStore';
import { formatCreatedAt } from '../../utils/formatDate';

const FEATURE_LABELS: Record<string, string> = {
  export_hd: '高清导出',
  export_no_watermark: '无水印导出',
  version_unlimited: '无限版本历史',
  version_compare: '版本对比',
  template_premium: '高级模板',
  api_access: 'API 访问',
  ai_assist: 'AI 辅助',
  sheet_pivot: '数据透视表',
  base_advanced_views: '多维表高级视图',
  batch_import_export: '批量导入导出',
  audit_log: '审计日志',
  watermark: '文档水印',
  advanced_share_link: '高级分享链接',
};

const MODULE_LABELS: Record<string, string> = {
  'mod.doc': '富文本文档',
  'mod.sheet': '表格/多维表',
  'mod.whiteboard': '白板',
  'mod.mindmap': '思维导图/思维笔记',
  'mod.form': '表单/问卷',
  'mod.knowledge': '知识库',
  'mod.collab': '实时协作',
  'mod.ai': 'AI 能力',
  'mod.mcp': 'MCP 接入',
  'mod.enterprise': '企业安全',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function quotaLabel(name: string, used: number, limit: number | null): string {
  if (limit == null) return `${name}：${used}（不限）`;
  if (name === '存储空间') return `${name}：${formatBytes(used)} / ${formatBytes(limit)}`;
  return `${name}：${used} / ${limit}`;
}

function QuotaRow({ label, used, limit, percent }: {
  label: string;
  used: number;
  limit: number | null;
  percent: number | null;
}) {
  if (limit == null) {
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#646a73', marginBottom: 6 }}>{quotaLabel(label, used, limit)}</div>
        <div style={{ fontSize: 12, color: '#8f959e' }}>当前版本不限量</div>
      </div>
    );
  }
  const pct = percent ?? Math.min(100, Math.round((used / limit) * 100));
  const status = pct >= 100 ? 'exception' : pct >= 80 ? 'active' : 'normal';
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, color: '#646a73', marginBottom: 6 }}>{quotaLabel(label, used, limit)}</div>
      <Progress percent={pct} size="small" status={status} showInfo />
    </div>
  );
}

export const AccountMembershipSection: React.FC = () => {
  const cached = useSyncExternalStore(authStore.subscribe, () => authStore.getState().membershipSummary);
  const [summary, setSummary] = useState<MembershipSummary | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMembershipSummary();
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const enabledFeatures = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.features)
      .filter(([, enabled]) => enabled)
      .map(([key]) => FEATURE_LABELS[key] ?? key);
  }, [summary]);

  const enabledModules = useMemo(() => {
    if (!summary?.modules) return [];
    return Object.entries(summary.modules)
      .filter(([, enabled]) => enabled)
      .map(([key]) => MODULE_LABELS[key] ?? key);
  }, [summary]);

  const disabledModules = useMemo(() => {
    if (!summary?.modules) return [];
    return Object.entries(summary.modules)
      .filter(([, enabled]) => !enabled)
      .map(([key]) => MODULE_LABELS[key] ?? key);
  }, [summary]);

  if (loading && !summary) {
    return (
      <Card bordered={false}>
        <div style={{ padding: '48px 0', textAlign: 'center' }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (error && !summary) {
    return <Card bordered={false}><Alert type="error" message={error} showIcon /></Card>;
  }

  if (!summary) return null;

  const planColor = summary.plan === 'vip' ? 'gold' : summary.plan === 'trial' ? 'blue' : 'default';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {summary.readOnly && (
        <Alert
          type="error"
          showIcon
          message="当前空间配额已超限，文档仅可只读查看"
        />
      )}
      {!summary.readOnly && summary.warnings[0] && (
        <Alert type="warning" showIcon message={summary.warnings[0].message} />
      )}

      <Card title="当前版本" bordered={false}>
        <Descriptions column={1} labelStyle={{ width: 120, color: '#8f959e' }}>
          <Descriptions.Item label="空间类型">
            {summary.spaceKind === 'team' ? '团队空间' : '个人空间'}
          </Descriptions.Item>
          <Descriptions.Item label="账号版本">
            <Tag color={planColor}>{summary.planLabel}</Tag>
            {summary.planExpired && <Tag color="error">已过期</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="到期时间">
            {summary.expireAt ? formatCreatedAt(new Date(summary.expireAt).getTime()) : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="创建团队">
            {summary.canCreateTeam ? '已开通' : '未开通（个人账号默认不可创建团队）'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="配额使用" bordered={false}>
        <QuotaRow
          label="知识库数量"
          used={summary.quotas.knowledgeBases?.used ?? 0}
          limit={summary.quotas.knowledgeBases?.limit ?? null}
          percent={summary.quotas.knowledgeBases?.percent ?? null}
        />
        <QuotaRow
          label="文档数量"
          used={summary.quotas.documents.used}
          limit={summary.quotas.documents.limit}
          percent={summary.quotas.documents.percent}
        />
        <QuotaRow
          label="存储空间"
          used={summary.quotas.storageBytes.used}
          limit={summary.quotas.storageBytes.limit}
          percent={summary.quotas.storageBytes.percent}
        />
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#646a73', marginBottom: 6 }}>
            单文件上限：
            {summary.quotas.maxFileBytes == null
              ? '50 MB（默认）'
              : formatBytes(summary.quotas.maxFileBytes)}
          </div>
        </div>
        <QuotaRow
          label="今日导出"
          used={summary.quotas.dailyExports.used}
          limit={summary.quotas.dailyExports.limit}
          percent={summary.quotas.dailyExports.percent}
        />
        {summary.quotas.members && (
          <QuotaRow
            label={summary.spaceKind === 'team' ? '团队成员' : '协作人数'}
            used={summary.quotas.members.used}
            limit={summary.quotas.members.limit}
            percent={summary.quotas.members.percent}
          />
        )}
      </Card>

      <Card title="已开通产品模块" bordered={false}>
        {enabledModules.length === 0 ? (
          <div style={{ color: '#8f959e', fontSize: 13 }}>暂无模块信息（请升级服务端后刷新）。</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {enabledModules.map(name => (
              <Tag key={name} color="success">{name}</Tag>
            ))}
          </div>
        )}
        {disabledModules.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: '#8f959e', marginBottom: 8 }}>未开通</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {disabledModules.map(name => (
                <Tag key={name}>{name}</Tag>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card title="已开通权益" bordered={false}>
        {enabledFeatures.length === 0 ? (
          <div style={{ color: '#8f959e', fontSize: 13 }}>当前版本暂无额外权益，升级会员可解锁更多能力。</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {enabledFeatures.map(name => (
              <Tag key={name} color="processing">{name}</Tag>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
