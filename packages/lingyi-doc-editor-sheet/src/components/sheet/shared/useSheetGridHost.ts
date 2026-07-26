import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { BaseCellRenderer, CellRenderer, DirtyTracker, LayerManager, ViewportManager, AsyncAssetManager } from '@lingyi-doc/core-sheet';
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

  // 共享的 assetManager，用于图片缓存和异步加载
  const assetManagerRef = useRef(new AsyncAssetManager());

  // CellRenderer 和 BaseCellRenderer 共享同一个 assetManager
  const cellRendererRef = useRef<CellRenderer>();
  const baseCellRendererRef = useRef<BaseCellRenderer>();

  useEffect(() => {
    const assetManager = assetManagerRef.current;
    assetManager.setOnAssetLoaded(scheduleRender);

    cellRendererRef.current = new CellRenderer(viewportRef.current, { assetManager });
    baseCellRendererRef.current = new BaseCellRenderer({ viewportManager: viewportRef.current, assetManager });

    return () => {
      if (renderFrameRef.current) {
        cancelAnimationFrame(renderFrameRef.current);
        renderFrameRef.current = 0;
      }
      assetManager.clear();
    };
  }, [scheduleRender]);

  const bumpLayoutVersion = useCallback(() => {
    setLayoutVersion(v => v + 1);
  }, []);

  return {
    mode,
    containerRef,
    canvasContainerRef,
    viewportRef,
    layerManagerRef,
    cellRendererRef: cellRendererRef as MutableRefObject<CellRenderer>,
    baseCellRendererRef: baseCellRendererRef as MutableRefObject<BaseCellRenderer>,
    dirtyTrackerRef,
    layoutVersion,
    bumpLayoutVersion,
    containerSize,
    setContainerSize,
    scheduleRender,
    registerPerformRender,
  };
}
