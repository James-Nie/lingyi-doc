/**
 * C 端模板目录：对接管理后台已发布模板
 */
import { TemplateApi } from '../api/template';
import type { TemplateCategoryId, TemplateDocType, DocTemplate } from './docTemplates';
import { DOC_TEMPLATES, filterTemplates } from './docTemplates';
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
  // 问卷、思维导图、流程图为本地模板类型，服务端 docType 仍为 base / whiteboard
  if (params.typeFilter === 'questionnaire' || params.typeFilter === 'mindmap' || params.typeFilter === 'flowchart') {
    return {
      templates: filterTemplates(DOC_TEMPLATES, {
        category: params.category ?? 'recommended',
        typeFilter: 'questionnaire',
        query: params.query ?? '',
      }),
      source: 'fallback',
    };
  }

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
      templates: filterTemplates(DOC_TEMPLATES, {
        category: params.category ?? 'recommended',
        typeFilter: params.typeFilter ?? 'all',
        query: params.query ?? '',
      }),
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
    const fallback = DOC_TEMPLATES.find(t => t.id === template.id);
    if (fallback) return fallback;
    return template;
  }
}

export function clearTemplateCatalogCache(): void {
  detailCache.clear();
}
