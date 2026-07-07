/** 与服务端 validatePassword 保持一致 */
export function validatePassword(password: string): string | null {
  if (!password || password.length < 8) {
    return '密码至少 8 位';
  }
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return '密码需包含字母和数字';
  }
  return null;
}

export const PASSWORD_HINT = '至少 8 位，需包含字母和数字';
