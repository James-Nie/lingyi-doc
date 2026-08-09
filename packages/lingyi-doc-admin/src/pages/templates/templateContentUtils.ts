import {
  Workbook,
  RichDocument,
  MindNoteDocument,
  WhiteboardDocument,
  createEmptyDocument,
  createEmptyMindNote,
  createEmptyWhiteboard,
  createQuestionnaireWorkbook,
} from '@lingyi-doc/core';
import type { TemplateDocType } from './templateConstants';

export function createDefaultContentJson(
  docType: TemplateDocType,
  documentTitle: string,
): unknown | null {
  switch (docType) {
    case 'richtext':
      return createEmptyDocument('', documentTitle || '未命名文档');
    case 'mindnote':
      return createEmptyMindNote('', documentTitle || '未命名思维笔记');
    case 'whiteboard':
      return createEmptyWhiteboard('', documentTitle || '未命名画板');
    case 'freeform': {
      const wb = Workbook.create();
      wb.renameSheet(wb.activeSheetId, documentTitle || '普通表格');
      return wb.toJSON();
    }
    case 'base': {
      const wb = Workbook.create();
      const defaultId = wb.activeSheetId;
      const newId = wb.addSheet('多维表格', 'base');
      wb.removeSheet(defaultId);
      wb.switchSheet(newId);
      return wb.toJSON();
    }
    case 'questionnaire':
      return createQuestionnaireWorkbook({
        formTitle: documentTitle || '未命名问卷',
      }).toJSON();
    default:
      return null;
  }
}

export function parseStoredContentJson(
  docType: TemplateDocType,
  contentJson: unknown | null | undefined,
  documentTitle: string,
): unknown | null {
  if (contentJson != null) return contentJson;
  return createDefaultContentJson(docType, documentTitle);
}

export function richDocFromContent(contentJson: unknown | null, documentTitle: string) {
  if (contentJson && typeof contentJson === 'object' && 'content' in contentJson) {
    return RichDocument.fromJSON({ ...(contentJson as Record<string, unknown>), title: documentTitle });
  }
  const json = createEmptyDocument('', documentTitle);
  return RichDocument.fromJSON(json);
}

export function mindNoteFromContent(contentJson: unknown | null, documentTitle: string) {
  if (contentJson && typeof contentJson === 'object' && 'root' in contentJson) {
    return MindNoteDocument.fromJSON({ ...(contentJson as Record<string, unknown>), title: documentTitle });
  }
  return MindNoteDocument.fromJSON(createEmptyMindNote('', documentTitle));
}

export function whiteboardFromContent(contentJson: unknown | null, documentTitle: string) {
  if (contentJson && typeof contentJson === 'object' && 'elements' in contentJson) {
    return WhiteboardDocument.fromJSON({ ...(contentJson as Record<string, unknown>), title: documentTitle });
  }
  return WhiteboardDocument.fromJSON(createEmptyWhiteboard('', documentTitle));
}

export function workbookFromContent(
  contentJson: unknown | null,
  docType: 'freeform' | 'base' | 'questionnaire',
) {
  const wb = contentJson
    ? Workbook.fromJSON(contentJson as Record<string, unknown>)
    : docType === 'questionnaire'
      ? createQuestionnaireWorkbook()
      : Workbook.create();
  wb.normalizeAfterLoad(docType === 'questionnaire' ? 'base' : docType);
  if (!wb.activeSheet) {
    if (docType === 'base' || docType === 'questionnaire') {
      const defaultId = wb.activeSheetId;
      const newId = wb.addSheet(docType === 'questionnaire' ? '问卷' : '多维表格', 'base');
      wb.removeSheet(defaultId);
      wb.switchSheet(newId);
    } else {
      wb.addSheet('Sheet1');
    }
  }
  return wb;
}
