import { Injectable } from '@nestjs/common';

interface WindowRecord {
  count: number;
  windowStart: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec?: number;
}

/**
 * 进程内滑动窗口限流。单机有效；多实例部署请配合 Redis 或网关层限流。
 */
@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, WindowRecord>();

  consume(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const record = this.buckets.get(key);

    if (!record || now - record.windowStart >= windowMs) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return { allowed: true };
    }

    if (record.count >= limit) {
      const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - record.windowStart)) / 1000));
      return { allowed: false, retryAfterSec };
    }

    record.count += 1;
    return { allowed: true };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}
