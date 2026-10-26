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

const AUTHORIZE_URL = 'https://login.dingtalk.com/oauth2/auth';
const USER_ACCESS_TOKEN_URL = 'https://api.dingtalk.com/v1.0/oauth2/userAccessToken';
const USER_INFO_URL = 'https://api.dingtalk.com/v1.0/contact/users/me';
const REQUEST_TIMEOUT_MS = 8000;

interface DingTalkTokenResponse {
  accessToken?: string;
  refreshToken?: string;
  expireIn?: number;
  corpId?: string;
}

interface DingTalkUserResponse {
  nick?: string;
  avatarUrl?: string;
  mobile?: string;
  openId?: string;
  unionId?: string;
  email?: string;
  stateCode?: string;
}

@Injectable()
export class DingTalkStrategy implements OAuthProviderStrategy {
  readonly code: OAuthProviderCode = 'dingtalk';
  private readonly logger = new Logger(DingTalkStrategy.name);

  constructor(private readonly config: ConfigService) {}

  get appId(): string {
    return this.config.get<string>('oauth.dingtalk.appKey', '');
  }

  private get appSecret(): string {
    return this.config.get<string>('oauth.dingtalk.appSecret', '');
  }

  isConfigured(): boolean {
    return Boolean(
      this.config.get<boolean>('oauth.dingtalk.enabled', false) && this.appId && this.appSecret,
    );
  }

  diagnose(): OAuthProviderDiagnostics {
    return {
      flagEnabled: this.config.get<boolean>('oauth.dingtalk.enabled', false),
      hasAppId: Boolean(this.appId),
      hasSecret: Boolean(this.appSecret),
    };
  }

  buildAuthorizeUrl(input: BuildAuthorizeUrlInput): string {
    const params = new URLSearchParams({
      redirect_uri: input.redirectUri,
      response_type: 'code',
      client_id: this.appId,
      scope: 'openid',
      state: input.state,
      prompt: 'consent',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeCode(input: ExchangeCodeInput): Promise<OAuthExternalProfile> {
    const accessToken = await this.fetchUserAccessToken(input.code);
    const profile = await this.fetchUserProfile(accessToken);

    if (!profile.openId) {
      throw new OAuthError(
        OAUTH_ERROR_CODES.PROFILE_UNAVAILABLE,
        '钉钉未返回用户标识（openId）',
        502,
      );
    }

    return {
      providerUserId: profile.openId,
      providerUnionId: profile.unionId ?? null,
      displayName: profile.nick?.trim() || '钉钉用户',
      avatarUrl: profile.avatarUrl ?? null,
      mobile: this.normalizeMobile(profile.mobile),
      email: profile.email?.trim().toLowerCase() || null,
      raw: profile as Record<string, unknown>,
    };
  }

  private async fetchUserAccessToken(code: string): Promise<string> {
    const data = await this.postJson<DingTalkTokenResponse>(USER_ACCESS_TOKEN_URL, {
      clientId: this.appId,
      clientSecret: this.appSecret,
      code,
      grantType: 'authorization_code',
    });
    if (!data.accessToken) {
      throw new OAuthError(
        OAUTH_ERROR_CODES.CODE_EXCHANGE_FAILED,
        '钉钉授权码换取 access_token 失败',
        502,
      );
    }
    return data.accessToken;
  }

  private async fetchUserProfile(accessToken: string): Promise<DingTalkUserResponse> {
    return this.getJson<DingTalkUserResponse>(USER_INFO_URL, {
      'x-acs-dingtalk-access-token': accessToken,
    });
  }

  private async postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async getJson<T>(url: string, headers: Record<string, string>): Promise<T> {
    return this.request<T>(url, { method: 'GET', headers });
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const text = await response.text();
      if (!response.ok) {
        this.logger.error(`DingTalk API ${response.status}: ${text}`);
        throw new OAuthError(
          OAUTH_ERROR_CODES.PROVIDER_UNREACHABLE,
          '钉钉接口调用失败，请稍后重试',
          502,
        );
      }
      return JSON.parse(text) as T;
    } catch (err) {
      if (err instanceof OAuthError) throw err;
      this.logger.error(`DingTalk API error: ${(err as Error).message}`);
      throw new OAuthError(
        OAUTH_ERROR_CODES.PROVIDER_UNREACHABLE,
        '钉钉接口调用失败，请稍后重试',
        502,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** 钉钉手机号可能带国际区号或不带，统一为纯数字 */
  private normalizeMobile(mobile?: string | null): string | null {
    if (!mobile) return null;
    const digits = mobile.replace(/[\s-]/g, '').replace(/^\+?86/, '');
    return digits || null;
  }
}
