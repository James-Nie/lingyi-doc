import { authFetch, authStore } from '../stores/authStore';

export type LoginSessionStatus = 'active' | 'expired' | 'revoked';

export interface LoginSessionItem {
  id: string;
  ip: string | null;
  deviceInfo: string | null;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
  status: LoginSessionStatus;
  isCurrent: boolean;
}

export interface LoginSessionList {
  items: LoginSessionItem[];
}

export async function fetchLoginSessions(): Promise<LoginSessionList> {
  const refreshToken = authStore.getState().refreshToken;
  const headers: Record<string, string> = {};
  if (refreshToken) {
    headers['X-Refresh-Token'] = refreshToken;
  }
  return authFetch<LoginSessionList>('/api/v1/c/auth/login-sessions', { headers });
}
