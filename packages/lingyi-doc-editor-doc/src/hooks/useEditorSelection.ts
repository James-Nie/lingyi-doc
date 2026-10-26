import { useCallback } from 'react';
import type { DocBlock, DocSelection, DocAnchor, DocSelectionContext, InlineFormatAction, NativeTextSelectionDetail, TextSelectionSlice, TextMark, PendingCaretSpec } from '@lingyi-doc/core-doc';
import { isCollapsedDocSelection, isWholeBlockSelection,
  getSelectionBlockIndices,
  getSelectionBlockRange,
  getInlineStateFromSelection,
  selectAllDocumentBlocks,
  selectBlockRange,
  docSelectionToContext,
  resolveEditableDocSelection,
  isCrossBlockEditableSelection,
  applyInlineFormatToBlocks,
  restoreNativeTextSelection,
  syncFormattedBlocksDom,
  saveSelection,
  restoreSelection,
  selectElementContents,
  getNativeTextSelectionDetail,
} from '@lingyi-doc/core-doc';

interface SelectionDeps {
  blocksRef: React.MutableRefObject<DocBlock[]>;
  blockRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  /** 选区快照保护锁：为 true 期间（如链接弹窗打开）不因选区折叠而清空已保存选区 */
  selectionSnapshotLockRef?: React.MutableRefObject<boolean>;
  docSelectionRef: React.MutableRefObject<DocSelection | null>;
  savedTextSelectionRef: React.MutableRefObject<NativeTextSelectionDetail | null>;
  pendingSelectionRestoreRef: React.MutableRefObject<{ blocks: DocBlock[]; slices: TextSelectionSlice[] } | null>;
  skipSelectionClearRef: React.MutableRefObject<boolean>;
  setDocSelection: (sel: DocSelection | null) => void;
  setActiveIndex: (idx: number) => void;
  onActiveBlockChange: (idx: number) => void;
  onBlocksChange: (blocks: DocBlock[], recordHistory?: boolean) => void;
  onToolbarStateChange: (partial: Partial<import('@lingyi-doc/core-doc').ToolbarState>, blockIndex: number) => void;
  activeIndex: number;
}

export function useEditorSelection(deps: SelectionDeps) {
  const {
    blocksRef,
    blockRefs,
    selectionSnapshotLockRef,
    docSelectionRef,
    savedTextSelectionRef,
    pendingSelectionRestoreRef,
    skipSelectionClearRef,
    setDocSelection,
    setActiveIndex,
    onActiveBlockChange,
    onBlocksChange,
    onToolbarStateChange,
    activeIndex,
  } = deps;

  const applyDocSelectionVisual = useCallback((sel: DocSelection) => {
    if (!isCollapsedDocSelection(sel)) {
      skipSelectionClearRef.current = true;
      // 只有在块级选择（选择整个块）时才清除浏览器原生选择
      // 文本级选择需要保留浏览器选择，以便评论按钮能检测到选中区域
      if (isWholeBlockSelection(sel)) {
        window.getSelection()?.removeAllRanges();
      }
    }
  }, [skipSelectionClearRef]);

  const hasActiveDocSelection = useCallback(() => {
    return !!resolveEditableDocSelection(
      blocksRef.current,
      blockRefs.current,
      docSelectionRef.current,
      savedTextSelectionRef.current,
    );
  }, [blocksRef, blockRefs, docSelectionRef, savedTextSelectionRef]);

  const clearActiveDocSelection = useCallback(() => {
    setDocSelection(null);
    savedTextSelectionRef.current = null;
  }, [setDocSelection, savedTextSelectionRef]);

  const resolveActiveDocSelection = useCallback((): DocSelection | null => {
    return resolveEditableDocSelection(
      blocksRef.current,
      blockRefs.current,
      docSelectionRef.current,
      savedTextSelectionRef.current,
    );
  }, [blocksRef, blockRefs, docSelectionRef, savedTextSelectionRef]);

  const getContext = useCallback((): DocSelectionContext | null => {
    const sel = docSelectionRef.current;
    if (sel && !isCollapsedDocSelection(sel)) {
      return docSelectionToContext(sel, blocksRef.current);
    }
    return getSelectionBlockRange();
  }, [docSelectionRef, blocksRef]);

  const refreshToolbarState = useCallback((blockIndex?: number) => {
    const idx = blockIndex ?? activeIndex;
    const inline = getInlineStateFromSelection();
    onToolbarStateChange(inline, idx);
  }, [activeIndex, onToolbarStateChange]);

  const selectEntireDocument = useCallback(() => {
    const allBlocks = blocksRef.current;
    if (!allBlocks.length) return;

    const sel = selectAllDocumentBlocks(allBlocks.length);
    skipSelectionClearRef.current = true;
    setDocSelection(sel);
    window.getSelection()?.removeAllRanges();
    setActiveIndex(0);
    onActiveBlockChange(0);
    refreshToolbarState(0);
  }, [blocksRef, skipSelectionClearRef, setDocSelection, setActiveIndex, onActiveBlockChange, refreshToolbarState]);

  const selectCurrentBlock = useCallback((blockIndex: number) => {
    if (blockIndex < 0 || blockIndex >= blocksRef.current.length) return;
    const sel = selectBlockRange(blockIndex, blockIndex);
    skipSelectionClearRef.current = true;
    setDocSelection(sel);
    window.getSelection()?.removeAllRanges();
    setActiveIndex(blockIndex);
    onActiveBlockChange(blockIndex);
    refreshToolbarState(blockIndex);
  }, [blocksRef, skipSelectionClearRef, setDocSelection, setActiveIndex, onActiveBlockChange, refreshToolbarState]);

  const isFullDocumentSelection = useCallback(() => {
    const sel = docSelectionRef.current;
    if (!sel || isCollapsedDocSelection(sel)) return false;
    const indices = getSelectionBlockIndices(sel, blocksRef.current);
    if (!indices?.length) return false;
    return indices.length === blocksRef.current.length
      && indices[0] === 0
      && indices[indices.length - 1] === blocksRef.current.length - 1;
  }, [docSelectionRef, blocksRef]);

  const isSingleBlockFullySelected = useCallback((blockIndex: number) => {
    const sel = docSelectionRef.current;
    if (!sel || isCollapsedDocSelection(sel)) return false;
    const indices = getSelectionBlockIndices(sel, blocksRef.current);
    return !!indices && indices.length === 1 && indices[0] === blockIndex;
  }, [docSelectionRef, blocksRef]);

  const getFormatBlockIndices = useCallback((ctx: DocSelectionContext | null): number[] => {
    const sel = docSelectionRef.current;
    if (sel && !isCollapsedDocSelection(sel)) {
      return getSelectionBlockIndices(sel, blocksRef.current) ?? [activeIndex];
    }
    if (ctx?.isMultiBlock) {
      const indices: number[] = [];
      for (let i = ctx.startBlock; i <= ctx.endBlock; i++) indices.push(i);
      return indices;
    }
    if (ctx?.hasTextSelection) return [ctx.startBlock];
    return [activeIndex];
  }, [docSelectionRef, blocksRef, activeIndex]);

  const captureTextSelectionSnapshot = useCallback(() => {
    // 保护锁期间（如链接/图片弹窗打开导致焦点转移）：选区折叠不代表用户取消选择，
    // 保留 savedTextSelectionRef 供确认后恢复使用
    if (selectionSnapshotLockRef?.current) return;
    const detail = getNativeTextSelectionDetail(blocksRef.current, blockRefs.current);
    if (detail && !detail.collapsed && detail.slices.length) {
      savedTextSelectionRef.current = detail;
    } else if (detail?.collapsed) {
      savedTextSelectionRef.current = null;
    }
  }, [blocksRef, blockRefs, savedTextSelectionRef, selectionSnapshotLockRef]);

  const flushPendingSelectionRestore = useCallback(() => {
    const pending = pendingSelectionRestoreRef.current;
    if (!pending) return;
    pendingSelectionRestoreRef.current = null;
    syncFormattedBlocksDom(pending.blocks, pending.slices, blockRefs.current);
    skipSelectionClearRef.current = true;
    restoreNativeTextSelection(pending.blocks, pending.slices, blockRefs.current);
    savedTextSelectionRef.current = {
      slices: pending.slices,
      collapsed: false,
    };
  }, [pendingSelectionRestoreRef, blockRefs, skipSelectionClearRef, savedTextSelectionRef]);

  return {
    applyDocSelectionVisual,
    hasActiveDocSelection,
    clearActiveDocSelection,
    resolveActiveDocSelection,
    getContext,
    refreshToolbarState,
    selectEntireDocument,
    selectCurrentBlock,
    isFullDocumentSelection,
    isSingleBlockFullySelected,
    getFormatBlockIndices,
    captureTextSelectionSnapshot,
    flushPendingSelectionRestore,
  };
}
