interface PasswordCryptoConfig {
  publicKey: string;
  keyId: string;
  encryptionRequired: boolean;
}

let cachedPublicKeyPem: string | null = null;
let cachedKeyId: string | null = null;
let cachedConfig: PasswordCryptoConfig | null = null;
let configPromise: Promise<PasswordCryptoConfig> | null = null;

export function clearPasswordCryptoCache(): void {
  cachedPublicKeyPem = null;
  cachedKeyId = null;
  cachedConfig = null;
  configPromise = null;
}

function canUseSubtleCrypto(): boolean {
  return typeof globalThis.crypto !== 'undefined'
    && typeof globalThis.crypto.subtle !== 'undefined'
    && globalThis.isSecureContext === true;
}

async function fetchPasswordCryptoConfig(forceRefresh = false): Promise<PasswordCryptoConfig> {
  if (!forceRefresh && cachedConfig) return cachedConfig;
  if (!forceRefresh && configPromise) return configPromise;

  configPromise = (async () => {
    const res = await fetch('/api/v1/c/auth/password-public-key');
    let json: {
      code?: number;
      data?: { publicKey?: string; keyId?: string; encryptionRequired?: boolean };
      message?: string;
    };
    try {
      json = await res.json();
    } catch {
      throw new Error('获取加密公钥失败');
    }
    const code = json.code ?? res.status;
    if (!res.ok || code !== 0 || !json.data?.publicKey) {
      throw new Error(json.message || '获取加密公钥失败');
    }
    cachedPublicKeyPem = json.data.publicKey;
    cachedKeyId = json.data.keyId ?? null;
    cachedConfig = {
      publicKey: json.data.publicKey,
      keyId: json.data.keyId ?? '',
      encryptionRequired: json.data.encryptionRequired !== false,
    };
    return cachedConfig;
  })().finally(() => {
    configPromise = null;
  });

  return configPromise;
}

function pemToSpkiBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function encryptWithPublicKey(plain: string, publicKeyPem: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('当前环境不支持 Web Crypto');
  }

  const key = await subtle.importKey(
    'spki',
    pemToSpkiBuffer(publicKeyPem),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
  const encrypted = await subtle.encrypt(
    { name: 'RSA-OAEP' },
    key,
    new TextEncoder().encode(plain),
  );
  return bufferToBase64(encrypted);
}

/**
 * 使用服务端 RSA 公钥加密密码后再提交。
 * 每次调用都会拉取最新公钥，避免服务端重启后密钥轮换导致解密失败。
 */
export async function encryptPasswordForAuth(plainPassword: string): Promise<string> {
  const config = await fetchPasswordCryptoConfig(true);

  if (canUseSubtleCrypto()) {
    try {
      return await encryptWithPublicKey(plainPassword, config.publicKey);
    } catch {
      clearPasswordCryptoCache();
      const refreshed = await fetchPasswordCryptoConfig(true);
      return encryptWithPublicKey(plainPassword, refreshed.publicKey);
    }
  }

  if (!config.encryptionRequired) {
    return plainPassword;
  }

  throw new Error('当前站点未启用 HTTPS，无法安全加密密码。请使用 HTTPS 访问，或在服务端配置 AUTH_PASSWORD_ALLOW_PLAIN=1（仅 dev）');
}
