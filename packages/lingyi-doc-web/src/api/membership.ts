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
  };
  features: Record<string, boolean>;
}

export async function fetchMembershipSummary(): Promise<MembershipSummary> {
  return authFetch<MembershipSummary>('/api/v1/c/membership/summary');
}
