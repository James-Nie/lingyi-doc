import { encryptPasswordForAuth, clearPasswordCryptoCache } from '../utils/passwordCrypto';

const ACCESS_KEY = 'lingyi_doc_c_access';
const REFRESH_KEY = 'lingyi_doc_c_refresh';
const USER_KEY = 'lingyi_doc_c_user';
const SESSION_KEY = 'lingyi_doc_c_session';
const TENANTS_KEY = 'lingyi_doc_c_tenants';
const REMEMBER_EMAIL_KEY = 'lingyi_doc_c_remember_email';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  userType: string;
  userSource?: number;
  status: string;
  createdAt?: number;
  lastLoginAt?: number | null;
}

export type IdentityType = 'personal' | 'tenant';

export interface SessionInfo {
  userSource: number;
  currentIdentityType: IdentityType;
  currentTenantId: string | null;
  tenantRole: number | null;
  deployType: number;
  accountMode: number;
  allowMultiTenantSwitch: boolean;
}

export interface TenantSummary {
  id: string;
  name: string;
  tenantRole: number;
  isAllowMultiSwitch: boolean;
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
    documents: { used: number; limit: number | null; percent: number | null };
    storageBytes: { used: number; limit: number | null; percent: number | null };
    dailyExports: { used: number; limit: number | null; percent: number | null };
    members: { used: number; limit: number | null; percent: number | null } | null;
  };
  features: Record<string, boolean>;
}

interface AuthState {
  user: AuthUser | null;
  session: SessionInfo | null;
  tenants: TenantSummary[];
  membershipSummary: MembershipSummary | null;
  accessToken: string | null;
  refreshToken: string | null;
  initialized: boolean;
}

type Listener = () => void;

let state: AuthState = {
  user: null,
  session: null,
  tenants: [],
  membershipSummary: null,
  accessToken: localStorage.getItem(ACCESS_KEY),
  refreshToken: localStorage.getItem(REFRESH_KEY),
  initialized: false,
};

let refreshPromise: Promise<boolean> | null = null;
let sessionExpiredHandler: (() => void) | null = null;
let workspaceRevision = 0;

function bumpWorkspaceRevision() {
  workspaceRevision += 1;
}

const listeners = new Set<Listener>();

function emit() {
  listeners.forEach(fn => fn());
}

function setState(patch: Partial<AuthState>) {
  state = { ...state, ...patch };
  emit();
}

function persistTokens(accessToken: string | null, refreshToken: string | null) {
  if (accessToken) localStorage.setItem(ACCESS_KEY, accessToken);
  else localStorage.removeItem(ACCESS_KEY);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  else localStorage.removeItem(REFRESH_KEY);
}

function persistUser(user: AuthUser | null) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

function persistSession(session: SessionInfo | null) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

function persistTenants(tenants: TenantSummary[]) {
  if (tenants.length) localStorage.setItem(TENANTS_KEY, JSON.stringify(tenants));
  else localStorage.removeItem(TENANTS_KEY);
}

function applyAuthPayload(data: {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  session?: SessionInfo;
  tenants?: TenantSummary[];
}) {
  persistTokens(data.accessToken, data.refreshToken);
  persistUser(data.user);
  if (data.session) persistSession(data.session);
  if (data.tenants) persistTenants(data.tenants);
  setState({
    user: data.user,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    session: data.session ?? state.session,
    tenants: data.tenants ?? state.tenants,
  });
}

function isAuthErrorCode(code: number): boolean {
  return code === 110001 || code === 110002 || code === 110004;
}

async function parseResponse<T>(res: Response): Promise<{ ok: boolean; data?: T; code: number; message?: string }> {
  let json: { code?: number; data?: T; message?: string };
  try {
    json = await res.json();
  } catch {
    return { ok: false, code: res.status, message: `请求失败 (${res.status})` };
  }
  const code = json.code ?? res.status;
  return {
    ok: res.ok && code === 0,
    data: json.data,
    code,
    message: json.message,
  };
}

function isPasswordDecryptError(message?: string): boolean {
  return !!message?.includes('解密失败');
}

/** 带 Token 的请求；401 时自动 refresh 并重试一次 */
export async function authFetch<T>(path: string, options?: RequestInit, retried = false): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  };
  if (state.accessToken) {
    headers.Authorization = `Bearer ${state.accessToken}`;
  }

  const res = await fetch(path, { ...options, headers });
  const parsed = await parseResponse<T>(res);

  if (!parsed.ok) {
    if (!retried && isAuthErrorCode(parsed.code)) {
      const refreshed = await authStore.tryRefresh();
      if (refreshed) return authFetch<T>(path, options, true);
      sessionExpiredHandler?.();
    }
    throw new Error(parsed.message || '请求失败');
  }

  return parsed.data as T;
}

export const authStore = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getState() {
    return state;
  },

  getAccessToken() {
    return state.accessToken;
  },

  getWorkspaceRevision() {
    return workspaceRevision;
  },

  isAuthenticated() {
    return Boolean(state.accessToken);
  },

  getRememberedEmail() {
    return localStorage.getItem(REMEMBER_EMAIL_KEY) || '';
  },

  setRememberedEmail(email: string | null) {
    if (email) localStorage.setItem(REMEMBER_EMAIL_KEY, email);
    else localStorage.removeItem(REMEMBER_EMAIL_KEY);
  },

  setSessionExpiredHandler(handler: (() => void) | null) {
    sessionExpiredHandler = handler;
  },

  async init() {
    if (state.initialized) return;

    const cachedUser = localStorage.getItem(USER_KEY);
    const cachedSession = localStorage.getItem(SESSION_KEY);
    const cachedTenants = localStorage.getItem(TENANTS_KEY);
    if (cachedUser) {
      try {
        setState({
          user: JSON.parse(cachedUser) as AuthUser,
          session: cachedSession ? JSON.parse(cachedSession) as SessionInfo : null,
          tenants: cachedTenants ? JSON.parse(cachedTenants) as TenantSummary[] : [],
        });
      } catch {
        /* ignore */
      }
    }

    if (state.accessToken) {
      try {
        const me = await authFetch<AuthUser & { session: SessionInfo; tenants: TenantSummary[] }>('/api/v1/c/auth/me');
        const { session, tenants, ...user } = me;
        persistUser(user);
        persistSession(session);
        persistTenants(tenants ?? []);
        setState({ user, session, tenants: tenants ?? [], initialized: true });
        await authStore.refreshMembership();
        return;
      } catch {
        if (state.refreshToken) {
          const ok = await authStore.tryRefresh();
          if (ok) {
            setState({ initialized: true });
            return;
          }
        }
        authStore.clear();
      }
    }

    setState({ initialized: true });
  },

  async tryRefresh(): Promise<boolean> {
    if (!state.refreshToken) return false;
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      try {
        const res = await fetch('/api/v1/c/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: state.refreshToken }),
        });
        const parsed = await parseResponse<{
          accessToken: string;
          refreshToken: string;
          session?: SessionInfo;
          tenants?: TenantSummary[];
        }>(res);
        if (!parsed.ok || !parsed.data) return false;

        persistTokens(parsed.data.accessToken, parsed.data.refreshToken);
        setState({
          accessToken: parsed.data.accessToken,
          refreshToken: parsed.data.refreshToken,
          session: parsed.data.session ?? state.session,
          tenants: parsed.data.tenants ?? state.tenants,
        });

        const me = await authFetch<AuthUser & { session: SessionInfo; tenants: TenantSummary[] }>('/api/v1/c/auth/me');
        const { session, tenants, ...user } = me;
        persistUser(user);
        persistSession(session);
        persistTenants(tenants ?? []);
        setState({ user, session, tenants: tenants ?? [] });
        await authStore.refreshMembership();
        return true;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  },

  async login(account: string, password: string, rememberAccount = true) {
    const trimmed = account.trim();
    const normalizedAccount = /^1[3-9]\d{9}$/.test(trimmed.replace(/[\s-]/g, ''))
      ? trimmed.replace(/[\s-]/g, '')
      : trimmed.toLowerCase();

    const attempt = async () => {
      const encryptedPassword = await encryptPasswordForAuth(password);
      const res = await fetch('/api/v1/c/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: normalizedAccount, password: encryptedPassword }),
      });
      return parseResponse<{
        user: AuthUser;
        accessToken: string;
        refreshToken: string;
        session: SessionInfo;
        tenants?: TenantSummary[];
      }>(res);
    };

    let parsed = await attempt();
    if (!parsed.ok && isPasswordDecryptError(parsed.message)) {
      clearPasswordCryptoCache();
      parsed = await attempt();
    }
    if (!parsed.ok || !parsed.data) {
      throw new Error(parsed.message || '登录失败');
    }

    applyAuthPayload(parsed.data);
    await authStore.refreshMembership();

    if (rememberAccount) authStore.setRememberedEmail(normalizedAccount);
    else authStore.setRememberedEmail(null);

    return parsed.data.user;
  },

  async register(
    email: string,
    password: string,
    displayName: string,
    phone: string,
    verificationToken: string,
  ) {
    const encryptedPassword = await encryptPasswordForAuth(password);
    const res = await fetch('/api/v1/c/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password: encryptedPassword,
        displayName: displayName.trim(),
        phone: phone.trim(),
        verificationToken,
      }),
    });
    const parsed = await parseResponse<{
      user: AuthUser;
      accessToken: string;
      refreshToken: string;
      session: SessionInfo;
      tenants?: TenantSummary[];
    }>(res);
    if (!parsed.ok || !parsed.data) {
      throw new Error(parsed.message || '注册失败');
    }

    applyAuthPayload(parsed.data);
    await authStore.refreshMembership();
    authStore.setRememberedEmail(email.trim().toLowerCase());
    return parsed.data.user;
  },

  async switchIdentity(identityType: IdentityType, tenantId?: string) {
    const res = await fetch('/api/v1/c/auth/switch-identity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.accessToken}`,
      },
      body: JSON.stringify({
        identityType,
        tenantId,
        refreshToken: state.refreshToken,
      }),
    });
    const parsed = await parseResponse<{
      user: AuthUser;
      accessToken: string;
      refreshToken: string;
      session: SessionInfo;
      tenants?: TenantSummary[];
    }>(res);
    if (!parsed.ok || !parsed.data) {
      throw new Error(parsed.message || '切换身份失败');
    }
    applyAuthPayload(parsed.data);
    await authStore.refreshMembership();
    bumpWorkspaceRevision();
    emit();
    return parsed.data;
  },

  async createTenant(name: string) {
    const data = await authFetch<{
      id: string;
      name: string;
      tenantRole: number;
      isAllowMultiSwitch: boolean;
    }>('/api/v1/c/tenants', {
      method: 'POST',
      body: JSON.stringify({ name: name.trim() }),
    });
    await authStore.refreshMe();
    return data;
  },

  async refreshMe() {
    const me = await authFetch<AuthUser & { session: SessionInfo; tenants: TenantSummary[] }>('/api/v1/c/auth/me');
    const { session, tenants, ...user } = me;
    persistUser(user);
    persistSession(session);
    persistTenants(tenants ?? []);
    setState({ user, session, tenants: tenants ?? [] });
    await authStore.refreshMembership();
    return me;
  },

  async refreshMembership() {
    if (!state.accessToken) {
      setState({ membershipSummary: null });
      return null;
    }
    try {
      const summary = await authFetch<MembershipSummary>('/api/v1/c/membership/summary');
      setState({ membershipSummary: summary });
      return summary;
    } catch {
      setState({ membershipSummary: null });
      return null;
    }
  },

  async refresh() {
    const ok = await authStore.tryRefresh();
    if (!ok) throw new Error('登录已过期，请重新登录');
  },

  async updateProfile(patch: { displayName?: string; avatarUrl?: string | null }) {
    const user = await authFetch<AuthUser>('/api/v1/c/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
    persistUser(user);
    setState({ user });
    return user;
  },

  async changePassword(oldPassword: string, newPassword: string) {
    const [encryptedOld, encryptedNew] = await Promise.all([
      encryptPasswordForAuth(oldPassword),
      encryptPasswordForAuth(newPassword),
    ]);
    await authFetch('/api/v1/c/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ oldPassword: encryptedOld, newPassword: encryptedNew }),
    });
  },

  async logout() {
    if (state.refreshToken) {
      try {
        await fetch('/api/v1/c/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: state.refreshToken }),
        });
      } catch {
        /* ignore */
      }
    }
    authStore.clear();
  },

  clear() {
    persistTokens(null, null);
    persistUser(null);
    persistSession(null);
    persistTenants([]);
    setState({ user: null, session: null, tenants: [], membershipSummary: null, accessToken: null, refreshToken: null });
  },
};
