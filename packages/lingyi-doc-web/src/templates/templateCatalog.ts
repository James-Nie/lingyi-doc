/**
 * C 端模板目录：对接管理后台已发布模板
 */
import { TemplateApi } from '../api/template';
import type { TemplateCategoryId, TemplateDocType, DocTemplate } from './docTemplates';
import {
  mapApiDetailToDocTemplate,
  mapApiSummaryToDocTemplate,
  needsTemplateHydration,
} from './mapApiTemplate';

export type TemplateCatalogSource = 'api' | 'fallback';

const detailCache = new Map<string, DocTemplate>();

export async function fetchPublishedTemplates(params: {
  category?: TemplateCategoryId;
  typeFilter?: 'all' | TemplateDocType;
  query?: string;
}): Promise<{ templates: DocTemplate[]; source: TemplateCatalogSource }> {

  try {
    const res = await TemplateApi.list({
      category: params.category,
      docType: params.typeFilter,
      query: params.query,
      pageSize: 200,
    });
    return {
      templates: res.items.map(mapApiSummaryToDocTemplate),
      source: 'api',
    };
  } catch {
    return {
      templates: [],
      source: 'fallback',
    };
  }
}

export async function hydrateTemplate(template: DocTemplate): Promise<DocTemplate> {
  const cached = detailCache.get(template.id);
  if (cached) return cached;
  if (!needsTemplateHydration(template)) return template;

  try {
    const detail = await TemplateApi.get(template.id);
    const hydrated = mapApiDetailToDocTemplate(detail);
    detailCache.set(template.id, hydrated);
    return hydrated;
  } catch {
    return template;
  }
}

export function clearTemplateCatalogCache(): void {
  detailCache.clear();
}
