import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ViewportManager } from '@lingyi-doc/core-sheet';

const BAR_SIZE = 10;
const MIN_THUMB = 24;

export interface SheetScrollbarsProps {
  viewportRef: React.RefObject<ViewportManager | null>;
  scrollTop: number;
  scrollLeft: number;
  containerSize: { width: number; height: number };
  rowCount: number;
  colCount: number;
  columnWidths: Map<number, number>;
  rowHeights: Map<number, number>;
  extraScrollBottom?: number;
  /** 写入 store + 触发重绘 */
  onScroll: (scrollTop: number, scrollLeft: number) => void;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export const SheetScrollbars: React.FC<SheetScrollbarsProps> = ({
  viewportRef,
  scrollTop,
  scrollLeft,
  containerSize,
  rowCount,
  colCount,
  columnWidths,
  rowHeights,
  extraScrollBottom = 0,
  onScroll,
}) => {
  const [dragging, setDragging] = useState<'v' | 'h' | null>(null);
  const [localTop, setLocalTop] = useState(scrollTop);
  const [localLeft, setLocalLeft] = useState(scrollLeft);
  const dragRef = useRef<{
    axis: 'v' | 'h';
    startPointer: number;
    startScroll: number;
  } | null>(null);

  useEffect(() => {
    if (dragging) return;
    setLocalTop(scrollTop);
    setLocalLeft(scrollLeft);
  }, [scrollTop, scrollLeft, dragging]);

  const metrics = useMemo(() => {
    const vp = viewportRef.current;
    if (!vp || containerSize.width <= 0 || containerSize.height <= 0) {
      return { maxTop: 0, maxLeft: 0, showV: false, showH: false };
    }
    const { maxTop, maxLeft } = vp.getMaxScroll(
      containerSize.width,
      containerSize.height,
      rowCount,
      colCount,
      columnWidths,
      rowHeights,
      extraScrollBottom,
    );
    return {
      maxTop,
      maxLeft,
      showV: maxTop > 1,
      showH: maxLeft > 1,
    };
  }, [
    viewportRef,
    localTop,
    localLeft,
    containerSize.width,
    containerSize.height,
    rowCount,
    colCount,
    columnWidths,
    rowHeights,
    extraScrollBottom,
  ]);

  const applyScroll = useCallback((top: number, left: number) => {
    onScroll(top, left);
    const vp = viewportRef.current;
    if (vp) {
      setLocalTop(vp.scrollTop);
      setLocalLeft(vp.scrollLeft);
    } else {
      setLocalTop(top);
      setLocalLeft(left);
    }
  }, [onScroll, viewportRef]);

  const trackH = Math.max(0, containerSize.height - (metrics.showH ? BAR_SIZE : 0));
  const trackW = Math.max(0, containerSize.width - (metrics.showV ? BAR_SIZE : 0));

  const vThumb = useMemo(() => {
    if (!metrics.showV || trackH <= 0) return { size: 0, offset: 0 };
    const ratio = trackH / (trackH + metrics.maxTop);
    const size = clamp(trackH * ratio, MIN_THUMB, trackH);
    const travel = Math.max(0, trackH - size);
    const offset = metrics.maxTop > 0 ? (localTop / metrics.maxTop) * travel : 0;
    return { size, offset };
  }, [metrics.showV, metrics.maxTop, trackH, localTop]);

  const hThumb = useMemo(() => {
    if (!metrics.showH || trackW <= 0) return { size: 0, offset: 0 };
    const ratio = trackW / (trackW + metrics.maxLeft);
    const size = clamp(trackW * ratio, MIN_THUMB, trackW);
    const travel = Math.max(0, trackW - size);
    const offset = metrics.maxLeft > 0 ? (localLeft / metrics.maxLeft) * travel : 0;
    return { size, offset };
  }, [metrics.showH, metrics.maxLeft, trackW, localLeft]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.axis === 'v') {
        const travel = Math.max(0, trackH - vThumb.size);
        if (travel <= 0 || metrics.maxTop <= 0) return;
        const delta = e.clientY - drag.startPointer;
        const nextTop = drag.startScroll + (delta / travel) * metrics.maxTop;
        applyScroll(nextTop, localLeft);
      } else {
        const travel = Math.max(0, trackW - hThumb.size);
        if (travel <= 0 || metrics.maxLeft <= 0) return;
        const delta = e.clientX - drag.startPointer;
        const nextLeft = drag.startScroll + (delta / travel) * metrics.maxLeft;
        applyScroll(localTop, nextLeft);
      }
    };

    const onUp = () => {
      dragRef.current = null;
      setDragging(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [
    dragging,
    trackH,
    trackW,
    vThumb.size,
    hThumb.size,
    metrics.maxTop,
    metrics.maxLeft,
    applyScroll,
    localTop,
    localLeft,
  ]);

  const startDrag = (axis: 'v' | 'h', e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      axis,
      startPointer: axis === 'v' ? e.clientY : e.clientX,
      startScroll: axis === 'v' ? localTop : localLeft,
    };
    setDragging(axis);
  };

  const onTrackPointerDown = (axis: 'v' | 'h', e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).dataset.sheetScrollThumb) {
      startDrag(axis, e);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    if (axis === 'v') {
      const y = e.clientY - rect.top;
      const travel = Math.max(0, trackH - vThumb.size);
      const nextTop = travel > 0 ? ((y - vThumb.size / 2) / travel) * metrics.maxTop : 0;
      applyScroll(nextTop, localLeft);
    } else {
      const x = e.clientX - rect.left;
      const travel = Math.max(0, trackW - hThumb.size);
      const nextLeft = travel > 0 ? ((x - hThumb.size / 2) / travel) * metrics.maxLeft : 0;
      applyScroll(localTop, nextLeft);
    }
  };

  if (!metrics.showV && !metrics.showH) return null;

  return (
    <div
      data-sheet-scrollbars
      style={{ position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none' }}
    >
      {metrics.showV && (
        <div
          data-sheet-keep-selection
          onPointerDown={e => onTrackPointerDown('v', e)}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: metrics.showH ? BAR_SIZE : 0,
            width: BAR_SIZE,
            background: 'rgba(0,0,0,0.04)',
            pointerEvents: 'auto',
            cursor: 'default',
          }}
        >
          <div
            data-sheet-scroll-thumb
            onPointerDown={e => startDrag('v', e)}
            style={{
              position: 'absolute',
              top: vThumb.offset,
              left: 2,
              width: BAR_SIZE - 4,
              height: vThumb.size,
              borderRadius: 4,
              background: dragging === 'v' ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.28)',
              cursor: 'default',
            }}
          />
        </div>
      )}

      {metrics.showH && (
        <div
          data-sheet-keep-selection
          onPointerDown={e => onTrackPointerDown('h', e)}
          style={{
            position: 'absolute',
            left: 0,
            right: metrics.showV ? BAR_SIZE : 0,
            bottom: 0,
            height: BAR_SIZE,
            background: 'rgba(0,0,0,0.04)',
            pointerEvents: 'auto',
            cursor: 'default',
          }}
        >
          <div
            data-sheet-scroll-thumb
            onPointerDown={e => startDrag('h', e)}
            style={{
              position: 'absolute',
              left: hThumb.offset,
              top: 2,
              height: BAR_SIZE - 4,
              width: hThumb.size,
              borderRadius: 4,
              background: dragging === 'h' ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.28)',
              cursor: 'default',
            }}
          />
        </div>
      )}

      {metrics.showV && metrics.showH && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: BAR_SIZE,
            height: BAR_SIZE,
            background: 'rgba(0,0,0,0.04)',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
};
