export interface SearchResultItem {
  docId: string;
  title: string;
  docType: string;
  snippet: string;
  location: string;
  ownerName: string;
  updatedAt: number;
  lastVisitedAt?: number;
  spaceSlug?: string;
  bookSlug?: string;
  docSlug?: string;
  sharedByName?: string;
  sharePermission?: string;
  /** 多维表格匹配的记录 ID */
  recordId?: string;
}

export interface SearchResponse {
  results: SearchResultItem[];
  hasMore: boolean;
}