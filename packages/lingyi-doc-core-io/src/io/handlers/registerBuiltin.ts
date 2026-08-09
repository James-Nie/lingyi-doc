import { RichDocument, createEmptyDocument, type RichDocumentJSON } from '@lingyi-doc/core-doc';
import { MindNoteDocument, createEmptyMindNote, type MindNoteJSON } from '@lingyi-doc/core-mindmap';
import { WhiteboardDocument, createEmptyWhiteboard, type WhiteboardJSON } from '@lingyi-doc/core-whiteboard';
import { Workbook } from '@lingyi-doc/core-sheet';
import { registerDocumentHandler } from '@lingyi-doc/core-types';

/** 注册内置文档模型 handler（side-effect，由 io/handlers 加载） */
export function registerBuiltinDocumentHandlers(): void {
  registerDocumentHandler({
    type: 'richtext',
    create: (title) => RichDocument.fromJSON(createEmptyDocument('', title ?? '未命名文档')),
    toJSON: (doc) => (doc as RichDocument).toJSON(),
    fromJSON: (json) => RichDocument.fromJSON(json as RichDocumentJSON),
  });

  registerDocumentHandler({
    type: 'mindnote',
    create: (title) => MindNoteDocument.fromJSON(createEmptyMindNote('', title ?? '未命名思维笔记')),
    toJSON: (doc) => (doc as MindNoteDocument).toJSON(),
    fromJSON: (json) => MindNoteDocument.fromJSON(json as MindNoteJSON),
  });

  registerDocumentHandler({
    type: 'whiteboard',
    create: (title) => WhiteboardDocument.fromJSON(createEmptyWhiteboard('', title ?? '未命名画板')),
    toJSON: (doc) => (doc as WhiteboardDocument).toJSON(),
    fromJSON: (json) => WhiteboardDocument.fromJSON(json as WhiteboardJSON),
  });

  registerDocumentHandler({
    type: 'workbook',
    create: () => new Workbook(),
    toJSON: (doc) => (doc as Workbook).toJSON(),
    fromJSON: (json) => Workbook.fromJSON(json),
  });
}

registerBuiltinDocumentHandlers();
