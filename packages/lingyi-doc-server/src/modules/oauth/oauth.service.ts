import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { DeployService } from '../../config/deploy.service';
import { AuthHelpersService, type AuthTokenResult, type RequestMeta } from '../../services/auth-helpers.service';
import { PasswordCryptoService } from '../../services/password-crypto.service';
import { UserRepository } from '../../repositories/user.repository';
import { UserOauthBindingRepository } from '../../repositories/user-oauth-binding.repository';
import { AccountFusionService } from './account-fusion.service';
import { OAuthStateService } from './oauth-state.service';
import { DingTalkStrategy } from './strategies/dingtalk.strategy';
import { FeishuStrategy } from './strategies/feishu.strategy';
import {
  OAuthError,
  OAUTH_ERROR_CODES,
  type OAuthProviderStrategy,
} from './strategies/oauth-provider.interface';
import type { OAuthProviderCode } from '../../types/database';

export interface OAuthProviderSummary {
  provider: OAuthProviderCode;
  name: string;
}

export interface OAuthCallbackResult {
  /** 302 目标：前端回调页 + fragment 中的令牌 */
  redirectUrl: string;
  /** 需要二次确认时无令牌 */
  tokens?: AuthTokenResult;
  isNewUser: boolean;
  /** true 表示已回跳"确认绑定"页，尚未登录 */
  requiresBindConfirm?: boolean;
}

const PROVIDER_NAMES: Record<OAuthProviderCode, string> = {
  dingtalk: '钉钉',
  feishu: '飞书',
};

const PROVIDER_CODES: OAuthProviderCode[] = ['dingtalk', 'feishu'];

@Injectable()
export class OAuthService implements OnModuleInit {
  private readonly logger = new Logger(OAuthService.name);
  private readonly strategies: Map<OAuthProviderCode, OAuthProviderStrategy>;

  constructor(
    private readonly config: ConfigService,
    private readonly deployService: DeployService,
    private readonly stateService: OAuthStateService,
    private readonly fusionService: AccountFusionService,
    private readonly authHelpers: AuthHelpersService,
    private readonly bindingRepository: UserOauthBindingRepository,
    private readonly userRepository: UserRepository,
    private readonly passwordCrypto: PasswordCryptoService,
    dingtalkStrategy: DingTalkStrategy,
    feishuStrategy: FeishuStrategy,
  ) {
    this.strategies = new Map<OAuthProviderCode, OAuthProviderStrategy>([
      [dingtalkStrategy.code, dingtalkStrategy],
      [feishuStrategy.code, feishuStrategy],
    ]);
  }

  /** 启动时打印装配状态，避免"登录页没入口却查不到原因" */
  onModuleInit(): void {
    this.logAssembly('启动自检');
  }

  private get killSwitchOn(): boolean {
    return this.config.get<boolean>('oauth.enabled', true);
  }

  /** 逐渠道打印：开关 / AppId / AppSecret 是否齐备（不输出密钥内容） */
  private logAssembly(context: string): void {
    const saas = this.deployService.isSaas();
    const lines = PROVIDER_CODES.map((code) => {
      const d = this.strategies.get(code)!.diagnose();
      const missing = [
        !d.flagEnabled && `${code.toUpperCase()}_OAUTH_ENABLED 未开启`,
        d.flagEnabled && !d.hasAppId && 'AppId 缺失',
        d.flagEnabled && !d.hasSecret && 'AppSecret 缺失',
      ].filter(Boolean);
      const state = d.flagEnabled && d.hasAppId && d.hasSecret
        ? '可用'
        : `不可用（${missing.join('、') || '未开启'}）`;
      return `${code}=${state}`;
    });
    this.logger.log(
      `[${context}] 第三方扫码登录 ${this.killSwitchOn && saas ? '已启用' : '未启用'}`
      + `（紧急开关=${this.killSwitchOn ? '开' : '关闭(OAUTH_ENABLED=0)'}，SaaS=${saas}）｜ ${lines.join(' ｜ ')}`,
    );
  }

  /** 总开关 + 紧急关闭：配置未显式关闭且为 SaaS 部署（私有化硬拦截） */
  isEnabled(): boolean {
    return this.killSwitchOn && this.deployService.isSaas();
  }

  isProviderEnabled(code: string): boolean {
    const strategy = this.strategies.get(code as OAuthProviderCode);
    if (!strategy) return false;
    return strategy.isConfigured();
  }

  /** 登录页渲染按钮用：仅返回已启用且凭证完整的渠道 */
  listProviders(): OAuthProviderSummary[] {
    if (!this.isEnabled()) return [];
    const items = PROVIDER_CODES
      .map((code) => this.strategies.get(code))
      .filter((s): s is OAuthProviderStrategy => Boolean(s && s.isConfigured()))
      .map((s) => ({ provider: s.code, name: PROVIDER_NAMES[s.code] }));
    // 一个渠道都没装配好时给出可定位的告警，避免前端静默无按钮
    if (items.length === 0) {
      this.logAssembly('无可用的第三方登录渠道');
      this.logger.warn(
        '登录页将不展示第三方入口。请逐项核对上行的渠道装配状态，'
        + '并确认已重启服务（环境变量改动需重启才会生效）',
      );
    }
    return items;
  }

  /** 发起登录：校验渠道与回跳地址，签发 state，返回第三方授权 URL */
  async startLogin(input: {
    provider: string;
    redirect?: string;
    req: Request;
  }): Promise<{ authorizeUrl: string }> {
    this.assertEnabled();
    const strategy = this.resolveStrategy(input.provider);
    const safeRedirect = this.resolveSafeRedirect(input.redirect);
    const state = await this.stateService.issue(strategy.code, safeRedirect);
    const redirectUri = this.buildCallbackUri(strategy.code, input.req);
    return { authorizeUrl: strategy.buildAuthorizeUrl({ redirectUri, state }) };
  }

  /**
   * 处理回调：校验 state → 换画像 → 账号融合 → 签发 JWT → 回跳前端。
   * 若手机号/邮箱命中既有本地账号，则**不自动合并**，改为回跳"确认绑定"页。
   */
  async handleCallback(input: {
    provider: string;
    code?: string;
    state?: string;
    req: Request;
  }): Promise<OAuthCallbackResult> {
    this.assertEnabled();
    const strategy = this.resolveStrategy(input.provider);

    if (!input.code) {
      throw new OAuthError(OAUTH_ERROR_CODES.CODE_EXCHANGE_FAILED, '缺少授权码', 400);
    }

    const statePayload = await this.stateService.consume(input.state ?? '');
    if (!statePayload) {
      throw new OAuthError(
        OAUTH_ERROR_CODES.STATE_INVALID,
        '登录链接已失效或已被使用，请重新扫码',
        400,
      );
    }
    if (statePayload.provider !== strategy.code) {
      throw new OAuthError(OAUTH_ERROR_CODES.STATE_INVALID, '登录渠道不匹配，请重新扫码', 400);
    }

    const profile = await strategy.exchangeCode({
      code: input.code,
      redirectUri: this.buildCallbackUri(strategy.code, input.req),
    });

    const outcome = await this.fusionService.resolve({
      provider: strategy.code,
      providerAppId: strategy.appId,
      profile,
    });

    // 命中既有本地账号：暂存上下文，回跳确认页要求证明账号所有权
    if (outcome.kind === 'needs-confirm') {
      const pendingToken = await this.stateService.issuePendingBind({
        provider: strategy.code,
        providerAppId: strategy.appId,
        targetUserId: outcome.targetUserId,
        profile,
        redirect: statePayload.redirect,
      });
      this.logger.warn(
        `OAuth 命中既有账号，转二次确认: provider=${strategy.code} target=${outcome.targetUserId}`,
      );
      return {
        redirectUrl: this.buildBindConfirmUrl({
          pendingToken,
          providerName: PROVIDER_NAMES[strategy.code],
          targetDisplayName: outcome.targetDisplayName,
          targetHint: outcome.targetHint,
          redirect: statePayload.redirect,
        }),
        isNewUser: false,
        requiresBindConfirm: true,
      };
    }

    const tokens = await this.authHelpers.issueTokens(
      outcome.user,
      'consumer',
      input.req as unknown as RequestMeta,
    );

    this.logger.log(
      `OAuth 登录成功: user=${outcome.user.id} provider=${strategy.code} matchedBy=${outcome.matchedBy} new=${outcome.isNewUser}`,
    );

    return {
      redirectUrl: this.buildFrontendRedirectUrl(tokens, statePayload.redirect),
      tokens,
      isNewUser: outcome.isNewUser,
    };
  }

  /**
   * 二次确认：用户输入既有本地账号的密码以证明所有权，通过后建立绑定并登录。
   * 密码比对沿用登录链路的 RSA 解密 + bcrypt 校验。
   */
  async confirmPendingBind(input: {
    pendingToken: string;
    encryptedPassword: string;
    req: Request;
  }): Promise<{ redirectUrl: string; tokens: AuthTokenResult }> {
    this.assertEnabled();

    const pending = await this.stateService.consumePendingBind(input.pendingToken);
    if (!pending) {
      throw new OAuthError(
        OAUTH_ERROR_CODES.STATE_INVALID,
        '确认链接已失效，请重新扫码',
        400,
      );
    }

    const target = await this.userRepository.findById(pending.targetUserId);
    if (!target) {
      throw new OAuthError(OAUTH_ERROR_CODES.STATE_INVALID, '目标账号不存在', 400);
    }
    // 无本地密码的账号无法用密码证明所有权，拒绝合并（防接管）
    if (!target.password_hash) {
      throw new OAuthError(
        OAUTH_ERROR_CODES.STATE_INVALID,
        '该账号未设置密码，请先用原登录方式进入后，在「账号设置 → 第三方账号」中主动绑定',
        400,
      );
    }

    const plainPassword = this.passwordCrypto.decryptPassword(input.encryptedPassword, 'password');
    const matched = await bcrypt.compare(plainPassword, target.password_hash);
    if (!matched) {
      throw new OAuthError(OAUTH_ERROR_CODES.STATE_INVALID, '密码错误，无法完成合并', 400);
    }

    const user = await this.fusionService.confirmBind({
      targetUserId: pending.targetUserId,
      provider: pending.provider,
      providerAppId: pending.providerAppId,
      profile: pending.profile,
    });

    const tokens = await this.authHelpers.issueTokens(
      user,
      'consumer',
      input.req as unknown as RequestMeta,
    );

    this.logger.log(
      `OAuth 二次确认完成并登录: user=${user.id} provider=${pending.provider}`,
    );

    return {
      redirectUrl: this.buildFrontendRedirectUrl(tokens, pending.redirect),
      tokens,
    };
  }

  /** 当前用户已绑定的第三方渠道 */
  async listBindings(userId: string): Promise<Array<{
    provider: OAuthProviderCode;
    providerName: string;
    boundAt: number;
    lastUsedAt: number | null;
  }>> {
    const bindings = await this.bindingRepository.listByUserId(userId);
    return bindings.map((b) => ({
      provider: b.provider,
      providerName: PROVIDER_NAMES[b.provider] ?? b.provider,
      boundAt: b.bound_at.getTime(),
      lastUsedAt: b.last_used_at ? b.last_used_at.getTime() : null,
    }));
  }

  private assertEnabled(): void {
    if (!this.isEnabled()) {
      throw new OAuthError(
        OAUTH_ERROR_CODES.DISABLED,
        '当前环境未开放第三方扫码登录',
        404,
      );
    }
  }

  private resolveStrategy(provider: string): OAuthProviderStrategy {
    const strategy = this.strategies.get(provider as OAuthProviderCode);
    if (!strategy) {
      throw new OAuthError(OAUTH_ERROR_CODES.PROVIDER_UNKNOWN, '不支持的登录渠道', 400);
    }
    if (!strategy.isConfigured()) {
      throw new OAuthError(
        OAUTH_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        `${PROVIDER_NAMES[strategy.code]}登录未配置，请联系管理员`,
        400,
      );
    }
    return strategy;
  }

  /**
   * 回跳地址白名单校验：只允许站内相对路径，
   * 拒绝绝对地址与协议相对地址（//evil.com），避免开放重定向
   */
  resolveSafeRedirect(redirect?: string): string {
    const fallback = '/';
    if (!redirect) return fallback;
    if (!redirect.startsWith('/') || redirect.startsWith('//')) return fallback;
    if (redirect.includes('\\') || redirect.includes('://')) return fallback;

    const allowlist = this.config.get<string[]>('oauth.redirectAllowlist', ['/']);
    if (allowlist.includes('/')) return redirect;

    const path = redirect.split('?')[0];
    const allowed = allowlist.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
    if (!allowed) {
      this.logger.warn(`OAuth 回跳路径不在白名单，已降级为 /: ${redirect}`);
      return fallback;
    }
    return redirect;
  }

  /**
   * 第三方回调地址，**必须与开放平台后台登记的回调域名一致**，否则第三方会返回
   * 「应用不存在 / redirect_uri 不匹配」这类与代码无关的错误。
   * 经 vite dev 代理访问时 Host 会变成后端端口（:3000），与开放平台登记的
   * 前端端口（:5173）不一致，故本地联调必须显式配置 OAUTH_CALLBACK_BASE_URL。
   */
  buildCallbackUri(provider: OAuthProviderCode, req: Request): string {
    const configured = this.config.get<string>('oauth.callbackBaseUrl', '');
    const base = configured || this.deriveBaseFromRequest(req);
    return `${base.replace(/\/$/, '')}/api/v1/c/auth/oauth/${provider}/callback`;
  }

  /** 请求头推导兜底：仅在未配置 OAUTH_CALLBACK_BASE_URL 时使用 */
  private deriveBaseFromRequest(req: Request): string {
    const headerProto = req.headers['x-forwarded-proto'];
    const headerHost = req.headers['x-forwarded-host'];
    const proto = (Array.isArray(headerProto) ? headerProto[0] : headerProto)?.split(',')[0]?.trim()
      || req.protocol
      || 'http';
    const host = (Array.isArray(headerHost) ? headerHost[0] : headerHost)?.split(',')[0]?.trim()
      || req.headers.host
      || 'localhost';
    return `${proto}://${host}`;
  }

  /**
   * 令牌放在 URL fragment（不会被浏览器/代理日志记录），
   * 前端回调页读取后立即写入本地存储并清空地址
   */
  private buildFrontendRedirectUrl(tokens: AuthTokenResult, redirectPath: string): string {
    const webBase = this.config.get<string>('oauth.webBaseUrl', '').replace(/\/$/, '');
    const params = new URLSearchParams({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      redirect: redirectPath,
    });
    return `${webBase}/oauth/callback#${params.toString()}`;
  }

  /**
   * 命中既有账号时的回跳：带上一次性 pending token 与目标账号提示信息，
   * 由前端"确认绑定"页要求用户输入该账号密码后才完成合并。
   */
  private buildBindConfirmUrl(input: {
    pendingToken: string;
    providerName: string;
    targetDisplayName: string;
    targetHint: string;
    redirect: string;
  }): string {
    const webBase = this.config.get<string>('oauth.webBaseUrl', '').replace(/\/$/, '');
    const params = new URLSearchParams({
      pending: input.pendingToken,
      provider: input.providerName,
      target: input.targetDisplayName,
      hint: input.targetHint,
      redirect: input.redirect,
    });
    return `${webBase}/oauth/bind-confirm#${params.toString()}`;
  }
}
