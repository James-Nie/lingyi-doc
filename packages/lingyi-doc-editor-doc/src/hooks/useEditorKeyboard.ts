import { useCallback, useEffect } from 'react';
import type { DocBlock, DocSelection, DocSelectionContext } from '@lingyi-doc/core-doc';
import {
  getFocusedDocContext,
  isDocumentBodyContext,
  selectElementContents,
  getListCaretContext,
  getListItemTextEl,
} from '@lingyi-doc/core-doc';
import type { ToolbarAction } from '../RichDocEditor';

interface KeyboardDeps {
  readOnly: boolean;
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
  handleToolbarAction: (action: ToolbarAction) => void;
  keepCodeSelected: (idx: number) => void;
  keepTableSelected: (idx: number) => void;
  selectEntireDocument: () => void;
  selectCurrentBlock: (blockIndex: number) => void;
  isFullDocumentSelection: () => boolean;
  isSingleBlockFullySelected: (blockIndex: number) => boolean;
  onActiveBlockChange: (idx: number) => void;
}

export function useEditorKeyboard(deps: KeyboardDeps) {
  const {
    readOnly,
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
    handleToolbarAction,
    keepCodeSelected,
    keepTableSelected,
    selectEntireDocument,
    selectCurrentBlock,
    isFullDocumentSelection,
    isSingleBlockFullySelected,
    onActiveBlockChange,
  } = deps;

  // Ctrl+A select all
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'a') return;
      if (e.isComposing) return;

      const root = editorRef.current;
      if (!root?.contains(document.activeElement)) return;

      const ctx = getFocusedDocContext(root);

      if (ctx.kind === 'code' && ctx.editable) {
        e.preventDefault();
        selectElementContents(ctx.editable);
        if (ctx.blockIndex >= 0) keepCodeSelected(ctx.blockIndex);
        return;
      }

      if (ctx.kind === 'mermaid' && ctx.editable) {
        e.preventDefault();
        selectElementContents(ctx.editable);
        if (ctx.blockIndex >= 0) keepCodeSelected(ctx.blockIndex);
        return;
      }

      if (ctx.kind === 'table') {
        e.preventDefault();
        if (ctx.blockIndex >= 0) {
          if (isFullDocumentSelection()) return;
          if (selectedTableIndexRef.current === ctx.blockIndex || isSingleBlockFullySelected(ctx.blockIndex)) {
            selectEntireDocument();
            return;
          }
          keepTableSelected(ctx.blockIndex);
          window.getSelection()?.removeAllRanges();
        }
        return;
      }

      if (ctx.kind === 'title' && ctx.editable) {
        e.preventDefault();
        selectElementContents(ctx.editable);
        return;
      }

      if (ctx.kind === 'list' && ctx.editable && ctx.blockIndex >= 0) {
        e.preventDefault();
        if (isFullDocumentSelection()) return;
        if (isSingleBlockFullySelected(ctx.blockIndex)) {
          selectEntireDocument();
          return;
        }
        const listCtx = getListCaretContext(ctx.editable);
        const sel = window.getSelection();
        const itemFullySelected = !!(
          listCtx
          && sel
          && !sel.isCollapsed
          && listCtx.focusItemText.length > 0
          && sel.toString() === listCtx.focusItemText
        );
        if (!itemFullySelected && listCtx) {
          const textEl = getListItemTextEl(ctx.editable, listCtx.focusItemIndex);
          if (textEl) {
            selectElementContents(textEl);
            return;
          }
        }
        selectCurrentBlock(ctx.blockIndex);
        return;
      }

      if (isDocumentBodyContext(ctx.kind)) {
        e.preventDefault();
        if (isFullDocumentSelection()) return;
        const blockIndex = ctx.blockIndex >= 0 ? ctx.blockIndex : activeIndexRef.current;
        const editable = ctx.editable;
        const block = blocksRef.current[blockIndex];
        if (
          editable
          && block
          && (block.type === 'paragraph' || block.type === 'heading' || block.type === 'quote')
          && editable.dataset.listRoot === undefined
        ) {
          const sel = window.getSelection();
          const allTextSelected = !!(
            sel
            && !sel.isCollapsed
            && block.text.length > 0
            && sel.toString() === block.text
          );
          if (!allTextSelected) {
            selectElementContents(editable);
            return;
          }
          // 文本已全选，直接全选文档（不需要先选块）
          selectEntireDocument();
          return;
        }
        if (isSingleBlockFullySelected(blockIndex)) {
          selectEntireDocument();
          return;
        }
        selectCurrentBlock(blockIndex);
        return;
      }

      // 如果焦点在编辑器内但不在上述任何已知上下文中，也尝试全选
      if (root.contains(document.activeElement)) {
        e.preventDefault();
        if (isFullDocumentSelection()) return;
        selectEntireDocument();
      }
    };

    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [
    keepCodeSelected,
    keepTableSelected,
    selectEntireDocument,
    selectCurrentBlock,
    isFullDocumentSelection,
    isSingleBlockFullySelected,
  ]);

  // Ctrl+Shift+7/8 (list), Alt+1-6 (headings)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.isComposing) return;

      const root = editorRef.current;
      if (!root?.contains(document.activeElement)) return;

      const ctx = getFocusedDocContext(root);
      if (ctx.kind === 'title') return;

      if (e.shiftKey && e.key === '7') {
        e.preventDefault();
        handleToolbarAction({ type: 'list', listType: 'ordered' });
        return;
      }
      if (e.shiftKey && e.key === '8') {
        e.preventDefault();
        handleToolbarAction({ type: 'list', listType: 'bullet' });
        return;
      }

      if (e.altKey && !e.shiftKey) {
        const digit = e.code.match(/^Digit([1-6])$/)?.[1] ?? e.key.match(/^([1-6])$/)?.[1];
        if (digit) {
          e.preventDefault();
          const level = Number(digit);
          const style = (`heading${level}` as import('@lingyi-doc/core-doc').ParagraphStyle);
          handleToolbarAction({ type: 'paragraphStyle', style });
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleToolbarAction]);

  // Ctrl+B/I/U
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'b') { e.preventDefault(); handleToolbarAction({ type: 'inline', cmd: 'bold' }); }
      if (e.key === 'i') { e.preventDefault(); handleToolbarAction({ type: 'inline', cmd: 'italic' }); }
      if (e.key === 'u') { e.preventDefault(); handleToolbarAction({ type: 'inline', cmd: 'underline' }); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleToolbarAction]);

  // Ctrl+Z/Y (undo/redo)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.isComposing) return;

      const root = editorRef.current;
      if (!root?.contains(document.activeElement)) return;

      const ctx = getFocusedDocContext(root);
      if (ctx.kind === 'title') return;

      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        e.stopPropagation();
        handleToolbarAction({ type: e.shiftKey ? 'redo' : 'undo' });
        return;
      }
      if (key === 'y' && e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        handleToolbarAction({ type: 'redo' });
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [handleToolbarAction]);

  return {};
}
