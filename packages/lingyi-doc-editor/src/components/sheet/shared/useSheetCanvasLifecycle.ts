import { useEffect } from 'react';
import { LayerManager } from '@lingyi-doc/core';
import type { FreeTable } from '@lingyi-doc/core';
import { useSheetStore } from '../../../store/sheetStore';
import { syncToolbarFromCell } from '../../../utils/syncToolbarFromCell';
import type { SheetGridHostValue } from './SheetGridContext';

export interface UseSheetCanvasLifecycleOptions {
  table: FreeTable;
  sheetId: string;
  sheetColumnWidths: Map<number, number>;
  previewMode: boolean;
  host: Pick<
    SheetGridHostValue,
    | 'containerRef'
    | 'canvasContainerRef'
    | 'viewportRef'
    | 'layerManagerRef'
    | 'dirtyTrackerRef'
    | 'layoutVersion'
    | 'bumpLayoutVersion'
    | 'containerSize'
    | 'setContainerSize'
    | 'scheduleRender'
    | 'registerPerformRender'
  >;
  performRender: () => void;
  resolveActiveRowHeights: () => Map<number, number>;
  effectiveRowHeights: Map<number, number>;
  gridRowCount: number;
  effectiveColCount: number;
  addRowsExtraScrollBottom: number;
  /** 初始化/更新 viewport 配置（base vs freeform 各自实现） */
  applyViewportConfig: () => void;
  /** 折叠行变化时重绘（多维表） */
  collapsedRowIds?: string[];
  /** 挂载时 ensureRowRecords（多维表） */
  ensureRowRecords?: boolean;
  /** 选中单元格时同步工具栏（普通表） */
  syncToolbarOnActiveCell?: boolean;
}

export function useSheetCanvasLifecycle({
  table,
  sheetId,
  sheetColumnWidths,
  previewMode,
  host,
  performRender,
  resolveActiveRowHeights,
  effectiveRowHeights,
  gridRowCount,
  effectiveColCount,
  addRowsExtraScrollBottom,
  applyViewportConfig,
  collapsedRowIds,
  ensureRowRecords = false,
  syncToolbarOnActiveCell = false,
}: UseSheetCanvasLifecycleOptions) {
  const {
    containerRef,
    canvasContainerRef,
    viewportRef,
    layerManagerRef,
    dirtyTrackerRef,
    layoutVersion,
    bumpLayoutVersion,
    containerSize,
    setContainerSize,
    scheduleRender,
    registerPerformRender,
  } = host;

  const setScrollPosition = useSheetStore(s => s.setScrollPosition);
  const zoomLevel = useSheetStore(s => s.zoomLevel);
  const editingCell = useSheetStore(s => s.editingCell);
  const formulaBarText = useSheetStore(s => s.formulaBarText);
  const activeCell = useSheetStore(s => s.activeCell);

  registerPerformRender(performRender);

  useEffect(() => {
    if (canvasContainerRef.current) {
      layerManagerRef.current = new LayerManager(canvasContainerRef.current);
    }
    return () => layerManagerRef.current?.destroy();
  }, [canvasContainerRef, layerManagerRef]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [containerRef, setContainerSize]);

  useEffect(() => {
    layerManagerRef.current?.resize(containerSize.width, containerSize.height);
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [containerSize, layerManagerRef, dirtyTrackerRef, scheduleRender]);

  useEffect(() => {
    if (ensureRowRecords) table.ensureRowRecords();
  }, [ensureRowRecords, table, gridRowCount]);

  useEffect(() => {
    if (!collapsedRowIds) return;
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [collapsedRowIds, dirtyTrackerRef, scheduleRender]);

  useEffect(() => {
    viewportRef.current.setZoomLevel(zoomLevel);
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [zoomLevel, viewportRef, dirtyTrackerRef, scheduleRender]);

  useEffect(() => {
    applyViewportConfig();
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [applyViewportConfig, dirtyTrackerRef, scheduleRender]);

  useEffect(() => {
    if (containerSize.width === 0 || containerSize.height === 0) return;
    const vp = viewportRef.current;
    const rowHeights = effectiveRowHeights;
    vp.clampScrollToBounds(
      containerSize.width,
      containerSize.height,
      gridRowCount,
      effectiveColCount,
      sheetColumnWidths,
      rowHeights,
      addRowsExtraScrollBottom,
    );
    if (!previewMode) {
      setScrollPosition(vp.scrollTop, vp.scrollLeft);
    }
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [
    containerSize.width,
    containerSize.height,
    zoomLevel,
    sheetId,
    gridRowCount,
    effectiveColCount,
    sheetColumnWidths,
    effectiveRowHeights,
    addRowsExtraScrollBottom,
    setScrollPosition,
    scheduleRender,
    previewMode,
    viewportRef,
    dirtyTrackerRef,
  ]);

  useEffect(() => {
    if (previewMode) return;
    const el = canvasContainerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const vp = viewportRef.current;
      const rowHeights = effectiveRowHeights;
      vp.setScrollPosition(
        vp.scrollTop + e.deltaY,
        vp.scrollLeft + e.deltaX,
        {
          canvasWidth: containerSize.width,
          canvasHeight: containerSize.height,
          rowCount: gridRowCount,
          colCount: effectiveColCount,
          columnWidths: sheetColumnWidths,
          rowHeights,
          extraScrollBottom: addRowsExtraScrollBottom,
        },
      );
      setScrollPosition(vp.scrollTop, vp.scrollLeft);
      dirtyTrackerRef.current.markFullRedraw();
      scheduleRender();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [
    previewMode,
    canvasContainerRef,
    viewportRef,
    containerSize.width,
    containerSize.height,
    sheetId,
    gridRowCount,
    effectiveColCount,
    sheetColumnWidths,
    effectiveRowHeights,
    addRowsExtraScrollBottom,
    setScrollPosition,
    scheduleRender,
    dirtyTrackerRef,
  ]);

  useEffect(() => {
    const unsub = table.onChange((range) => {
      bumpLayoutVersion();
      if (range) {
        dirtyTrackerRef.current.markDirtyRange(
          range,
          sheetColumnWidths,
          table.sheet.rowHeights,
          viewportRef.current,
        );
      } else {
        dirtyTrackerRef.current.markFullRedraw();
      }
      scheduleRender();
    });
    return unsub;
  }, [table, scheduleRender, sheetColumnWidths, bumpLayoutVersion, dirtyTrackerRef, viewportRef]);

  useEffect(() => {
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [layoutVersion, effectiveRowHeights, dirtyTrackerRef, scheduleRender]);

  useEffect(() => {
    if (previewMode) return;
    if (editingCell && formulaBarText.startsWith('=')) {
      dirtyTrackerRef.current.markFullRedraw();
      scheduleRender();
    }
  }, [formulaBarText, editingCell, scheduleRender, previewMode, dirtyTrackerRef]);

  useEffect(() => {
    if (previewMode || !syncToolbarOnActiveCell || !activeCell) return;
    syncToolbarFromCell(table.getCell(activeCell.row, activeCell.col));
  }, [activeCell, table, previewMode, syncToolbarOnActiveCell]);
}
