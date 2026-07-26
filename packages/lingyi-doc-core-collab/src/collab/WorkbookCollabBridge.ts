import type { Workbook } from '@lingyi-doc/core-sheet';
import { cloneSnapshot, diffWorkbook } from '@lingyi-doc/core-io';
import { applyDocumentPatch } from '@lingyi-doc/core-io';
import type { WorkbookPatchOp } from '@lingyi-doc/core-io';
import type { CrdtOperation } from './index';
import { HybridLogicalClock } from './HybridLogicalClock';
import { SyncManager } from './SyncManager';
import type { CollabConnectionState, OnlineUser } from './CollabClient';
import type { ActiveCellEditor, CellEditingPayload } from './cellEditing';
import { blockLockEquals } from './blockEditing';
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
  onCellEditingChange?: (editors: ActiveCellEditor[]) => void;
  onStateChange?: (state: CollabConnectionState) => void;
  onCommentUpdate?: (senderId: string, payload: import('@lingyi-doc/core-doc').CommentUpdatePayload) => void;
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
  /** 同帧/短窗内合并远端 op，避免大表粘贴广播导致反复全量重建 */
  private readonly remoteApplyBuffer: CrdtOperation[] = [];
  private remoteApplyTimer: ReturnType<typeof setTimeout> | null = null;
  private localCellEdit: { sheetId: string; row: number; col: number } | null = null;
  private remoteCellEditors: ActiveCellEditor[] = [];
  private readonly broadcastDebounceMs: number;
  private readonly docType?: string;
  private readonly userId: string;
  private readonly getWorkbook: () => Workbook | null;
  private readonly onWorkbookReplace: (workbook: Workbook) => void;
  private readonly onBeforeLocalFlush?: () => void;
  private readonly isLocalEditing?: () => boolean;
  private readonly onCommentUpdate?: (senderId: string, payload: import('@lingyi-doc/core-doc').CommentUpdatePayload) => void;

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
      onCellEditingChange: (editors) => {
        this.remoteCellEditors = editors.filter(e => e.userId !== this.userId);
        options.onCellEditingChange?.(this.remoteCellEditors);
      },
      onConnected: () => {
        if (this.localCellEdit) {
          this.sync.sendCellEditing({ action: 'start', ...this.localCellEdit });
        }
      },
      onCommentUpdate: (senderId, payload) => this.onCommentUpdate?.(senderId, payload),
      onError: (err) => {
        if (err.message.includes('210009') || err.message.includes('正在编辑')) {
          this.localCellEdit = null;
        }
        options.onError?.(err);
      },
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
    this.cancelRemoteApply();
    this.sync.disconnect();
    this.sync.resetSyncCursor();
    this.pendingRemoteOps.length = 0;
    this.remoteApplyBuffer.length = 0;
  }

  isOnline(): boolean {
    return this.sync.isOnline();
  }

  getOnlineUsers(): OnlineUser[] {
    return this.sync.getOnlineUsers();
  }

  getRemoteCellEditors(): ActiveCellEditor[] {
    return this.remoteCellEditors;
  }

  /** @deprecated 使用 getRemoteCellEditors */
  getRemoteCellEditor(): ActiveCellEditor | null {
    return this.remoteCellEditors[0] ?? null;
  }

  isRegionLockedByOther(sheetId: string, row: number, col: number): boolean {
    return this.remoteCellEditors.some(e => blockLockEquals(e, { sheetId, row, col }));
  }

  /** @deprecated 使用 isRegionLockedByOther */
  isBlockedByRemoteEditor(): boolean {
    return this.remoteCellEditors.length > 0;
  }

  isApplyingRemote(): boolean {
    return this.applyingRemote;
  }

  canStartCellEdit(sheetId?: string, row?: number, col?: number): boolean {
    if (sheetId == null || row == null || col == null) return true;
    return !this.isRegionLockedByOther(sheetId, row, col);
  }

  startCellEdit(sheetId: string, row: number, col: number): boolean {
    if (this.isRegionLockedByOther(sheetId, row, col)) return false;
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

  /**
   * HTTP 保存成功后调用：把「相对上次已广播快照」的 diff 补发到 CRDT，
   * 避免 oplog 落后于持久化文档，导致其他人/历史回放用旧值覆盖。
   */
  syncSavedSnapshot(snapshot: Record<string, unknown>): void {
    void this.syncSavedSnapshotAsync(snapshot);
  }

  private async syncSavedSnapshotAsync(snapshot: Record<string, unknown>): Promise<void> {
    const next = cloneSnapshot(snapshot);
    if (!this.lastBroadcastSnapshot) {
      this.lastBroadcastSnapshot = next;
      return;
    }
    if (this.applyingRemote) {
      this.lastBroadcastSnapshot = next;
      return;
    }
    const patchOps = diffWorkbook(this.lastBroadcastSnapshot, next);
    this.lastBroadcastSnapshot = next;
    if (patchOps.length === 0 || !this.sync.isOnline()) return;
    const crdtOps = workbookPatchesToCrdt(patchOps as WorkbookPatchOp[], this.clock);
    await this.sync.sendOps(crdtOps);
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

  private cancelRemoteApply(): void {
    if (this.remoteApplyTimer) {
      clearTimeout(this.remoteApplyTimer);
      this.remoteApplyTimer = null;
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

    // 增量应用到 baseline，避免对大表 after 再做一次全量 deep clone
    this.lastBroadcastSnapshot = applyDocumentPatch(
      'workbook',
      this.lastBroadcastSnapshot,
      patchOps,
    );
    const crdtOps = workbookPatchesToCrdt(patchOps as WorkbookPatchOp[], this.clock);
    await this.sync.sendOps(crdtOps);
  }

  private handleRemoteOp(op: CrdtOperation, _senderId: string): void {
    if (this.isLocalEditing?.()) {
      this.pendingRemoteOps.push(op);
      return;
    }
    this.remoteApplyBuffer.push(op);
    if (this.remoteApplyTimer != null) return;
    this.remoteApplyTimer = setTimeout(() => {
      this.remoteApplyTimer = null;
      const batch = this.remoteApplyBuffer.splice(0);
      if (batch.length === 0) return;
      this.applyRemoteOps(batch);
    }, 16);
  }

  private async flushPendingRemoteOps(): Promise<void> {
    if (this.pendingRemoteOps.length === 0) return;
    if (this.isLocalEditing?.()) return;
    const ops = this.pendingRemoteOps.splice(0);
    this.applyRemoteOps(ops);
  }

  private applyRemoteOps(ops: CrdtOperation[]): void {
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
}
