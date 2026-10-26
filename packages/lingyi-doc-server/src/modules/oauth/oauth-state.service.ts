import { randomBytes } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import {
  OAuthError,
  OAUTH_ERROR_CODES,
  type OAuthExternalProfile,
} from './strategies/oauth-provider.interface';
import type { OAuthProviderCode } from '../../types/database';

export interface OAuthStatePayload {
  provider: OAuthProviderCode;
  /** 登录成功后回跳的业务路径（已通过白名单校验） */
  redirect: string;
  createdAt: number;
}

/**
 * 待二次确认的绑定上下文。
 * 手机号/邮箱命中既有本地账号时，不直接合并，先把上下文暂存 Redis，
 * 等用户证明自己也是该本地账号的持有者（输入密码）后再落绑定。
 */
export interface PendingBindPayload {
  provider: OAuthProviderCode;
  providerAppId: string;
  /** 待合并的既有本地账号 */
  targetUserId: string;
  /** 第三方返回的画像，确认后用于写绑定 */
  profile: OAuthExternalProfile;
  /** 确认完成后回跳的业务路径 */
  redirect: string;
  createdAt: number;
}

/** OAuth state 管理：Redis 存储、短 TTL、一次性消费（防重放） */
@Injectable()
export class OAuthStateService {
  private readonly logger = new Logger(OAuthStateService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  private get ttlSec(): number {
    return this.config.get<number>('oauth.stateTtlSec', 300);
  }

  async issue(provider: OAuthProviderCode, redirect: string): Promise<string> {
    if (!this.redis.isReady()) {
      this.logger.error('Redis 不可用，无法发起 OAuth 登录（state 无处存放）');
      throw new OAuthError(
        OAUTH_ERROR_CODES.PROVIDER_UNREACHABLE,
        '服务暂时不可用，请稍后重试',
        503,
      );
    }
    const state = randomBytes(24).toString('base64url');
    const payload: OAuthStatePayload = { provider, redirect, createdAt: Date.now() };
    await this.redis.setex(this.keyOf(state), this.ttlSec, JSON.stringify(payload));
    return state;
  }

  /** 原子取出并销毁；返回 null 表示无效或已过期 */
  async consume(state: string): Promise<OAuthStatePayload | null> {
    if (!state) return null;
    const raw = await this.redis.getdel(this.keyOf(state));
    if (!raw) return null;
    try {
      const payload = JSON.parse(raw) as OAuthStatePayload;
      if (!payload?.provider) return null;
      return payload;
    } catch {
      return null;
    }
  }

  /** 暂存"待二次确认"的绑定上下文，返回一次性 token */
  async issuePendingBind(payload: Omit<PendingBindPayload, 'createdAt'>): Promise<string> {
    if (!this.redis.isReady()) {
      throw new OAuthError(
        OAUTH_ERROR_CODES.PROVIDER_UNREACHABLE,
        '服务暂时不可用，请稍后重试',
        503,
      );
    }
    const token = randomBytes(24).toString('base64url');
    const full: PendingBindPayload = { ...payload, createdAt: Date.now() };
    await this.redis.setex(this.pendingKeyOf(token), this.ttlSec, JSON.stringify(full));
    return token;
  }

  /** 原子取出并销毁待确认上下文 */
  async consumePendingBind(token: string): Promise<PendingBindPayload | null> {
    if (!token) return null;
    const raw = await this.redis.getdel(this.pendingKeyOf(token));
    if (!raw) return null;
    try {
      const payload = JSON.parse(raw) as PendingBindPayload;
      if (!payload?.targetUserId || !payload?.provider) return null;
      return payload;
    } catch {
      return null;
    }
  }

  private keyOf(state: string): string {
    return `oauth:state:${state}`;
  }

  private pendingKeyOf(token: string): string {
    return `oauth:pending-bind:${token}`;
  }
}
