import { useCallback, useEffect, useRef, useState } from 'react';

export const SIDEBAR_MIN_W = 220;
export const SIDEBAR_MAX_W = 600;

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_W, Math.max(SIDEBAR_MIN_W, width));
}

export function loadSidebarWidth(storageKey: string, defaultWidth: number): number {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaultWidth;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return defaultWidth;
    return clampSidebarWidth(parsed);
  } catch {
    return defaultWidth;
  }
}

interface UseSidebarResizeOptions {
  storageKey: string;
  defaultWidth: number;
  cssVarName?: string;
}

export function useSidebarResize({
  storageKey,
  defaultWidth,
  cssVarName,
}: UseSidebarResizeOptions) {
  const [sidebarWidth, setSidebarWidth] = useState(() => loadSidebarWidth(storageKey, defaultWidth));
  const [resizeHover, setResizeHover] = useState(false);
  const [resizing, setResizing] = useState(false);
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;

  useEffect(() => {
    if (!cssVarName) return;
    document.documentElement.style.setProperty(cssVarName, `${sidebarWidth}px`);
  }, [sidebarWidth, cssVarName]);

  useEffect(() => {
    if (resizing) return;
    try {
      localStorage.setItem(storageKey, String(sidebarWidth));
    } catch {
      /* ignore */
    }
  }, [sidebarWidth, resizing, storageKey]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidthRef.current;
    setResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      setSidebarWidth(clampSidebarWidth(startW + ev.clientX - startX));
    };
    const onUp = () => {
      setResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  return {
    sidebarWidth,
    resizeHover,
    resizing,
    setResizeHover,
    handleResizeStart,
  };
}
