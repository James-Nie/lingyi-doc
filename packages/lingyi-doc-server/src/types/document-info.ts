export interface DocInfoUserBrief {
  id: string | null;
  displayName: string;
  email?: string | null;
}

export interface DocInfoOverview {
  owner: DocInfoUserBrief;
  creator: DocInfoUserBrief;
  createdAt: number;
  updatedAt: number;
}

export interface DocInfoDocumentStats {
  wordCount: number;
  charCount: number;
  sizeBytes: number;
  sizeLabel: string;
}

export interface DocInfoInteractionStats {
  visitorCount: number;
  visitCount: number;
  todayNewVisits: number;
  likeCount: number;
  commentCount: number;
}

export interface DocInfoVisitRecord {
  visitorId: string | null;
  displayName: string;
  email?: string | null;
  lastVisitedAt: number;
  visitCount: number;
}

export type DocInfoOperationCategory =
  | 'all'
  | 'share'
  | 'duplicate'
  | 'download'
  | 'permission';

export interface DocInfoOperationRecord {
  id: string;
  operatorId: string;
  operatorName: string;
  action: string;
  category: DocInfoOperationCategory;
  summary: string;
  createdAt: number;
}

export interface DocInfoPrivacySettings {
  showMyVisitRecord: boolean;
  showOthersVisitRecord: boolean;
}

export interface DocumentInfoDto {
  docId: string;
  title: string;
  overview: DocInfoOverview;
  documentStats: DocInfoDocumentStats;
  interaction: DocInfoInteractionStats;
  visitRecords: DocInfoVisitRecord[];
  operationRecords: DocInfoOperationRecord[];
  visitStatsSince: string;
  privacy: DocInfoPrivacySettings;
}
