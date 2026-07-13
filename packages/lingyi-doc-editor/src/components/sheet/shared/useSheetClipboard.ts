import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import {
  ClipboardManager,
  copyTableSelectionAsImage,
  parseClipboardGrid,
  readClipboardGridAsync,
  readSheetClipboardInternalAsync,
  resolveImageCaptureRange,
  type CellCoord,
  type CellRange,
  type DirtyTracker,
  type FreeTable,
  type ViewportManager,
} from '@lingyi-doc/core';
import { useSheetStore } from '../../../store/sheetStore';
import { resolveCopySourceRange, shouldIgnoreSheetShortcut } from './sheetUtils';

export interface UseSheetClipboardOptions {
  table: FreeTable;
  isBaseSheet: boolean;
  previewMode: boolean;
  dirtyTrackerRef: MutableRefObject<DirtyTracker>;
  scheduleRender: () => void;
  viewportRef: RefObject<ViewportManager>;
  sheetColumnWidths: Map<number, number>;
  resolveActiveRowHeights: () => Map<number, number>;
}

export function useSheetClipboard({
  table,
  isBaseSheet,
  previewMode,
  dirtyTrackerRef,
  scheduleRender,
  viewportRef,
  sheetColumnWidths,
  resolveActiveRowHeights,
}: UseSheetClipboardOptions) {
  const setSelection = useSheetStore(s => s.setSelection);

  const clipboardManagerRef = useRef(new ClipboardManager());
  const lastPasteHandledAtRef = useRef(0);
  const copyDashOffsetRef = useRef(0);
  const copyAnimFrameRef = useRef(0);
  const [copiedRange, setCopiedRange] = useState<CellRange | null>(null);

  const markCopiedRange = useCallback(() => {
    if (isBaseSheet) return;
    const store = useSheetStore.getState();
    const range = resolveCopySourceRange(table.sheetId, store.selectionRange, store.discreteSelections);
    if (range) setCopiedRange(range);
  }, [table.sheetId, isBaseSheet]);

  const handleCopy = useCallback(() => {
    const store = useSheetStore.getState();
    const discrete = store.discreteSelections;
    if (discrete.length > 1) {
      clipboardManagerRef.current.copyDiscrete(table, discrete);
      markCopiedRange();
      store.setStatusText('已复制选区');
      scheduleRender();
      return;
    }
    const sel = store.selectionRange;
    if (sel) {
      clipboardManagerRef.current.copy(table, sel);
      markCopiedRange();
      store.setStatusText('已复制选区');
      scheduleRender();
    }
  }, [table, markCopiedRange, scheduleRender]);

  const handleCut = useCallback(() => {
    const store = useSheetStore.getState();
    const discrete = store.discreteSelections;
    if (discrete.length > 1) {
      clipboardManagerRef.current.cutDiscrete(table, discrete);
      markCopiedRange();
      store.setStatusText('已剪切选区');
      dirtyTrackerRef.current.markFullRedraw();
      scheduleRender();
      return;
    }
    const sel = store.selectionRange;
    if (sel) {
      clipboardManagerRef.current.cut(table, sel);
      markCopiedRange();
      store.setStatusText('已剪切选区');
      dirtyTrackerRef.current.markFullRedraw();
      scheduleRender();
    }
  }, [table, markCopiedRange, scheduleRender, dirtyTrackerRef]);

  const applyPasteAt = useCallback(async (target: CellCoord, dt?: DataTransfer | null) => {
    const now = Date.now();
    if (now - lastPasteHandledAtRef.current < 80) return;
    lastPasteHandledAtRef.current = now;

    const store = useSheetStore.getState();
    const clip = clipboardManagerRef.current;

    const internalPayload = await readSheetClipboardInternalAsync(dt);
    if (internalPayload && !isBaseSheet) {
      try {
        const newRange = clip.pastePayload(table, target, internalPayload);
        setSelection(newRange, target);
        setCopiedRange(null);
        store.setStatusText('已粘贴');
        dirtyTrackerRef.current.markFullRedraw();
        scheduleRender();
      } catch {
        store.setStatusText('粘贴失败');
      }
      return;
    }

    if (clip.hasData() && !isBaseSheet) {
      try {
        const newRange = clip.paste(table, target);
        setSelection(newRange, target);
        setCopiedRange(null);
        store.setStatusText('已粘贴');
        dirtyTrackerRef.current.markFullRedraw();
        scheduleRender();
      } catch {
        store.setStatusText('粘贴失败');
      }
      return;
    }

    const externalPayload = dt ? parseClipboardGrid(dt) : await readClipboardGridAsync(dt);
    if (externalPayload && externalPayload.grid.length > 0) {
      if (isBaseSheet) {
        store.setStatusText('剪贴板为空');
        return;
      }
      try {
        const newRange = clip.pasteGrid(table, target, externalPayload);
        setSelection(newRange, target);
        setCopiedRange(null);
        store.setStatusText('已粘贴');
        dirtyTrackerRef.current.markFullRedraw();
        scheduleRender();
      } catch {
        store.setStatusText('粘贴失败');
      }
      return;
    }

    store.setStatusText('剪贴板为空');
  }, [table, setSelection, scheduleRender, isBaseSheet, dirtyTrackerRef]);

  const handlePaste = useCallback(() => {
    const store = useSheetStore.getState();
    const target = store.activeCell;
    if (!target) return;
    void applyPasteAt(target);
  }, [applyPasteAt]);

  const handleCopyAsImage = useCallback(async () => {
    const store = useSheetStore.getState();
    const captureRange = resolveImageCaptureRange(
      table.sheetId,
      store.selectionRange,
      store.discreteSelections,
    );
    if (!captureRange) {
      store.setStatusText('请先选择要复制的区域');
      return;
    }
    await copyTableSelectionAsImage(
      table,
      captureRange,
      sheetColumnWidths,
      resolveActiveRowHeights(),
      viewportRef.current!.zoomLevel,
    );
    store.setStatusText('已复制选区为图片');
  }, [table, sheetColumnWidths, resolveActiveRowHeights, viewportRef]);

  useEffect(() => {
    if (previewMode || isBaseSheet || !copiedRange) return;
    let running = true;
    const tick = () => {
      if (!running) return;
      copyDashOffsetRef.current = (copyDashOffsetRef.current + 1) % 20;
      scheduleRender();
      copyAnimFrameRef.current = requestAnimationFrame(tick);
    };
    copyAnimFrameRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(copyAnimFrameRef.current);
    };
  }, [copiedRange, previewMode, isBaseSheet, scheduleRender]);

  useEffect(() => {
    setCopiedRange(null);
  }, [table.sheetId]);

  useEffect(() => {
    if (previewMode || isBaseSheet) return;

    const onPaste = (e: ClipboardEvent) => {
      if (shouldIgnoreSheetShortcut(e.target)) return;
      const store = useSheetStore.getState();
      if (store.editingCell) return;
      const target = store.activeCell;
      if (!target) return;
      e.preventDefault();
      void applyPasteAt(target, e.clipboardData);
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [previewMode, isBaseSheet, applyPasteAt]);

  return {
    clipboardManagerRef,
    copiedRange,
    setCopiedRange,
    copyDashOffsetRef,
    handleCopy,
    handleCut,
    handlePaste,
    applyPasteAt,
    handleCopyAsImage,
  };
}
