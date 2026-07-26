import { useEffect } from 'react';
import type { DocBlock, DocSelection, DocCopyPayload } from '@lingyi-doc/core-doc';
import {
  isCollapsedDocSelection,
  resolveDocCopyPayload,
  writeDocCopyToClipboard,
  cloneDocBlock,
} from '@lingyi-doc/core-doc';

interface DeleteCopyDeps {
  editorRef: React.MutableRefObject<HTMLDivElement | null>;
  blocksRef: React.MutableRefObject<DocBlock[]>;
  blockRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  docSelectionRef: React.MutableRefObject<DocSelection | null>;
  savedTextSelectionRef: React.MutableRefObject<any>;
  selectedImageIndexRef: React.MutableRefObject<number | null>;
  selectedTableIndexRef: React.MutableRefObject<number | null>;
  selectedBaseIndexRef: React.MutableRefObject<number | null>;
  selectedWhiteboardIndexRef: React.MutableRefObject<number | null>;
  selectedCodeIndexRef: React.MutableRefObject<number | null>;
  activeIndexRef: React.MutableRefObject<number>;
  lastDocCopyPayloadRef: React.MutableRefObject<DocCopyPayload | null>;
  hasActiveDocSelection: () => boolean;
  resolveActiveDocSelection: () => DocSelection | null;
  handleDeleteBlock: (index: number) => void;
  handleDeleteDocSelection: () => void;
  setSelectedImageIndex: (idx: number | null) => void;
  setSelectedTableIndex: (idx: number | null) => void;
  setSelectedBaseIndex: (idx: number | null) => void;
  setSelectedWhiteboardIndex: (idx: number | null) => void;
  setSelectedCodeIndex: (idx: number | null) => void;
}

export function useEditorDeleteCopy(deps: DeleteCopyDeps) {
  const {
    editorRef,
    blocksRef,
    blockRefs,
    docSelectionRef,
    savedTextSelectionRef,
    selectedImageIndexRef,
    selectedTableIndexRef,
    selectedBaseIndexRef,
    selectedWhiteboardIndexRef,
    selectedCodeIndexRef,
    activeIndexRef,
    lastDocCopyPayloadRef,
    hasActiveDocSelection,
    resolveActiveDocSelection,
    handleDeleteBlock,
    handleDeleteDocSelection,
    setSelectedImageIndex,
    setSelectedTableIndex,
    setSelectedBaseIndex,
    setSelectedWhiteboardIndex,
    setSelectedCodeIndex,
  } = deps;

  // Delete/Backspace for object blocks
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (e.isComposing) return;
      if (hasActiveDocSelection()) return;

      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLElement && activeEl.isContentEditable && activeEl.dataset.docEditable !== undefined) {
        return;
      }

      const blocks = blocksRef.current;
      let idx =
        selectedImageIndexRef.current
        ?? selectedTableIndexRef.current
        ?? selectedBaseIndexRef.current
        ?? selectedWhiteboardIndexRef.current
        ?? selectedCodeIndexRef.current
        ?? null;

      if (idx == null) {
        const activeIdx = activeIndexRef.current;
        if (blocks[activeIdx]?.type === 'divider') idx = activeIdx;
      }

      if (idx == null) return;

      const block = blocks[idx];
      if (!block) return;
      if (block.type !== 'image' && block.type !== 'table' && block.type !== 'base' && block.type !== 'divider'
        && block.type !== 'code' && block.type !== 'mermaid') {
        return;
      }

      if (block.type === 'table' && activeEl instanceof HTMLElement) {
        const tableRoot = blockRefs.current.get(block.id);
        if (tableRoot?.contains(activeEl) && activeEl.isContentEditable) return;
      }

      if (block.type === 'base' && activeEl instanceof HTMLElement) {
        const baseRoot = blockRefs.current.get(block.id);
        if (baseRoot?.contains(activeEl)) return;
      }

      if ((block.type === 'code' || block.type === 'mermaid') && activeEl instanceof HTMLElement) {
        if (activeEl.closest('[data-doc-code-ui]') || activeEl.closest('[data-doc-mermaid-ui]')) return;
      }

      e.preventDefault();
      handleDeleteBlock(idx);
      setSelectedImageIndex(null);
      setSelectedTableIndex(null);
      setSelectedBaseIndex(null);
      setSelectedCodeIndex(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleDeleteBlock]);

  // Delete/Backspace for doc selection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (e.isComposing) return;

      const root = editorRef.current;
      if (!root) return;

      if (!resolveActiveDocSelection()) return;

      const active = document.activeElement;
      const focusInEditor = active instanceof Node && root.contains(active);
      const blockSelection = docSelectionRef.current && !isCollapsedDocSelection(docSelectionRef.current);
      const focusNode = window.getSelection()?.focusNode;
      const selectionInEditor = focusNode instanceof Node && root.contains(focusNode);
      if (!focusInEditor && !blockSelection && !selectionInEditor) return;

      e.preventDefault();
      e.stopPropagation();
      handleDeleteDocSelection();
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [handleDeleteDocSelection, resolveActiveDocSelection]);

  // Copy/Cut
  useEffect(() => {
    const getSelectedObjectIndex = () =>
      selectedImageIndexRef.current
      ?? selectedTableIndexRef.current
      ?? selectedBaseIndexRef.current
      ?? selectedWhiteboardIndexRef.current
      ?? selectedCodeIndexRef.current
      ?? null;

    const shouldHandleCopy = () => {
      const el = editorRef.current;
      if (!el) return false;
      if (hasActiveDocSelection()) return true;
      if (getSelectedObjectIndex() != null) return true;
      const active = document.activeElement;
      if (active instanceof Node && el.contains(active)) return true;
      const focusNode = window.getSelection()?.focusNode;
      if (focusNode && el.contains(focusNode)) return true;
      return false;
    };

    const buildCopyPayload = () => {
      const focusNode = window.getSelection()?.focusNode
        ?? (document.activeElement instanceof Node ? document.activeElement : null);

      return resolveDocCopyPayload({
        blocks: blocksRef.current,
        blockEls: blockRefs.current,
        docSelection: hasActiveDocSelection() ? docSelectionRef.current : null,
        savedNativeDetail: savedTextSelectionRef.current,
        focusNode,
        selectedBlockIndex: getSelectedObjectIndex(),
      });
    };

    const onCopy = (e: ClipboardEvent) => {
      if (!shouldHandleCopy()) return;

      const payload = buildCopyPayload();
      if (!payload?.blocks.length) return;

      e.preventDefault();
      writeDocCopyToClipboard(e.clipboardData, payload);
      lastDocCopyPayloadRef.current = {
        plainText: payload.plainText,
        blocks: payload.blocks.map(block => cloneDocBlock(block)),
      };
    };

    const onCut = (e: ClipboardEvent) => {
      if (!shouldHandleCopy()) return;

      const nativeSel = window.getSelection();
      const hasNativeRange = !!(nativeSel && !nativeSel.isCollapsed);
      const objectIdx = getSelectedObjectIndex();
      const hasRealSelection = hasActiveDocSelection() || hasNativeRange || objectIdx != null;
      if (!hasRealSelection) return;

      const payload = buildCopyPayload();
      if (!payload?.blocks.length) return;

      e.preventDefault();
      writeDocCopyToClipboard(e.clipboardData, payload);
      lastDocCopyPayloadRef.current = {
        plainText: payload.plainText,
        blocks: payload.blocks.map(block => cloneDocBlock(block)),
      };

      if (objectIdx != null && !hasActiveDocSelection() && !hasNativeRange) {
        handleDeleteBlock(objectIdx);
        setSelectedImageIndex(null);
        setSelectedTableIndex(null);
        setSelectedBaseIndex(null);
        setSelectedWhiteboardIndex(null);
        setSelectedCodeIndex(null);
        return;
      }

      handleDeleteDocSelection();
    };

    document.addEventListener('copy', onCopy, true);
    document.addEventListener('cut', onCut, true);
    return () => {
      document.removeEventListener('copy', onCopy, true);
      document.removeEventListener('cut', onCut, true);
    };
  }, [hasActiveDocSelection, handleDeleteDocSelection, handleDeleteBlock]);
}
