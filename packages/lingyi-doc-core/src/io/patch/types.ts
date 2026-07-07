/** 表格增量操作 */
export type WorkbookPatchOp =
  | { type: 'set_workbook_meta'; patch: { activeSheetId?: string; sheetOrder?: string[] } }
  | { type: 'add_sheet'; sheet: { id: string; data: Record<string, unknown> } }
  | { type: 'remove_sheet'; sheetId: string }
  | { type: 'set_sheet_meta'; sheetId: string; patch: Record<string, unknown> }
  | { type: 'set_cell'; sheetId: string; key: string; cell: unknown | null };

/** 富文本增量操作（对齐 RichDocumentJSON：content 字段，无 block id） */
export type RichTextPatchOp =
  | { type: 'set_doc_meta'; patch: { title?: string; documentId?: string } }
  | { type: 'replace_content'; content: unknown[] }
  | { type: 'update_content_block'; index: number; block: unknown }
  | { type: 'insert_content_block'; index: number; block: unknown }
  | { type: 'delete_content_block'; index: number };

/** 思维笔记增量操作 */
export type MindNotePatchOp =
  | { type: 'set_doc_meta'; patch: { title?: string; documentId?: string } }
  | { type: 'set_settings'; settings: Record<string, unknown> }
  | { type: 'update_node'; id: string; patch: { text?: string; completed?: boolean; collapsed?: boolean } }
  | { type: 'insert_node'; parentId: string; index: number; node: Record<string, unknown> }
  | { type: 'delete_node'; id: string }
  | { type: 'move_node'; id: string; parentId: string; index: number }
  | { type: 'set_root'; root: Record<string, unknown> };

/** 画板增量操作 */
export type WhiteboardPatchOp =
  | { type: 'set_doc_meta'; patch: { title?: string; documentId?: string } }
  | { type: 'set_viewport'; viewport: { x: number; y: number; zoom: number } }
  | { type: 'add_element'; element: Record<string, unknown> }
  | { type: 'remove_element'; id: string }
  | { type: 'set_element'; id: string; element: Record<string, unknown> }
  | { type: 'replace_all'; snapshot: { viewport: { x: number; y: number; zoom: number }; elements: Record<string, unknown>[] } };

export type DocumentPatchOp = WorkbookPatchOp | RichTextPatchOp | MindNotePatchOp | WhiteboardPatchOp;

export type DocumentPatchKind = 'workbook' | 'richtext' | 'mindnote' | 'whiteboard';

export interface PatchRequest {
  baseVersion: number;
  title?: string;
  ops: DocumentPatchOp[];
}

export interface PatchResult {
  success: boolean;
  version: number;
  applied: number;
}

export class DocumentPatchConflictError extends Error {
  readonly currentVersion: number;

  constructor(currentVersion: number) {
    super('文档版本冲突');
    this.name = 'DocumentPatchConflictError';
    this.currentVersion = currentVersion;
  }
}

export const PATCH_MAX_OPS = 200;
/** 表格增量 patch 体积上限 */
export const PATCH_MAX_BYTES = 256 * 1024;
/** 富文本含 base64 图片，与服务端 express.json limit 对齐 */
export const PATCH_MAX_BYTES_RICHTEXT = 50 * 1024 * 1024;
