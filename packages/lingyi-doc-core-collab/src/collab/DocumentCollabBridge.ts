import { cloneSnapshot, diffDocument } from '@lingyi-doc/core-io';
import { applyDocumentPatch } from '@lingyi-doc/core-io';
import type { DocumentPatchKind, DocumentPatchOp } from '@lingyi-doc/core-io';
import type { CrdtOperation } from './index';
import { HybridLogicalClock } from './HybridLogicalClock';
import { SyncManager } from './SyncManager';
import type { ActiveCellEditor, CollabConnectionState, OnlineUser } from './CollabClient';
import { crdtToDocumentPatch, documentPatchesToCrdt } from './patchToCrdt';
import { applyRemoteDocumentPatches } from './applyRemoteDocument';
import { blockLockEquals, type BlockLockTarget } from './blockEditing';

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
  /** 其他人占用的区域编辑锁列表 */
  onBlockEditingChange?: (editors: ActiveCellEditor[]) => void;
  onStateChange?: (state: CollabConnectionState) => void;
  onError?: (error: Error) => void;
  onCommentUpdate?: (senderId: string, payload: import('@lingyi-doc/core-doc').CommentUpdatePayload) => void;
  broadcastDebounceMs?: number;
  /** 本地输入中时是否暂停广播（默认 false，输入中仍 debounce 广播） */
  pauseBroadcastWhileEditing?: boolean;
  /** 本地输入中时是否暂停合并远端变更（默认 true） */
  pauseRemoteWhileEditing?: boolean;
}

/**
 * 文档协作桥接类
 * @param options 桥接选项
 */
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
  private remoteBlockEditors: ActiveCellEditor[] = [];
  private readonly getSnapshot: () => Record<string, unknown> | null;
  private readonly onSnapshotReplace: (snapshot: Record<string, unknown>) => void;
  private readonly onBeforeLocalFlush?: () => void;
  private readonly isLocalEditing?: () => boolean;
  private readonly onBlockEditingChange?: (editors: ActiveCellEditor[]) => void;
  private readonly onError?: (error: Error) => void;
  private readonly onCommentUpdate?: (senderId: string, payload: import('@lingyi-doc/core-doc').CommentUpdatePayload) => void;
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
      onCellEditingChange: (editors) => {
        this.remoteBlockEditors = editors.filter(e => e.userId !== this.userId);
        this.onBlockEditingChange?.(this.remoteBlockEditors);
      },
      onConnected: () => {
        // 服务端重启/断线重连后，若仍在编辑则重新申领区域锁
        if (this.localBlockEdit) {
          this.sync.sendCellEditing({ action: 'start', ...this.localBlockEdit });
        }
      },
      onError: (err) => this.handleError(err),
      onCommentUpdate: (senderId, payload) => this.onCommentUpdate?.(senderId, payload),
      onRemoteOp: (op) => this.handleRemoteOp(op),
    });
  }

  /**
   * 初始化桥接
   * @param snapshot 初始快照
   */
  initialize(snapshot: Record<string, unknown>): void {
    this.lastBroadcastSnapshot = cloneSnapshot(snapshot);
  }

  /**
   * 连接桥接
   */
  connect(): void {
    this.sync.connect();
  }

  /**
   * 断开桥接
   */
  disconnect(): void {
    this.releaseBlockEdit();
    this.cancelBroadcast();
    this.sync.disconnect();
    this.sync.resetSyncCursor();
    this.pendingRemoteOps.length = 0;
  }

  /**
   * 检查桥接是否在线
   * @returns 是否在线
   */
  isOnline(): boolean {
    return this.sync.isOnline();
  }

  /**
   * 获取当前在线用户
   * @returns 当前在线用户列表
   */
  getOnlineUsers(): OnlineUser[] {
    return this.sync.getOnlineUsers();
  }

  /**
   * 获取当前远程块编辑器
   * @returns 当前远程块编辑器列表
   */
  getRemoteBlockEditors(): ActiveCellEditor[] {
    return this.remoteBlockEditors;
  }

  /**
   * 获取当前远程块编辑器
   * @returns 当前远程块编辑器列表
   */
  /** @deprecated 使用 getRemoteBlockEditors */
  getRemoteBlockEditor(): ActiveCellEditor | null {
    return this.remoteBlockEditors[0] ?? null;
  }

  /**
   * 检查区域是否被其他远程块编辑器锁定
   * @param lock 区域锁
   * @returns 是否被锁定
   */
  isRegionLockedByOther(lock: BlockLockTarget): boolean {
    return this.remoteBlockEditors.some(e => blockLockEquals(e, lock));
  }

  /**
   * 检查区域是否被其他远程块编辑器锁定
   * @param lock 区域锁
   * @returns 是否被锁定
   */
  isBlockedByRemoteEditor(): boolean {
    return this.remoteBlockEditors.length > 0;
  }

  /**
   * 检查是否可以开始编辑区域
   * @param lock 区域锁
   * @returns 是否可以开始编辑
   */
  canStartBlockEdit(lock?: BlockLockTarget): boolean {
    if (!lock) return true;
    return !this.isRegionLockedByOther(lock);
  }

  tryStartBlockEdit(lock: BlockLockTarget): boolean {
    if (this.isRegionLockedByOther(lock)) return false;
    this.localBlockEdit = lock;
    this.sync.sendCellEditing({ action: 'start', ...lock });
    return true;
  }

  /**
   * 结束编辑区域
   */
  endBlockEdit(): void {
    this.releaseBlockEdit();
    void this.flushPendingRemoteOps();
    void this.flushBroadcast(true);
  }

  /**
   * 检查是否正在应用远程操作
   * @returns 是否正在应用远程操作
   */
  isApplyingRemote(): boolean {
    return this.applyingRemote;
  }

  /**
   * 安排广播
   */
  scheduleBroadcast(): void {
    if (this.applyingRemote) return;
    if (this.pauseBroadcastWhileEditing && this.isLocalEditing?.()) return;
    if (this.broadcastTimer) clearTimeout(this.broadcastTimer);
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      void this.flushBroadcast(false);
    }, this.broadcastDebounceMs);
  }

  /**
   * 编辑完成后刷新
   */
  flushAfterEdit(): void {
    void this.flushPendingRemoteOps();
    void this.flushBroadcast(true);
  }

  /** HTTP 保存成功后补发 CRDT，避免 oplog 落后于持久化文档 */
  syncSavedSnapshot(snapshot: Record<string, unknown>): void {
    void this.syncSavedSnapshotAsync(snapshot);
  }

  /**
   * 同步保存的快照
   * @param snapshot 保存的快照
   */
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
    const patchOps = diffDocument(this.patchKind, this.lastBroadcastSnapshot, next);
    this.lastBroadcastSnapshot = next;
    if (patchOps.length === 0 || !this.sync.isOnline()) return;
    const crdtOps = documentPatchesToCrdt(this.patchKind, patchOps, this.clock);
    await this.sync.sendOps(crdtOps);
  }

  /**
   * 处理错误
   * @param error 错误对象
   */
  private handleError(error: Error): void {
    if (error.message.includes('210009') || error.message.includes('正在编辑')) {
      this.localBlockEdit = null;
    }
    this.onError?.(error);
  }

  /**
   * 释放本地块编辑锁
   */
  private releaseBlockEdit(): void {
    if (!this.localBlockEdit) return;
    const lock = this.localBlockEdit;
    this.localBlockEdit = null;
    this.sync.sendCellEditing({ action: 'end', ...lock });
  }

  /**
   * 取消广播
   */
  private cancelBroadcast(): void {
    if (this.broadcastTimer) {
      clearTimeout(this.broadcastTimer);
      this.broadcastTimer = null;
    }
  }

  /**
   * 强制刷新广播
   * @param force 是否强制刷新
   */
  private async flushBroadcast(force: boolean): Promise<void> {
    if (!this.sync.isOnline() || this.applyingRemote) return;
    if (!force && this.pauseBroadcastWhileEditing && this.isLocalEditing?.()) return;
    this.onBeforeLocalFlush?.();
    const current = this.getSnapshot();
    if (!current || !this.lastBroadcastSnapshot) return;

    const patchOps = diffDocument(this.patchKind, this.lastBroadcastSnapshot, current);
    if (patchOps.length === 0) return;

    this.lastBroadcastSnapshot = applyDocumentPatch(
      this.patchKind,
      this.lastBroadcastSnapshot,
      patchOps,
    );
    const crdtOps = documentPatchesToCrdt(this.patchKind, patchOps, this.clock);
    await this.sync.sendOps(crdtOps);
  }

  /**
   * 处理远程操作
   * @param op 远程操作
   */
  private handleRemoteOp(op: CrdtOperation): void {
    if (this.pauseRemoteWhileEditing && this.isLocalEditing?.()) {
      this.pendingRemoteOps.push(op);
      return;
    }
    this.applyRemoteOp(op);
  }

  /**
   * 应用待处理的远程操作
   */
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

  /**
   * 应用远程操作
   * @param op 远程操作
   */
  private applyRemoteOp(op: CrdtOperation): void {
    const patch = crdtToDocumentPatch(this.patchKind, op);
    if (!patch) return;
    this.applyRemotePatches([patch]);
  }

  /**
   * 应用远程补丁
   * @param patches 远程补丁
   */
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
