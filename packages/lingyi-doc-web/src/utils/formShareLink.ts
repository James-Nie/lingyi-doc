import { buildShareLink } from '../api/documentShare';

export const FORM_SHARE_SCOPE_OPTIONS = [
  { value: 'internet' as const, label: '互联网上获得链接的人可填写' },
  { value: 'organization' as const, label: '组织内获得链接的人可填写' },
  { value: 'collaborators' as const, label: '仅指定填写者可填写' },
];

export type FormShareLinkScope = typeof FORM_SHARE_SCOPE_OPTIONS[number]['value'];

export interface FormShareParams {
  isFormFill: boolean;
  sheetId: string;
  viewId: string;
}

export function parseFormShareParams(searchParams: URLSearchParams): FormShareParams {
  return {
    isFormFill: searchParams.get('form') === '1',
    sheetId: searchParams.get('sheetId') ?? '',
    viewId: searchParams.get('viewId') ?? '',
  };
}

export function buildFormShareLink(
  shareUrl: string | null | undefined,
  params: { sheetId: string; viewId: string },
): string | null {
  const base = buildShareLink(shareUrl ?? null);
  if (!base) return null;
  try {
    const url = new URL(base, window.location.origin);
    url.searchParams.set('form', '1');
    url.searchParams.set('sheetId', params.sheetId);
    url.searchParams.set('viewId', params.viewId);
    return url.toString();
  } catch {
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}form=1&sheetId=${encodeURIComponent(params.sheetId)}&viewId=${encodeURIComponent(params.viewId)}`;
  }
}
