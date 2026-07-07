import type { NavigateFunction } from 'react-router-dom';
import { DocumentShareApi, type DocPathContext } from '../api/documentShare';
import { appPath } from './appPaths';

const pathCache = new Map<string, string>();

export function docPathToHref(ctx: Pick<DocPathContext, 'spaceSlug' | 'bookSlug' | 'docSlug'>): string {
  return appPath.docPublic(ctx.spaceSlug, ctx.bookSlug, ctx.docSlug);
}

export async function resolveDocHref(docId: string): Promise<string> {
  const cached = pathCache.get(docId);
  if (cached) return cached;
  const ctx = await DocumentShareApi.resolveDocPathById(docId);
  const href = docPathToHref(ctx);
  pathCache.set(docId, href);
  return href;
}

export function invalidateDocHrefCache(docId?: string): void {
  if (docId) {
    pathCache.delete(docId);
    return;
  }
  pathCache.clear();
}

export async function navigateToDoc(
  navigate: NavigateFunction,
  docId: string,
  opts?: { replace?: boolean },
): Promise<void> {
  const href = await resolveDocHref(docId);
  navigate(href, { replace: opts?.replace });
}

export async function openDocInNewTab(docId: string): Promise<void> {
  const href = await resolveDocHref(docId);
  window.open(href, '_blank');
}
