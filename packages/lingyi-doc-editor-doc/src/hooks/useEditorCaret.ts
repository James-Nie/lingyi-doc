import { useCallback } from 'react';
import type { DocBlock, PendingCaret, PendingCaretSpec } from '@lingyi-doc/core-doc';
import { buildPendingCaret, applyPendingCaretToBlockEl } from '@lingyi-doc/core-doc';

interface CaretDeps {
  blocksRef: React.MutableRefObject<DocBlock[]>;
  blockRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  pendingCaretRef: React.MutableRefObject<PendingCaret | null>;
}

export function useEditorCaret(deps: CaretDeps) {
  const { blocksRef, blockRefs, pendingCaretRef } = deps;

  const scheduleCaret = useCallback((spec: PendingCaretSpec, blocksOverride?: DocBlock[]) => {
    const pending = buildPendingCaret(blocksOverride ?? blocksRef.current, spec);
    if (pending) pendingCaretRef.current = pending;
    return pending;
  }, [blocksRef, pendingCaretRef]);

  const consumePendingCaret = useCallback((
    blockId: string,
    tableCell?: { row: number; col: number },
  ): PendingCaret | null => {
    const pending = pendingCaretRef.current;
    if (!pending || pending.blockId !== blockId) return null;
    if (tableCell) {
      if (pending.tableCell?.row !== tableCell.row || pending.tableCell?.col !== tableCell.col) {
        return null;
      }
      return pending;
    }
    if (pending.tableCell) return null;
    return pending;
  }, [pendingCaretRef]);

  const releasePendingCaret = useCallback((pending: PendingCaret) => {
    if (pendingCaretRef.current?.blockId === pending.blockId) {
      pendingCaretRef.current = null;
    }
  }, [pendingCaretRef]);

  const applyPendingCaret = useCallback((pending: PendingCaret): boolean => {
    const block = blocksRef.current.find(b => b.id === pending.blockId);
    if (!block) return false;
    const el = blockRefs.current.get(block.id);
    if (!el) return false;
    applyPendingCaretToBlockEl(el, block, pending);
    releasePendingCaret(pending);
    return true;
  }, [blocksRef, blockRefs, releasePendingCaret]);

  const flushPendingCaret = useCallback(() => {
    const pending = pendingCaretRef.current;
    if (!pending) return;
    applyPendingCaret(pending);
  }, [applyPendingCaret]);

  const queuePendingCaretFallback = useCallback((pending: PendingCaret) => {
    requestAnimationFrame(() => {
      const still = pendingCaretRef.current;
      if (!still || still.blockId !== pending.blockId) return;
      applyPendingCaret(still);
    });
  }, [applyPendingCaret, pendingCaretRef]);

  return {
    scheduleCaret,
    consumePendingCaret,
    releasePendingCaret,
    applyPendingCaret,
    flushPendingCaret,
    queuePendingCaretFallback,
    pendingCaretRef,
  };
}
