export class SearchRequestDto {
  q!: string;
  limit?: number;
  docTypes?: string[];
}

export class SearchResultItem {
  docId!: string;
  title!: string;
  docType!: string;
  snippet!: string;
  location!: string;
  ownerName!: string;
  updatedAt!: number;
  lastVisitedAt?: number;
  spaceSlug?: string;
  bookSlug?: string;
  docSlug?: string;
  sharedByName?: string;
  sharePermission?: string;
  /** 多维表格匹配的记录 ID，点击后需要定位到该记录 */
  recordId?: string;
}

export class SearchResponseDto {
  results!: SearchResultItem[];
  hasMore!: boolean;
}