import type {
  AnchorId,
  ShapeElement,
  WhiteboardElement,
  WhiteboardPoint,
} from '@lingyi-doc/core';
import {
  getElementAnchors,
  isConnectable,
  pointInElement,
  type ConnectionSnap,
} from '@lingyi-doc/core';
import { hitLineElement } from '@lingyi-doc/core';
import { elementBounds, type ResizeHandle } from '../viewportUtils';
import { getShapeConnectorAnchors, getShapeVisualBounds, hitShapeElementAtPoint } from './shapePaths';
import { SHAPE_SELECTION_UI } from './shapeQuickAdd';

function shapeInteractionHit(el: WhiteboardElement, pt: WhiteboardPoint, pad: number): boolean {
  if (el.type === 'shape') return hitShapeElementAtPoint(el as ShapeElement, pt, pad);
  return pointInElement(pt, el, pad);
}

function interactionAnchors(el: WhiteboardElement): { id: AnchorId; x: number; y: number }[] {
  if (el.type === 'shape') return getShapeConnectorAnchors(el as ShapeElement);
  return getElementAnchors(el);
}

export function interactionAnchorsForElement(el: WhiteboardElement): { id: AnchorId; x: number; y: number }[] {
  return interactionAnchors(el);
}

export function findHoverConnectable(
  elements: WhiteboardElement[],
  pt: WhiteboardPoint,
): string | null {
  const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex);
  for (const el of sorted) {
    if (!isConnectable(el)) continue;
    if (shapeInteractionHit(el, pt, 4)) return el.id;
  }
  return null;
}

export function findConnectionSnap(
  elements: WhiteboardElement[],
  pt: WhiteboardPoint,
  opts?: { excludeId?: string; snapRadius?: number },
): ConnectionSnap | null {
  const snapRadius = opts?.snapRadius ?? 40;
  let best: (ConnectionSnap & { dist: number }) | null = null;

  for (const el of elements) {
    if (!isConnectable(el) || el.id === opts?.excludeId) continue;
    if (!shapeInteractionHit(el, pt, 20)) continue;
    for (const a of interactionAnchors(el)) {
      const d = Math.hypot(pt.x - a.x, pt.y - a.y);
      if (d <= snapRadius && (!best || d < best.dist)) {
        best = { elementId: el.id, anchor: a.id, point: { x: a.x, y: a.y }, dist: d };
      }
    }
  }
  return best ? { elementId: best.elementId, anchor: best.anchor, point: best.point } : null;
}

const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const CORNER_HANDLES: ResizeHandle[] = ['nw', 'ne', 'se', 'sw'];
const EDGE_HANDLES: ResizeHandle[] = ['n', 'e', 's', 'w'];
const HANDLE_R = SHAPE_SELECTION_UI.resizeCornerHit;
const EDGE_HANDLE_HIT_R = SHAPE_SELECTION_UI.resizeEdgeHit;
const EDGE_HIT_DIST = 6;
const EDGE_CORNER_MARGIN = 14;

function hitShapeResizeEdge(
  box: { x: number; y: number; w: number; h: number },
  pt: WhiteboardPoint,
): ResizeHandle | null {
  const { x, y, w, h } = box;
  if (w < EDGE_CORNER_MARGIN * 2 || h < EDGE_CORNER_MARGIN * 2) return null;

  if (
    Math.abs(pt.y - y) <= EDGE_HIT_DIST
    && pt.x >= x + EDGE_CORNER_MARGIN
    && pt.x <= x + w - EDGE_CORNER_MARGIN
  ) {
    return 'n';
  }
  if (
    Math.abs(pt.y - (y + h)) <= EDGE_HIT_DIST
    && pt.x >= x + EDGE_CORNER_MARGIN
    && pt.x <= x + w - EDGE_CORNER_MARGIN
  ) {
    return 's';
  }
  if (
    Math.abs(pt.x - (x + w)) <= EDGE_HIT_DIST
    && pt.y >= y + EDGE_CORNER_MARGIN
    && pt.y <= y + h - EDGE_CORNER_MARGIN
  ) {
    return 'e';
  }
  if (
    Math.abs(pt.x - x) <= EDGE_HIT_DIST
    && pt.y >= y + EDGE_CORNER_MARGIN
    && pt.y <= y + h - EDGE_CORNER_MARGIN
  ) {
    return 'w';
  }
  return null;
}

export function resizeHandleCursor(handle: ResizeHandle): string {
  switch (handle) {
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    case 'nw':
    case 'se':
      return 'nwse-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
  }
}

export function hitElementAtPoint(
  elements: WhiteboardElement[],
  pt: WhiteboardPoint,
  excludeTypes: string[] = [],
): WhiteboardElement | null {
  const lineHit = hitLineElement(elements, pt, 10);
  if (lineHit) {
    const el = elements.find(e => e.id === lineHit);
    if (el) return el;
  }
  const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex);
  for (const el of sorted) {
    if (excludeTypes.includes(el.type)) continue;
    if (el.type === 'connector' || el.type === 'pen') continue;
    if (el.type === 'shape') {
      if (hitShapeElementAtPoint(el as ShapeElement, pt, 2)) return el;
      continue;
    }
    if (pointInElement(pt, el, 2)) return el;
  }
  return null;
}

function handlePosition(box: { x: number; y: number; w: number; h: number }, handle: ResizeHandle): WhiteboardPoint {
  const { x, y, w, h } = box;
  const cx = x + w / 2;
  const cy = y + h / 2;
  switch (handle) {
    case 'nw': return { x, y };
    case 'n': return { x: cx, y };
    case 'ne': return { x: x + w, y };
    case 'e': return { x: x + w, y: cy };
    case 'se': return { x: x + w, y: y + h };
    case 's': return { x: cx, y: y + h };
    case 'sw': return { x, y: y + h };
    case 'w': return { x, y: cy };
  }
}

export function hitResizeHandle(
  elements: WhiteboardElement[],
  selectedIds: string[],
  pt: WhiteboardPoint,
): { id: string; handle: ResizeHandle } | null {
  if (selectedIds.length !== 1) return null;
  const el = elements.find(e => e.id === selectedIds[0]);
  if (!el || el.type === 'connector' || el.type === 'pen' || el.type === 'mindmap') return null;
  const box = el.type === 'shape'
    ? getShapeVisualBounds(el.shapeKind, el.x, el.y, el.width, el.height)
    : elementBounds(el);

  for (const handle of CORNER_HANDLES) {
    const hp = handlePosition(box, handle);
    if (Math.hypot(pt.x - hp.x, pt.y - hp.y) <= HANDLE_R + 4) {
      return { id: el.id, handle };
    }
  }

  if (el.type === 'shape') {
    for (const handle of EDGE_HANDLES) {
      const hp = handlePosition(box, handle);
      if (Math.hypot(pt.x - hp.x, pt.y - hp.y) <= EDGE_HANDLE_HIT_R) {
        return { id: el.id, handle };
      }
    }
    const edge = hitShapeResizeEdge(box, pt);
    if (edge) return { id: el.id, handle: edge };
    return null;
  }

  for (const handle of HANDLES) {
    if (CORNER_HANDLES.includes(handle)) continue;
    const hp = handlePosition(box, handle);
    if (Math.hypot(pt.x - hp.x, pt.y - hp.y) <= HANDLE_R + 4) {
      return { id: el.id, handle };
    }
  }
  return null;
}

export function hitConnectorEndpoint(
  elements: WhiteboardElement[],
  selectedIds: string[],
  pt: WhiteboardPoint,
  getEndpoints: (conn: import('@lingyi-doc/core').ConnectorElement) => [WhiteboardPoint, WhiteboardPoint],
): 'start' | 'end' | null {
  if (selectedIds.length !== 1) return null;
  const el = elements.find(e => e.id === selectedIds[0]);
  if (!el || el.type !== 'connector') return null;
  const [start, end] = getEndpoints(el as import('@lingyi-doc/core').ConnectorElement);
  if (Math.hypot(pt.x - start.x, pt.y - start.y) <= 10) return 'start';
  if (Math.hypot(pt.x - end.x, pt.y - end.y) <= 10) return 'end';
  return null;
}

export { HANDLE_R, HANDLES };
