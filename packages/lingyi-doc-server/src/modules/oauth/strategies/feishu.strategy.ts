import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OAuthProviderCode } from '../../../types/database';
import {
  OAuthError,
  OAUTH_ERROR_CODES,
  type BuildAuthorizeUrlInput,
  type ExchangeCodeInput,
  type OAuthExternalProfile,
  type OAuthProviderDiagnostics,
  type OAuthProviderStrategy,
} from './oauth-provider.interface';

const AUTHORIZE_URL = 'https://accounts.feishu.cn/open-apis/authen/v1/authorize';
const TOKEN_URL = 'https://open.feishu.cn/open-apis/authen/v2/oauth/token';
const USER_INFO_URL = 'https://open.feishu.cn/open-apis/authen/v1/user_info';
const REQUEST_TIMEOUT_MS = 8000;

interface FeishuTokenResponse {
  code?: number;
  error?: string;
  error_description?: string;
  access_token?: string;
  accessToken?: string;
}

interface FeishuUserInfoData {
  name?: string;
  avatar_url?: string;
  avatarUrl?: string;
  open_id?: string;
  openId?: string;
  union_id?: string;
  unionId?: string;
  email?: string;
  enterprise_email?: string;
  mobile?: string;
}

interface FeishuUserInfoResponse {
  code?: number;
  msg?: string;
  data?: FeishuUserInfoData;
}

@Injectable()
export class FeishuStrategy implements OAuthProviderStrategy {
  readonly code: OAuthProviderCode = 'feishu';
  private readonly logger = new Logger(FeishuStrategy.name);

  constructor(private readonly config: ConfigService) {}

  get appId(): string {
    return this.config.get<string>('oauth.feishu.appId', '');
  }

  private get appSecret(): string {
    return this.config.get<string>('oauth.feishu.appSecret', '');
  }

  isConfigured(): boolean {
    return Boolean(
      this.config.get<boolean>('oauth.feishu.enabled', false) && this.appId && this.appSecret,
    );
  }

  diagnose(): OAuthProviderDiagnostics {
    return {
      flagEnabled: this.config.get<boolean>('oauth.feishu.enabled', false),
      hasAppId: Boolean(this.appId),
      hasSecret: Boolean(this.appSecret),
    };
  }

  buildAuthorizeUrl(input: BuildAuthorizeUrlInput): string {
    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: input.redirectUri,
      response_type: 'code',
      state: input.state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeCode(input: ExchangeCodeInput): Promise<OAuthExternalProfile> {
    const accessToken = await this.fetchUserAccessToken(input.code, input.redirectUri);
    const info = await this.fetchUserProfile(accessToken);
    const openId = info.open_id ?? info.openId;

    if (!openId) {
      throw new OAuthError(
        OAUTH_ERROR_CODES.PROFILE_UNAVAILABLE,
        '飞书未返回用户标识（open_id）',
        502,
      );
    }

    return {
      providerUserId: openId,
      providerUnionId: info.union_id ?? info.unionId ?? null,
      displayName: info.name?.trim() || '飞书用户',
      avatarUrl: info.avatar_url ?? info.avatarUrl ?? null,
      mobile: this.normalizeMobile(info.mobile),
      email: (info.enterprise_email ?? info.email)?.trim().toLowerCase() || null,
      raw: info as Record<string, unknown>,
    };
  }

  private async fetchUserAccessToken(code: string, redirectUri: string): Promise<string> {
    const data = await this.request<FeishuTokenResponse>(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: this.appId,
        client_secret: this.appSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    // 飞书 v2 令牌接口失败时返回 error/error_description，成功无 code 或 code=0
    if (data.error) {
      this.logger.error(`Feishu token error: ${data.error} ${data.error_description ?? ''}`);
      throw new OAuthError(
        OAUTH_ERROR_CODES.CODE_EXCHANGE_FAILED,
        '飞书授权码换取 access_token 失败',
        502,
      );
    }
    const accessToken = data.access_token ?? data.accessToken;
    if (!accessToken) {
      throw new OAuthError(
        OAUTH_ERROR_CODES.CODE_EXCHANGE_FAILED,
        '飞书授权码换取 access_token 失败',
        502,
      );
    }
    return accessToken;
  }

  private async fetchUserProfile(accessToken: string): Promise<FeishuUserInfoData> {
    const data = await this.request<FeishuUserInfoResponse>(USER_INFO_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (data.code !== undefined && data.code !== 0) {
      this.logger.error(`Feishu user_info error: ${data.code} ${data.msg ?? ''}`);
      throw new OAuthError(
        OAUTH_ERROR_CODES.PROFILE_UNAVAILABLE,
        '飞书获取用户信息失败',
        502,
      );
    }
    return data.data ?? {};
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const text = await response.text();
      if (!response.ok) {
        this.logger.error(`Feishu API ${response.status}: ${text}`);
        throw new OAuthError(
          OAUTH_ERROR_CODES.PROVIDER_UNREACHABLE,
          '飞书接口调用失败，请稍后重试',
          502,
        );
      }
      return JSON.parse(text) as T;
    } catch (err) {
      if (err instanceof OAuthError) throw err;
      this.logger.error(`Feishu API error: ${(err as Error).message}`);
      throw new OAuthError(
        OAUTH_ERROR_CODES.PROVIDER_UNREACHABLE,
        '飞书接口调用失败，请稍后重试',
        502,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private normalizeMobile(mobile?: string | null): string | null {
    if (!mobile) return null;
    const digits = mobile.replace(/[\s-]/g, '').replace(/^\+?86/, '');
    return digits || null;
  }
}
