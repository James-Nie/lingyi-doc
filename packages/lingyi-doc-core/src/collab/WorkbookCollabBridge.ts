import type { Workbook } from '../model/Workbook';
import { cloneSnapshot, diffWorkbook } from '../io/patch';
import type { WorkbookPatchOp } from '../io/patch/types';
import type { CrdtOperation } from './index';
import { HybridLogicalClock } from './HybridLogicalClock';
import { SyncManager } from './SyncManager';
import type { CollabConnectionState, OnlineUser } from './CollabClient';
import type { ActiveCellEditor, CellEditingPayload } from './cellEditing';
import { crdtToWorkbookPatch, workbookPatchesToCrdt } from './patchToCrdt';
import { applyRemoteWorkbookPatches } from './applyRemoteWorkbook';

export interface WorkbookCollabBridgeOptions {
  docId: string;
  docType?: string;
  userId: string;
  getToken: () => string | null;
  getWorkbook: () => Workbook | null;
  isLocalEditing?: () => boolean;
  onWorkbookReplace: (workbook: Workbook) => void;
  onBeforeLocalFlush?: () => void;
  onPresenceChange?: (users: OnlineUser[]) => void;
  onCellEditingChange?: (editor: ActiveCellEditor | null) => void;
  onStateChange?: (state: CollabConnectionState) => void;
  onCommentUpdate?: (senderId: string, payload: import('../doc/comments').CommentUpdatePayload) => void;
  onError?: (error: Error) => void;
  broadcastDebounceMs?: number;
}

export class WorkbookCollabBridge {
  private readonly sync: SyncManager;
  private readonly clock: HybridLogicalClock;
  private lastBroadcastSnapshot: Record<string, unknown> | null = null;
  private broadcastTimer: ReturnType<typeof setTimeout> | null = null;
  private applyingRemote = false;
  private readonly pendingRemoteOps: CrdtOperation[] = [];
  private localCellEdit: { sheetId: string; row: number; col: number } | null = null;
  private remoteCellEditor: ActiveCellEditor | null = null;
  private readonly broadcastDebounceMs: number;
  private readonly docType?: string;
  private readonly userId: string;
  private readonly getWorkbook: () => Workbook | null;
  private readonly onWorkbookReplace: (workbook: Workbook) => void;
  private readonly onBeforeLocalFlush?: () => void;
  private readonly isLocalEditing?: () => boolean;
  private readonly onCommentUpdate?: (senderId: string, payload: import('../doc/comments').CommentUpdatePayload) => void;

  constructor(private readonly options: WorkbookCollabBridgeOptions) {
    this.docType = options.docType;
    this.userId = options.userId;
    this.getWorkbook = options.getWorkbook;
    this.onWorkbookReplace = options.onWorkbookReplace;
    this.onBeforeLocalFlush = options.onBeforeLocalFlush;
    this.isLocalEditing = options.isLocalEditing;
    this.onCommentUpdate = options.onCommentUpdate;
    this.broadcastDebounceMs = options.broadcastDebounceMs ?? 300;
    this.clock = new HybridLogicalClock(`node_${Math.random().toString(36).slice(2, 10)}`);

    this.sync = new SyncManager({
      docId: options.docId,
      getToken: options.getToken,
      onStateChange: options.onStateChange,
      onPresenceChange: options.onPresenceChange,
      onCellEditingChange: (editor) => {
        this.remoteCellEditor = editor;
        options.onCellEditingChange?.(editor);
      },
      onCommentUpdate: (senderId, payload) => this.onCommentUpdate?.(senderId, payload),
      onError: options.onError,
      onRemoteOp: (op, meta) => this.handleRemoteOp(op, meta.senderId),
    });
  }

  initialize(snapshot: Record<string, unknown>): void {
    this.lastBroadcastSnapshot = cloneSnapshot(snapshot);
  }

  connect(): void {
    this.sync.connect();
  }

  disconnect(): void {
    this.releaseCellEdit();
    this.cancelBroadcast();
    this.sync.disconnect();
    this.pendingRemoteOps.length = 0;
  }

  isOnline(): boolean {
    return this.sync.isOnline();
  }

  getOnlineUsers(): OnlineUser[] {
    return this.sync.getOnlineUsers();
  }

  getRemoteCellEditor(): ActiveCellEditor | null {
    return this.remoteCellEditor;
  }

  isBlockedByRemoteEditor(): boolean {
    return !!this.remoteCellEditor && this.remoteCellEditor.userId !== this.userId;
  }

  isApplyingRemote(): boolean {
    return this.applyingRemote;
  }

  canStartCellEdit(): boolean {
    return !this.isBlockedByRemoteEditor();
  }

  startCellEdit(sheetId: string, row: number, col: number): boolean {
    if (!this.canStartCellEdit()) return false;
    this.localCellEdit = { sheetId, row, col };
    this.sync.sendCellEditing({ action: 'start', sheetId, row, col });
    return true;
  }

  endCellEdit(): void {
    this.releaseCellEdit();
    void this.flushPendingRemoteOps();
    void this.flushBroadcast(true);
  }

  /** 本地非单元格编辑变更 */
  scheduleBroadcast(): void {
    if (this.applyingRemote) return;
    if (this.isLocalEditing?.()) return;
    if (this.broadcastTimer) clearTimeout(this.broadcastTimer);
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      void this.flushBroadcast(false);
    }, this.broadcastDebounceMs);
  }

  syncSavedSnapshot(snapshot: Record<string, unknown>): void {
    this.lastBroadcastSnapshot = cloneSnapshot(snapshot);
  }

  private releaseCellEdit(): void {
    if (!this.localCellEdit) return;
    const payload: CellEditingPayload = {
      action: 'end',
      sheetId: this.localCellEdit.sheetId,
      row: this.localCellEdit.row,
      col: this.localCellEdit.col,
    };
    this.localCellEdit = null;
    this.sync.sendCellEditing(payload);
  }

  private cancelBroadcast(): void {
    if (this.broadcastTimer) {
      clearTimeout(this.broadcastTimer);
      this.broadcastTimer = null;
    }
  }

  private async flushBroadcast(force: boolean): Promise<void> {
    if (!this.sync.isOnline() || this.applyingRemote) return;
    if (!force && this.isLocalEditing?.()) return;
    this.onBeforeLocalFlush?.();
    const workbook = this.getWorkbook();
    if (!workbook || !this.lastBroadcastSnapshot) return;

    const after = workbook.toJSON() as Record<string, unknown>;
    const patchOps = diffWorkbook(this.lastBroadcastSnapshot, after);
    if (patchOps.length === 0) return;

    this.lastBroadcastSnapshot = cloneSnapshot(after);
    const crdtOps = workbookPatchesToCrdt(patchOps as WorkbookPatchOp[], this.clock);
    for (const op of crdtOps) {
      this.sync.sendOp(op);
    }
  }

  private handleRemoteOp(op: CrdtOperation, _senderId: string): void {
    if (this.isLocalEditing?.()) {
      this.pendingRemoteOps.push(op);
      return;
    }
    this.applyRemotePatchOp(op);
  }

  private async flushPendingRemoteOps(): Promise<void> {
    if (this.pendingRemoteOps.length === 0) return;
    if (this.isLocalEditing?.()) return;
    const ops = this.pendingRemoteOps.splice(0);
    const patches = ops
      .map((op) => crdtToWorkbookPatch(op))
      .filter((patch): patch is WorkbookPatchOp => patch != null);
    if (patches.length === 0) return;

    const workbook = this.getWorkbook();
    if (!workbook) return;

    this.applyingRemote = true;
    try {
      const next = applyRemoteWorkbookPatches(workbook, patches, this.docType);
      const nextJson = next.toJSON() as Record<string, unknown>;
      this.lastBroadcastSnapshot = cloneSnapshot(nextJson);
      this.onWorkbookReplace(next);
    } finally {
      this.applyingRemote = false;
    }
  }

  private applyRemotePatchOp(op: CrdtOperation): void {
    const patchOp = crdtToWorkbookPatch(op);
    if (!patchOp) return;

    const workbook = this.getWorkbook();
    if (!workbook) return;

    this.applyingRemote = true;
    try {
      const next = applyRemoteWorkbookPatches(workbook, [patchOp], this.docType);
      const nextJson = next.toJSON() as Record<string, unknown>;
      this.lastBroadcastSnapshot = cloneSnapshot(nextJson);
      this.onWorkbookReplace(next);
    } finally {
      this.applyingRemote = false;
    }
  }
}
