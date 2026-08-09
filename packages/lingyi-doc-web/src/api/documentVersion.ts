import { authFetch } from '../stores/authStore';

const DOC_BASE = '/api/v1/c/docs';

export type DocumentSnapshotActionType = 'create' | 'auto' | 'named' | 'restore';

export interface DocumentVersionListItem {
  version: number;
  snapshotType: string;
  actionType: DocumentSnapshotActionType | null;
  label: string | null;
  parentVersion: number | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: number;
}

export interface DocumentVersionDetail extends DocumentVersionListItem {
  snapshotData: unknown | null;
  contentHash: string | null;
}

export interface DocumentVersionListResult {
  items: DocumentVersionListItem[];
  total: number;
  hasMore: boolean;
}

export async function listDocumentVersions(
  docId: string,
  opts?: { limit?: number; beforeVersion?: number },
): Promise<DocumentVersionListResult> {
  const params = new URLSearchParams();
  if (opts?.limit != null) params.set('limit', String(opts.limit));
  if (opts?.beforeVersion != null) params.set('beforeVersion', String(opts.beforeVersion));
  const qs = params.toString();
  return authFetch<DocumentVersionListResult>(
    `${DOC_BASE}/${docId}/versions${qs ? `?${qs}` : ''}`,
  );
}

export async function getDocumentVersion(
  docId: string,
  version: number,
): Promise<DocumentVersionDetail> {
  return authFetch<DocumentVersionDetail>(`${DOC_BASE}/${docId}/versions/${version}`);
}

export async function createNamedDocumentVersion(
  docId: string,
  label: string,
): Promise<DocumentVersionListItem> {
  return authFetch<DocumentVersionListItem>(`${DOC_BASE}/${docId}/versions`, {
    method: 'POST',
    body: JSON.stringify({ label }),
  });
}

export async function restoreDocumentVersion(
  docId: string,
  version: number,
): Promise<{ version: number }> {
  return authFetch<{ version: number }>(`${DOC_BASE}/${docId}/versions/${version}/restore`, {
    method: 'POST',
  });
}
