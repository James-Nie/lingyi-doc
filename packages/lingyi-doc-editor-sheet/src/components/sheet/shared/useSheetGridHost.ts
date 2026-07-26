import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { BaseCellRenderer, CellRenderer, DirtyTracker, LayerManager, ViewportManager } from '@lingyi-doc/core-sheet';
import type { SheetGridMode } from '../SheetGridView.types';

export interface SheetGridHostValue {
  mode: SheetGridMode;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  canvasContainerRef: MutableRefObject<HTMLDivElement | null>;
  viewportRef: MutableRefObject<ViewportManager>;
  layerManagerRef: MutableRefObject<LayerManager | null>;
  cellRendererRef: MutableRefObject<CellRenderer>;
  baseCellRendererRef: MutableRefObject<BaseCellRenderer>;
  dirtyTrackerRef: MutableRefObject<DirtyTracker>;
  layoutVersion: number;
  bumpLayoutVersion: () => void;
  containerSize: { width: number; height: number };
  setContainerSize: (size: { width: number; height: number }) => void;
  scheduleRender: () => void;
  registerPerformRender: (fn: () => void) => void;
}

export function useSheetGridHost(mode: SheetGridMode): SheetGridHostValue {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef(new ViewportManager());
  const layerManagerRef = useRef<LayerManager | null>(null);
  const cellRendererRef = useRef(new CellRenderer(viewportRef.current));
  const baseCellRendererRef = useRef(new BaseCellRenderer({ viewportManager: viewportRef.current }));
  const dirtyTrackerRef = useRef(new DirtyTracker());

  const [layoutVersion, setLayoutVersion] = useState(0);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  const renderFrameRef = useRef(0);
  const performRenderRef = useRef<() => void>(() => {});

  const registerPerformRender = useCallback((fn: () => void) => {
    performRenderRef.current = fn;
  }, []);

  const scheduleRender = useCallback(() => {
    if (renderFrameRef.current) return;
    renderFrameRef.current = requestAnimationFrame(() => {
      renderFrameRef.current = 0;
      // 卸载后 LayerManager 已 destroy，跳过残留帧
      if (!layerManagerRef.current?.isAlive()) return;
      performRenderRef.current();
    });
  }, []);

  useEffect(() => {
    return () => {
      if (renderFrameRef.current) {
        cancelAnimationFrame(renderFrameRef.current);
        renderFrameRef.current = 0;
      }
    };
  }, []);

  const bumpLayoutVersion = useCallback(() => {
    setLayoutVersion(v => v + 1);
  }, []);

  return {
    mode,
    containerRef,
    canvasContainerRef,
    viewportRef,
    layerManagerRef,
    cellRendererRef,
    baseCellRendererRef,
    dirtyTrackerRef,
    layoutVersion,
    bumpLayoutVersion,
    containerSize,
    setContainerSize,
    scheduleRender,
    registerPerformRender,
  };
}
