import { authFetch } from '../stores/authStore';

export type McpTokenPreset = 'readonly' | 'editor' | 'full';

export interface McpTokenItem {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  status: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface McpTokenCreateResult {
  id: string;
  name: string;
  plainToken: string;
  scopes: string[];
  expiresAt: string | null;
  warning: string;
}

export interface McpAuditItem {
  id: string;
  method: string;
  toolName: string | null;
  status: string;
  latencyMs: number;
  createdAt: string;
}

export function fetchMcpTokens() {
  return authFetch<McpTokenItem[]>('/api/v1/c/mcp/tokens');
}

export function createMcpToken(body: {
  name: string;
  preset?: McpTokenPreset;
  expiresInDays?: number;
}) {
  return authFetch<McpTokenCreateResult>('/api/v1/c/mcp/tokens', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateMcpToken(
  id: string,
  body: { name?: string; preset?: McpTokenPreset; scopes?: string[] },
) {
  return authFetch<McpTokenItem>(`/api/v1/c/mcp/tokens/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteMcpToken(id: string) {
  return authFetch<{ success: boolean }>(`/api/v1/c/mcp/tokens/${id}`, {
    method: 'DELETE',
  });
}

export function fetchMcpTokenAudit(id: string) {
  return authFetch<McpAuditItem[]>(`/api/v1/c/mcp/tokens/${id}/audit`);
}
