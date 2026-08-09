import type { SmsScene } from './smsTypes';
import { encryptPasswordForAuth } from '../utils/passwordCrypto';

async function parseResponse<T>(res: Response): Promise<{ ok: boolean; data?: T; message?: string }> {
  let json: { code?: number; data?: T; message?: string };
  try {
    json = await res.json();
  } catch {
    return { ok: false, message: `请求失败 (${res.status})` };
  }
  const code = json.code ?? res.status;
  return {
    ok: res.ok && code === 0,
    data: json.data,
    message: json.message,
  };
}

export async function sendSmsCode(phone: string, scene: SmsScene = 'register'): Promise<{ expiresIn: number }> {
  const res = await fetch('/api/v1/c/auth/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: phone.trim(), scene }),
  });
  const parsed = await parseResponse<{ expiresIn: number }>(res);
  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.message || '发送验证码失败');
  }
  return parsed.data;
}

export async function verifySmsCode(phone: string, code: string, scene: SmsScene = 'register'): Promise<string> {
  const res = await fetch('/api/v1/c/auth/sms/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: phone.trim(), code: code.trim(), scene }),
  });
  const parsed = await parseResponse<{ success: boolean; verificationToken: string }>(res);
  if (!parsed.ok || !parsed.data?.verificationToken) {
    throw new Error(parsed.message || '验证码校验失败');
  }
  return parsed.data.verificationToken;
}

export interface ResetPasswordParams {
  phone: string;
  verificationToken: string;
  newPassword: string;
}

export async function resetPasswordBySms(params: ResetPasswordParams): Promise<void> {
  const encryptedPassword = await encryptPasswordForAuth(params.newPassword);
  const res = await fetch('/api/v1/c/auth/password/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: params.phone.trim(),
      verificationToken: params.verificationToken,
      newPassword: encryptedPassword,
    }),
  });
  const parsed = await parseResponse<{ success: boolean }>(res);
  if (!parsed.ok) {
    throw new Error(parsed.message || '重置密码失败');
  }
}

export type { SmsScene };
