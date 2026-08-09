/**
 * 文档模板 API（C 端模板中心）
 * @see docs/template-management-architecture.md
 */
import { authFetch } from '../stores/authStore';
import type { TemplateCategoryId, TemplateDocType } from '../templates/docTemplates';

const BASE = '/api/v1/c/templates';

export interface ApiTemplateSummary {
  id: string;
  title: string;
  subtitle: string;
  docType: TemplateDocType;
  documentTitle: string;
  categories: string[];
  usageLabel: string | null;
  isNew: boolean;
  isBlank: boolean;
  sortOrder: number;
  useCount: number;
  hasContent: boolean;
  createdAt: number;
  updatedAt: number;
  publishedAt: number | null;
}

export interface ApiTemplateDetail extends ApiTemplateSummary {
  contentJson: unknown | null;
}

export interface TemplateListResponse {
  items: ApiTemplateSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export const TemplateApi = {
  async list(params?: {
    query?: string;
    docType?: 'all' | TemplateDocType;
    category?: TemplateCategoryId;
    pageSize?: number;
  }): Promise<TemplateListResponse> {
    const search = new URLSearchParams();
    if (params?.query?.trim()) search.set('query', params.query.trim());
    if (params?.docType && params.docType !== 'all') search.set('docType', params.docType);
    if (params?.category && params.category !== 'recommended') search.set('category', params.category);
    search.set('pageSize', String(params?.pageSize ?? 200));
    const qs = search.toString();
    return authFetch<TemplateListResponse>(`${BASE}${qs ? `?${qs}` : ''}`);
  },

  async get(id: string): Promise<ApiTemplateDetail> {
    return authFetch<ApiTemplateDetail>(`${BASE}/${id}`);
  },

  /** 记录模板使用次数（失败静默） */
  recordUse(id: string): void {
    void authFetch<{ ok: boolean }>(`${BASE}/${id}/use`, { method: 'POST' }).catch(() => {});
  },
};
