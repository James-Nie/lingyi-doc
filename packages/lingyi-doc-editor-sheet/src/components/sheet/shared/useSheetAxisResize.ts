import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveColumnWidth } from '@lingyi-doc/core-sheet';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import type { AxisResizeGuideProps } from '../../AxisResizeGuide';
import type { SheetGridHostValue } from './SheetGridContext';

export interface UseSheetAxisResizeOptions {
  table: FreeTable;
  sheetColumnWidths: Map<number, number>;
  sheetRowHeights: Map<number, number>;
  zoomLevel: number;
  containerSize: { width: number; height: number };
  host: Pick<SheetGridHostValue, 'canvasContainerRef' | 'viewportRef' | 'scheduleRender'>;
  resolveActiveRowHeights: () => Map<number, number>;
  /** 是否允许行高拖拽（普通表） */
  allowRowResize?: boolean;
}

export function useSheetAxisResize({
  table,
  sheetColumnWidths,
  sheetRowHeights,
  zoomLevel,
  containerSize,
  host,
  resolveActiveRowHeights,
  allowRowResize = false,
}: UseSheetAxisResizeOptions) {
  const { canvasContainerRef, viewportRef, scheduleRender } = host;

  const [resizeState, setResizeState] = useState<{ type: 'col' | 'row'; index: number } | null>(null);
  const [axisResizeGuide, setAxisResizeGuide] = useState<AxisResizeGuideProps | null>(null);
  const axisResizeLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const axisResizeMovedRef = useRef(false);
  /** 拖拽期间暂存的最终列宽/行高，用于结束时一次性同步 */
  const pendingResizeRef = useRef<{ type: 'col' | 'row'; index: number; size: number } | null>(null);

  const clearAxisResizeLongPress = useCallback(() => {
    if (axisResizeLongPressTimerRef.current) {
      clearTimeout(axisResizeLongPressTimerRef.current);
      axisResizeLongPressTimerRef.current = null;
    }
  }, []);

  const buildAxisResizeGuide = useCallback((
    type: 'col' | 'row',
    index: number,
    clientX: number,
    clientY: number,
    size: number,
  ): AxisResizeGuideProps | null => {
    const canvasRect = canvasContainerRef.current?.getBoundingClientRect();
    if (!canvasRect) return null;
    const config = viewportRef.current.config;
    const relX = clientX - canvasRect.left;
    const relY = clientY - canvasRect.top;

    if (type === 'col') {
      const left = viewportRef.current.getColumnScreenLeft(index, sheetColumnWidths);
      const w = resolveColumnWidth(index, sheetColumnWidths, config.defaultColumnWidth) * zoomLevel;
      const linePos = left + w;
      return {
        type: 'col',
        linePos,
        tooltipX: Math.max(config.headerWidth + 40, Math.min(linePos + 12, containerSize.width - 60)),
        tooltipY: Math.min(config.headerHeight * 0.65, Math.max(16, relY)),
        size,
        containerHeight: containerSize.height,
      };
    }

    const rowHeights = resolveActiveRowHeights();
    const rect = viewportRef.current.getCellRect({ row: index, col: 0 }, sheetColumnWidths, rowHeights);
    const linePos = rect.y + rect.height;
    return {
      type: 'row',
      linePos,
      linePosSecondary: rect.y,
      tooltipX: Math.max(config.headerWidth + 30, relX),
      tooltipY: linePos,
      size,
      containerHeight: containerSize.height,
    };
  }, [canvasContainerRef, viewportRef, sheetColumnWidths, zoomLevel, containerSize.width, containerSize.height, resolveActiveRowHeights]);

  const startAxisResizeLongPress = useCallback((
    type: 'col' | 'row',
    index: number,
    clientX: number,
    clientY: number,
    size: number,
  ) => {
    clearAxisResizeLongPress();
    axisResizeMovedRef.current = false;
    axisResizeLongPressTimerRef.current = setTimeout(() => {
      if (!axisResizeMovedRef.current) {
        const guide = buildAxisResizeGuide(type, index, clientX, clientY, size);
        if (guide) setAxisResizeGuide(guide);
      }
    }, 400);
  }, [clearAxisResizeLongPress, buildAxisResizeGuide]);

  useEffect(() => () => clearAxisResizeLongPress(), [clearAxisResizeLongPress]);

  useEffect(() => {
    if (!resizeState) return;
    const config = viewportRef.current.config;
    const handleMove = (e: MouseEvent) => {
      axisResizeMovedRef.current = true;
      clearAxisResizeLongPress();
      let size = config.defaultColumnWidth;
      if (resizeState.type === 'col') {
        const deltaX = e.movementX / zoomLevel;
        const currentWidth = sheetColumnWidths.get(resizeState.index) ?? config.defaultColumnWidth;
        size = Math.max(20, currentWidth + deltaX);
        // 拖拽期间直接修改 Map，不通过 table.setColumnWidth 触发 _notifyChange，
        // 避免 onChange 监听器引起的 bumpLayoutVersion + scheduleRender 链式重绘
        sheetColumnWidths.set(resizeState.index, size);
      } else if (resizeState.type === 'row' && allowRowResize) {
        const deltaY = e.movementY / zoomLevel;
        const currentHeight = sheetRowHeights.get(resizeState.index) ?? config.defaultRowHeight;
        size = Math.max(10, currentHeight + deltaY);
        sheetRowHeights.set(resizeState.index, size);
      }
      pendingResizeRef.current = { type: resizeState.type, index: resizeState.index, size };
      const guide = buildAxisResizeGuide(resizeState.type, resizeState.index, e.clientX, e.clientY, size);
      if (guide) setAxisResizeGuide(guide);
    };
    const handleUp = () => {
      clearAxisResizeLongPress();
      const pending = pendingResizeRef.current;
      // 拖拽结束时通过 table.setColumnWidth/setRowHeight 正式同步数据，
      // 触发一次 _notifyChange → onChange → Canvas 重绘
      if (pending) {
        if (pending.type === 'col') {
          table.setColumnWidth(pending.index, pending.size);
        } else if (pending.type === 'row') {
          table.setRowHeight(pending.index, pending.size);
        }
        pendingResizeRef.current = null;
      }
      setResizeState(null);
      setAxisResizeGuide(null);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [
    resizeState,
    table,
    zoomLevel,
    sheetColumnWidths,
    sheetRowHeights,
    allowRowResize,
    clearAxisResizeLongPress,
    buildAxisResizeGuide,
    viewportRef,
  ]);

  return {
    resizeState,
    setResizeState,
    axisResizeGuide,
    startAxisResizeLongPress,
  };
}
