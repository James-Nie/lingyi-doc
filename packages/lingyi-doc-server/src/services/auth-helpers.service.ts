import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { DeployService } from '../config/deploy.service';
import { TRIAL_DAYS_PERSONAL } from '../modules/membership/membership-policy';
import { UserRepository } from '../repositories/user.repository';
import { AuthSessionRepository } from '../repositories/auth-session.repository';
import { AdminRoleRepository } from '../repositories/admin-role.repository';
import { SystemConfigRepository } from '../repositories/system-config.repository';
import { TenantRepository } from '../repositories/tenant.repository';
import { TenantMemberRepository } from '../repositories/tenant-member.repository';
import { AuthService, type TokenAudience } from './auth.service';
import { SessionService } from './session.service';
import { SmsVerificationService } from './sms-verification.service';
import { isValidPhone } from '../constants/demoRequest';
import type { DbUser, PublicUser } from '../types/database';
import type { ConsumerSessionContext, SessionInfo, TenantSummary } from '../types/session';

export interface RequestMeta {
  headers: Record<string, unknown>;
  socket?: { remoteAddress?: string };
}

export interface AuthTokenResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  session: SessionInfo;
  tenants?: TenantSummary[];
  roles?: Array<{ code: string; name: string }>;
  permissions?: string[];
}

export class AuthError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export function authErrorStatus(code: number): number {
  if (code === 100002) return 400;
  if (code >= 120001 && code <= 120007) return 401;
  if (code >= 120008 && code <= 120011) return 400;
  return 400;
}

@Injectable()
export class AuthHelpersService {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly config: ConfigService,
    private readonly deployService: DeployService,
    private readonly userRepository: UserRepository,
    private readonly authSessionRepository: AuthSessionRepository,
    private readonly adminRoleRepository: AdminRoleRepository,
    private readonly systemConfigRepository: SystemConfigRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly tenantMemberRepository: TenantMemberRepository,
    private readonly smsVerification: SmsVerificationService,
  ) {}

  private refreshExpiresAt(audience: TokenAudience): Date {
    const ttl = audience === 'admin'
      ? this.config.get<number>('jwt.adminRefreshTtl', 604800)
      : this.config.get<number>('jwt.consumerRefreshTtl', 2592000);
    return new Date(Date.now() + ttl * 1000);
  }

  async issueTokens(
    user: DbUser,
    audience: TokenAudience,
    req: RequestMeta,
    sessionOverride?: ConsumerSessionContext,
  ): Promise<AuthTokenResult> {
    const refreshToken = this.authService.signRefreshToken(user.id, audience);
    const session = sessionOverride ?? this.sessionService.buildConsumerSession({
      userSource: (user.user_source ?? this.deployService.defaultUserSource()) as 1 | 2,
    });

    await this.authSessionRepository.create({
      userId: user.id,
      refreshToken,
      clientType: audience,
      expiresAt: this.refreshExpiresAt(audience),
      ip: this.authService.getClientIp(req),
      deviceInfo: this.authService.getUserAgent(req),
      sessionContext: audience === 'consumer' ? session : null,
    });

    const publicUser = this.userRepository.toPublicUser(user);

    if (audience === 'admin') {
      const roles = await this.adminRoleRepository.getUserRoles(user.id);
      const permissions = await this.adminRoleRepository.getUserPermissions(user.id);
      const accessToken = this.authService.signAccessToken({
        sub: user.id,
        email: user.email,
        aud: 'admin',
        userType: 'admin',
        roles: roles.map((r) => r.code),
        permissions,
      });
      return {
        user: publicUser,
        accessToken,
        refreshToken,
        session: this.sessionService.sessionInfoFrom(session),
        roles,
        permissions,
      };
    }

    const accessToken = this.authService.signAccessToken({
      sub: user.id,
      email: user.email,
      aud: 'consumer',
      userType: user.user_type,
      ...this.sessionService.sessionToTokenClaims(session),
    });

    const tenants = await this.tenantRepository.listForUser(user.id);
    return {
      user: publicUser,
      accessToken,
      refreshToken,
      session: this.sessionService.sessionInfoFrom(session),
      tenants,
    };
  }

  async registerConsumer(input: {
    email: string;
    password: string;
    displayName: string;
    phone: string;
    verificationToken: string;
    req: RequestMeta;
  }): Promise<AuthTokenResult> {
    const registerEnabled = await this.systemConfigRepository.getValue('auth.register_enabled', true);
    if (!registerEnabled) {
      throw new AuthError(120003, '当前未开放注册');
    }

    const pwdError = this.authService.validatePassword(input.password);
    if (pwdError) throw new AuthError(100002, pwdError);

    const phone = this.smsVerification.assertVerificationToken(
      input.verificationToken,
      'register',
      input.phone,
    );

    const existingPhone = await this.userRepository.findByPhone(phone);
    if (existingPhone) throw new AuthError(120007, '手机号已注册');

    const existing = await this.userRepository.findByEmail(input.email);
    if (existing) throw new AuthError(120002, '邮箱已注册');

    const passwordHash = await bcrypt.hash(input.password, 12);
    const personalTrialExpire = this.deployService.isSaas()
      ? (() => {
        const d = new Date();
        d.setDate(d.getDate() + TRIAL_DAYS_PERSONAL);
        return d;
      })()
      : null;

    const user = await this.userRepository.create({
      id: uuidv4(),
      email: input.email.trim().toLowerCase(),
      passwordHash,
      displayName: input.displayName.trim(),
      phone,
      userType: 'consumer',
      personalPlan: this.deployService.isSaas() ? 3 : 1,
      personalVipExpireAt: personalTrialExpire,
    });

    this.smsVerification.consumeVerificationToken(
      input.verificationToken,
      'register',
      input.phone,
    );

    await this.userRepository.recordLoginSuccess(user.id);
    await this.tenantMemberRepository.ensurePrivateDefaultMembership(
      user.id,
      this.deployService.defaultUserSource(),
    );
    return this.issueTokens(user, 'consumer', input.req);
  }

  async loginUser(input: {
    account: string;
    password: string;
    audience: TokenAudience;
    req: RequestMeta;
  }): Promise<AuthTokenResult> {
    const account = input.account.trim();
    const normalizedPhone = account.replace(/[\s-]/g, '');
    const user = isValidPhone(normalizedPhone)
      ? await this.userRepository.findByPhone(normalizedPhone)
      : await this.userRepository.findByEmail(account.toLowerCase());
    if (!user) throw new AuthError(120001, '用户不存在');

    if (input.audience === 'admin' && user.user_type !== 'admin') {
      throw new AuthError(120005, '非管理端账号');
    }

    await this.userRepository.clearExpiredLoginLock(user.id);
    if (user.user_type === 'admin') {
      await this.userRepository.clearLoginLock(user.id);
    }
    const currentUser = (await this.userRepository.findById(user.id)) ?? user;

    const loginBlock = this.authService.canLogin(currentUser);
    if (loginBlock) throw new AuthError(120006, loginBlock);

    const valid = await bcrypt.compare(input.password, currentUser.password_hash);
    if (!valid) {
      if (currentUser.user_type !== 'admin') {
        const maxAttempts = await this.systemConfigRepository.getValue('auth.max_login_attempts', 5);
        const lockMinutes = await this.systemConfigRepository.getValue('auth.lock_duration_minutes', 10);
        await this.userRepository.recordLoginFailure(currentUser.id, maxAttempts, lockMinutes);
      }
      throw new AuthError(120004, '密码错误');
    }

    if (input.audience === 'admin') {
      const permissions = await this.adminRoleRepository.getUserPermissions(currentUser.id);
      if (!permissions.length) {
        throw new AuthError(120007, '账号未分配管理角色');
      }
    }

    await this.userRepository.recordLoginSuccess(currentUser.id);
    const refreshed = await this.userRepository.findById(currentUser.id);
    if (!refreshed) throw new AuthError(120001, '用户不存在');
    if (input.audience === 'consumer') {
      await this.tenantMemberRepository.ensurePrivateDefaultMembership(
        refreshed.id,
        refreshed.user_source ?? this.deployService.defaultUserSource(),
      );
    }
    return this.issueTokens(refreshed, input.audience, input.req);
  }
}
