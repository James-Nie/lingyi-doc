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
  DocumentPatchConflictError,
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
    this.saveFull = options.saveFull;
    this.savePatch = options.savePatch;
    this.onStatusChange = options.onStatusChange;
    this.onSaved = options.onSaved;
    this.onError = options.onError;
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

    if (this.flushing) {
      this.pendingFlush = true;
      return;
    }

    this.flushing = true;
    this.setStatus('saving');

    try {
      this.onBeforeFlush?.();

      const title = this.getTitle();
      const rawSnapshot = this.getSnapshot();
      const current = cloneSnapshot(this.normalizeSnapshot(rawSnapshot));
      const base = this.lastSavedSnapshot;

      if (!base) {
        const result = await this.saveFull(title, rawSnapshot);
        this.commitSaved(current, title, result.version);
        return;
      }

      const titleChanged = title !== this.lastSavedTitle;
      const currentHash = hashSnapshot(current);
      const baseHash = hashSnapshot(base);
      const contentChanged = currentHash !== baseHash;

      if (!contentChanged && !titleChanged) {
        this.dirty = false;
        this.setStatus('saved');
        return;
      }

      let ops = diffDocument(this.kind, base, current);

      // diff 漏检：内容已变但 ops 为空 → 全量兜底
      if (contentChanged && ops.length === 0) {
        const result = await this.saveFull(title, rawSnapshot);
        this.commitSaved(current, title, result.version);
        return;
      }

      const patchBytesLimit = this.kind === 'richtext' ? PATCH_MAX_BYTES_RICHTEXT : PATCH_MAX_BYTES;
      const useFull =
        forceFull
        || ops.length > PATCH_MAX_OPS
        || estimatePatchBytes(ops) > patchBytesLimit;

      if (useFull) {
        const result = await this.saveFull(title, rawSnapshot);
        this.commitSaved(cloneSnapshot(this.normalizeSnapshot(rawSnapshot)), title, result.version);
        return;
      }

      // 仅标题变更且 diff 无 meta op（如 workbook）→ 全量 save
      if (ops.length === 0 && titleChanged && (this.kind === 'workbook' || this.kind === 'whiteboard')) {
        const result = await this.saveFull(title, rawSnapshot);
        this.commitSaved(current, title, result.version);
        return;
      }

      // 绝不在 ops 为空时发 patch
      if (ops.length === 0) {
        this.dirty = false;
        this.setStatus('saved');
        return;
      }

      try {
        const patchResult = await this.savePatch({
          baseVersion: this.baseVersion,
          title: titleChanged ? title : undefined,
          ops,
        });
        this.commitSaved(current, title, patchResult.version);
      } catch (err) {
        if (err instanceof DocumentPatchConflictError) {
          this.baseVersion = err.currentVersion;
          const result = await this.saveFull(title, rawSnapshot);
          this.commitSaved(current, title, result.version);
          return;
        }
        throw err;
      }
    } catch (err) {
      this.setStatus('error');
      this.onError?.(err as Error);
    } finally {
      this.flushing = false;
      if (this.pendingFlush) {
        this.pendingFlush = false;
        void this.flush(false);
      }
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private commitSaved(snapshot: Record<string, unknown>, title: string, version: number): void {
    this.lastSavedSnapshot = cloneSnapshot(snapshot);
    this.lastSavedTitle = title;
    this.baseVersion = version;
    this.dirty = false;
    this.setStatus('saved');
    this.onSaved?.(version);
  }

  private setStatus(status: SaveStatus): void {
    this.onStatusChange?.(status);
  }
}
