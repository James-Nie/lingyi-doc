/**
 * 第三方扫码登录 API（钉钉 / 飞书）
 */

export type OAuthProviderCode = 'dingtalk' | 'feishu';

export interface OAuthProviderSummary {
  provider: OAuthProviderCode;
  name: string;
}

export interface OAuthBindingSummary {
  provider: OAuthProviderCode;
  providerName: string;
  boundAt: number;
  lastUsedAt: number | null;
}

/** 登录页可用的第三方渠道；未配置或私有化部署时返回空数组 */
export async function fetchOAuthProviders(): Promise<OAuthProviderSummary[]> {
  try {
    const res = await fetch('/api/v1/c/auth/oauth/providers');
    if (!res.ok) return [];
    const json = await res.json() as { code?: number; data?: { items?: OAuthProviderSummary[] } };
    if (json.code !== 0) return [];
    return json.data?.items ?? [];
  } catch {
    return [];
  }
}

/**
 * 发起扫码登录：整页跳转到后端 start 接口，由后端 302 到第三方授权页。
 * 用整页跳转而非 fetch，避免第三方授权域名被 CORS 拦截。
 */
export function startOAuthLogin(provider: OAuthProviderCode, redirectPath = '/'): void {
  const params = new URLSearchParams({ redirect: redirectPath });
  window.location.href = `/api/v1/c/auth/oauth/${provider}/start?${params.toString()}`;
}

/** 解析 OAuth 回调 fragment：成功返回令牌，失败返回错误信息 */
export function parseOAuthCallbackFragment(hash: string): {
  accessToken?: string;
  refreshToken?: string;
  redirect: string;
  error?: string;
} {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  return {
    accessToken: params.get('access_token') ?? undefined,
    refreshToken: params.get('refresh_token') ?? undefined,
    redirect: params.get('redirect') || '/',
    error: params.get('error') ?? undefined,
  };
}

/** 「确认合并」页的 fragment 上下文 */
export interface OAuthBindConfirmContext {
  pendingToken: string;
  providerName: string;
  targetDisplayName: string;
  targetHint: string;
  redirect: string;
}

/** 解析确认合并页 fragment */
export function parseBindConfirmFragment(hash: string): OAuthBindConfirmContext | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  const pendingToken = params.get('pending');
  if (!pendingToken) return null;
  return {
    pendingToken,
    providerName: params.get('provider') || '第三方',
    targetDisplayName: params.get('target') || '',
    targetHint: params.get('hint') || '',
    redirect: params.get('redirect') || '/',
  };
}
