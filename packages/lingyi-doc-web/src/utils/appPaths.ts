/** 登录后工作台路由前缀 */
export const APP_BASE = '/workspace';

/** 后台管理应用根地址（含尾斜杠）。
 *  开发时 admin 独立端口(5174)部署，需通过 VITE_ADMIN_URL 显式配置；生产默认同域 /admin/。 */
export function getAdminBaseUrl(): string {
  const configured = import.meta.env.VITE_ADMIN_URL as string | undefined;
  if (configured) return configured.replace(/\/$/, '') + '/';
  return '/admin/';
}

/** 路由首段保留字，避免与文档路径冲突 */
export const RESERVED_PATH_ROOTS = new Set([
  'workspace',
  'login',
  'register',
  'change-password',
  'share',
  'recycle-bin',
  'account',
  'api',
  'invite',
  'g',
]);

/** 解码 path 段（兼容 pathname 已是 percent-encoding 的情况，避免二次 encode） */
export function decodePathSegment(segment: string): string {
  let cur = segment;
  for (let i = 0; i < 3; i++) {
    if (!/%[0-9A-Fa-f]{2}/.test(cur)) break;
    try {
      const next = decodeURIComponent(cur);
      if (next === cur) break;
      cur = next;
    } catch {
      break;
    }
  }
  return cur;
}

/** 编码 path 段：先归一化为明文再 encode 一次 */
export function encodePathSegment(segment: string): string {
  return encodeURIComponent(decodePathSegment(segment));
}

/** 归一化 pathname 为解码后的 /a/b/c，便于缓存 key 对齐 */
export function normalizePathname(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean).map(decodePathSegment);
  return `/${parts.join('/')}`;
}

export function isDocPublicPath(pathname: string): boolean {
  const parts = normalizePathname(pathname).split('/').filter(Boolean);
  if (parts.length !== 3) return false;
  return !RESERVED_PATH_ROOTS.has(parts[0]);
}

export const appPath = {
  home: APP_BASE,
  wiki: `${APP_BASE}/wiki`,
  wikiSpace: (kbId: string) => `${APP_BASE}/wiki/${kbId}`,
  wikiSpaceNode: (kbId: string, nodeId: string) => `${APP_BASE}/wiki/${kbId}/n/${nodeId}`,
  wikiSpaceDoc: (kbId: string, docId: string) => `${APP_BASE}/wiki/${kbId}/doc/${docId}`,
  wikiSettings: (kbId: string, section?: string) =>
    section
      ? `${APP_BASE}/wiki/${kbId}/settings?section=${encodeURIComponent(section)}`
      : `${APP_BASE}/wiki/${kbId}/settings`,
  /** 知识库邀请确认加入 */
  wikiInvite: (token: string) => `/invite/kb/${encodeURIComponent(token)}`,
  workspaceSelect: `${APP_BASE}/select`,
  recycleBin: `${APP_BASE}/recycle-bin`,
  account: `/account`,
  changePassword: `/change-password`,
  doc: (docId: string) => `${APP_BASE}/doc/${docId}`,
  /** @deprecated 请使用 resolveDocHref / navigateToDoc 跳转到 docPublic 路径 */
  /** 文档路径：/{space}/{book}/{doc} */
  docPublic: (spaceSlug: string, bookSlug: string, docSlug: string) =>
    `/${decodePathSegment(spaceSlug)}/${decodePathSegment(bookSlug)}/${decodePathSegment(docSlug)}`,
  /** 协作者申请加入 */
  collaboratorJoin: (spaceSlug: string, bookSlug: string, docSlug: string, token: string) =>
    `/g/${spaceSlug}/${bookSlug}/${docSlug}/collaborator/join?token=${encodeURIComponent(token)}&source=doc_collaborator`,
  /** 公开链接（与文档 canonical 路径一致，通过 ?token= 鉴权） */
  publicLink: (spaceSlug: string, bookSlug: string, docSlug: string, token: string) => {
    const params = new URLSearchParams({ token, source: 'doc_link' });
    return `/${spaceSlug}/${bookSlug}/${docSlug}?${params.toString()}`;
  },
  /** @deprecated 旧版 /g/.../link/join，保留兼容 */
  publicLinkJoin: (spaceSlug: string, bookSlug: string, docSlug: string, token: string) =>
    `/g/${spaceSlug}/${bookSlug}/${docSlug}/link/join?token=${encodeURIComponent(token)}&source=doc_link`,
  /** @deprecated 旧版 token 路径，保留兼容 */
  share: (token: string) => `/share/${token}`,
};
