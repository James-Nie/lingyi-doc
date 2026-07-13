export type CrdtOpType =
  | 'set' | 'clear'
  | 'insert_row' | 'delete_row' | 'insert_column' | 'delete_column'
  | 'move_row' | 'move_column' | 'resize_row' | 'resize_column'
  | 'merge_cells' | 'unmerge_cells'
  | 'set_style' | 'format_range'
  | 'sort_range' | 'set_filter' | 'clear_filter'
  | 'create_record' | 'delete_record' | 'update_field'
  | 'add_field' | 'remove_field' | 'update_field_def'
  | 'add_sheet' | 'remove_sheet' | 'rename_sheet' | 'reorder_sheet'
  | 'set_validation' | 'remove_validation'
  | 'set_conditional_format' | 'remove_conditional_format'
  | 'counter_inc' | 'counter_dec';

export interface CrdtOperation {
  opId: string;
  type: CrdtOpType;
  target: string;
  value?: unknown;
  clock: number;
  dependencies: string[];
  position?: { index: number; count?: number };
  mergeRange?: import('../types').CellRange;
  style?: Partial<import('../types').CellStyle>;
  fieldDef?: import('../types').ColumnDef;
}

export interface OfflineOpRecord {
  id: string;
  docId: string;
  operation: CrdtOperation;
  localTimestamp: number;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  retryCount: number;
}

export { CollabClient, type CollabConnectionState, type OnlineUser, type ServerMessage } from './CollabClient';
export { SyncManager, type SyncManagerOptions } from './SyncManager';
export { HybridLogicalClock } from './HybridLogicalClock';
export { WorkbookCollabBridge, type WorkbookCollabBridgeOptions } from './WorkbookCollabBridge';
export { DocumentCollabBridge, type DocumentCollabBridgeOptions } from './DocumentCollabBridge';
export {
  workbookPatchToCrdt,
  workbookPatchesToCrdt,
  crdtToWorkbookPatch,
  documentPatchToCrdt,
  documentPatchesToCrdt,
  crdtToDocumentPatch,
} from './patchToCrdt';
export { applyRemoteWorkbookPatches } from './applyRemoteWorkbook';
export { applyRemoteDocumentPatches } from './applyRemoteDocument';
export { isRichTextComposing, isWhiteboardComposing, isMindNoteComposing } from './editingDetect';
export {
  richTextBlockLock,
  richTextTitleLock,
  whiteboardElementLock,
  whiteboardMindmapNodeLock,
  whiteboardTableCellLock,
  mindnoteNodeLock,
  blockLockLabel,
  blockLockEquals,
  type BlockLockTarget,
} from './blockEditing';
export type { ActiveCellEditor, CellEditingPayload } from './cellEditing';
export { cellRefLabel } from './cellEditing';
