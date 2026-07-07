import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { AliyunSmsService } from './aliyun-sms.service';
import { isValidPhone } from '../constants/demoRequest';
import { RateLimitService } from './rate-limit.service';
import type { SmsScene } from '../types/sms';

interface PendingRecord {
  outId: string;
  sentAt: number;
  expiresAt: number;
}

interface SmsVerificationTokenPayload {
  typ: 'sms_verification';
  scene: SmsScene;
  phone: string;
  jti: string;
}

@Injectable()
export class SmsVerificationService {
  private readonly logger = new Logger(SmsVerificationService.name);
  private readonly pending = new Map<string, PendingRecord>();
  private readonly consumedJtis = new Set<string>();
  private readonly lastSendAt = new Map<string, number>();
  private readonly verifyFailCount = new Map<string, number>();

  constructor(
    private readonly aliyunSms: AliyunSmsService,
    private readonly config: ConfigService,
    private readonly rateLimit: RateLimitService,
  ) {}

  normalizePhone(phone: string): string {
    return phone.replace(/[\s-]/g, '');
  }

  assertValidPhone(phone: string): string {
    const normalized = this.normalizePhone(phone);
    if (!isValidPhone(normalized)) {
      throw new SmsVerificationError(100002, '手机号格式不正确');
    }
    return normalized;
  }

  private pendingKey(scene: SmsScene, phone: string): string {
    return `${scene}:${phone}`;
  }

  private jwtSecret(): string {
    return this.config.get<string>('jwt.secret', 'dev-secret-change-in-production');
  }

  private getSendIntervalSec(): number {
    return this.config.get<number>('sms.sendIntervalSec') ?? 60;
  }

  private getCodeTtlMinutes(): number {
    return this.config.get<number>('sms.codeTtlMinutes') ?? 5;
  }

  private getVerifiedTtlMinutes(): number {
    return this.config.get<number>('sms.verifiedTtlMinutes') ?? 10;
  }

  private getPhoneMaxPerDay(): number {
    return this.config.get<number>('sms.phoneMaxPerDay') ?? 10;
  }

  private getIpMaxPerHour(): number {
    return this.config.get<number>('sms.ipMaxPerHour') ?? 20;
  }

  private getVerifyMaxFails(): number {
    return this.config.get<number>('sms.verifyMaxFails') ?? 5;
  }

  private assertIpSendLimit(clientIp?: string | null): void {
    if (!clientIp) return;
    const result = this.rateLimit.consume(
      `sms:ip:${clientIp}`,
      this.getIpMaxPerHour(),
      60 * 60_000,
    );
    if (!result.allowed) {
      throw new SmsVerificationError(
        120009,
        `发送过于频繁，请 ${result.retryAfterSec ?? 60} 秒后再试`,
      );
    }
  }

  private assertPhoneDailyLimit(scene: SmsScene, phone: string): void {
    const result = this.rateLimit.consume(
      `sms:phone:${scene}:${phone}`,
      this.getPhoneMaxPerDay(),
      24 * 60 * 60_000,
    );
    if (!result.allowed) {
      throw new SmsVerificationError(120009, '该手机号今日验证码发送次数已达上限，请明日再试');
    }
  }

  async sendCode(
    scene: SmsScene,
    phone: string,
    clientIp?: string | null,
  ): Promise<{ expiresIn: number }> {
    const normalized = this.assertValidPhone(phone);
    const now = Date.now();
    const intervalMs = this.getSendIntervalSec() * 1000;
    const lastSent = this.lastSendAt.get(normalized) ?? 0;
    if (now - lastSent < intervalMs) {
      const waitSec = Math.ceil((intervalMs - (now - lastSent)) / 1000);
      throw new SmsVerificationError(120009, `发送过于频繁，请 ${waitSec} 秒后再试`);
    }

    this.assertIpSendLimit(clientIp);

    const codeMinutes = this.getCodeTtlMinutes();

    try {
      const { outId } = await this.aliyunSms.sendVerifyCode({
        phoneNumber: normalized,
        codeMinutes,
      });

      this.assertPhoneDailyLimit(scene, normalized);

      const expiresAt = now + codeMinutes * 60_000;
      this.pending.set(this.pendingKey(scene, normalized), {
        outId,
        sentAt: now,
        expiresAt,
      });
      this.lastSendAt.set(normalized, now);
      this.verifyFailCount.delete(this.pendingKey(scene, normalized));

      return { expiresIn: codeMinutes * 60 };
    } catch (err) {
      this.logger.error('send sms failed', err);
      throw new SmsVerificationError(120011, err instanceof Error ? err.message : '发送验证码失败');
    }
  }

  async verifyCode(scene: SmsScene, phone: string, code: string): Promise<{ verificationToken: string }> {
    const normalized = this.assertValidPhone(phone);
    const verifyCode = String(code ?? '').trim();
    if (!/^\d{4,8}$/.test(verifyCode)) {
      throw new SmsVerificationError(120008, '验证码格式不正确');
    }

    const key = this.pendingKey(scene, normalized);
    const pending = this.pending.get(key);
    if (!pending) {
      throw new SmsVerificationError(120008, '请先获取验证码');
    }
    if (Date.now() > pending.expiresAt) {
      this.pending.delete(key);
      this.verifyFailCount.delete(key);
      throw new SmsVerificationError(120008, '验证码已过期，请重新获取');
    }

    const failCount = this.verifyFailCount.get(key) ?? 0;
    if (failCount >= this.getVerifyMaxFails()) {
      this.pending.delete(key);
      this.verifyFailCount.delete(key);
      throw new SmsVerificationError(120008, '验证码错误次数过多，请重新获取验证码');
    }

    let passed = false;
    try {
      passed = await this.aliyunSms.checkVerifyCode({
        phoneNumber: normalized,
        verifyCode,
        outId: pending.outId,
      });
    } catch (err) {
      this.logger.error('verify sms failed', err);
      throw new SmsVerificationError(120011, err instanceof Error ? err.message : '验证码校验失败');
    }

    if (!passed) {
      const nextFailCount = failCount + 1;
      this.verifyFailCount.set(key, nextFailCount);
      if (nextFailCount >= this.getVerifyMaxFails()) {
        this.pending.delete(key);
        this.verifyFailCount.delete(key);
        throw new SmsVerificationError(120008, '验证码错误次数过多，请重新获取验证码');
      }
      throw new SmsVerificationError(120008, '验证码错误或已失效');
    }

    this.pending.delete(key);
    this.verifyFailCount.delete(key);
    return { verificationToken: this.createVerificationToken(scene, normalized) };
  }

  private createVerificationToken(scene: SmsScene, phone: string): string {
    const ttlMin = this.getVerifiedTtlMinutes();
    const jti = randomUUID();
    return jwt.sign(
      { typ: 'sms_verification', scene, phone, jti } satisfies SmsVerificationTokenPayload,
      this.jwtSecret(),
      { expiresIn: `${ttlMin}m` },
    );
  }

  assertVerificationToken(token: string, scene: SmsScene, phone: string): string {
    const normalized = this.assertValidPhone(phone);
    let payload: SmsVerificationTokenPayload;
    try {
      payload = jwt.verify(token, this.jwtSecret()) as SmsVerificationTokenPayload;
    } catch {
      throw new SmsVerificationError(120010, '手机号验证已过期，请重新验证');
    }

    if (payload.typ !== 'sms_verification') {
      throw new SmsVerificationError(120010, '手机号验证无效，请重新验证');
    }
    if (payload.scene !== scene || payload.phone !== normalized) {
      throw new SmsVerificationError(120010, '手机号与验证信息不一致，请重新验证');
    }
    if (this.consumedJtis.has(payload.jti)) {
      throw new SmsVerificationError(120010, '手机号验证已使用，请重新验证');
    }

    return normalized;
  }

  consumeVerificationToken(token: string, scene: SmsScene, phone: string): string {
    const normalized = this.assertVerificationToken(token, scene, phone);
    const payload = jwt.decode(token) as SmsVerificationTokenPayload | null;
    if (payload?.jti) {
      this.consumedJtis.add(payload.jti);
    }
    return normalized;
  }
}

export class SmsVerificationError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
    this.name = 'SmsVerificationError';
  }
}
