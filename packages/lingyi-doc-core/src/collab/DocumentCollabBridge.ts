import { cloneSnapshot, diffDocument } from '../io/patch';
import type { DocumentPatchKind, DocumentPatchOp } from '../io/patch/types';
import type { CrdtOperation } from './index';
import { HybridLogicalClock } from './HybridLogicalClock';
import { SyncManager } from './SyncManager';
import type { ActiveCellEditor, CollabConnectionState, OnlineUser } from './CollabClient';
import { crdtToDocumentPatch, documentPatchesToCrdt } from './patchToCrdt';
import { applyRemoteDocumentPatches } from './applyRemoteDocument';
import type { BlockLockTarget } from './blockEditing';

export interface DocumentCollabBridgeOptions {
  docId: string;
  userId: string;
  patchKind: DocumentPatchKind;
  getToken: () => string | null;
  getSnapshot: () => Record<string, unknown> | null;
  onSnapshotReplace: (snapshot: Record<string, unknown>) => void;
  isLocalEditing?: () => boolean;
  onBeforeLocalFlush?: () => void;
  onPresenceChange?: (users: OnlineUser[]) => void;
  onBlockEditingChange?: (editor: ActiveCellEditor | null) => void;
  onStateChange?: (state: CollabConnectionState) => void;
  onError?: (error: Error) => void;
  onCommentUpdate?: (senderId: string, payload: import('../doc/comments').CommentUpdatePayload) => void;
  broadcastDebounceMs?: number;
  /** 本地输入中时是否暂停广播（默认 false，输入中仍 debounce 广播） */
  pauseBroadcastWhileEditing?: boolean;
  /** 本地输入中时是否暂停合并远端变更（默认 true） */
  pauseRemoteWhileEditing?: boolean;
}

export class DocumentCollabBridge {
  private readonly sync: SyncManager;
  private readonly clock: HybridLogicalClock;
  private lastBroadcastSnapshot: Record<string, unknown> | null = null;
  private broadcastTimer: ReturnType<typeof setTimeout> | null = null;
  private applyingRemote = false;
  private readonly pendingRemoteOps: CrdtOperation[] = [];
  private readonly patchKind: DocumentPatchKind;
  private readonly broadcastDebounceMs: number;
  private readonly userId: string;
  private localBlockEdit: BlockLockTarget | null = null;
  private remoteBlockEditor: ActiveCellEditor | null = null;
  private readonly getSnapshot: () => Record<string, unknown> | null;
  private readonly onSnapshotReplace: (snapshot: Record<string, unknown>) => void;
  private readonly onBeforeLocalFlush?: () => void;
  private readonly isLocalEditing?: () => boolean;
  private readonly onBlockEditingChange?: (editor: ActiveCellEditor | null) => void;
  private readonly onError?: (error: Error) => void;
  private readonly onCommentUpdate?: (senderId: string, payload: import('../doc/comments').CommentUpdatePayload) => void;
  private readonly pauseBroadcastWhileEditing: boolean;
  private readonly pauseRemoteWhileEditing: boolean;

  constructor(private readonly options: DocumentCollabBridgeOptions) {
    this.patchKind = options.patchKind;
    this.userId = options.userId;
    this.getSnapshot = options.getSnapshot;
    this.onSnapshotReplace = options.onSnapshotReplace;
    this.onBeforeLocalFlush = options.onBeforeLocalFlush;
    this.isLocalEditing = options.isLocalEditing;
    this.onBlockEditingChange = options.onBlockEditingChange;
    this.onError = options.onError;
    this.onCommentUpdate = options.onCommentUpdate;
    this.pauseBroadcastWhileEditing = options.pauseBroadcastWhileEditing ?? false;
    this.pauseRemoteWhileEditing = options.pauseRemoteWhileEditing ?? true;
    this.broadcastDebounceMs = options.broadcastDebounceMs ?? 300;
    this.clock = new HybridLogicalClock(`node_${Math.random().toString(36).slice(2, 10)}`);

    this.sync = new SyncManager({
      docId: options.docId,
      getToken: options.getToken,
      onStateChange: options.onStateChange,
      onPresenceChange: options.onPresenceChange,
      onCellEditingChange: (editor) => {
        this.remoteBlockEditor = editor;
        this.onBlockEditingChange?.(editor);
      },
      onError: (err) => this.handleError(err),
      onCommentUpdate: (senderId, payload) => this.onCommentUpdate?.(senderId, payload),
      onRemoteOp: (op) => this.handleRemoteOp(op),
    });
  }

  initialize(snapshot: Record<string, unknown>): void {
    this.lastBroadcastSnapshot = cloneSnapshot(snapshot);
  }

  connect(): void {
    this.sync.connect();
  }

  disconnect(): void {
    this.releaseBlockEdit();
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

  getRemoteBlockEditor(): ActiveCellEditor | null {
    return this.remoteBlockEditor;
  }

  isBlockedByRemoteEditor(): boolean {
    return !!this.remoteBlockEditor && this.remoteBlockEditor.userId !== this.userId;
  }

  canStartBlockEdit(): boolean {
    return !this.isBlockedByRemoteEditor();
  }

  tryStartBlockEdit(lock: BlockLockTarget): boolean {
    if (!this.canStartBlockEdit()) return false;
    this.localBlockEdit = lock;
    this.sync.sendCellEditing({ action: 'start', ...lock });
    return true;
  }

  endBlockEdit(): void {
    this.releaseBlockEdit();
    void this.flushPendingRemoteOps();
    void this.flushBroadcast(true);
  }

  isApplyingRemote(): boolean {
    return this.applyingRemote;
  }

  scheduleBroadcast(): void {
    if (this.applyingRemote) return;
    if (this.pauseBroadcastWhileEditing && this.isLocalEditing?.()) return;
    if (this.broadcastTimer) clearTimeout(this.broadcastTimer);
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      void this.flushBroadcast(false);
    }, this.broadcastDebounceMs);
  }

  flushAfterEdit(): void {
    void this.flushPendingRemoteOps();
    void this.flushBroadcast(true);
  }

  syncSavedSnapshot(snapshot: Record<string, unknown>): void {
    this.lastBroadcastSnapshot = cloneSnapshot(snapshot);
  }

  private handleError(error: Error): void {
    if (error.message.includes('210009') || error.message.includes('正在编辑')) {
      this.localBlockEdit = null;
    }
    this.onError?.(error);
  }

  private releaseBlockEdit(): void {
    if (!this.localBlockEdit) return;
    const lock = this.localBlockEdit;
    this.localBlockEdit = null;
    this.sync.sendCellEditing({ action: 'end', ...lock });
  }

  private cancelBroadcast(): void {
    if (this.broadcastTimer) {
      clearTimeout(this.broadcastTimer);
      this.broadcastTimer = null;
    }
  }

  private async flushBroadcast(force: boolean): Promise<void> {
    if (!this.sync.isOnline() || this.applyingRemote) return;
    if (!force && this.pauseBroadcastWhileEditing && this.isLocalEditing?.()) return;
    this.onBeforeLocalFlush?.();
    const current = this.getSnapshot();
    if (!current || !this.lastBroadcastSnapshot) return;

    const patchOps = diffDocument(this.patchKind, this.lastBroadcastSnapshot, current);
    if (patchOps.length === 0) return;

    this.lastBroadcastSnapshot = cloneSnapshot(current);
    const crdtOps = documentPatchesToCrdt(this.patchKind, patchOps, this.clock);
    for (const op of crdtOps) {
      this.sync.sendOp(op);
    }
  }

  private handleRemoteOp(op: CrdtOperation): void {
    if (this.pauseRemoteWhileEditing && this.isLocalEditing?.()) {
      this.pendingRemoteOps.push(op);
      return;
    }
    this.applyRemoteOp(op);
  }

  private flushPendingRemoteOps(): void {
    if (this.pendingRemoteOps.length === 0) return;
    if (this.pauseRemoteWhileEditing && this.isLocalEditing?.()) return;
    const ops = this.pendingRemoteOps.splice(0);
    const patches = ops
      .map((op) => crdtToDocumentPatch(this.patchKind, op))
      .filter((patch): patch is DocumentPatchOp => patch != null);
    if (patches.length === 0) return;
    this.applyRemotePatches(patches);
  }

  private applyRemoteOp(op: CrdtOperation): void {
    const patch = crdtToDocumentPatch(this.patchKind, op);
    if (!patch) return;
    this.applyRemotePatches([patch]);
  }

  private applyRemotePatches(patches: DocumentPatchOp[]): void {
    const current = this.getSnapshot();
    if (!current) return;

    this.applyingRemote = true;
    try {
      const next = applyRemoteDocumentPatches(this.patchKind, current, patches);
      this.lastBroadcastSnapshot = cloneSnapshot(next);
      this.onSnapshotReplace(next);
    } finally {
      this.applyingRemote = false;
    }
  }
}
