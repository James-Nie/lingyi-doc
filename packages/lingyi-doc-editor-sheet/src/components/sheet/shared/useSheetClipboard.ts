import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { ClipboardManager, copyTableSelectionAsImage, parseClipboardGrid, parseSheetClipboardInternal, readClipboardGridAsync, readSheetClipboardInternalAsync, resolveImageCaptureRange, type DirtyTracker, type FreeTable, type ViewportManager } from '@lingyi-doc/core-sheet';
import type { CellCoord, CellRange } from '@lingyi-doc/core-types';
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
  /** 分组/树视图：显示行 → 记录行；返回 null 表示不可粘贴（如分组头） */
  resolvePasteRecordRow?: (displayRow: number) => number | null;
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
  resolvePasteRecordRow,
}: UseSheetClipboardOptions) {
  const setSelection = useSheetStore(s => s.setSelection);

  const clipboardManagerRef = useRef(new ClipboardManager());
  const lastPasteHandledAtRef = useRef(0);
  const copyDashOffsetRef = useRef(0);
  const copyAnimFrameRef = useRef(0);
  const [copiedRange, setCopiedRange] = useState<CellRange | null>(null);

  const resolvePasteTarget = useCallback((display: CellCoord): CellCoord | null => {
    if (!resolvePasteRecordRow) return display;
    const recordRow = resolvePasteRecordRow(display.row);
    if (recordRow === null) return null;
    return { row: recordRow, col: display.col };
  }, [resolvePasteRecordRow]);

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

  const applyPasteAt = useCallback(async (displayTarget: CellCoord, dt?: DataTransfer | null) => {
    const now = Date.now();
    if (now - lastPasteHandledAtRef.current < 80) return;
    lastPasteHandledAtRef.current = now;

    const store = useSheetStore.getState();
    const clip = clipboardManagerRef.current;
    const target = resolvePasteTarget(displayTarget);
    if (!target) {
      store.setStatusText('无法在此位置粘贴');
      return;
    }

    const finishInternal = (paste: () => CellRange) => {
      try {
        const newRange = paste();
        // 多维表选区按显示坐标，写入已按记录坐标完成
        const selectionRange: CellRange = resolvePasteRecordRow
          ? {
              sheetId: newRange.sheetId,
              start: displayTarget,
              end: {
                row: displayTarget.row + (newRange.end.row - newRange.start.row),
                col: displayTarget.col + (newRange.end.col - newRange.start.col),
              },
            }
          : newRange;
        setSelection(selectionRange, displayTarget);
        setCopiedRange(null);
        store.setStatusText('已粘贴');
        dirtyTrackerRef.current.markFullRedraw();
        scheduleRender();
      } catch {
        store.setStatusText('粘贴失败');
      }
    };

    const finishExternal = async (externalPayload: NonNullable<ReturnType<typeof parseClipboardGrid>>) => {
      try {
        const rows = externalPayload.grid.length;
        const cols = Math.max(...externalPayload.grid.map(row => row.length), 0);
        if (rows * Math.max(cols, 1) >= 800) {
          store.setStatusText(`正在粘贴 ${rows} 行…`);
        }
        const newRange = await clip.pasteGridAsync(table, target, externalPayload);
        const selectionRange: CellRange = resolvePasteRecordRow
          ? {
              sheetId: newRange.sheetId,
              start: displayTarget,
              end: {
                row: displayTarget.row + (newRange.end.row - newRange.start.row),
                col: displayTarget.col + (newRange.end.col - newRange.start.col),
              },
            }
          : newRange;
        setSelection(selectionRange, displayTarget);
        setCopiedRange(null);
        store.setStatusText('已粘贴');
        dirtyTrackerRef.current.markFullRedraw();
        scheduleRender();
      } catch {
        store.setStatusText('粘贴失败');
      }
    };

    // 1) paste 事件中的内部 MIME（应用内复制：普通表 / 多维表）
    const internalFromEvent = dt ? parseSheetClipboardInternal(dt) : null;
    if (internalFromEvent) {
      finishInternal(() => clip.pastePayload(table, target, internalFromEvent));
      return;
    }

    // 2) paste 事件中的外部数据（Excel / WPS 等）
    // 必须优先于内存剪贴板：应用内复制后 _clipboard 仍保留，但系统剪贴板已被 WPS 覆盖
    if (dt) {
      let externalFromEvent = parseClipboardGrid(dt);
      if (!externalFromEvent?.grid.length) {
        // 部分环境 getData 为空，回退异步读取系统剪贴板
        externalFromEvent = await readClipboardGridAsync(null);
      }
      if (externalFromEvent?.grid.length) {
        await finishExternal(externalFromEvent);
        return;
      }
    }

    // 3) 无 DataTransfer：先读系统剪贴板，再回退内存
    //    （工具栏粘贴时若先用 hasData，会被应用内旧复制挡住 WPS/Excel）
    const internalPayload = await readSheetClipboardInternalAsync(null);
    if (internalPayload) {
      finishInternal(() => clip.pastePayload(table, target, internalPayload));
      return;
    }

    const externalPayload = await readClipboardGridAsync(null);
    if (externalPayload?.grid.length) {
      await finishExternal(externalPayload);
      return;
    }

    if (clip.hasData()) {
      finishInternal(() => clip.paste(table, target));
      return;
    }

    store.setStatusText('剪贴板为空');
  }, [table, setSelection, scheduleRender, dirtyTrackerRef, resolvePasteTarget, resolvePasteRecordRow]);

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
    if (previewMode) return;

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
  }, [previewMode, applyPasteAt]);

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
