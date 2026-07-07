import crypto from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import type { UserType, UserStatus } from '../types/database';
import type { AccountMode, DeployType, IdentityType } from '../types/deploy';
import type { UserSource } from '../types/database';
import type { TenantRole } from '../types/session';

export type TokenAudience = 'consumer' | 'admin';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  aud: TokenAudience;
  userType: UserType;
  roles?: string[];
  permissions?: string[];
  userSource?: UserSource;
  currentIdentityType?: IdentityType;
  currentTenantId?: string | null;
  tenantRole?: TenantRole | null;
  deployType?: DeployType;
  accountMode?: AccountMode;
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(private readonly config: ConfigService) {}

  private jwtSecret(): string {
    return this.config.get<string>('jwt.secret', 'dev-secret-change-in-production');
  }

  hashRefreshToken(token: string): string {
    return hashRefreshToken(token);
  }

  signAccessToken(payload: AccessTokenPayload): string {
    const ttl = payload.aud === 'admin'
      ? this.config.get<number>('jwt.adminAccessTtl', 1800)
      : this.config.get<number>('jwt.consumerAccessTtl', 7200);
    return jwt.sign(payload, this.jwtSecret(), { expiresIn: ttl });
  }

  signRefreshToken(userId: string, audience: TokenAudience): string {
    const ttl = audience === 'admin'
      ? this.config.get<number>('jwt.adminRefreshTtl', 604800)
      : this.config.get<number>('jwt.consumerRefreshTtl', 2592000);
    return jwt.sign({ sub: userId, aud: audience, type: 'refresh' }, this.jwtSecret(), { expiresIn: ttl });
  }

  verifyAccessToken(token: string, expectedAud: TokenAudience): AccessTokenPayload {
    const payload = jwt.verify(token, this.jwtSecret()) as AccessTokenPayload & { aud?: string };
    if (payload.aud !== expectedAud) {
      throw new Error('Token audience mismatch');
    }
    return payload;
  }

  verifyRefreshToken(token: string, expectedAud: TokenAudience): { sub: string } {
    const payload = jwt.verify(token, this.jwtSecret()) as { sub: string; aud?: string; type?: string };
    if (payload.type !== 'refresh' || payload.aud !== expectedAud) {
      throw new Error('Invalid refresh token');
    }
    return { sub: payload.sub };
  }

  validatePassword(password: string): string | null {
    if (!password || password.length < 8) {
      return '密码至少 8 位';
    }
    if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      return '密码需包含字母和数字';
    }
    return null;
  }

  isAccountLocked(lockedUntil: Date | string | null): boolean {
    if (!lockedUntil) return false;
    const ts = lockedUntil instanceof Date ? lockedUntil.getTime() : new Date(lockedUntil).getTime();
    return ts > Date.now();
  }

  getLockRemainingMinutes(lockedUntil: Date | string | null): number {
    if (!lockedUntil) return 0;
    const ts = lockedUntil instanceof Date ? lockedUntil.getTime() : new Date(lockedUntil).getTime();
    const remainingMs = ts - Date.now();
    if (remainingMs <= 0) return 0;
    return Math.ceil(remainingMs / 60000);
  }

  canLogin(user: {
    user_type?: 'consumer' | 'admin';
    status: UserStatus;
    is_active: number;
    locked_until: Date | null;
  }): string | null {
    if (!user.is_active) return '账号已停用';
    if (user.status === 'suspended') return '账号已被禁用';
    if (user.status === 'pending') return '账号待激活';
    if (user.user_type === 'admin') return null;
    if (this.isAccountLocked(user.locked_until)) {
      const minutes = this.getLockRemainingMinutes(user.locked_until);
      return minutes > 0
        ? `连续密码错误次数过多，账号已锁定 ${minutes} 分钟`
        : '账号已锁定，请稍后再试';
    }
    return null;
  }

  getClientIp(req: { headers: Record<string, unknown>; socket?: { remoteAddress?: string } }): string | null {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0]?.trim() ?? null;
    }
    return req.socket?.remoteAddress ?? null;
  }

  getUserAgent(req: { headers: Record<string, unknown> }): string | null {
    const ua = req.headers['user-agent'];
    return typeof ua === 'string' ? ua.slice(0, 500) : null;
  }
}
