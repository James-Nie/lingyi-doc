import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  privateDecrypt,
  constants,
} from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PasswordCryptoService implements OnModuleInit {
  private readonly logger = new Logger(PasswordCryptoService.name);
  private privateKeyPem = '';
  private publicKeyPem = '';
  private keyId = '';

  constructor(private readonly config: ConfigService) {}

  private loadKeyPair(privatePem: string): void {
    this.privateKeyPem = privatePem;
    this.publicKeyPem = createPublicKey(privatePem).export({
      type: 'spki',
      format: 'pem',
    }) as string;
    this.keyId = createHash('sha256').update(this.publicKeyPem).digest('hex').slice(0, 16);
  }

  onModuleInit(): void {
    const privateKeyB64 = this.config.get<string>('auth.rsaPrivateKeyB64', '');
    if (privateKeyB64) {
      this.loadKeyPair(Buffer.from(privateKeyB64, 'base64').toString('utf8'));
      return;
    }

    const devKeyPath = join(process.cwd(), 'data', 'dev-rsa-private.pem');
    if (existsSync(devKeyPath)) {
      this.loadKeyPair(readFileSync(devKeyPath, 'utf8'));
      this.logger.log('已加载开发 RSA 密钥 data/dev-rsa-private.pem');
      return;
    }

    const pair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    mkdirSync(dirname(devKeyPath), { recursive: true });
    writeFileSync(devKeyPath, pair.privateKey, { mode: 0o600 });
    this.loadKeyPair(pair.privateKey);
    this.logger.warn('已生成并保存开发 RSA 密钥到 data/dev-rsa-private.pem（重启后自动复用）');
  }

  getPublicKey(): { algorithm: string; publicKey: string; keyId: string; encryptionRequired: boolean } {
    return {
      algorithm: 'RSA-OAEP-SHA256',
      publicKey: this.publicKeyPem,
      keyId: this.keyId,
      encryptionRequired: !this.isPlainPasswordAllowed(),
    };
  }

  isPlainPasswordAllowed(): boolean {
    return this.config.get<boolean>('auth.allowPlainPassword') === true;
  }

  decryptPassword(encryptedBase64: string, fieldName = 'password'): string {
    if (typeof encryptedBase64 !== 'string' || !encryptedBase64.trim()) {
      throw new PasswordCryptoError(`${fieldName} 不能为空`);
    }

    if (this.isPlainPasswordAllowed() && !this.looksLikeRsaCiphertext(encryptedBase64)) {
      return encryptedBase64;
    }

    try {
      const ciphertext = Buffer.from(encryptedBase64, 'base64');
      const plaintext = privateDecrypt(
        {
          key: this.privateKeyPem,
          padding: constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        ciphertext,
      );
      return plaintext.toString('utf8');
    } catch {
      throw new PasswordCryptoError(`${fieldName} 解密失败，请刷新页面后重试`);
    }
  }

  /** RSA-OAEP 2048 密文固定 256 字节 */
  private looksLikeRsaCiphertext(value: string): boolean {
    if (value.length < 200) return false;
    try {
      return Buffer.from(value, 'base64').length === 256;
    } catch {
      return false;
    }
  }
}

export class PasswordCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordCryptoError';
  }
}
