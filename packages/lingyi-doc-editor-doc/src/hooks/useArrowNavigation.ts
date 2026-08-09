import { useCallback, useEffect } from 'react';
import type { DocBlock, DocSelection, DocAnchor } from '@lingyi-doc/core-doc';
import {
  isCollapsedDocSelection,
  getSelectionBlockIndices,
  blockAnchor,
  getFocusedDocContext,
  isTextBlock,
  isObjectBlock,
  isCaretAtStart,
  isCaretAtEnd,
  getCollapsedCaretClientX,
  setCaretFromClientX,
  getListItemTextEl,
  getListCaretContext,
} from '@lingyi-doc/core-doc';

interface ArrowDeps {
  blocksRef: React.MutableRefObject<DocBlock[]>;
  blockRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  editorRef: React.MutableRefObject<HTMLDivElement | null>;
  activeIndexRef: React.MutableRefObject<number>;
  selectedImageIndexRef: React.MutableRefObject<number | null>;
  selectedTableIndexRef: React.MutableRefObject<number | null>;
  selectedBaseIndexRef: React.MutableRefObject<number | null>;
  selectedWhiteboardIndexRef: React.MutableRefObject<number | null>;
  selectedCodeIndexRef: React.MutableRefObject<number | null>;
  docSelectionRef: React.MutableRefObject<DocSelection | null>;
  preferredCaretXRef: React.MutableRefObject<number | null>;
  setDocSelection: (sel: DocSelection | null) => void;
  setSelectedImageIndex: (idx: number | null) => void;
  setSelectedCodeIndex: (idx: number | null) => void;
  setSelectedTableIndex: (idx: number | null) => void;
  setSelectedBaseIndex: (idx: number | null) => void;
  setSelectedWhiteboardIndex: (idx: number | null) => void;
  setActiveIndex: (idx: number) => void;
  onActiveBlockChange: (idx: number) => void;
  focusBlockAt: (index: number, position: 'start' | 'end' | number, listItemIndex?: number) => void;
  findNearestTextBlockIndex: (blocks: DocBlock[], from: number, direction: -1 | 1) => number;
  selectObjectBlock: (idx: number) => void;
  hasActiveDocSelection: () => boolean;
  applyDocSelectionVisual: (sel: DocSelection) => void;
}

export function useArrowNavigation(deps: ArrowDeps) {
  const {
    blocksRef,
    blockRefs,
    editorRef,
    activeIndexRef,
    selectedImageIndexRef,
    selectedTableIndexRef,
    selectedBaseIndexRef,
    selectedWhiteboardIndexRef,
    selectedCodeIndexRef,
    docSelectionRef,
    preferredCaretXRef,
    setDocSelection,
    setSelectedImageIndex,
    setSelectedCodeIndex,
    setSelectedTableIndex,
    setSelectedBaseIndex,
    setSelectedWhiteboardIndex,
    setActiveIndex,
    onActiveBlockChange,
    focusBlockAt,
    findNearestTextBlockIndex,
    selectObjectBlock,
    hasActiveDocSelection,
    applyDocSelectionVisual,
  } = deps;

  const navigateDocArrow = useCallback((key: string): boolean => {
    const root = editorRef.current;
    if (!root) return false;

    const allBlocks = blocksRef.current;
    const isVertical = key === 'ArrowUp' || key === 'ArrowDown';
    const dir: -1 | 1 = (key === 'ArrowUp' || key === 'ArrowLeft') ? -1 : 1;

    const selectedObj =
      selectedImageIndexRef.current
      ?? selectedTableIndexRef.current
      ?? selectedBaseIndexRef.current
      ?? selectedWhiteboardIndexRef.current
      ?? selectedCodeIndexRef.current
      ?? null;

    const focusInEditor = root.contains(document.activeElement);
    if (!focusInEditor && selectedObj == null && !hasActiveDocSelection()) return false;

    const ctx = getFocusedDocContext(root);

    const rememberCaretX = () => {
      const x = getCollapsedCaretClientX();
      if (x != null) preferredCaretXRef.current = x;
    };

    const focusAdjacent = (fromIndex: number, direction: -1 | 1, preferEnd: boolean): boolean => {
      const adj = fromIndex + direction;
      if (adj < 0 || adj >= allBlocks.length) return false;
      const target = allBlocks[adj];
      if (!target) return false;

      if (isObjectBlock(target)) {
        preferredCaretXRef.current = null;
        selectObjectBlock(adj);
        setDocSelection(null);
        setActiveIndex(adj);
        onActiveBlockChange(adj);
        return true;
      }

      if (isTextBlock(target) || target.type === 'list') {
        const el = blockRefs.current.get(target.id);
        const preferredX = preferredCaretXRef.current;
        setDocSelection(null);
        setActiveIndex(adj);
        onActiveBlockChange(adj);
        setSelectedImageIndex(null);
        setSelectedCodeIndex(null);
        setSelectedTableIndex(null);
        setSelectedBaseIndex(null);
        setSelectedWhiteboardIndex(null);

        if (el && preferredX != null && isVertical) {
          el.focus({ preventScroll: true });
          const ok = setCaretFromClientX(el, preferredX, preferEnd);
          if (ok) return true;
        }
        focusBlockAt(adj, preferEnd ? 'end' : 'start');
        return true;
      }
      return false;
    };

    if (hasActiveDocSelection()) {
      setDocSelection(null);
      focusBlockAt(activeIndexRef.current, key === 'ArrowUp' ? 'end' : 'start');
      return true;
    }

    if (selectedObj != null && (ctx.kind === 'none' || !ctx.editable || ctx.blockIndex === selectedObj)) {
      if (isVertical || key === 'ArrowLeft' || key === 'ArrowRight') {
        return focusAdjacent(selectedObj, dir, dir < 0);
      }
    }

    if (!focusInEditor) return false;

    if (ctx.kind === 'title' && ctx.editable) {
      if (key === 'ArrowDown') {
        if (focusAdjacent(-1, 1, false)) return true;
        const idx = findNearestTextBlockIndex(allBlocks, 0, 1);
        if (idx >= 0) focusBlockAt(idx, 'start');
        return true;
      }
      return false;
    }

    if (ctx.kind === 'none' || !ctx.editable) return false;

    if (ctx.kind === 'code' || ctx.kind === 'mermaid') {
      const el = ctx.editable;
      if (key === 'ArrowUp' && ctx.blockIndex > 0) {
        const ta = el instanceof HTMLTextAreaElement ? el : null;
        if (!ta || ta.selectionStart === 0) {
          rememberCaretX();
          return focusAdjacent(ctx.blockIndex, -1, true);
        }
      }
      if (key === 'ArrowDown' && ctx.blockIndex < allBlocks.length - 1) {
        const ta = el instanceof HTMLTextAreaElement ? el : null;
        if (!ta || ta.selectionStart === ta.value.length) {
          rememberCaretX();
          return focusAdjacent(ctx.blockIndex, 1, false);
        }
      }
      return false;
    }

    const blockIndex = ctx.blockIndex;
    if (blockIndex < 0) return false;
    const block = allBlocks[blockIndex];
    const el = ctx.editable;

    if (ctx.kind === 'list' && block.type === 'list') {
      const listRoot = (el?.dataset.listRoot !== undefined ? el : blockRefs.current.get(block.id)) as HTMLElement | null;
      if (!listRoot) return false;
      const caretCtx = getListCaretContext(listRoot);
      if (!caretCtx) return false;
      const textEl = getListItemTextEl(listRoot, caretCtx.focusItemIndex);
      if (!textEl) return false;
      const itemIndex = caretCtx.focusItemIndex;

      if (key === 'ArrowUp' && isCaretAtStart(textEl)) {
        rememberCaretX();
        if (itemIndex > 0) {
          focusBlockAt(blockIndex, 'end', itemIndex - 1);
          return true;
        }
        return focusAdjacent(blockIndex, -1, true);
      }
      if (key === 'ArrowDown' && isCaretAtEnd(textEl)) {
        rememberCaretX();
        if (itemIndex < block.items.length - 1) {
          focusBlockAt(blockIndex, 'start', itemIndex + 1);
          return true;
        }
        return focusAdjacent(blockIndex, 1, false);
      }
      if (key === 'ArrowLeft' && isCaretAtStart(textEl)) {
        preferredCaretXRef.current = null;
        if (itemIndex > 0) {
          focusBlockAt(blockIndex, 'end', itemIndex - 1);
          return true;
        }
        return focusAdjacent(blockIndex, -1, true);
      }
      if (key === 'ArrowRight' && isCaretAtEnd(textEl)) {
        preferredCaretXRef.current = null;
        if (itemIndex < block.items.length - 1) {
          focusBlockAt(blockIndex, 'start', itemIndex + 1);
          return true;
        }
        return focusAdjacent(blockIndex, 1, false);
      }
      return false;
    }

    if (!isTextBlock(block)) return false;

    if (key === 'ArrowUp' && isCaretAtStart(el)) {
      rememberCaretX();
      if (blockIndex === 0) {
        const titleEl = root.querySelector('[data-doc-title][contenteditable]') as HTMLElement | null;
        titleEl?.focus();
        return !!titleEl;
      }
      return focusAdjacent(blockIndex, -1, true);
    }
    if (key === 'ArrowDown' && isCaretAtEnd(el)) {
      rememberCaretX();
      return focusAdjacent(blockIndex, 1, false);
    }
    if (key === 'ArrowLeft' && isCaretAtStart(el) && blockIndex > 0) {
      preferredCaretXRef.current = null;
      return focusAdjacent(blockIndex, -1, true);
    }
    if (key === 'ArrowRight' && isCaretAtEnd(el) && blockIndex < allBlocks.length - 1) {
      preferredCaretXRef.current = null;
      return focusAdjacent(blockIndex, 1, false);
    }
    return false;
  }, [focusBlockAt, findNearestTextBlockIndex, selectObjectBlock, onActiveBlockChange, hasActiveDocSelection, blocksRef, blockRefs, editorRef, selectedImageIndexRef, selectedTableIndexRef, selectedBaseIndexRef, selectedWhiteboardIndexRef, selectedCodeIndexRef, docSelectionRef, preferredCaretXRef, setDocSelection, setActiveIndex, setSelectedImageIndex, setSelectedCodeIndex, setSelectedTableIndex, setSelectedBaseIndex, setSelectedWhiteboardIndex]);

  // Arrow key event listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (navigateDocArrow(e.key)) e.preventDefault();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [navigateDocArrow]);

  // Shift+Arrow block selection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.shiftKey) return;
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;

      const root = editorRef.current;
      if (!root) return;

      const dir: -1 | 1 = (e.key === 'ArrowUp' || e.key === 'ArrowLeft') ? -1 : 1;
      const blocks = blocksRef.current;
      if (!blocks.length) return;

      const objectIdx =
        selectedImageIndexRef.current
        ?? selectedTableIndexRef.current
        ?? selectedBaseIndexRef.current
        ?? selectedWhiteboardIndexRef.current
        ?? selectedCodeIndexRef.current
        ?? null;

      const sel = docSelectionRef.current;
      if (sel && !isCollapsedDocSelection(sel)) {
        const indices = getSelectionBlockIndices(sel, blocks);
        if (!indices?.length) return;
        const focusIdx = sel.focus.kind === 'block' ? sel.focus.blockIndex : indices[indices.length - 1];
        const nextFocus = Math.max(0, Math.min(blocks.length - 1, focusIdx + dir));
        if (nextFocus === focusIdx) return;
        e.preventDefault();
        e.stopPropagation();
        const next: DocSelection = { anchor: sel.anchor, focus: blockAnchor(nextFocus) };
        setDocSelection(next);
        applyDocSelectionVisual(next);
        setSelectedImageIndex(null);
        setSelectedCodeIndex(null);
        setSelectedTableIndex(null);
        setSelectedBaseIndex(null);
        setSelectedWhiteboardIndex(null);
        window.getSelection()?.removeAllRanges();
        return;
      }

      if (objectIdx != null) {
        const nextFocus = Math.max(0, Math.min(blocks.length - 1, objectIdx + dir));
        if (nextFocus === objectIdx) return;
        e.preventDefault();
        e.stopPropagation();
        const next: DocSelection = {
          anchor: blockAnchor(objectIdx),
          focus: blockAnchor(nextFocus),
        };
        setDocSelection(next);
        applyDocSelectionVisual(next);
        setSelectedImageIndex(null);
        setSelectedCodeIndex(null);
        setSelectedTableIndex(null);
        setSelectedBaseIndex(null);
        setSelectedWhiteboardIndex(null);
        window.getSelection()?.removeAllRanges();
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [applyDocSelectionVisual]);

  return { navigateDocArrow };
}
