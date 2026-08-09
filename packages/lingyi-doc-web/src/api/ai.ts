import { authFetch, authRawFetch } from '../stores/authStore';

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
  date: string;
  tokens: string;
  cost: string;
  requests: string;
  errors: string;
  avgLatency: string;
}

export interface AiUsageRecentItem {
  id: string;
  model: string;
  source: string;
  agentId: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latency: number;
  status: string;
  createdAt: string;
}

export interface AiAgentItem {
  id: string;
  name: string;
  description: string | null;
  type: string;
}

const AI_BASE = '/api/v1/ai';

export async function fetchAiUsageSummary(): Promise<AiUsageSummary> {
  return authFetch<AiUsageSummary>(`${AI_BASE}/usage`);
}

export async function fetchAiDailyUsage(): Promise<AiUsageDailyItem[]> {
  return authFetch<AiUsageDailyItem[]>(`${AI_BASE}/usage/daily`);
}

export async function fetchAiRecentUsage(limit = 20): Promise<AiUsageRecentItem[]> {
  return authFetch<AiUsageRecentItem[]>(`${AI_BASE}/usage/recent?limit=${limit}`);
}

export async function fetchAiAgents(): Promise<{ items: AiAgentItem[]; total: number }> {
  return authFetch(`${AI_BASE}/agents?limit=50`);
}

export { authFetch, authRawFetch };

/** 适配 ai-ui RawFetchFn 签名 */
export function aiRawFetch(path: string, init?: RequestInit): Promise<Response> {
  return authRawFetch(path, init);
}
