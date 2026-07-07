import type {
  EffectivePlan,
  MembershipFeatureKey,
  MembershipPlanCode,
  MembershipSpaceKind,
  QuotaUsage,
  QuotaWarning,
} from '../../types/membership';

export const GB = 1024 * 1024 * 1024;

export interface PlanQuotaLimits {
  maxStorageBytes: number | null;
  maxDocuments: number | null;
  maxMembers: number | null;
  maxDailyExports: number | null;
}

const PERSONAL_FREE: PlanQuotaLimits = {
  maxStorageBytes: 10 * GB,
  maxDocuments: 500,
  maxMembers: null,
  maxDailyExports: 20,
};

const TEAM_FREE: PlanQuotaLimits = {
  maxStorageBytes: 50 * GB,
  maxDocuments: 2000,
  maxMembers: 10,
  maxDailyExports: 100,
};

const UNLIMITED: PlanQuotaLimits = {
  maxStorageBytes: null,
  maxDocuments: null,
  maxMembers: null,
  maxDailyExports: null,
};

export function quotaLimitsFor(
  spaceKind: MembershipSpaceKind,
  plan: EffectivePlan,
): PlanQuotaLimits {
  if (plan === 'vip' || plan === 'trial') return UNLIMITED;
  return spaceKind === 'personal' ? PERSONAL_FREE : TEAM_FREE;
}

const FEATURE_MATRIX: Record<MembershipFeatureKey, Record<EffectivePlan, boolean>> = {
  export_hd: { free: false, trial: true, vip: true },
  export_no_watermark: { free: false, trial: true, vip: true },
  version_unlimited: { free: false, trial: true, vip: true },
  version_compare: { free: false, trial: true, vip: true },
  template_premium: { free: false, trial: true, vip: true },
  api_access: { free: false, trial: true, vip: true },
  ai_assist: { free: false, trial: true, vip: true },
  sheet_pivot: { free: false, trial: true, vip: true },
  base_advanced_views: { free: false, trial: true, vip: true },
  batch_import_export: { free: false, trial: true, vip: true },
  audit_log: { free: false, trial: false, vip: false },
  watermark: { free: false, trial: false, vip: false },
  advanced_share_link: { free: false, trial: false, vip: false },
};

/** 团队会员专属企业能力 */
const TEAM_VIP_ONLY: MembershipFeatureKey[] = [
  'audit_log',
  'watermark',
  'advanced_share_link',
];

export function hasFeature(
  spaceKind: MembershipSpaceKind,
  plan: EffectivePlan,
  feature: MembershipFeatureKey,
): boolean {
  if (TEAM_VIP_ONLY.includes(feature)) {
    return spaceKind === 'team' && (plan === 'vip' || plan === 'trial');
  }
  return FEATURE_MATRIX[feature]?.[plan] ?? false;
}

export function planLabel(spaceKind: MembershipSpaceKind, plan: EffectivePlan): string {
  const prefix = spaceKind === 'personal' ? '个人' : '团队';
  switch (plan) {
    case 'vip': return `${prefix}会员`;
    case 'trial': return `${prefix}试用`;
    default: return `${prefix}免费版`;
  }
}

/** 根据存储计划码与到期时间解析有效版本 */
export function resolveEffectivePlan(
  stored: MembershipPlanCode,
  expireAt: Date | null | undefined,
): { plan: EffectivePlan; expired: boolean } {
  const now = Date.now();
  const expired = expireAt != null && expireAt.getTime() <= now;

  if (stored === 2 && !expired) return { plan: 'vip', expired: false };
  if (stored === 3 && !expired) return { plan: 'trial', expired: false };
  if ((stored === 2 || stored === 3) && expired) return { plan: 'free', expired: true };
  return { plan: 'free', expired: false };
}

export function storedPlanLabel(stored: MembershipPlanCode): string {
  switch (stored) {
    case 2: return '个人会员';
    case 3: return '个人试用';
    default: return '个人免费版';
  }
}

export function buildFeatureMap(
  spaceKind: MembershipSpaceKind,
  plan: EffectivePlan,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const key of Object.keys(FEATURE_MATRIX) as MembershipFeatureKey[]) {
    out[key] = hasFeature(spaceKind, plan, key);
  }
  return out;
}

export function calcQuotaPercent(used: number, limit: number | null): number | null {
  if (limit == null || limit <= 0) return null;
  return Math.min(100, Math.round((used / limit) * 100));
}

export const TRIAL_DAYS_PERSONAL = 7;
export const TRIAL_DAYS_TEAM = 15;
export const QUOTA_WARN_PERCENT = 80;

export function buildQuotaWarnings(quotas: {
  documents: QuotaUsage;
  storageBytes: QuotaUsage;
  dailyExports: QuotaUsage;
  members: QuotaUsage | null;
}): QuotaWarning[] {
  const warnings: QuotaWarning[] = [];
  const push = (
    metric: QuotaWarning['metric'],
    q: QuotaUsage,
    label: string,
  ) => {
    if (q.percent != null && q.percent >= QUOTA_WARN_PERCENT && q.limit != null) {
      warnings.push({
        metric,
        percent: q.percent,
        message: `${label}已使用 ${q.percent}%（${formatBytesOrCount(q.used, metric)} / ${formatBytesOrCount(q.limit, metric)}），建议升级会员`,
      });
    }
  };
  push('documents', quotas.documents, '文档数量');
  push('storageBytes', quotas.storageBytes, '存储空间');
  push('dailyExports', quotas.dailyExports, '今日导出次数');
  if (quotas.members) push('members', quotas.members, '团队成员');
  return warnings;
}

function formatBytesOrCount(value: number, metric: string): string {
  if (metric === 'storageBytes') {
    if (value >= GB) return `${(value / GB).toFixed(1)} GB`;
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.round(value / 1024)} KB`;
  }
  return String(value);
}
