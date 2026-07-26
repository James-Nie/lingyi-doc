import { useCallback } from 'react';
import type { DocBlock } from '@lingyi-doc/core-doc';
import type { BlockDragState } from '../DocBlockWrapper';

interface BlockDragDeps {
  blocksRef: React.MutableRefObject<DocBlock[]>;
  blockDragRef: React.MutableRefObject<{ fromIndex: number } | null>;
  blockDragStateRef: React.MutableRefObject<BlockDragState | null>;
  setBlockDragState: (state: BlockDragState | null) => void;
  onBlocksChange: (blocks: DocBlock[], recordHistory?: boolean) => void;
  setActiveIndex: (idx: number) => void;
  onActiveBlockChange: (idx: number) => void;
}

export function useBlockDrag(deps: BlockDragDeps) {
  const {
    blocksRef,
    blockDragRef,
    blockDragStateRef,
    setBlockDragState,
    onBlocksChange,
    setActiveIndex,
    onActiveBlockChange,
  } = deps;

  const handleBlockDragStart = useCallback((fromIndex: number) => {
    blockDragRef.current = { fromIndex };
    const initial: BlockDragState = { fromIndex, overIndex: fromIndex, position: 'after' };
    blockDragStateRef.current = initial;
    setBlockDragState(initial);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';

    const onMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) return;
      const row = el.closest('[data-block-row]') as HTMLElement | null;
      if (!row) return;
      const overIndex = Number(row.dataset.blockRow);
      if (Number.isNaN(overIndex)) return;

      const rect = row.getBoundingClientRect();
      const position: 'before' | 'after' = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
      const state: BlockDragState = { fromIndex, overIndex, position };
      blockDragStateRef.current = state;
      setBlockDragState(state);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);

      const prev = blockDragStateRef.current;
      blockDragRef.current = null;
      blockDragStateRef.current = null;
      setBlockDragState(null);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';

      if (!prev || prev.fromIndex === prev.overIndex) return;

      const next = [...blocksRef.current];
      const [removed] = next.splice(prev.fromIndex, 1);
      let insertAt = prev.overIndex;
      if (prev.fromIndex < prev.overIndex) insertAt -= 1;
      if (prev.position === 'after') insertAt += 1;
      insertAt = Math.max(0, Math.min(insertAt, next.length));
      next.splice(insertAt, 0, removed);
      onBlocksChange(next, true);
      setActiveIndex(insertAt);
      onActiveBlockChange(insertAt);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [onBlocksChange, onActiveBlockChange, blocksRef, blockDragRef, blockDragStateRef, setBlockDragState, setActiveIndex]);

  return { handleBlockDragStart };
}
