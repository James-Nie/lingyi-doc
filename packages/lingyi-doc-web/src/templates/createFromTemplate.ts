import {
  DocumentManager,
  RichDocument,
  Workbook,
  MindNoteDocument,
  WhiteboardDocument,
  createEmptyMindNote,
  createEmptyWhiteboard,
  createFlowchartWhiteboard,
  createMindmapBoardWhiteboard,
} from '@lingyi-doc/core';
import type { DocTemplate } from './docTemplates';

export async function createDocumentFromTemplate(template: DocTemplate): Promise<string> {
  const title = template.documentTitle;

  if (template.docType === 'slides') {
    throw new Error('幻灯片功能开发中');
  }

  if (template.docType === 'richtext') {
    if (template.isBlank || !template.richDocument) {
      return DocumentManager.createRichText(title);
    }
    const doc = RichDocument.fromJSON({ ...template.richDocument, title });
    return DocumentManager.createRichTextFromDocument(title, doc);
  }

  if (template.docType === 'mindnote') {
    const json = template.mindNoteJson ?? createEmptyMindNote('', title);
    return DocumentManager.createMindNoteFromDocument(
      title,
      MindNoteDocument.fromJSON({ ...json, title }),
    );
  }

  if (template.docType === 'whiteboard' || template.docType === 'mindmap' || template.docType === 'flowchart') {
    const json = template.whiteboardJson
      ?? (template.docType === 'mindmap'
        ? createMindmapBoardWhiteboard(title)
        : template.docType === 'flowchart'
          ? createFlowchartWhiteboard(title)
          : createEmptyWhiteboard('', title));
    return DocumentManager.createWhiteboardFromDocument(
      title,
      WhiteboardDocument.fromJSON({ ...json, title }),
    );
  }

  if (template.buildWorkbook) {
    const docType = template.docType === 'questionnaire' ? 'base' : template.docType;
    return DocumentManager.create(title, template.buildWorkbook(), docType);
  }

  const wb = Workbook.create();
  if (template.docType === 'base') {
    const defaultId = wb.activeSheetId;
    const newId = wb.addSheet('多维表格', 'base');
    wb.removeSheet(defaultId);
    wb.switchSheet(newId);
    return DocumentManager.create(title, wb, 'base');
  }

  wb.renameSheet(wb.activeSheetId, template.isBlank ? '普通表格' : title);
  return DocumentManager.create(title, wb, 'freeform');
}
