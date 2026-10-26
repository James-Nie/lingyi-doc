import type { OAuthProviderCode } from '../../../types/database';

/** 第三方授权返回的用户画像（已归一化） */
export interface OAuthExternalProfile {
  /** 应用级用户标识：钉钉 openId / 飞书 open_id（唯一键组成部分） */
  providerUserId: string;
  /** 企业级用户标识：钉钉 unionId / 飞书 union_id（辅助去重，可能为空） */
  providerUnionId: string | null;
  displayName: string;
  avatarUrl: string | null;
  mobile: string | null;
  email: string | null;
  /** 原始响应快照，落库用于排查 */
  raw: Record<string, unknown>;
}

export interface BuildAuthorizeUrlInput {
  redirectUri: string;
  state: string;
}

export interface ExchangeCodeInput {
  code: string;
  redirectUri: string;
}

/** 渠道装配状态，用于启动日志与排障（绝不包含密钥明文） */
export interface OAuthProviderDiagnostics {
  /** 渠道开关 X_OAUTH_ENABLED */
  flagEnabled: boolean;
  hasAppId: boolean;
  hasSecret: boolean;
}

/** 第三方登录渠道策略：新增渠道只需实现该接口并注册到 OAuthService */
export interface OAuthProviderStrategy {
  readonly code: OAuthProviderCode;
  /** 钉钉 AppKey / 飞书 AppId，写入绑定表用于多应用隔离 */
  readonly appId: string;
  /** 是否已配置完整凭证（未配置则登录页不展示、接口不可用） */
  isConfigured(): boolean;
  diagnose(): OAuthProviderDiagnostics;
  buildAuthorizeUrl(input: BuildAuthorizeUrlInput): string;
  /** 服务端用 code 换取用户画像（浏览器不接触第三方 token） */
  exchangeCode(input: ExchangeCodeInput): Promise<OAuthExternalProfile>;
}

/** 第三方登录链路错误 */
export class OAuthError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
    this.name = 'OAuthError';
  }
}

export const OAUTH_ERROR_CODES = {
  DISABLED: 130001,
  PROVIDER_UNKNOWN: 130002,
  PROVIDER_NOT_CONFIGURED: 130003,
  STATE_INVALID: 130004,
  CODE_EXCHANGE_FAILED: 130005,
  PROFILE_UNAVAILABLE: 130006,
  REDIRECT_NOT_ALLOWED: 130007,
  PROVIDER_UNREACHABLE: 130008,
  PRIVATE_DEPLOY_FORBIDDEN: 130009,
} as const;
