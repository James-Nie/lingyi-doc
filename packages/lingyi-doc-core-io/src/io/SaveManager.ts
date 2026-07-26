import {
  cloneSnapshot,
  diffDocument,
  docTypeToPatchKind,
  estimatePatchBytes,
  hashSnapshot,
  richTextSnapshotForDiff,
  mindNoteSnapshotForDiff,
  whiteboardSnapshotForDiff,
  PATCH_MAX_BYTES,
  PATCH_MAX_BYTES_RICHTEXT,
  PATCH_MAX_OPS,
  isDocumentPatchConflictError,
  type DocumentPatchKind,
  type PatchResult,
} from './patch/index';

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error';

export interface SaveManagerOptions {
  docId: string;
  docType: string;
  debounceMs?: number;
  getTitle: () => string;
  getSnapshot: () => Record<string, unknown>;
  /** flush 前同步未提交的编辑（如单元格输入框、contenteditable） */
  onBeforeFlush?: () => void;
  /**
   * 为 true 时推迟自动 flush（例如单元格正在编辑）。
   * 强制 flush（forceFull / 主动保存）不受影响。
   */
  shouldDeferFlush?: () => boolean;
  saveFull: (title: string, snapshot: Record<string, unknown>) => Promise<{ version: number }>;
  savePatch: (input: {
    baseVersion: number;
    title?: string;
    ops: import('./patch/types').DocumentPatchOp[];
  }) => Promise<PatchResult>;
  onStatusChange?: (status: SaveStatus) => void;
  onSaved?: (version: number) => void;
  onError?: (error: Error) => void;
}

/** 增量保存：diff → patch；空 ops / diff 失败时全量兜底 */
export class SaveManager {
  private kind: DocumentPatchKind;
  private debounceMs: number;
  private getTitle: () => string;
  private getSnapshot: () => Record<string, unknown>;
  private onBeforeFlush?: () => void;
  private shouldDeferFlush?: () => boolean;
  private saveFull: SaveManagerOptions['saveFull'];
  private savePatch: SaveManagerOptions['savePatch'];
  private onStatusChange?: (status: SaveStatus) => void;
  private onSaved?: (version: number) => void;
  private onError?: (error: Error) => void;

  private baseVersion = 0;
  private lastSavedSnapshot: Record<string, unknown> | null = null;
  private lastSavedTitle = '';
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private pendingFlush = false;

  constructor(options: SaveManagerOptions) {
    this.kind = docTypeToPatchKind(options.docType);
    this.debounceMs = options.debounceMs ?? 1500;
    this.getTitle = options.getTitle;
    this.getSnapshot = options.getSnapshot;
    this.onBeforeFlush = options.onBeforeFlush;
    this.shouldDeferFlush = options.shouldDeferFlush;
    this.saveFull = options.saveFull;
    this.savePatch = options.savePatch;
    this.onStatusChange = options.onStatusChange;
    this.onSaved = options.onSaved;
    this.onError = options.onError;
  }

  isDirty(): boolean {
    return this.dirty;
  }

  private normalizeSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
    if (this.kind === 'richtext') return richTextSnapshotForDiff(snapshot);
    if (this.kind === 'mindnote') return mindNoteSnapshotForDiff(snapshot);
    if (this.kind === 'whiteboard') return whiteboardSnapshotForDiff(snapshot);
    return snapshot;
  }

  initialize(version: number, snapshot: Record<string, unknown>, title: string): void {
    this.baseVersion = version;
    this.lastSavedSnapshot = cloneSnapshot(this.normalizeSnapshot(snapshot));
    this.lastSavedTitle = title;
    this.dirty = false;
    this.setStatus('saved');
  }

  /**
   * 协同远端变更落地后调用：更新本地 baseline，避免把远端 diff 再打一遍到服务端。
   * 不抬升脏标记；持久化由变更发起方负责。
   */
  adoptRemoteSnapshot(snapshot: Record<string, unknown>, version?: number): void {
    const normalized = cloneSnapshot(this.normalizeSnapshot(snapshot));
    if (typeof version === 'number' && version > this.baseVersion) {
      this.baseVersion = version;
    }
    this.lastSavedSnapshot = normalized;
    if (typeof snapshot.title === 'string') {
      this.lastSavedTitle = snapshot.title;
    }
    // 远端合并后的内容已在内存中；若本地无额外未保存意图，清掉脏状态
    if (!this.dirty) {
      this.setStatus('saved');
      return;
    }
    // 仍标脏时保留 dirty，但 baseline 已是合并后快照，后续 diff 只含远程之后的本地改动
  }

  /** 仅同步服务端版本号（对方刚保存成功） */
  bumpBaseVersion(version: number): void {
    if (version > this.baseVersion) {
      this.baseVersion = version;
    }
  }

  markDirty(): void {
    this.dirty = true;
    this.setStatus('unsaved');
    this.scheduleFlush();
  }

  /** 用户主动改标题时调用（勿在加载文档时调用） */
  markTitleDirty(): void {
    this.markDirty();
  }

  scheduleFlush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush(false); }, this.debounceMs);
  }

  async flush(forceFull = false): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty && !forceFull) return;

    // 单元格/公式栏编辑进行中时，自动保存推迟，避免打断输入
    if (!forceFull && this.shouldDeferFlush?.()) {
      this.scheduleFlush();
      return;
    }

    if (this.flushing) {
      this.pendingFlush = true;
      return;
    }

    this.flushing = true;
    this.setStatus('saving');
    let failed = false;

    try {
      // 先提交未落盘的编辑器内容，再拍快照并清除脏标记。
      // await 期间若有新编辑，markDirty 会重新置 dirty，finally 中会再 flush。
      this.onBeforeFlush?.();
      this.dirty = false;

      const title = this.getTitle();
      const rawSnapshot = this.getSnapshot();
      const current = cloneSnapshot(this.normalizeSnapshot(rawSnapshot));
      const base = this.lastSavedSnapshot;

      if (!base) {
        const result = await this.saveFull(title, rawSnapshot);
        this.commitSaved(this.snapshotAfterFullSave(current), title, result.version);
        return;
      }

      const titleChanged = title !== this.lastSavedTitle;
      const currentHash = hashSnapshot(current);
      const baseHash = hashSnapshot(base);
      const contentChanged = currentHash !== baseHash;

      if (!contentChanged && !titleChanged) {
        // 本轮快照无变更；若保存中又有编辑，保留 unsaved
        if (!this.dirty) this.setStatus('saved');
        else this.setStatus('unsaved');
        return;
      }

      const ops = diffDocument(this.kind, base, current);

      // diff 漏检：内容已变但 ops 为空 → 全量兜底
      if (contentChanged && ops.length === 0) {
        const result = await this.saveFull(title, rawSnapshot);
        this.commitSaved(this.snapshotAfterFullSave(current), title, result.version);
        return;
      }

      const patchBytesLimit = this.kind === 'richtext' ? PATCH_MAX_BYTES_RICHTEXT : PATCH_MAX_BYTES;
      const useFull =
        forceFull
        || ops.length > PATCH_MAX_OPS
        || estimatePatchBytes(ops) > patchBytesLimit;

      if (useFull) {
        const result = await this.saveFull(title, rawSnapshot);
        this.commitSaved(this.snapshotAfterFullSave(current), title, result.version);
        return;
      }

      // 仅标题变更且 diff 无 meta op（如 workbook）→ 全量 save
      if (ops.length === 0 && titleChanged && (this.kind === 'workbook' || this.kind === 'whiteboard')) {
        const result = await this.saveFull(title, rawSnapshot);
        this.commitSaved(this.snapshotAfterFullSave(current), title, result.version);
        return;
      }

      // 绝不在 ops 为空时发 patch
      if (ops.length === 0) {
        if (!this.dirty) this.setStatus('saved');
        else this.setStatus('unsaved');
        return;
      }

      try {
        const patchResult = await this.savePatch({
          baseVersion: this.baseVersion,
          title: titleChanged ? title : undefined,
          ops,
        });
        // patch 对应的是拍快照时的 current；保存期间新编辑靠 dirty + 再 flush
        this.commitSaved(current, title, patchResult.version);
      } catch (err) {
        if (isDocumentPatchConflictError(err)) {
          // 多人同时保存时的乐观锁冲突：对齐版本后全量写回当前合并态，不向用户报错
          this.baseVersion = typeof err.currentVersion === 'number'
            ? err.currentVersion
            : this.baseVersion;
          const liveTitle = this.getTitle();
          const liveRaw = this.getSnapshot();
          const result = await this.saveFull(liveTitle, liveRaw);
          this.commitSaved(
            cloneSnapshot(this.normalizeSnapshot(liveRaw)),
            liveTitle,
            result.version,
          );
          return;
        }
        throw err;
      }
    } catch (err) {
      failed = true;
      // 失败后保留未保存状态，便于后续重试
      this.dirty = true;
      this.setStatus('error');
      this.onError?.(err as Error);
    } finally {
      this.flushing = false;
      if (this.dirty || this.pendingFlush) {
        this.pendingFlush = false;
        if (this.dirty) {
          if (failed) {
            // 失败用 debounce 重试，避免 tight loop
            this.scheduleFlush();
          } else {
            // 保存期间产生的新编辑：立即再刷一轮
            void this.flush(false);
          }
        }
      }
    }
  }

  /**
   * 全量保存常读实时 workbook；await 后若已有新编辑，用最新快照作 baseline，
   * 避免把「已写入服务端的内容」仍当成未保存 diff 源。
   */
  private snapshotAfterFullSave(fallback: Record<string, unknown>): Record<string, unknown> {
    try {
      return cloneSnapshot(this.normalizeSnapshot(this.getSnapshot()));
    } catch {
      return fallback;
    }
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    // 组件卸载时尽量把未保存改动刷出去（fire-and-forget）
    if (this.dirty && !this.flushing) {
      void this.flush(false);
    }
  }

  /**
   * 更新 baseline。不清掉保存过程中 markDirty 置起的 dirty；
   * 有未保存编辑时保持 unsaved，由 finally / scheduleFlush 继续落盘。
   */
  private commitSaved(snapshot: Record<string, unknown>, title: string, version: number): void {
    this.lastSavedSnapshot = cloneSnapshot(snapshot);
    this.lastSavedTitle = title;
    this.baseVersion = version;
    if (this.dirty) {
      this.setStatus('unsaved');
      return;
    }
    this.setStatus('saved');
    this.onSaved?.(version);
  }

  private setStatus(status: SaveStatus): void {
    this.onStatusChange?.(status);
  }
}
