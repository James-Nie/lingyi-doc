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
  mergeRange?: unknown;
  style?: unknown;
  fieldDef?: unknown;
}

export interface OnlineUser {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  color: string;
  joinedAt: number;
}

export interface ActiveCellEditor {
  userId: string;
  displayName: string;
  sheetId: string;
  row: number;
  col: number;
}

export interface CollabClientContext {
  socketId: string;
  userId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  color: string;
  docId: string;
  canWrite: boolean;
  identityType: 'personal' | 'tenant';
  tenantId: string | null;
}

export type ClientMessage =
  | { type: 'auth'; token: string; docId: string }
  | { type: 'heartbeat'; ts: number }
  | { type: 'crdt_op'; operation: CrdtOperation }
  | { type: 'crdt_op_batch'; operations: CrdtOperation[] }
  | { type: 'sync_request'; fromVersion: number }
  | { type: 'cursor_move'; docKind?: string; payload: Record<string, unknown> }
  | { type: 'selection_change'; docKind?: string; payload: Record<string, unknown> };

export type ServerMessage =
  | {
      type: 'connected';
      docVersion: number;
      globalVersion: number;
      onlineUsers: OnlineUser[];
      /** @deprecated 使用 activeCellEditors */
      activeCellEditor?: ActiveCellEditor | null;
      activeCellEditors?: ActiveCellEditor[];
    }
  | { type: 'heartbeat_ack'; serverTime: number }
  | { type: 'crdt_op'; operation: CrdtOperation; globalVersion: number; senderId: string }
  | { type: 'user_joined'; user: OnlineUser }
  | { type: 'user_left'; userId: string }
  | { type: 'cursor_update'; userId: string; payload: Record<string, unknown> }
  | { type: 'selection_update'; userId: string; payload: Record<string, unknown> }
  | {
      type: 'cell_editing_update';
      /** @deprecated 使用 editors */
      editor: ActiveCellEditor | null;
      editors?: ActiveCellEditor[];
    }
  | { type: 'sync_response'; operations: CrdtOperation[]; currentVersion: number }
  | { type: 'comment_update'; senderId: string; payload: import('../../types/document-comment').CommentUpdatePayload }
  | { type: 'conflict_resolved'; target: string; resolution: CrdtOperation }
  | { type: 'error'; code: number; message: string };

export interface CollabPubSubEnvelope {
  originInstanceId: string;
  docId: string;
  payload: ServerMessage;
  excludeUserId?: string;
  excludeSocketId?: string;
}

export const COLLAB_ERROR = {
  OP_INVALID: 210001,
  OP_DUPLICATE: 210002,
  VERSION_GAP: 210003,
  ROOM_FULL: 210004,
  FORBIDDEN: 210005,
  DOC_NOT_FOUND: 210006,
  DISABLED: 210007,
  UNAUTHORIZED: 210008,
  CELL_EDIT_LOCKED: 210009,
} as const;

const USER_COLORS = [
  '#f5222d', '#fa8c16', '#fadb14', '#52c41a',
  '#13c2c2', '#1677ff', '#722ed1', '#eb2f96',
];

export function pickUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return USER_COLORS[hash % USER_COLORS.length];
}

export function entryToCrdtOperation(entry: {
  opId: string;
  opType: string;
  opTarget: string;
  opData: unknown;
  dependencies?: unknown | null;
  clientTs?: string | null;
}): CrdtOperation {
  const data = (entry.opData && typeof entry.opData === 'object')
    ? entry.opData as Record<string, unknown>
    : {};
  return {
    opId: entry.opId,
    type: entry.opType as CrdtOperation['type'],
    target: entry.opTarget,
    value: data.value,
    clock: Number(data.clock ?? entry.clientTs ?? Date.now()),
    dependencies: Array.isArray(data.dependencies)
      ? data.dependencies as string[]
      : Array.isArray(entry.dependencies)
        ? entry.dependencies as string[]
        : [],
    position: data.position as CrdtOperation['position'],
    mergeRange: data.mergeRange as CrdtOperation['mergeRange'],
    style: data.style as CrdtOperation['style'],
    fieldDef: data.fieldDef as CrdtOperation['fieldDef'],
  };
}

export function crdtOperationToOpData(op: CrdtOperation): Record<string, unknown> {
  return {
    value: op.value,
    clock: op.clock,
    dependencies: op.dependencies,
    position: op.position,
    mergeRange: op.mergeRange,
    style: op.style,
    fieldDef: op.fieldDef,
  };
}
