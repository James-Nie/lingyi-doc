import { adminFetch } from '../stores/authStore';

export interface AiModelConfig {
  enabled: boolean;
  defaultModel: string;
  models: string[];
  defaultProvider: string;
  gateway: {
    baseUrl: string;
    apiKeyConfigured: boolean;
    apiKeyPreview: string | null;
  };
  embedding: {
    provider: string;
    model: string;
  };
  source: 'env' | 'database';
}

export interface AiUsageSummary {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  todayRequests: number;
  todayTokens: number;
  avgLatencyMs: number;
  errorRate: number;
  successCount: number;
  errorCount: number;
}

export interface AiUsageDailyItem {
  period: string;
  label: string;
  tokens: string;
  cost: string;
  requests: string;
  errors: string;
  avgLatency: string;
}

export type AiUsageTrendPeriod = 'day' | 'week' | 'month';

export interface AiUsageByModelItem {
  model: string;
  tokens: string;
  cost: string;
  requests: string;
  avgLatency: string;
}

export interface AiUsageByAgentItem {
  agentId: string | null;
  tokens: string;
  requests: string;
  avgLatency: string;
}

export interface AiUsageRecentItem {
  id: string;
  model: string;
  source: string;
  agentId: string | null;
  userId: string | null;
  tenantId: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latency: number;
  status: string;
  createdAt: string;
}

export interface AiUsageFilter {
  tenantId?: string;
  agentId?: string;
  model?: string;
}

function buildQuery(filter?: AiUsageFilter, limit?: number, period?: AiUsageTrendPeriod): string {
  const params = new URLSearchParams();
  if (filter?.tenantId) params.set('tenantId', filter.tenantId);
  if (filter?.agentId) params.set('agentId', filter.agentId);
  if (filter?.model) params.set('model', filter.model);
  if (limit !== undefined) params.set('limit', String(limit));
  if (period) params.set('period', period);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function fetchAiConfig() {
  return adminFetch<AiModelConfig>('/api/v1/admin/ai/config');
}

export function updateAiConfig(body: {
  enabled?: boolean;
  defaultModel?: string;
  models?: string[];
}) {
  return adminFetch<AiModelConfig>('/api/v1/admin/ai/config', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function fetchAiUsageSummary(filter?: AiUsageFilter) {
  return adminFetch<AiUsageSummary>(`/api/v1/admin/ai/usage${buildQuery(filter)}`);
}

export function fetchAiDailyUsage(filter?: AiUsageFilter, period: AiUsageTrendPeriod = 'day') {
  return adminFetch<AiUsageDailyItem[]>(`/api/v1/admin/ai/usage/trend${buildQuery(filter, undefined, period)}`);
}

export function fetchAiUsageByModel(filter?: AiUsageFilter) {
  return adminFetch<AiUsageByModelItem[]>(`/api/v1/admin/ai/usage/by-model${buildQuery(filter)}`);
}

export function fetchAiUsageByAgent(filter?: AiUsageFilter) {
  return adminFetch<AiUsageByAgentItem[]>(`/api/v1/admin/ai/usage/by-agent${buildQuery(filter)}`);
}

export function fetchAiRecentUsage(limit = 30, filter?: AiUsageFilter) {
  return adminFetch<AiUsageRecentItem[]>(`/api/v1/admin/ai/usage/recent${buildQuery(filter, limit)}`);
}
