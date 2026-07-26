import { useCallback } from 'react';
import type { DocBlock, DocSelectionContext, InlineFormatAction, TextMark } from '@lingyi-doc/core-doc';
import {
  isTextBlock,
  increaseBlockIndent,
  decreaseBlockIndent,
  getNativeTextSelectionDetail,
  applyInlineFormatToBlocks,
  saveSelection,
  restoreSelection,
  selectElementContents,
  normalizeMarks,
} from '@lingyi-doc/core-doc';
import type { ToolbarAction } from '../RichDocEditor';

interface ToolbarDeps {
  readOnly: boolean;
  blocks: DocBlock[];
  activeIndex: number;
  blocksRef: React.MutableRefObject<DocBlock[]>;
  blockRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  savedTextSelectionRef: React.MutableRefObject<any>;
  pendingSelectionRestoreRef: React.MutableRefObject<{ blocks: DocBlock[]; slices: any[] } | null>;
  hasActiveDocSelection: () => boolean;
  getContext: () => DocSelectionContext | null;
  getFormatBlockIndices: (ctx: DocSelectionContext | null) => number[];
  syncBlockFromEl: (index: number, el: HTMLElement) => void;
  refreshToolbarState: (blockIndex?: number) => void;
  onBlocksChange: (blocks: DocBlock[], recordHistory?: boolean) => void;
  onToolbarAction: (action: ToolbarAction, ctx: DocSelectionContext | null) => void;
  onToolbarStateChange: (partial: Partial<import('@lingyi-doc/core-doc').ToolbarState>, blockIndex: number) => void;
  setActiveIndex: (idx: number) => void;
  onActiveBlockChange: (idx: number) => void;
  setToolbarInsertMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  /** 打开链接对话框的回调 */
  onOpenLinkDialog?: () => void;
}

export function useEditorToolbar(deps: ToolbarDeps) {
  const {
    readOnly,
    blocks,
    activeIndex,
    blocksRef,
    blockRefs,
    savedTextSelectionRef,
    pendingSelectionRestoreRef,
    hasActiveDocSelection,
    getContext,
    getFormatBlockIndices,
    syncBlockFromEl,
    refreshToolbarState,
    onBlocksChange,
    onToolbarAction,
    onToolbarStateChange,
    setActiveIndex,
    onActiveBlockChange,
    setToolbarInsertMenuOpen,
    onOpenLinkDialog,
  } = deps;

  const applyInlineFormat = useCallback((action: InlineFormatAction): boolean => {
    let detail = getNativeTextSelectionDetail(blocksRef.current, blockRefs.current);
    if ((!detail || detail.collapsed || !detail.slices.length) && savedTextSelectionRef.current) {
      detail = savedTextSelectionRef.current;
    }
    if (!detail || detail.collapsed || !detail.slices.length) return false;

    const slices = detail.slices;
    const next = applyInlineFormatToBlocks(blocksRef.current, slices, action);
    pendingSelectionRestoreRef.current = { blocks: next, slices };
    onBlocksChange(next, true);

    refreshToolbarState(slices[0].blockIndex);
    setActiveIndex(slices[0].blockIndex);
    onActiveBlockChange(slices[0].blockIndex);
    return true;
  }, [onBlocksChange, refreshToolbarState, onActiveBlockChange, blocksRef, blockRefs, savedTextSelectionRef, pendingSelectionRestoreRef, setActiveIndex]);

  const applyInlineToTargets = useCallback((action: InlineFormatAction, selectAllInMulti = true) => {
    if (applyInlineFormat(action)) return;

    const ctx = getContext();
    if (ctx?.hasTextSelection || savedTextSelectionRef.current?.slices.length) {
      return;
    }

    const indices = getFormatBlockIndices(ctx);
    const saved = saveSelection();
    const isMulti = indices.length > 1 || hasActiveDocSelection();

    indices.forEach(i => {
      const block = blocksRef.current[i];
      const el = block?.id ? blockRefs.current.get(block.id) : null;
      if (!el?.isContentEditable) return;
      if (isMulti && selectAllInMulti) selectElementContents(el);
      if (action.type === 'bold') document.execCommand('bold', false);
      else if (action.type === 'italic') document.execCommand('italic', false);
      else if (action.type === 'underline') document.execCommand('underline', false);
      else if (action.type === 'strikethrough') document.execCommand('strikeThrough', false);
      else if (action.type === 'color') document.execCommand('foreColor', false, action.value);
      else if (action.type === 'background') {
        if (action.value === 'transparent') document.execCommand('removeFormat', false);
        else document.execCommand('hiliteColor', false, action.value);
      } else if (action.type === 'fontSize') document.execCommand('fontSize', false, '3');
      else if (action.type === 'link') document.execCommand('createLink', false, action.value);
      syncBlockFromEl(i, el);
    });

    if (!isMulti) restoreSelection(saved);
    refreshToolbarState(indices[0] ?? activeIndex);
  }, [applyInlineFormat, getContext, getFormatBlockIndices, syncBlockFromEl, refreshToolbarState, activeIndex, hasActiveDocSelection, blocksRef, blockRefs, savedTextSelectionRef]);

  /** 应用链接：将选区文本替换为标题，并应用 link mark */
  const applyLinkWithTitle = useCallback((title: string, url: string) => {
    let detail = getNativeTextSelectionDetail(blocksRef.current, blockRefs.current);
    if ((!detail || detail.collapsed || !detail.slices.length) && savedTextSelectionRef.current) {
      detail = savedTextSelectionRef.current;
    }
    if (!detail || detail.collapsed || !detail.slices.length) {
      // 回退到 execCommand 方式（没有选区时）
      applyInlineToTargets({ type: 'link', value: url }, false);
      return;
    }

    const slice = detail.slices[0];
    const block = blocksRef.current[slice.blockIndex];
    if (!block) return;

    // 先应用 link mark 到选区
    const next = applyInlineFormatToBlocks(blocksRef.current, detail.slices, { type: 'link', value: url });

    // 对于文本块：如果标题与选区文本不同，需要替换文本
    const blockAfter = next[slice.blockIndex];
    if (blockAfter && isTextBlock(blockAfter)) {
      const originalSelectedText = isTextBlock(block) ? block.text.slice(slice.start, slice.end) : title;
      if (title !== originalSelectedText) {
        const beforeText = blockAfter.text.slice(0, slice.start);
        const afterText = blockAfter.text.slice(slice.end);
        const newText = beforeText + title + afterText;

        // 调整所有 mark 的位置：选区之后的 mark 需要偏移
        const titleLen = title.length;
        const origLen = slice.end - slice.start;
        const diff = titleLen - origLen;
        const adjustedMarks: TextMark[] = blockAfter.marks.map(m => {
          if (m.end <= slice.start) return m; // 在选区之前，不变
          if (m.start >= slice.end) return { ...m, start: m.start + diff, end: m.end + diff }; // 在选区之后，偏移
          // 跨选区的 mark：调整 end
          return { ...m, end: m.end + diff };
        });

        next[slice.blockIndex] = {
          ...blockAfter,
          text: newText,
          marks: normalizeMarks(adjustedMarks, newText.length),
        };
      }
    }

    // 更新选区信息以反映新文本长度
    const updatedSlices = detail.slices.map(s => ({
      ...s,
      end: s.start + title.length,
    }));
    pendingSelectionRestoreRef.current = { blocks: next, slices: updatedSlices };
    onBlocksChange(next, true);

    refreshToolbarState(slice.blockIndex);
    setActiveIndex(slice.blockIndex);
    onActiveBlockChange(slice.blockIndex);
  }, [applyInlineToTargets, applyInlineFormatToBlocks, onBlocksChange, refreshToolbarState, onActiveBlockChange, blocksRef, blockRefs, savedTextSelectionRef, pendingSelectionRestoreRef, setActiveIndex]);

  const handleToolbarAction = useCallback((action: ToolbarAction) => {
    if (readOnly) return;
    const ctx = getContext();

    if (action.type === 'inline') {
      applyInlineToTargets({ type: action.cmd });
      return;
    }
    if (action.type === 'color') {
      applyInlineToTargets({ type: 'color', value: action.color });
      return;
    }
    if (action.type === 'background') {
      applyInlineToTargets({ type: 'background', value: action.color });
      return;
    }
    if (action.type === 'fontSize') {
      applyInlineToTargets({ type: 'fontSize', value: `${action.size}px` });
      onToolbarStateChange({ fontSize: action.size }, getFormatBlockIndices(ctx)[0] ?? activeIndex);
      return;
    }
    if (action.type === 'link') {
      onOpenLinkDialog?.();
      return;
    }
    if (action.type === 'indent') {
      const indices = getFormatBlockIndices(ctx);
      const next = [...blocks];
      indices.forEach(i => {
        const block = next[i];
        if (!isTextBlock(block)) return;
        next[i] = action.direction === 'increase'
          ? increaseBlockIndent(block)
          : decreaseBlockIndent(block);
      });
      onBlocksChange(next, true);
      return;
    }
    if (action.type === 'new') {
      setToolbarInsertMenuOpen(v => !v);
      return;
    }

    onToolbarAction(action, ctx);
  }, [activeIndex, applyInlineToTargets, blocks, getContext, getFormatBlockIndices, onBlocksChange, onToolbarAction, onToolbarStateChange, readOnly, setToolbarInsertMenuOpen]);

  return { applyInlineFormat, applyInlineToTargets, handleToolbarAction, applyLinkWithTitle };
}
