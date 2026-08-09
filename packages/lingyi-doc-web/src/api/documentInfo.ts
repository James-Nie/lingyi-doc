import { authFetch } from '../stores/authStore';

const DOC_BASE = '/api/v1/c/docs';

export interface DocInfoUserBrief {
  id: string | null;
  displayName: string;
  email?: string | null;
}

export interface DocumentInfo {
  docId: string;
  title: string;
  overview: {
    owner: DocInfoUserBrief;
    creator: DocInfoUserBrief;
    createdAt: number;
    updatedAt: number;
  };
  documentStats: {
    wordCount: number;
    charCount: number;
    sizeBytes: number;
    sizeLabel: string;
  };
  interaction: {
    visitorCount: number;
    visitCount: number;
    todayNewVisits: number;
    likeCount: number;
    commentCount: number;
  };
  visitRecords: Array<{
    visitorId: string | null;
    displayName: string;
    email?: string | null;
    lastVisitedAt: number;
    visitCount: number;
  }>;
  operationRecords: Array<{
    id: string;
    operatorId: string;
    operatorName: string;
    action: string;
    category: 'all' | 'share' | 'duplicate' | 'download' | 'permission';
    summary: string;
    createdAt: number;
  }>;
  visitStatsSince: string;
  privacy: {
    showMyVisitRecord: boolean;
    showOthersVisitRecord: boolean;
  };
}

export async function fetchDocumentInfo(docId: string): Promise<DocumentInfo> {
  return authFetch<DocumentInfo>(`${DOC_BASE}/${docId}/info`);
}
