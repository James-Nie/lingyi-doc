import type { NavigateFunction } from 'react-router-dom';
import { DocumentShareApi, type DocPathContext } from '../api/documentShare';
import { activeDocumentStore } from '../stores/activeDocumentStore';
import { appPath, normalizePathname } from './appPaths';

/** docId → canonical href（解码后的 pathname） */
const pathCache = new Map<string, string>();
/** pathname → docId（侧栏选中等同步反查） */
const hrefToDocIdCache = new Map<string, string>();

function rememberDocHref(docId: string, href: string): void {
  const normalized = normalizePathname(href);
  const prev = pathCache.get(docId);
  if (prev && prev !== normalized) hrefToDocIdCache.delete(prev);
  pathCache.set(docId, normalized);
  hrefToDocIdCache.set(normalized, docId);
}

export function docPathToHref(ctx: Pick<DocPathContext, 'spaceSlug' | 'bookSlug' | 'docSlug'>): string {
  return appPath.docPublic(ctx.spaceSlug, ctx.bookSlug, ctx.docSlug);
}

/** 从已缓存的 canonical 路径反查 docId（刷新前无缓存则返回 undefined） */
export function lookupDocIdByHref(pathname: string): string | undefined {
  return hrefToDocIdCache.get(normalizePathname(pathname));
}

export function rememberDocPathContext(ctx: DocPathContext): string {
  const href = docPathToHref(ctx);
  rememberDocHref(ctx.docId, href);
  return href;
}

/** 列表项已带路径时预热缓存，切换文档可免调 path 接口 */
export function rememberDocPathsFromList(
  items: Array<{
    id: string;
    title?: string;
    spaceSlug?: string | null;
    bookSlug?: string | null;
    docSlug?: string | null;
  }>,
): void {
  for (const item of items) {
    if (!item.spaceSlug || !item.bookSlug || !item.docSlug) continue;
    rememberDocPathContext({
      docId: item.id,
      title: item.title ?? '',
      spaceSlug: item.spaceSlug,
      bookSlug: item.bookSlug,
      docSlug: item.docSlug,
    });
  }
}

export async function resolveDocHref(
  docId: string,
  path?: Pick<DocPathContext, 'spaceSlug' | 'bookSlug' | 'docSlug'> | null,
): Promise<string> {
  if (path?.spaceSlug && path.bookSlug && path.docSlug) {
    return rememberDocPathContext({
      docId,
      title: '',
      spaceSlug: path.spaceSlug,
      bookSlug: path.bookSlug,
      docSlug: path.docSlug,
    });
  }
  const cached = pathCache.get(docId);
  if (cached) return cached;
  const ctx = await DocumentShareApi.resolveDocPathById(docId);
  return rememberDocPathContext(ctx);
}

export function invalidateDocHrefCache(docId?: string): void {
  if (docId) {
    const href = pathCache.get(docId);
    pathCache.delete(docId);
    if (href) hrefToDocIdCache.delete(href);
    return;
  }
  pathCache.clear();
  hrefToDocIdCache.clear();
}

export async function navigateToDoc(
  navigate: NavigateFunction,
  docId: string,
  opts?: {
    replace?: boolean;
    path?: Pick<DocPathContext, 'spaceSlug' | 'bookSlug' | 'docSlug'> | null;
  },
): Promise<void> {
  // 先写入选中态再跳转，普通表格等慢加载也不会丢高亮
  activeDocumentStore.setDocId(docId);
  const href = await resolveDocHref(docId, opts?.path);
  navigate(href, { replace: opts?.replace });
}

export async function openDocInNewTab(
  docId: string,
  path?: Pick<DocPathContext, 'spaceSlug' | 'bookSlug' | 'docSlug'> | null,
): Promise<void> {
  const href = await resolveDocHref(docId, path);
  window.open(href, '_blank');
}
