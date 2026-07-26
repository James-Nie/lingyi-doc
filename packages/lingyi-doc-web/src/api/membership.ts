import { authFetch } from '../stores/authStore';

export interface QuotaUsage {
  used: number;
  limit: number | null;
  percent: number | null;
}

export interface MembershipSummary {
  spaceKind: 'personal' | 'team';
  plan: 'free' | 'vip' | 'trial';
  planLabel: string;
  planExpired: boolean;
  expireAt: string | null;
  canCreateTeam: boolean;
  readOnly: boolean;
  warnings: Array<{ metric: string; percent: number; message: string }>;
  quotas: {
    documents: QuotaUsage;
    storageBytes: QuotaUsage;
    dailyExports: QuotaUsage;
    members: QuotaUsage | null;
    knowledgeBases: QuotaUsage;
    maxFileBytes: number | null;
  };
  features: Record<string, boolean>;
  /** 产品模块开通表；缺省视为全开（兼容旧后端） */
  modules?: Record<string, boolean>;
  /** 部署 License 状态 */
  license?: {
    status: 'absent' | 'ok' | 'expired' | 'invalid';
    reason?: string;
    expireAt: string | null;
    message: string | null;
  };
}

export async function fetchMembershipSummary(): Promise<MembershipSummary> {
  return authFetch<MembershipSummary>('/api/v1/c/membership/summary');
}
