import { Workbook } from '@lingyi-doc/core';
import type { RichDocumentJSON, MindNoteJSON, WhiteboardJSON } from '@lingyi-doc/core';
import type { ApiTemplateDetail, ApiTemplateSummary } from '../api/template';
import type { DocTemplate } from './docTemplates';

function mapBaseFields(item: ApiTemplateSummary): Omit<DocTemplate, 'richDocument' | 'buildWorkbook' | 'mindNoteJson' | 'whiteboardJson'> {
  return {
    id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    docType: item.docType,
    categories: item.categories as DocTemplate['categories'],
    usageLabel: item.usageLabel ?? undefined,
    isNew: item.isNew,
    thumbGradient: item.thumbGradient,
    documentTitle: item.documentTitle,
    isBlank: item.isBlank,
  };
}

/** 列表项映射（不含内容，预览前需 hydrate） */
export function mapApiSummaryToDocTemplate(item: ApiTemplateSummary): DocTemplate {
  return mapBaseFields(item);
}

/** 详情映射（含完整内容，可直接预览/创建） */
export function mapApiDetailToDocTemplate(item: ApiTemplateDetail): DocTemplate {
  const base = mapBaseFields(item);
  if (item.isBlank || item.contentJson == null) return base;

  switch (item.docType) {
    case 'richtext':
      return { ...base, richDocument: item.contentJson as RichDocumentJSON };
    case 'mindnote':
      return { ...base, mindNoteJson: item.contentJson as MindNoteJSON };
    case 'whiteboard':
      return { ...base, whiteboardJson: item.contentJson as WhiteboardJSON };
    case 'freeform':
    case 'base': {
      const json = item.contentJson;
      return {
        ...base,
        buildWorkbook: () => Workbook.fromJSON(
          typeof json === 'object' && json !== null
            ? JSON.parse(JSON.stringify(json))
            : json,
        ),
      };
    }
    default:
      return base;
  }
}

/** 将详情内容合并到已有 DocTemplate */
export function hydrateDocTemplate(template: DocTemplate, detail: ApiTemplateDetail): DocTemplate {
  return mapApiDetailToDocTemplate({ ...detail, ...mapBaseFields(detail) });
}

export function needsTemplateHydration(template: DocTemplate): boolean {
  if (template.isBlank) return false;
  if (template.docType === 'richtext') return !template.richDocument;
  if (template.docType === 'mindnote') return !template.mindNoteJson;
  if (template.docType === 'whiteboard') return !template.whiteboardJson;
  if (template.docType === 'freeform' || template.docType === 'base') return !template.buildWorkbook;
  return false;
}
