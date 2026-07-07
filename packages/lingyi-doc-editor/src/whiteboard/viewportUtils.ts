import type { WhiteboardElement, WhiteboardPoint, WhiteboardViewport } from '@lingyi-doc/core';
import { getShapeVisualBounds } from './canvas/shapePaths';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
export const DEFAULT_ZOOM = 1;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function zoomViewportCenter(
  viewport: WhiteboardViewport,
  containerWidth: number,
  containerHeight: number,
  nextZoom: number,
): WhiteboardViewport {
  const zoom = clampZoom(nextZoom);
  const cx = containerWidth / 2;
  const cy = containerHeight / 2;
  const canvasX = (cx - viewport.x) / viewport.zoom;
  const canvasY = (cy - viewport.y) / viewport.zoom;
  return {
    zoom,
    x: cx - canvasX * zoom,
    y: cy - canvasY * zoom,
  };
}

export function screenToCanvasPoint(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  viewport: WhiteboardViewport,
): WhiteboardPoint {
  return {
    x: (clientX - rect.left - viewport.x) / viewport.zoom,
    y: (clientY - rect.top - viewport.y) / viewport.zoom,
  };
}

/** 以光标为中心缩放 */
export function zoomAtPointer(
  viewport: WhiteboardViewport,
  clientX: number,
  clientY: number,
  rect: DOMRect,
  deltaY: number,
): WhiteboardViewport {
  const factor = zoomWheelFactor(deltaY);
  const nextZoom = clampZoom(viewport.zoom * factor);
  const mx = clientX - rect.left;
  const my = clientY - rect.top;
  const canvasX = (mx - viewport.x) / viewport.zoom;
  const canvasY = (my - viewport.y) / viewport.zoom;
  return {
    zoom: nextZoom,
    x: mx - canvasX * nextZoom,
    y: my - canvasY * nextZoom,
  };
}

export function panViewport(
  viewport: WhiteboardViewport,
  dx: number,
  dy: number,
): WhiteboardViewport {
  return { ...viewport, x: viewport.x + dx, y: viewport.y + dy };
}

const GRID_SIZE = 8;

export function snapToGrid(value: number, grid = GRID_SIZE): number {
  return Math.round(value / grid) * grid;
}

export function snapPoint(p: WhiteboardPoint, grid = GRID_SIZE): WhiteboardPoint {
  return { x: snapToGrid(p.x, grid), y: snapToGrid(p.y, grid) };
}

/** 归一化 wheel delta（兼容鼠标滚轮 / 触控板） */
export function normalizeWheelDelta(e: { deltaY: number; deltaMode: number }): number {
  if (e.deltaMode === 1) return e.deltaY * 16;
  if (e.deltaMode === 2) return e.deltaY * 120;
  return e.deltaY;
}

export function zoomWheelFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.0015);
}

export function fitViewportToElements(
  elements: WhiteboardElement[],
  containerWidth: number,
  containerHeight: number,
  padding = 80,
): WhiteboardViewport {
  if (!elements.length || containerWidth <= 0 || containerHeight <= 0) {
    return { x: 80, y: 80, zoom: DEFAULT_ZOOM };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    if (el.type === 'connector' || el.type === 'pen') {
      for (const p of el.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    } else {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }
  }

  if (!Number.isFinite(minX)) {
    return { x: 80, y: 80, zoom: DEFAULT_ZOOM };
  }

  const bw = Math.max(maxX - minX, 40);
  const bh = Math.max(maxY - minY, 40);
  const availW = containerWidth - padding * 2;
  const availH = containerHeight - padding * 2;
  const zoom = clampZoom(Math.min(availW / bw, availH / bh, 1.5));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  return {
    zoom,
    x: containerWidth / 2 - cx * zoom,
    y: containerHeight / 2 - cy * zoom,
  };
}

export function translateElement(el: WhiteboardElement, dx: number, dy: number): WhiteboardElement {
  if (el.type === 'connector' || el.type === 'pen') {
    return {
      ...el,
      x: el.x + dx,
      y: el.y + dy,
      points: el.points.map(p => ({ x: p.x + dx, y: p.y + dy })),
    };
  }
  return { ...el, x: el.x + dx, y: el.y + dy };
}

export function elementBounds(el: WhiteboardElement): { x: number; y: number; w: number; h: number } {
  if (el.type === 'connector' || el.type === 'pen') {
    if (!el.points.length) return { x: el.x, y: el.y, w: el.width, h: el.height };
    const xs = el.points.map(p => p.x);
    const ys = el.points.map(p => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
      x: minX,
      y: minY,
      w: Math.max(...xs) - minX,
      h: Math.max(...ys) - minY,
    };
  }
  if (el.type === 'shape') {
    return getShapeVisualBounds(el.shapeKind, el.x, el.y, el.width, el.height);
  }
  return { x: el.x, y: el.y, w: el.width, h: el.height };
}

export function rectsIntersect(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export function resizeElement(
  el: WhiteboardElement,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  origin: { x: number; y: number; w: number; h: number },
  lockAspect = false,
): WhiteboardElement {
  if (el.type === 'connector' || el.type === 'pen') return el;

  let { x, y, w, h } = origin;
  const minSize = 24;

  if (handle.includes('e')) w = Math.max(minSize, origin.w + dx);
  if (handle.includes('s')) h = Math.max(minSize, origin.h + dy);
  if (handle.includes('w')) {
    const nextW = Math.max(minSize, origin.w - dx);
    x = origin.x + origin.w - nextW;
    w = nextW;
  }
  if (handle.includes('n')) {
    const nextH = Math.max(minSize, origin.h - dy);
    y = origin.y + origin.h - nextH;
    h = nextH;
  }

  if (lockAspect && origin.w > 0 && origin.h > 0) {
    const ratio = origin.w / origin.h;
    if (handle === 'e' || handle === 'w') {
      h = w / ratio;
      if (handle.includes('n')) y = origin.y + origin.h - h;
    } else if (handle === 'n' || handle === 's') {
      w = h * ratio;
      if (handle.includes('w')) x = origin.x + origin.w - w;
    } else {
      h = w / ratio;
      if (handle.includes('n')) y = origin.y + origin.h - h;
      if (handle.includes('w')) x = origin.x + origin.w - w;
    }
  }

  return { ...el, x, y, width: w, height: h };
}
