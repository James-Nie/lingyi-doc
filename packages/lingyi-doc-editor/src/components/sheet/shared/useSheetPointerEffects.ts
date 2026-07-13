import { useEffect, useRef } from 'react';
import { computeFillTargetRange } from '@lingyi-doc/core';
import type { CellCoord } from '@lingyi-doc/core';
import { useSheetStore } from '../../../store/sheetStore';
import type { SheetGridHostValue } from './SheetGridContext';

export interface UseSheetPointerEffectsOptions {
  previewMode: boolean;
  host: Pick<SheetGridHostValue, 'containerRef' | 'canvasContainerRef' | 'dirtyTrackerRef' | 'scheduleRender'>;
  selectionManagerRef: React.MutableRefObject<{ clear: () => void }>;
  clearAxisDiscreteSelection: () => void;
  clearCheckedRows?: () => void;
  isFillDraggingRef: React.MutableRefObject<boolean>;
  fillSourceRangeRef: React.MutableRefObject<{ start: CellCoord; end: CellCoord; sheetId: string } | null>;
  getCellFromClientCoords: (clientX: number, clientY: number) => CellCoord | null;
  updateFillPreview: (preview: { start: CellCoord; end: CellCoord; sheetId: string }) => void;
  finishFillDrag: () => boolean;
}

export function useSheetPointerEffects({
  previewMode,
  host,
  selectionManagerRef,
  clearAxisDiscreteSelection,
  clearCheckedRows,
  isFillDraggingRef,
  fillSourceRangeRef,
  getCellFromClientCoords,
  updateFillPreview,
  finishFillDrag,
}: UseSheetPointerEffectsOptions) {
  const { containerRef, canvasContainerRef, dirtyTrackerRef, scheduleRender } = host;
  const pointerDownOutsideRef = useRef(false);

  useEffect(() => {
    if (previewMode) return;
    const isKeepSelectionTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof Node)) return false;
      const el = target as HTMLElement;
      if (el.closest?.('[data-sheet-canvas]')) return true;
      if (el.closest?.('[data-freeform-dropdown-cell]')) return true;
      if (el.closest?.('[data-sheet-keep-selection]')) return true;
      if (el.closest?.('.ant-modal, .ant-select-dropdown, .ant-picker-dropdown, .sheet-select-dropdown, .sheet-select-dropdown-panel, [data-sheet-dropdown-config], [data-sheet-keep-selection]')) return true;
      const canvasEl = canvasContainerRef.current;
      const sheetEl = containerRef.current;
      if (sheetEl?.contains(target) && canvasEl && !canvasEl.contains(target)) return true;
      return false;
    };

    const handlePointerDown = (e: MouseEvent) => {
      pointerDownOutsideRef.current = !isKeepSelectionTarget(e.target);
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (!pointerDownOutsideRef.current) return;
      if (isKeepSelectionTarget(e.target)) return;

      const store = useSheetStore.getState();
      if (!store.selectionRange && !store.activeCell && store.discreteSelections.length === 0) return;

      store.setSelection(null, null);
      clearAxisDiscreteSelection();
      selectionManagerRef.current.clear();
      clearCheckedRows?.();
      dirtyTrackerRef.current.markFullRedraw();
      scheduleRender();
    };

    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [
    previewMode,
    containerRef,
    canvasContainerRef,
    scheduleRender,
    clearAxisDiscreteSelection,
    selectionManagerRef,
    clearCheckedRows,
    dirtyTrackerRef,
  ]);

  useEffect(() => {
    if (previewMode) return;
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!isFillDraggingRef.current || !fillSourceRangeRef.current) return;
      const coord = getCellFromClientCoords(e.clientX, e.clientY);
      if (!coord) return;
      const preview = computeFillTargetRange(fillSourceRangeRef.current, coord);
      updateFillPreview(preview);
    };

    const handleWindowMouseUp = () => {
      finishFillDrag();
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [
    previewMode,
    getCellFromClientCoords,
    updateFillPreview,
    finishFillDrag,
    isFillDraggingRef,
    fillSourceRangeRef,
  ]);
}
