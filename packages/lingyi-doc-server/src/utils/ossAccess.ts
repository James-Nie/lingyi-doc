import crypto from 'crypto';
import { ConfigService } from '@nestjs/config';

function signSecret(config: ConfigService): string {
  return config.get<string>('oss.accessSignSecret') || config.get<string>('jwt.secret') || '';
}

export function assertAllowedObjectKey(objectKey: string, config: ConfigService): void {
  const prefix = (config.get<string>('oss.prefix') || 'dev').replace(/^\/+|\/+$/g, '');
  const normalized = objectKey.replace(/^\/+/, '');
  if (normalized.includes('..')) {
    throw new Error('非法对象路径');
  }
  if (!prefix) return;
  if (normalized !== prefix && !normalized.startsWith(`${prefix}/`)) {
    throw new Error('非法对象路径');
  }
}

export function signObjectAccess(
  objectKey: string,
  expiresAtSec: number,
  config: ConfigService,
): string {
  const payload = `${objectKey}\n${expiresAtSec}`;
  return crypto.createHmac('sha256', signSecret(config)).update(payload).digest('hex');
}

export function verifyObjectAccess(
  objectKey: string,
  expiresAtSec: number,
  sig: string,
  config: ConfigService,
): boolean {
  if (!Number.isFinite(expiresAtSec) || expiresAtSec < Math.floor(Date.now() / 1000)) {
    return false;
  }
  const expected = signObjectAccess(objectKey, expiresAtSec, config);
  if (expected.length !== sig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

/** 生成带签名的应用内访问 URL，供私有 Bucket 在浏览器中加载 */
export function buildSignedAccessUrl(objectKey: string, config: ConfigService): string {
  const expiresAt = Math.floor(Date.now() / 1000) + (config.get<number>('oss.accessUrlTtl') ?? 86400);
  const key = Buffer.from(objectKey, 'utf8').toString('base64url');
  const sig = signObjectAccess(objectKey, expiresAt, config);
  return `/api/v1/oss/access?key=${key}&exp=${expiresAt}&sig=${sig}`;
}
