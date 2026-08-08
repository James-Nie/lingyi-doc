/** 短信验证码业务场景，对应阿里云号码认证模板 */
export type SmsScene =
  | 'register'
  | 'reset_password'
  | 'change_phone'
  | 'bind_phone'
  | 'verify_phone';

export const SMS_SCENES: SmsScene[] = [
  'register',
  'reset_password',
  'change_phone',
  'bind_phone',
  'verify_phone',
];

export function isSmsScene(value: unknown): value is SmsScene {
  return typeof value === 'string' && (SMS_SCENES as string[]).includes(value);
}
