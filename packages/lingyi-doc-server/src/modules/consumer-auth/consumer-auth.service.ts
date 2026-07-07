import {
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import bcrypt from 'bcryptjs';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthSessionRepository } from '../../repositories/auth-session.repository';
import { TenantMemberRepository } from '../../repositories/tenant-member.repository';
import { TenantRepository } from '../../repositories/tenant.repository';
import { UserRepository } from '../../repositories/user.repository';
import {
  AuthError,
  AuthHelpersService,
  authErrorStatus,
} from '../../services/auth-helpers.service';
import { AuthService, hashRefreshToken } from '../../services/auth.service';
import { DeployService } from '../../config/deploy.service';
import { SessionService } from '../../services/session.service';
import {
  SmsVerificationError,
  SmsVerificationService,
} from '../../services/sms-verification.service';
import {
  PasswordCryptoError,
  PasswordCryptoService,
} from '../../services/password-crypto.service';
import { RateLimitService } from '../../services/rate-limit.service';
import { isSmsScene } from '../../types/sms';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';
import type { IdentityType } from '../../types/deploy';

@Injectable()
export class ConsumerAuthService {
  private readonly logger = new Logger(ConsumerAuthService.name);

  constructor(
    private readonly authHelpers: AuthHelpersService,
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    private readonly userRepository: UserRepository,
    private readonly authSessionRepository: AuthSessionRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly tenantMemberRepository: TenantMemberRepository,
    private readonly deployService: DeployService,
    private readonly sessionService: SessionService,
    private readonly smsVerification: SmsVerificationService,
    private readonly passwordCrypto: PasswordCryptoService,
    private readonly rateLimit: RateLimitService,
  ) {}

  getPasswordPublicKey() {
    return this.passwordCrypto.getPublicKey();
  }

  private decryptPasswordField(body: Record<string, unknown>, field: string): string {
    try {
      return this.passwordCrypto.decryptPassword(String(body[field] ?? ''), field);
    } catch (err) {
      if (err instanceof PasswordCryptoError) {
        throw new BusinessException(100002, err.message);
      }
      throw err;
    }
  }

  async sendSms(body: Record<string, unknown>, req: Request) {
    const { phone, scene } = body ?? {};
    if (!phone || !scene || !isSmsScene(scene)) {
      throw new BusinessException(100002, '缺少必填参数');
    }

    const normalized = this.smsVerification.normalizePhone(String(phone));
    if (scene === 'register') {
      const existing = await this.userRepository.findByPhone(normalized);
      if (existing) {
        throw new BusinessException(120007, '手机号已注册');
      }
    }

    try {
      return await this.smsVerification.sendCode(
        scene,
        String(phone),
        this.authService.getClientIp(req),
      );
    } catch (err) {
      if (err instanceof SmsVerificationError) {
        throw new BusinessException(err.code, err.message, authErrorStatus(err.code));
      }
      this.logger.error('send sms failed', err);
      throw new BusinessException(100005, '发送验证码失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async verifySms(body: Record<string, unknown>) {
    const { phone, code, scene } = body ?? {};
    if (!phone || !code || !scene || !isSmsScene(scene)) {
      throw new BusinessException(100002, '缺少必填参数');
    }

    try {
      const result = await this.smsVerification.verifyCode(scene, String(phone), String(code));
      return { success: true, verificationToken: result.verificationToken };
    } catch (err) {
      if (err instanceof SmsVerificationError) {
        throw new BusinessException(err.code, err.message, authErrorStatus(err.code));
      }
      this.logger.error('verify sms failed', err);
      throw new BusinessException(100005, '验证码校验失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async register(body: Record<string, unknown>, req: Request) {
    const { email, password, displayName, phone, verificationToken } = body ?? {};
    if (!email || !password || !displayName || !phone || !verificationToken) {
      throw new BusinessException(100002, '缺少必填参数');
    }
    try {
      return await this.authHelpers.registerConsumer({
        email: String(email),
        password: this.decryptPasswordField(body, 'password'),
        displayName: String(displayName),
        phone: String(phone),
        verificationToken: String(verificationToken),
        req,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        throw new BusinessException(err.code, err.message, authErrorStatus(err.code));
      }
      if (err instanceof SmsVerificationError) {
        throw new BusinessException(err.code, err.message, authErrorStatus(err.code));
      }
      this.logger.error('register failed', err);
      throw new BusinessException(100005, '注册失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async login(body: Record<string, unknown>, req: Request) {
    const { password, account, email } = body ?? {};
    const loginAccount = String(account ?? email ?? '').trim();
    if (!loginAccount || !password) {
      throw new BusinessException(100002, '缺少必填参数');
    }

    const clientIp = this.authService.getClientIp(req);
    if (clientIp) {
      const ipLimit = this.config.get<number>('rateLimit.loginIpMaxPerHour') ?? 60;
      const ipResult = this.rateLimit.consume(`login:ip:${clientIp}`, ipLimit, 60 * 60_000);
      if (!ipResult.allowed) {
        throw new BusinessException(
          100004,
          `登录尝试过于频繁，请 ${ipResult.retryAfterSec ?? 60} 秒后再试`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const accountLimit = this.config.get<number>('rateLimit.loginAccountMaxPerHour') ?? 30;
    const accountKey = loginAccount.replace(/[\s-]/g, '').toLowerCase();
    const accountResult = this.rateLimit.consume(
      `login:account:${accountKey}`,
      accountLimit,
      60 * 60_000,
    );
    if (!accountResult.allowed) {
      throw new BusinessException(
        100004,
        `登录尝试过于频繁，请 ${accountResult.retryAfterSec ?? 60} 秒后再试`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      return await this.authHelpers.loginUser({
        account: loginAccount,
        password: this.decryptPasswordField(body, 'password'),
        audience: 'consumer',
        req,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        throw new BusinessException(err.code, err.message, authErrorStatus(err.code));
      }
      this.logger.error('login failed', err);
      throw new BusinessException(100005, '登录失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async refresh(body: Record<string, unknown>, req: Request) {
    const { refreshToken } = body ?? {};
    if (!refreshToken) {
      throw new BusinessException(100002, '缺少 refreshToken');
    }

    try {
      this.authService.verifyRefreshToken(String(refreshToken), 'consumer');
      const session = await this.authSessionRepository.findValid(String(refreshToken), 'consumer');
      if (!session) {
        throw new BusinessException(110002, 'Token 无效或已过期', HttpStatus.UNAUTHORIZED);
      }
      const user = await this.userRepository.findById(session.userId);
      if (!user) {
        throw new BusinessException(110004, '用户不存在', HttpStatus.UNAUTHORIZED);
      }
      const result = await this.authHelpers.issueTokens(
        user,
        'consumer',
        req,
        session.sessionContext ?? this.sessionService.buildConsumerSession({
          userSource: user.user_source ?? this.deployService.defaultUserSource(),
        }),
      );
      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        session: result.session,
        tenants: result.tenants,
      };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      throw new BusinessException(110002, 'Token 无效或已过期', HttpStatus.UNAUTHORIZED);
    }
  }

  async logout(body: Record<string, unknown>) {
    const { refreshToken } = body ?? {};
    if (refreshToken) {
      await this.authSessionRepository.revoke(String(refreshToken));
    }
    return { success: true };
  }

  async me(user: AuthUser) {
    const dbUser = await this.userRepository.findById(user.userId);
    if (!dbUser) {
      throw new BusinessException(110004, '用户不存在', HttpStatus.UNAUTHORIZED);
    }
    const tenants = await this.tenantRepository.listForUser(dbUser.id);
    return {
      ...this.userRepository.toPublicUser(dbUser),
      session: this.sessionService.sessionInfoFrom(this.sessionService.buildConsumerSession({
        userSource: user.userSource ?? dbUser.user_source ?? this.deployService.defaultUserSource(),
        currentIdentityType: user.currentIdentityType ?? 'personal',
        currentTenantId: user.currentTenantId ?? null,
        tenantRole: user.tenantRole ?? null,
        deployType: user.deployType ?? this.deployService.type,
        accountMode: user.accountMode ?? this.deployService.accountMode,
      })),
      tenants,
    };
  }

  async switchIdentity(user: AuthUser, body: Record<string, unknown>, req: Request) {
    try {
      const { identityType, tenantId } = body ?? {};
      if (identityType !== 'personal' && identityType !== 'tenant') {
        throw new BusinessException(100002, '无效的身份类型');
      }

      const dbUser = await this.userRepository.findById(user.userId);
      if (!dbUser) {
        throw new BusinessException(110004, '用户不存在', HttpStatus.UNAUTHORIZED);
      }

      let nextSession = this.sessionService.buildConsumerSession({
        userSource: dbUser.user_source ?? this.deployService.defaultUserSource(),
        currentIdentityType: identityType as IdentityType,
        currentTenantId: null,
        tenantRole: null,
      });

      if (identityType === 'tenant') {
        if (!tenantId || typeof tenantId !== 'string') {
          throw new BusinessException(100002, '缺少 tenantId');
        }

        if (this.deployService.isPrivate()) {
          const defaultTenant = await this.tenantRepository.ensureDefaultPrivateTenant();
          if (defaultTenant && tenantId !== defaultTenant.id) {
            throw new BusinessException(110003, '无权切换到该租户', HttpStatus.FORBIDDEN);
          }
        }

        const membership = await this.tenantMemberRepository.findMembership(dbUser.id, tenantId);
        if (!membership) {
          throw new BusinessException(110003, '您不是该租户成员', HttpStatus.FORBIDDEN);
        }

        nextSession = this.sessionService.buildConsumerSession({
          userSource: dbUser.user_source ?? this.deployService.defaultUserSource(),
          currentIdentityType: 'tenant',
          currentTenantId: tenantId,
          tenantRole: membership.tenant_role as 1 | 2 | 3,
        });
      }

      const refreshToken = body?.refreshToken as string | undefined;
      if (refreshToken) {
        await this.authSessionRepository.updateSessionContext(refreshToken, nextSession);
      }

      return await this.authHelpers.issueTokens(dbUser, 'consumer', req, nextSession);
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.error('switch-identity failed', err);
      throw new BusinessException(100005, '切换身份失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async listLoginSessions(user: AuthUser, refreshToken?: string) {
    const rows = await this.authSessionRepository.listForUser(user.userId, 'consumer', 50);
    const currentHash = refreshToken ? hashRefreshToken(refreshToken) : null;
    const now = Date.now();
    return {
      items: rows.map((row) => {
        const expiresAt = row.expiresAt instanceof Date ? row.expiresAt.getTime() : new Date(row.expiresAt).getTime();
        const revokedAt = row.revokedAt
          ? (row.revokedAt instanceof Date ? row.revokedAt.getTime() : new Date(row.revokedAt).getTime())
          : null;
        const createdAt = row.createdAt instanceof Date ? row.createdAt.getTime() : new Date(row.createdAt).getTime();
        let status: 'active' | 'expired' | 'revoked' = 'active';
        if (revokedAt) status = 'revoked';
        else if (expiresAt <= now) status = 'expired';

        return {
          id: row.id,
          ip: row.ip,
          deviceInfo: row.deviceInfo,
          createdAt,
          expiresAt,
          revokedAt,
          status,
          isCurrent: currentHash != null && row.refreshTokenHash === currentHash,
        };
      }),
    };
  }

  async updateProfile(user: AuthUser, body: Record<string, unknown>) {
    const { displayName, avatarUrl } = body ?? {};
    const updated = await this.userRepository.updateProfile(user.userId, {
      displayName: typeof displayName === 'string' ? displayName.trim() : undefined,
      avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : avatarUrl === null ? null : undefined,
    });
    if (!updated) {
      throw new BusinessException(110004, '用户不存在', HttpStatus.NOT_FOUND);
    }
    return this.userRepository.toPublicUser(updated);
  }

  async updatePassword(user: AuthUser, body: Record<string, unknown>) {
    const { oldPassword, newPassword } = body ?? {};
    if (!oldPassword || !newPassword) {
      throw new BusinessException(100002, '缺少必填参数');
    }
    const decryptedOld = this.decryptPasswordField(body, 'oldPassword');
    const decryptedNew = this.decryptPasswordField(body, 'newPassword');
    const pwdError = this.authService.validatePassword(decryptedNew);
    if (pwdError) {
      throw new BusinessException(100002, pwdError);
    }

    const dbUser = await this.userRepository.findById(user.userId);
    if (!dbUser) {
      throw new BusinessException(110004, '用户不存在', HttpStatus.NOT_FOUND);
    }

    const valid = await bcrypt.compare(decryptedOld, dbUser.password_hash);
    if (!valid) {
      throw new BusinessException(120004, '原密码错误');
    }

    const passwordHash = await bcrypt.hash(decryptedNew, 12);
    await this.userRepository.updatePassword(dbUser.id, passwordHash);
    await this.authSessionRepository.revokeAllForUser(dbUser.id, 'consumer');
    return { success: true };
  }
}
