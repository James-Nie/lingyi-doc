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
  metric: 'documents' | 'storageBytes' | 'dailyExports' | 'members' | 'knowledgeBases';
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
    knowledgeBases: QuotaUsage;
    /** 当前版本单文件上传上限（字节）；null = 使用系统默认大文件上限 */
    maxFileBytes: number | null;
  };
  features: Record<string, boolean>;
  /** 产品模块开通表（与 MembershipModuleKey 对齐） */
  modules: Record<string, boolean>;
  /** 部署 License 状态（未配置 License 源时为 absent） */
  license: {
    status: 'absent' | 'ok' | 'expired' | 'invalid';
    reason?: string;
    expireAt: string | null;
    message: string | null;
  };
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

/** 产品模块授权 Key（可独立售卖 / 私有化裁剪 / 开源分层） */
export type MembershipModuleKey =
  | 'mod.doc'
  | 'mod.sheet'
  | 'mod.whiteboard'
  | 'mod.mindmap'
  | 'mod.form'
  | 'mod.knowledge'
  | 'mod.collab'
  | 'mod.ai'
  | 'mod.mcp'
  | 'mod.enterprise';
