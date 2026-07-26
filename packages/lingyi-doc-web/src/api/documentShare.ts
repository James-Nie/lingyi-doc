/**
 * 文档分享 API
 * @see docs/document-share-api.openapi.yaml
 * @see docs/document-share-architecture.md
 */
import { authFetch, authStore } from '../stores/authStore';
import { encodePathSegment } from '../utils/appPaths';

const DOC_SHARE_BASE = '/api/v1/c/docs';
const PUBLIC_SHARE_BASE = '/api/v1/share';

export type DocSharePermissionLevel = 'none' | 'read' | 'comment' | 'edit' | 'manage';

/** 分享给他人时可选权限（不含管理；管理权仅文档拥有者） */
export type DocShareAssignablePermission = Exclude<DocSharePermissionLevel, 'none' | 'manage'>;

export const DOC_SHARE_PERMISSION_OPTIONS: { value: DocShareAssignablePermission; label: string }[] = [
  { value: 'read', label: '只读' },
  { value: 'comment', label: '可评论' },
  { value: 'edit', label: '可编辑' },
];

export const DOC_SHARE_COLLABORATOR_OPTIONS = DOC_SHARE_PERMISSION_OPTIONS;

export const DOC_SHARE_PERMISSION_LABELS: Record<DocSharePermissionLevel, string> = {
  none: '禁止访问',
  read: '只读',
  comment: '可评论',
  edit: '可编辑',
  manage: '可编辑', // 历史 manage 按可编辑展示
};

export interface DocShareConfig {
  docId: string;
  docUrl: string | null;
  shareToken: string | null;
  shareUrl: string | null;
  memberShareToken: string | null;
  memberShareUrl: string | null;
  memberShareStatus: 'active' | 'closed';
  status: 'active' | 'closed';
  permissionLevel: DocSharePermissionLevel;
  memberPermissionLevel: DocSharePermissionLevel;
  expireTime: string | null;
  memberExpireTime: string | null;
  hasPassword: boolean;
  allowDownload: boolean;
  allowPrint: boolean;
  allowCopy: boolean;
  allowReshare: boolean;
  watermarkEnabled: boolean;
}

export interface DocShareCollaborator {
  id: string;
  docId: string;
  userId: string;
  displayName?: string;
  email?: string;
  permissionLevel: DocSharePermissionLevel;
  expireTime: string | null;
  createdAt: string;
}

export interface DocShareJoinRequest {
  id: string;
  docId: string;
  applicantId: string;
  applicantName?: string;
  applicantEmail?: string;
  permissionLevel: DocSharePermissionLevel;
  status: 'pending' | 'approved' | 'rejected';
  message?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
}

export interface CollaboratorJoinInfo {
  title: string;
  docType: string;
  docUrl: string;
  permissionLevel: DocSharePermissionLevel;
  expired: boolean;
  closed: boolean;
  alreadyCollaborator: boolean;
  joinRequestStatus: 'none' | 'pending' | 'approved' | 'rejected';
}

export interface DocPathContext {
  docId: string;
  title: string;
  spaceSlug: string;
  bookSlug: string;
  docSlug: string;
}

export interface UpsertDocShareInput {
  permissionLevel: DocSharePermissionLevel;
  expireTime?: string | null;
  password?: string;
  clearPassword?: boolean;
  allowDownload?: boolean;
  allowPrint?: boolean;
  allowCopy?: boolean;
  allowReshare?: boolean;
  watermarkEnabled?: boolean;
}

export interface PublicShareInfo {
  title: string;
  docType: string;
  permissionLevel: DocSharePermissionLevel;
  requirePassword: boolean;
  expired: boolean;
  closed: boolean;
}

export interface PublicShareDocument {
  title: string;
  docType: string;
  permissionLevel: DocSharePermissionLevel;
  data: unknown;
}

export interface SubmitPublicFormInput {
  token: string;
  password?: string;
  sheetId: string;
  viewId: string;
  fieldValues: Record<string, unknown>;
}

export interface PublicFormAccessPending {
  requirePassword: true;
  title: string;
  docType: string;
  permissionLevel?: DocSharePermissionLevel;
}

export interface PublicFormFieldDto {
  fieldId: string;
  question: string;
  description?: string;
  required?: boolean;
  conditionalVisible?: boolean;
  displayConditions?: unknown[];
  column: Record<string, unknown> & { id: string; name: string; type: string };
}

export interface PublicFormSchema {
  docId: string;
  sheetId: string;
  viewId: string;
  title: string;
  description: string;
  formShareLinkScope: 'internet' | 'organization' | 'collaborators';
  canManage: boolean;
  fields: PublicFormFieldDto[];
}

export interface PublicFormStats {
  submittedCount: number;
  requiredCount: number;
  submittedPeopleCount: number;
  pendingRequiredCount: number;
}

export interface PublicFormSubmissionSummary {
  recordId: string;
  createdAt: number;
  createdBy: string;
  isLatest: boolean;
  fields: Array<{ label: string; value: string }>;
}

export interface PublicFormQuery {
  token: string;
  sheetId: string;
  viewId: string;
  password?: string;
}

function buildFormQuery(query: PublicFormQuery): string {
  const qs = new URLSearchParams({
    token: query.token,
    sheetId: query.sheetId,
    viewId: query.viewId,
  });
  if (query.password) qs.set('password', query.password);
  return qs.toString();
}

export interface SharedDocumentListItem {
  id: string;
  title: string;
  docType: string;
  ownerId?: string | null;
  ownerName?: string | null;
  location: string;
  createdAt: number;
  updatedAt: number;
  lastVisitedAt: number;
  sharePermission: DocSharePermissionLevel;
  sharedByName?: string;
}

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message?: string;
}

async function parsePublicResponse<T>(res: Response): Promise<T> {
  const json = await res.json() as ApiEnvelope<T>;
  if (json.code !== 0) {
    throw new Error(json.message || '请求失败');
  }
  return json.data;
}

async function optionalAuthFetch<T>(path: string): Promise<T> {
  const token = authStore.getAccessToken();
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return parsePublicResponse<T>(res);
}
async function publicFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = authStore.getAccessToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers as Record<string, string> | undefined),
    },
  });
  return parsePublicResponse<T>(res);
}

export function buildShareLink(shareUrl: string | null): string | null {
  if (!shareUrl) return null;
  if (shareUrl.startsWith('http')) return shareUrl;
  return `${window.location.origin}${shareUrl.startsWith('/') ? shareUrl : `/${shareUrl}`}`;
}

export const DocumentShareApi = {
  getConfig(docId: string): Promise<DocShareConfig> {
    return authFetch(`${DOC_SHARE_BASE}/${docId}/share`);
  },

  upsert(docId: string, input: UpsertDocShareInput): Promise<DocShareConfig> {
    return authFetch(`${DOC_SHARE_BASE}/${docId}/share`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  upsertMemberShare(
    docId: string,
    input: { permissionLevel: DocSharePermissionLevel; expireTime?: string | null },
  ): Promise<DocShareConfig> {
    return authFetch(`${DOC_SHARE_BASE}/${docId}/share/member`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  close(docId: string): Promise<{ docId: string; status: 'closed' }> {
    return authFetch(`${DOC_SHARE_BASE}/${docId}/share/close`, { method: 'POST' });
  },

  closeMemberShare(docId: string): Promise<{ docId: string; status: 'closed' }> {
    return authFetch(`${DOC_SHARE_BASE}/${docId}/share/member/close`, { method: 'POST' });
  },

  listCollaborators(docId: string): Promise<{ items: DocShareCollaborator[]; total: number }> {
    return authFetch(`${DOC_SHARE_BASE}/${docId}/share/collaborators`);
  },

  listJoinRequests(docId: string): Promise<{ items: DocShareJoinRequest[]; total: number }> {
    return authFetch(`${DOC_SHARE_BASE}/${docId}/share/join-requests`);
  },

  approveJoinRequest(docId: string, requestId: string): Promise<{ requestId: string; status: 'approved'; docUrl: string | null }> {
    return authFetch(`${DOC_SHARE_BASE}/${docId}/share/join-requests/${requestId}/approve`, { method: 'POST' });
  },

  rejectJoinRequest(docId: string, requestId: string): Promise<{ requestId: string; status: 'rejected' }> {
    return authFetch(`${DOC_SHARE_BASE}/${docId}/share/join-requests/${requestId}/reject`, { method: 'POST' });
  },

  listSharedWithMe(sortBy: 'lastVisited' | 'created' | 'updated' = 'lastVisited'): Promise<{ items: SharedDocumentListItem[]; total: number }> {
    return authFetch(`/api/v1/c/docs/shared-with-me?sortBy=${sortBy}`);
  },

  addCollaborator(
    docId: string,
    input: { userId: string; permissionLevel: DocShareAssignablePermission },
  ): Promise<DocShareCollaborator> {
    return authFetch(`${DOC_SHARE_BASE}/${docId}/share/collaborators`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  searchUsersForCollaborator(
    docId: string,
    q: string,
  ): Promise<{ items: Array<{ userId: string; displayName: string; email: string; phone: string | null }> }> {
    const qs = new URLSearchParams({ q }).toString();
    return authFetch(`${DOC_SHARE_BASE}/${docId}/share/collaborators/search-users?${qs}`);
  },

  removeCollaborator(docId: string, userId: string): Promise<{ userId: string }> {
    return authFetch(`${DOC_SHARE_BASE}/${docId}/share/collaborators/${userId}`, { method: 'DELETE' });
  },

  resolveDocByPath(spaceSlug: string, bookSlug: string, docSlug: string): Promise<DocPathContext> {
    return authFetch(
      `${DOC_SHARE_BASE}/by-path/${encodePathSegment(spaceSlug)}/${encodePathSegment(bookSlug)}/${encodePathSegment(docSlug)}/resolve`,
    );
  },

  resolveDocPathById(docId: string): Promise<DocPathContext> {
    return authFetch(`${DOC_SHARE_BASE}/${docId}/path`);
  },

  getCollaboratorJoinInfo(
    spaceSlug: string,
    bookSlug: string,
    docSlug: string,
    token: string,
  ): Promise<CollaboratorJoinInfo> {
    const qs = new URLSearchParams({ token });
    return optionalAuthFetch(
      `/api/v1/share/join/${encodePathSegment(spaceSlug)}/${encodePathSegment(bookSlug)}/${encodePathSegment(docSlug)}/collaborator?${qs}`,
    );
  },

  applyCollaboratorJoin(
    spaceSlug: string,
    bookSlug: string,
    docSlug: string,
    token: string,
    message?: string,
  ): Promise<{ status: 'pending' | 'approved'; docUrl: string }> {
    return authFetch(`/api/v1/c/share/join/${encodePathSegment(spaceSlug)}/${encodePathSegment(bookSlug)}/${encodePathSegment(docSlug)}/collaborator?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      body: JSON.stringify({ token, message }),
    });
  },

  getPublicInfo(token: string): Promise<PublicShareInfo> {
    return publicFetch(`${PUBLIC_SHARE_BASE}/${token}`);
  },

  verifyPublic(token: string, password?: string): Promise<PublicShareDocument> {
    return publicFetch(`${PUBLIC_SHARE_BASE}/${token}/verify`, {
      method: 'POST',
      body: JSON.stringify(password ? { password } : {}),
    });
  },

  getPublicForm(
    spaceSlug: string,
    bookSlug: string,
    docSlug: string,
    query: PublicFormQuery,
  ): Promise<PublicFormSchema | PublicFormAccessPending> {
    return publicFetch(
      `/api/v1/docs/by-path/${encodePathSegment(spaceSlug)}/${encodePathSegment(bookSlug)}/${encodePathSegment(docSlug)}/form?${buildFormQuery(query)}`,
    );
  },

  getPublicFormStats(
    spaceSlug: string,
    bookSlug: string,
    docSlug: string,
    query: PublicFormQuery,
  ): Promise<PublicFormStats> {
    return publicFetch(
      `/api/v1/docs/by-path/${encodePathSegment(spaceSlug)}/${encodePathSegment(bookSlug)}/${encodePathSegment(docSlug)}/form/stats?${buildFormQuery(query)}`,
    );
  },

  listPublicFormSubmissions(
    spaceSlug: string,
    bookSlug: string,
    docSlug: string,
    query: PublicFormQuery,
  ): Promise<{ items: PublicFormSubmissionSummary[]; total: number }> {
    return publicFetch(
      `/api/v1/docs/by-path/${encodePathSegment(spaceSlug)}/${encodePathSegment(bookSlug)}/${encodePathSegment(docSlug)}/form/submissions?${buildFormQuery(query)}`,
    );
  },

  getPublicFormSubmissionDetail(
    spaceSlug: string,
    bookSlug: string,
    docSlug: string,
    recordId: string,
    query: PublicFormQuery,
  ): Promise<{ recordId: string; fieldValues: Record<string, unknown> }> {
    return publicFetch(
      `/api/v1/docs/by-path/${encodePathSegment(spaceSlug)}/${encodePathSegment(bookSlug)}/${encodePathSegment(docSlug)}/form/submissions/${encodeURIComponent(recordId)}?${buildFormQuery(query)}`,
    );
  },

  submitPublicForm(
    spaceSlug: string,
    bookSlug: string,
    docSlug: string,
    input: SubmitPublicFormInput,
  ): Promise<{ success: true; version: number }> {
    return publicFetch(
      `/api/v1/docs/by-path/${encodePathSegment(spaceSlug)}/${encodePathSegment(bookSlug)}/${encodePathSegment(docSlug)}/form-submit`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
  },
} as const;
