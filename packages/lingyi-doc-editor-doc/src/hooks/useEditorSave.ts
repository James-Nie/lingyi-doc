import { useEffect } from 'react';
import { getFocusedDocContext, getListCaretContext, getCaretOffset, parseTableCellCoords, isTextBlock, applyPendingCaretToBlockEl, saveSelection, restoreSelection } from '@lingyi-doc/core-doc';
import type { DocBlock, PendingCaretSpec } from '@lingyi-doc/core-doc';
import type { RichDocEditorSaveRef } from '../RichDocEditor';

interface SaveDeps {
  editorSaveRef: React.MutableRefObject<RichDocEditorSaveRef | null> | undefined;
  editorRef: React.MutableRefObject<HTMLDivElement | null>;
  blocksRef: React.MutableRefObject<DocBlock[]>;
  blockRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  activeIndexRef: React.MutableRefObject<number>;
  saveSelectionRef: React.MutableRefObject<Range | null>;
  syncBlockFromEl: (index: number, el: HTMLElement) => void;
  scheduleCaret: (spec: PendingCaretSpec, blocksOverride?: DocBlock[]) => import('@lingyi-doc/core-doc').PendingCaret | null;
  setActiveIndex: (idx: number) => void;
  onActiveBlockChange: (idx: number) => void;
}

export function useEditorSave(deps: SaveDeps) {
  const {
    editorSaveRef,
    editorRef,
    blocksRef,
    blockRefs,
    activeIndexRef,
    saveSelectionRef,
    syncBlockFromEl,
    scheduleCaret,
    setActiveIndex,
    onActiveBlockChange,
  } = deps;

  useEffect(() => {
    if (!editorSaveRef) return;
    editorSaveRef.current = {
      flushBeforeSave: () => {
        saveSelectionRef.current = saveSelection();
        const root = editorRef.current;
        if (!root) return;
        const ctx = getFocusedDocContext(root);
        if (ctx.blockIndex >= 0 && ctx.editable) {
          syncBlockFromEl(ctx.blockIndex, ctx.editable);
        }
        requestAnimationFrame(() => {
          restoreSelection(saveSelectionRef.current);
        });
      },
      captureHistoryCaret: () => {
        const root = editorRef.current;
        if (!root) return null;
        const ctx = getFocusedDocContext(root);
        if (ctx.blockIndex < 0 || !ctx.editable) {
          const active = activeIndexRef.current;
          if (active >= 0 && active < blocksRef.current.length) {
            return { blockIndex: active, position: 'start' as const };
          }
          return null;
        }
        if (ctx.kind === 'list') {
          const listCtx = getListCaretContext(ctx.editable);
          return {
            blockIndex: ctx.blockIndex,
            position: listCtx?.focusOffset ?? 'start',
            listItemIndex: listCtx?.focusItemIndex,
          };
        }
        if (ctx.kind === 'table') {
          const coords = parseTableCellCoords(ctx.editable);
          return {
            blockIndex: ctx.blockIndex,
            position: getCaretOffset(ctx.editable),
            tableCell: coords ?? undefined,
          };
        }
        return {
          blockIndex: ctx.blockIndex,
          position: getCaretOffset(ctx.editable),
        };
      },
      restoreHistoryCaret: (spec) => {
        if (!spec) return;
        scheduleCaret(spec);
        setActiveIndex(spec.blockIndex);
        onActiveBlockChange(spec.blockIndex);
        requestAnimationFrame(() => {
          const block = blocksRef.current[spec.blockIndex];
          if (!block) return;
          const el = blockRefs.current.get(block.id);
          if (!el) return;
          if (isTextBlock(block) || block.type === 'list' || block.type === 'table') {
            applyPendingCaretToBlockEl(el, block, {
              blockId: block.id,
              blockIndex: spec.blockIndex,
              position: spec.position ?? 'start',
              listItemIndex: spec.listItemIndex,
              tableCell: spec.tableCell,
            });
          }
        });
      },
    };
    return () => {
      if (editorSaveRef) editorSaveRef.current = null;
    };
  }, [editorSaveRef, syncBlockFromEl, scheduleCaret, onActiveBlockChange]);
}
