/** 会员计划存储值 */
export type MembershipPlanCode = 1 | 2 | 3;

/** 解析后的有效版本 */
export type EffectivePlan = 'free' | 'vip' | 'trial';

export type MembershipSpaceKind = 'personal' | 'team';

export interface QuotaUsage {
  used: number;
  limit: number | null;
  percent: number | null;
}

export interface QuotaWarning {
  metric: 'documents' | 'storageBytes' | 'dailyExports' | 'members';
  percent: number;
  message: string;
}

export interface MembershipSummary {
  spaceKind: MembershipSpaceKind;
  plan: EffectivePlan;
  planLabel: string;
  planExpired: boolean;
  expireAt: string | null;
  canCreateTeam: boolean;
  readOnly: boolean;
  warnings: QuotaWarning[];
  quotas: {
    documents: QuotaUsage;
    storageBytes: QuotaUsage;
    dailyExports: QuotaUsage;
    members: QuotaUsage | null;
  };
  features: Record<string, boolean>;
}

export interface MembershipContext {
  spaceKind: MembershipSpaceKind;
  effectivePlan: EffectivePlan;
  planExpired: boolean;
  expireAt: Date | null;
  userId: string;
  tenantId: string | null;
  canCreateTeam: boolean;
  /** 配额统计用的空间主体 ID */
  spaceId: string;
}

export interface DocumentSpaceMeta {
  scope: number;
  ownerId: string | null;
  tenantId: string | null;
  storageSize: number;
}

export type MembershipFeatureKey =
  | 'export_hd'
  | 'export_no_watermark'
  | 'version_unlimited'
  | 'version_compare'
  | 'template_premium'
  | 'api_access'
  | 'ai_assist'
  | 'sheet_pivot'
  | 'base_advanced_views'
  | 'batch_import_export'
  | 'audit_log'
  | 'watermark'
  | 'advanced_share_link';
