const ACCESS_KEY = 'lingyi_doc_admin_access';
const REFRESH_KEY = 'lingyi_doc_admin_refresh';
const USER_KEY = 'lingyi_doc_admin_user';

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  userType: string;
  status: string;
  roles: Array<{ code: string; name: string }>;
  permissions: string[];
}

interface AuthState {
  user: AdminUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  initialized: boolean;
}

type Listener = () => void;

let state: AuthState = {
  user: null,
  accessToken: localStorage.getItem(ACCESS_KEY),
  refreshToken: localStorage.getItem(REFRESH_KEY),
  initialized: false,
};

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

function persistUser(user: AdminUser | null) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

export async function adminFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  };
  if (state.accessToken) {
    headers.Authorization = `Bearer ${state.accessToken}`;
  }

  const res = await fetch(path, { ...options, headers });
  const json = await res.json();

  if (res.status === 401 && state.refreshToken && !path.includes('/auth/refresh')) {
    await authStore.refresh();
    return adminFetch<T>(path, options);
  }

  if (!res.ok || json.code !== 0) {
    throw new Error(json.message || '请求失败');
  }
  return json.data as T;
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

  hasPermission(code: string) {
    return state.user?.permissions?.includes(code) ?? false;
  },

  async init() {
    if (state.initialized) return;
    const cached = localStorage.getItem(USER_KEY);
    if (cached) {
      try {
        setState({ user: JSON.parse(cached) as AdminUser });
      } catch { /* ignore */ }
    }
    if (state.accessToken) {
      try {
        const user = await adminFetch<AdminUser>('/api/v1/admin/auth/me');
        setState({ user, initialized: true });
        persistUser(user);
        return;
      } catch {
        if (state.refreshToken) {
          try {
            await authStore.refresh();
            setState({ initialized: true });
            return;
          } catch {
            authStore.clear();
          }
        }
      }
    }
    setState({ initialized: true });
  },

  async login(email: string, password: string) {
    const data = await adminFetch<{
      user: AdminUser;
      accessToken: string;
      refreshToken: string;
      roles: Array<{ code: string; name: string }>;
      permissions: string[];
    }>('/api/v1/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const user = { ...data.user, roles: data.roles ?? [], permissions: data.permissions ?? [] };
    persistTokens(data.accessToken, data.refreshToken);
    persistUser(user);
    setState({ user, accessToken: data.accessToken, refreshToken: data.refreshToken });
  },

  async refresh() {
    if (!state.refreshToken) throw new Error('未登录');
    const data = await adminFetch<{
      accessToken: string;
      refreshToken: string;
      permissions?: string[];
      roles?: Array<{ code: string; name: string }>;
    }>('/api/v1/admin/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: state.refreshToken }),
    });
    persistTokens(data.accessToken, data.refreshToken);
    setState({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    const user = await adminFetch<AdminUser>('/api/v1/admin/auth/me');
    persistUser(user);
    setState({ user });
  },

  async logout() {
    if (state.refreshToken) {
      try {
        await adminFetch('/api/v1/admin/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: state.refreshToken }),
        });
      } catch { /* ignore */ }
    }
    authStore.clear();
  },

  clear() {
    persistTokens(null, null);
    persistUser(null);
    setState({ user: null, accessToken: null, refreshToken: null });
  },
};
