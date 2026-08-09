import { useCallback, useEffect } from 'react';
import type { DocBlock, DocSelection, DocAnchor } from '@lingyi-doc/core-doc';
import {
  applyTextSelectionBetweenAnchors,
  resolveAnchorFromPoint,
  resolveAnchorFromNode,
  resolveBlockIndexFromClientY,
  resolveClickCaretPosition,
  blockAnchor,
  findBlockIndexFromNode,
  getNativeTextSelectionDetail,
  selectionSlicesToAnchors,
  getListCaretContext,
  getCaretOffset,
  isCollapsedDocSelection,
  getSelectionBlockIndices,
  getBlockSelectionState,
  createRangeForBlockSelection,
  normalizeDocSelection,
  isTextBlock,
  type BlockSelectionState,
} from '@lingyi-doc/core-doc';
import type { ToolbarAction } from '../RichDocEditor';

interface MouseDeps {
  readOnly: boolean;
  blocksRef: React.MutableRefObject<DocBlock[]>;
  blockRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  editorRef: React.MutableRefObject<HTMLDivElement | null>;
  docSelectionRef: React.MutableRefObject<DocSelection | null>;
  activeIndexRef: React.MutableRefObject<number>;
  skipSelectionClearRef: React.MutableRefObject<boolean>;
  dragAnchor: React.MutableRefObject<number | null>;
  dragStartAnchor: React.MutableRefObject<DocAnchor | null>;
  dragMoved: React.MutableRefObject<boolean>;
  isDragging: React.MutableRefObject<boolean>;
  savedTextSelectionRef: React.MutableRefObject<any>;
  textSelectAnchorRef: React.MutableRefObject<DocAnchor | null>;
  textSelectCleanupRef: React.MutableRefObject<(() => void) | null>;
  setDocSelection: (sel: DocSelection | null) => void;
  setSelectedImageIndex: (idx: number | null) => void;
  setSelectedCodeIndex: (idx: number | null) => void;
  setSelectedTableIndex: (idx: number | null) => void;
  setSelectedBaseIndex: (idx: number | null) => void;
  setActiveHandleIndex: (idx: number | null) => void;
  setActiveIndex: (idx: number) => void;
  onActiveBlockChange: (idx: number) => void;
  focusBlockAt: (index: number, position: 'start' | 'end' | number, listItemIndex?: number) => void;
  selectObjectBlock: (idx: number) => void;
  keepImageSelected: (idx: number) => void;
  keepCodeSelected: (idx: number) => void;
  keepTableSelected: (idx: number) => void;
  applyDocSelectionVisual: (sel: DocSelection) => void;
  captureTextSelectionSnapshot: () => void;
  refreshToolbarState: (blockIndex?: number) => void;
}

/** 当跨块原生选区无法由浏览器实现时，在每个块内独立高亮选中部分 */
function applyBlockInternalRanges(
  sel: DocSelection,
  blocks: DocBlock[],
  blockEls: Map<string, HTMLElement>,
): void {
  const indices = getSelectionBlockIndices(sel, blocks);
  if (!indices || indices.length === 0) return;

  // 先移除全局原生选区，让各块独立设置
  window.getSelection()?.removeAllRanges();

  for (const idx of indices) {
    const block = blocks[idx];
    const el = blockEls.get(block.id);
    if (!block || !el) continue;

    // 只有文本块和列表块需要内部高亮
    if (!isTextBlock(block) && block.type !== 'list') continue;

    const state = getBlockSelectionState(sel, idx, blocks);
    if (state === 'none') continue;

    try {
      const range = createRangeForBlockSelection(el, block, idx, sel, blocks);
      if (range) {
        const nativeSel = window.getSelection();
        if (nativeSel) nativeSel.addRange(range);
      }
    } catch {
      // 跨 contentEditable 的 Range 可能被浏览器截断，忽略错误
    }
  }
}

export function useEditorMouse(deps: MouseDeps) {
  const {
    readOnly,
    blocksRef,
    blockRefs,
    editorRef,
    docSelectionRef,
    activeIndexRef,
    skipSelectionClearRef,
    dragAnchor,
    dragStartAnchor,
    dragMoved,
    isDragging,
    savedTextSelectionRef,
    textSelectAnchorRef,
    textSelectCleanupRef,
    setDocSelection,
    setSelectedImageIndex,
    setSelectedCodeIndex,
    setSelectedTableIndex,
    setSelectedBaseIndex,
    setActiveHandleIndex,
    setActiveIndex,
    onActiveBlockChange,
    focusBlockAt,
    selectObjectBlock,
    keepImageSelected,
    keepCodeSelected,
    keepTableSelected,
    applyDocSelectionVisual,
    captureTextSelectionSnapshot,
    refreshToolbarState,
  } = deps;

  const finishTextSelectDrag = useCallback(() => {
    textSelectAnchorRef.current = null;
    textSelectCleanupRef.current?.();
    textSelectCleanupRef.current = null;
  }, [textSelectAnchorRef, textSelectCleanupRef]);

  const startTextSelectDrag = useCallback((anchor: DocAnchor | null) => {
    finishTextSelectDrag();
    if (!anchor) return;
    textSelectAnchorRef.current = anchor;

    const onMove = (e: MouseEvent) => {
      if (e.buttons !== 1) {
        finishTextSelectDrag();
        return;
      }
      let focus = resolveAnchorFromPoint(e.clientX, e.clientY, blocksRef.current)
        ?? resolveAnchorFromNode(document.elementFromPoint(e.clientX, e.clientY), blocksRef.current);

      if (!focus && editorRef.current) {
        const idx = resolveBlockIndexFromClientY(e.clientY, editorRef.current);
        const block = idx >= 0 ? blocksRef.current[idx] : null;
        const rowEl = editorRef.current.querySelector(`[data-block-row="${idx}"]`) as HTMLElement | null;
        if (block && (block.type === 'paragraph' || block.type === 'heading' || block.type === 'quote')) {
          const pos = resolveClickCaretPosition(e.clientY, rowEl);
          focus = blockAnchor(idx, {
            kind: 'text',
            offset: pos === 'end' ? block.text.length : 0,
          });
        } else if (block?.type === 'list') {
          focus = blockAnchor(idx, { kind: 'whole' });
        }
      }

      if (focus && textSelectAnchorRef.current) {
        skipSelectionClearRef.current = true;
        const applied = applyTextSelectionBetweenAnchors(
          textSelectAnchorRef.current,
          focus,
          blocksRef.current,
          blockRefs.current,
        );
        if (applied) {
          captureTextSelectionSnapshot();
        } else {
          // 跨 contentEditable 的原生选区失败（浏览器限制）
          // 改用 docSelection + 逐块原生 Range 来视觉呈现选区
          const sel: DocSelection = { anchor: textSelectAnchorRef.current, focus };
          setDocSelection(sel);
          applyDocSelectionVisual(sel);
          // 尝试在每个块内部高亮选中部分
          applyBlockInternalRanges(sel, blocksRef.current, blockRefs.current);
          captureTextSelectionSnapshot();
        }
      }
    };

    const onUp = () => {
      // 拖拽结束：将跨块选区同步到 docSelection
      if (textSelectAnchorRef.current && isDragging.current) {
        // 已经在 onMove 中设置了 docSelection，保持即可
      }
      finishTextSelectDrag();
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    textSelectCleanupRef.current = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [finishTextSelectDrag, captureTextSelectionSnapshot, blocksRef, blockRefs, editorRef, skipSelectionClearRef, textSelectAnchorRef, textSelectCleanupRef, setDocSelection, applyDocSelectionVisual]);

  const focusBlockFromPointer = useCallback((clientX: number, clientY: number) => {
    const blocks = blocksRef.current;
    const editorEl = editorRef.current;
    if (!editorEl) return;

    const anchor = resolveAnchorFromPoint(clientX, clientY, blocks);
    if (anchor?.kind === 'title') return;

    if (anchor?.kind === 'block') {
      const block = blocks[anchor.blockIndex];
      if (!block) return;

      const isTextLike = block.type === 'paragraph' || block.type === 'heading' || block.type === 'quote' || block.type === 'list';
      if (isTextLike) {
        if (anchor.sub.kind === 'text') {
          focusBlockAt(anchor.blockIndex, anchor.sub.offset);
        } else if (anchor.sub.kind === 'list') {
          focusBlockAt(anchor.blockIndex, anchor.sub.offset, anchor.sub.itemIndex);
        } else {
          const row = editorEl.querySelector(`[data-block-row="${anchor.blockIndex}"]`) as HTMLElement | null;
          focusBlockAt(anchor.blockIndex, resolveClickCaretPosition(clientY, row));
        }
        refreshToolbarState(anchor.blockIndex);
        setActiveHandleIndex(null);
        return;
      }

      selectObjectBlock(anchor.blockIndex);
      return;
    }

    const blockIndex = resolveBlockIndexFromClientY(clientY, editorEl);
    if (blockIndex < 0) return;

    const block = blocks[blockIndex];
    if (!block) return;

    const row = editorEl.querySelector(`[data-block-row="${blockIndex}"]`) as HTMLElement | null;
    const position = resolveClickCaretPosition(clientY, row);

    const isTextLike = block.type === 'paragraph' || block.type === 'heading' || block.type === 'quote' || block.type === 'list';
    if (isTextLike) {
      focusBlockAt(blockIndex, position);
      refreshToolbarState(blockIndex);
      setActiveHandleIndex(null);
      return;
    }

    selectObjectBlock(blockIndex);
  }, [focusBlockAt, refreshToolbarState, selectObjectBlock, blocksRef, editorRef, setActiveHandleIndex]);

  const isNativeTextSelectionTarget = (target: Node): boolean => {
    if (!(target instanceof Element)) return false;
    if (target.closest('[data-doc-title]')) return true;
    if (target.closest('[data-doc-editable], [data-list-root], [data-list-text], [data-list-marker]')) return true;
    if (target.closest('[data-doc-code-ui] textarea, [data-doc-mermaid-ui] textarea')) return true;
    return false;
  };

  const handleEditorMouseDown = useCallback((e: React.MouseEvent) => {
    if (readOnly) return;
    const target = e.target as Node;
    if (target instanceof Element && (
      target.closest('[data-doc-block-insert-menu]')
      || target.closest('[data-doc-table-picker]')
    )) return;

    if (target instanceof Element && target.closest('[data-doc-title]')) return;

    // Shift+点击正文/列表：扩展文本选区
    if (e.shiftKey && isNativeTextSelectionTarget(target)) {
      finishTextSelectDrag();
      setDocSelection(null);
      setSelectedImageIndex(null);
      setSelectedCodeIndex(null);
      setSelectedTableIndex(null);
      setSelectedBaseIndex(null);

      const focusAnchor = resolveAnchorFromPoint(e.clientX, e.clientY, blocksRef.current)
        ?? resolveAnchorFromNode(target, blocksRef.current);
      if (!focusAnchor) return;

      let anchor: DocAnchor | null = null;
      const detail = getNativeTextSelectionDetail(blocksRef.current, blockRefs.current)
        ?? savedTextSelectionRef.current;
      if (detail && detail.slices.length) {
        const fromSlices = selectionSlicesToAnchors(detail.slices, detail.backward);
        if (fromSlices) anchor = fromSlices.anchor;
      }
      if (!anchor) {
        const sel = window.getSelection();
        if (sel?.anchorNode && editorRef.current?.contains(sel.anchorNode)) {
          anchor = resolveAnchorFromNode(sel.anchorNode, blocksRef.current);
        }
      }
      if (!anchor) {
        const activeIdx = activeIndexRef.current;
        const activeBlock = blocksRef.current[activeIdx];
        if (activeBlock && (activeBlock.type === 'paragraph' || activeBlock.type === 'heading' || activeBlock.type === 'quote' || activeBlock.type === 'list')) {
          const el = blockRefs.current.get(activeBlock.id);
          if (el && activeBlock.type === 'list') {
            const listCtx = getListCaretContext(el);
            anchor = blockAnchor(activeIdx, {
              kind: 'list',
              itemIndex: listCtx?.focusItemIndex ?? 0,
              offset: listCtx?.focusOffset ?? 0,
            });
          } else if (el) {
            anchor = blockAnchor(activeIdx, { kind: 'text', offset: getCaretOffset(el) });
          } else {
            anchor = blockAnchor(activeIdx, { kind: 'text', offset: 0 });
          }
        }
      }

      if (anchor) {
        skipSelectionClearRef.current = true;
        const applied = applyTextSelectionBetweenAnchors(
          anchor,
          focusAnchor,
          blocksRef.current,
          blockRefs.current,
        );
        if (applied) {
          captureTextSelectionSnapshot();
          e.preventDefault();
          return;
        }
      }
    }

    // 正文/列表内拖拽选字
    if (!e.shiftKey && isNativeTextSelectionTarget(target)) {
      setDocSelection(null);
      setSelectedImageIndex(null);
      setSelectedCodeIndex(null);
      setSelectedTableIndex(null);
      setSelectedBaseIndex(null);
      const anchor = resolveAnchorFromPoint(e.clientX, e.clientY, blocksRef.current)
        ?? resolveAnchorFromNode(target, blocksRef.current);
      dragAnchor.current = anchor?.kind === 'block' ? anchor.blockIndex : findBlockIndexFromNode(target);
      dragStartAnchor.current = anchor;
      dragMoved.current = false;
      isDragging.current = true;
      startTextSelectDrag(anchor);
      return;
    }
    finishTextSelectDrag();

    let idx = findBlockIndexFromNode(target);
    let anchor = resolveAnchorFromNode(target, blocksRef.current);

    if (idx < 0 && editorRef.current?.contains(target)) {
      const pointAnchor = resolveAnchorFromPoint(e.clientX, e.clientY, blocksRef.current);
      if (pointAnchor?.kind === 'block') {
        idx = pointAnchor.blockIndex;
        anchor = pointAnchor;
      } else {
        const fromY = resolveBlockIndexFromClientY(e.clientY, editorRef.current);
        if (fromY >= 0) {
          idx = fromY;
          anchor = blockAnchor(fromY);
        }
      }
    }

    if (idx < 0) {
      setDocSelection(null);
      setActiveHandleIndex(null);
      return;
    }

    if (e.shiftKey && anchor) {
      const baseAnchor = docSelectionRef.current?.anchor
        ?? blockAnchor(activeIndexRef.current);
      const next: DocSelection = { anchor: baseAnchor, focus: anchor };
      setDocSelection(next);
      applyDocSelectionVisual(next);
      setSelectedImageIndex(null);
      setSelectedCodeIndex(null);
      setSelectedTableIndex(null);
      setSelectedBaseIndex(null);
      e.preventDefault();
      return;
    }

    dragAnchor.current = idx;
    dragStartAnchor.current = anchor ?? blockAnchor(idx);
    dragMoved.current = false;
    isDragging.current = true;
    setDocSelection(null);
    setSelectedImageIndex(null);
    setSelectedCodeIndex(null);
    setSelectedTableIndex(null);
    setSelectedBaseIndex(null);
  }, [readOnly, finishTextSelectDrag, startTextSelectDrag, setDocSelection, setSelectedImageIndex, setSelectedCodeIndex, setSelectedTableIndex, setSelectedBaseIndex, setActiveHandleIndex, applyDocSelectionVisual, captureTextSelectionSnapshot, focusBlockFromPointer, blocksRef, blockRefs, editorRef, docSelectionRef, activeIndexRef, skipSelectionClearRef, dragAnchor, dragStartAnchor, dragMoved, isDragging, savedTextSelectionRef, onActiveBlockChange]);

  const handleEditorMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || e.buttons !== 1 || dragAnchor.current == null) return;
    dragMoved.current = true;

    const focus = resolveAnchorFromPoint(e.clientX, e.clientY, blocksRef.current)
      ?? resolveAnchorFromNode(e.target as Node, blocksRef.current);
    const startAnchor = dragStartAnchor.current ?? blockAnchor(dragAnchor.current);
    if (!focus) return;

    const next: DocSelection = { anchor: startAnchor, focus };
    setDocSelection(next);
    applyDocSelectionVisual(next);
    setSelectedImageIndex(null);
    setSelectedCodeIndex(null);
    setSelectedTableIndex(null);
    setSelectedBaseIndex(null);
  }, [isDragging, dragAnchor, dragStartAnchor, dragMoved, blocksRef, setDocSelection, applyDocSelectionVisual, setSelectedImageIndex, setSelectedCodeIndex, setSelectedTableIndex, setSelectedBaseIndex]);

  const handleEditorMouseUp = useCallback((e?: React.MouseEvent) => {
    finishTextSelectDrag();
    const wasDragging = isDragging.current;
    const moved = dragMoved.current;
    const anchorIdx = dragAnchor.current;
    isDragging.current = false;
    dragAnchor.current = null;
    dragStartAnchor.current = null;
    dragMoved.current = false;

    const sel = docSelectionRef.current;
    if (sel && !isCollapsedDocSelection(sel)) {
      // 跨块选区：在每个块内重新应用原生 Range 以保持视觉高亮
      applyBlockInternalRanges(sel, blocksRef.current, blockRefs.current);
      applyDocSelectionVisual(sel);
      captureTextSelectionSnapshot();
      const indices = getSelectionBlockIndices(sel, blocksRef.current);
      const focusIdx = indices?.[0] ?? activeIndexRef.current;
      refreshToolbarState(focusIdx);
      onActiveBlockChange(focusIdx);
      setActiveIndex(focusIdx);
      return;
    }

    if (wasDragging && anchorIdx != null && !moved) {
      setDocSelection(null);
      if (e) {
        focusBlockFromPointer(e.clientX, e.clientY);
      } else {
        selectObjectBlock(anchorIdx);
      }
    }
  }, [finishTextSelectDrag, isDragging, dragAnchor, dragStartAnchor, dragMoved, docSelectionRef, blocksRef, blockRefs, activeIndexRef, applyDocSelectionVisual, captureTextSelectionSnapshot, refreshToolbarState, onActiveBlockChange, setActiveIndex, setDocSelection, focusBlockFromPointer, selectObjectBlock]);

  const getBlockSelectionHighlight = useCallback((index: number, docSelection: DocSelection | null, blocks: DocBlock[]): BlockSelectionState => {
    return getBlockSelectionState(docSelection, index, blocks);
  }, []);

  return {
    finishTextSelectDrag,
    startTextSelectDrag,
    focusBlockFromPointer,
    isNativeTextSelectionTarget,
    handleEditorMouseDown,
    handleEditorMouseMove,
    handleEditorMouseUp,
    getBlockSelectionHighlight,
  };
}
