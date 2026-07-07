import { randomBytes } from 'crypto';

const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 生成语雀风格的随机 slug */
export function generateRandomSlug(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  }
  return out;
}

/** 将展示名转为 slug 前缀（仅 ASCII 字母数字，不含中文） */
export function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

/** 个人/组织空间标识：{ascii-prefix}-{random5}；无可用 ASCII 前缀时用 fallbackPrefix */
export function generateSpaceSlug(displayName: string, fallbackPrefix = 'space'): string {
  const slugPart = slugifyName(displayName);
  const base = slugPart || fallbackPrefix;
  return `${base}-${generateRandomSlug(5)}`;
}

/** 知识库/默认库标识：6 位随机 */
export function generateBookSlug(): string {
  return generateRandomSlug(6);
}

/** 文档标识：16 位随机 */
export function generateDocSlug(): string {
  return generateRandomSlug(16);
}

/** 协作者邀请 token（query 参数） */
export function generateInviteToken(): string {
  return randomBytes(12).toString('base64url');
}
