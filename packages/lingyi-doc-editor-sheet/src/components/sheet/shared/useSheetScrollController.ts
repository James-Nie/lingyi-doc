import { useCallback, useEffect, useRef } from 'react';
import type { ViewportManager } from '@lingyi-doc/core-sheet';

export interface SheetScrollClamp {
  canvasWidth: number;
  canvasHeight: number;
  rowCount: number;
  colCount: number;
  columnWidths: Map<number, number>;
  rowHeights: Map<number, number>;
  extraScrollBottom?: number;
}

export interface UseSheetScrollControllerOptions {
  viewportRef: React.RefObject<ViewportManager | null>;
  scheduleRender: () => void;
  setScrollPosition: (top: number, left: number) => void;
  /** false 时不写全局 store（embed/preview） */
  syncStore?: boolean;
}

/**
 * 滚动控制器：viewport 立即更新 + 画布 rAF 重绘；
 * Zustand scroll 合并到每帧最多一次，避免 wheel 触发密集 React flush。
 */
export function useSheetScrollController({
  viewportRef,
  scheduleRender,
  setScrollPosition,
  syncStore = true,
}: UseSheetScrollControllerOptions) {
  const storeRafRef = useRef(0);
  const clampRef = useRef<SheetScrollClamp | null>(null);

  const setClampContext = useCallback((clamp: SheetScrollClamp) => {
    clampRef.current = clamp;
  }, []);

  const flushStore = useCallback(() => {
    storeRafRef.current = 0;
    const vp = viewportRef.current;
    if (!vp || !syncStore) return;
    setScrollPosition(vp.scrollTop, vp.scrollLeft);
  }, [viewportRef, setScrollPosition, syncStore]);

  const scheduleStoreSync = useCallback(() => {
    if (!syncStore) return;
    if (storeRafRef.current) return;
    storeRafRef.current = requestAnimationFrame(flushStore);
  }, [syncStore, flushStore]);

  const applyScroll = useCallback((top: number, left: number) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const clamp = clampRef.current;
    if (clamp) {
      vp.setScrollPosition(top, left, clamp);
    } else {
      vp.setScrollPosition(top, left);
    }
    // 滚动只需按新 scroll 重绘可视区；各层本身会 clearRect，无需 markFullRedraw
    scheduleRender();
    scheduleStoreSync();
  }, [viewportRef, scheduleRender, scheduleStoreSync]);

  const applyScrollDelta = useCallback((deltaY: number, deltaX: number) => {
    const vp = viewportRef.current;
    if (!vp) return;
    applyScroll(vp.scrollTop + deltaY, vp.scrollLeft + deltaX);
  }, [viewportRef, applyScroll]);

  useEffect(() => {
    return () => {
      if (storeRafRef.current) {
        cancelAnimationFrame(storeRafRef.current);
        storeRafRef.current = 0;
      }
    };
  }, []);

  return {
    setClampContext,
    applyScroll,
    applyScrollDelta,
    /** 立即把当前 viewport 同步到 store（滚动结束时可调用） */
    flushStoreNow: flushStore,
  };
}
