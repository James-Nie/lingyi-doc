import type { DocumentPatchKind, DocumentPatchOp } from './types';
import { diffWorkbook } from './diffWorkbook';
import { diffRichText } from './diffRichText';
import { diffMindNote } from './diffMindNote';
import { diffWhiteboard } from './diffWhiteboard';

export function diffDocument(
  kind: DocumentPatchKind,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): DocumentPatchOp[] {
  switch (kind) {
    case 'workbook':
      return diffWorkbook(before, after);
    case 'richtext':
      return diffRichText(before, after);
    case 'mindnote':
      return diffMindNote(before, after);
    case 'whiteboard':
      return diffWhiteboard(before, after);
    default:
      return [];
  }
}

export function docTypeToPatchKind(docType: string): DocumentPatchKind {
  if (docType === 'richtext') return 'richtext';
  if (docType === 'mindnote') return 'mindnote';
  if (docType === 'whiteboard') return 'whiteboard';
  return 'workbook';
}
