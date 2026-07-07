import type {
  AnchorId,
  ConnectorBind,
  ConnectorElement,
  ConnectorStyle,
  WhiteboardElement,
  WhiteboardPoint,
} from './types';
import {
  defaultElbowPoints,
  elbowPathD,
  elbowPathSegments,
  resolveElbowRoute,
} from './elbowConnector';

export const ANCHOR_IDS: AnchorId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export function isConnectable(el: WhiteboardElement): boolean {
  return el.type !== 'connector' && el.type !== 'pen';
}

function boxOf(el: WhiteboardElement): { x: number; y: number; w: number; h: number } {
  if (el.type === 'connector' || el.type === 'pen') {
    if (!el.points.length) return { x: el.x, y: el.y, w: el.width, h: el.height };
    const xs = el.points.map(p => p.x);
    const ys = el.points.map(p => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
  }
  return { x: el.x, y: el.y, w: el.width, h: el.height };
}

export function getAnchorPoint(el: WhiteboardElement, anchor: AnchorId): WhiteboardPoint {
  const b = boxOf(el);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  switch (anchor) {
    case 'n': return { x: cx, y: b.y };
    case 's': return { x: cx, y: b.y + b.h };
    case 'e': return { x: b.x + b.w, y: cy };
    case 'w': return { x: b.x, y: cy };
    case 'nw': return { x: b.x, y: b.y };
    case 'ne': return { x: b.x + b.w, y: b.y };
    case 'se': return { x: b.x + b.w, y: b.y + b.h };
    case 'sw': return { x: b.x, y: b.y + b.h };
  }
}

export function getElementAnchors(el: WhiteboardElement): { id: AnchorId; x: number; y: number }[] {
  return ANCHOR_IDS.map(id => ({ id, ...getAnchorPoint(el, id) }));
}

export function pointInElement(pt: WhiteboardPoint, el: WhiteboardElement, pad = 0): boolean {
  const b = boxOf(el);
  return (
    pt.x >= b.x - pad && pt.x <= b.x + b.w + pad
    && pt.y >= b.y - pad && pt.y <= b.y + b.h + pad
  );
}

export interface ConnectionSnap {
  elementId: string;
  anchor: AnchorId;
  point: WhiteboardPoint;
}

/** 查找光标附近可吸附的锚点 */
export function findConnectionSnap(
  elements: WhiteboardElement[],
  pt: WhiteboardPoint,
  opts?: { excludeId?: string; snapRadius?: number },
): ConnectionSnap | null {
  const snapRadius = opts?.snapRadius ?? 40;
  let best: (ConnectionSnap & { dist: number }) | null = null;

  for (const el of elements) {
    if (!isConnectable(el) || el.id === opts?.excludeId) continue;
    if (!pointInElement(pt, el, 20)) continue;
    for (const a of getElementAnchors(el)) {
      const d = Math.hypot(pt.x - a.x, pt.y - a.y);
      if (d <= snapRadius && (!best || d < best.dist)) {
        best = { elementId: el.id, anchor: a.id, point: { x: a.x, y: a.y }, dist: d };
      }
    }
  }
  return best ? { elementId: best.elementId, anchor: best.anchor, point: best.point } : null;
}

/** 查找 hover 的可连接图形（自上而下） */
export function findHoverConnectable(
  elements: WhiteboardElement[],
  pt: WhiteboardPoint,
): string | null {
  const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex);
  for (const el of sorted) {
    if (!isConnectable(el)) continue;
    if (pointInElement(pt, el, 4)) return el.id;
  }
  return null;
}

export function getConnectorEndpoints(
  conn: ConnectorElement,
  elements: WhiteboardElement[],
): [WhiteboardPoint, WhiteboardPoint] {
  const pts = conn.points;
  let start = pts[0] ?? { x: conn.x, y: conn.y };
  let end = pts[1] ?? { x: conn.x + conn.width, y: conn.y + conn.height };
  if (conn.startBind) {
    const el = elements.find(e => e.id === conn.startBind!.elementId);
    if (el) start = getAnchorPoint(el, conn.startBind.anchor);
  }
  if (conn.endBind) {
    const el = elements.find(e => e.id === conn.endBind!.elementId);
    if (el) end = getAnchorPoint(el, conn.endBind.anchor);
  }
  return [start, end];
}

export function syncBoundConnectors(elements: WhiteboardElement[]): WhiteboardElement[] {
  return elements.map(el => {
    if (el.type !== 'connector') return el;
    const [start, end] = getConnectorEndpoints(el, elements);
    const points = el.style === 'elbow'
      ? resolveElbowRoute(el.points, start, end)
      : [start, end];
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    return {
      ...el,
      points,
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs) || 1,
      height: Math.max(...ys) - Math.min(...ys) || 1,
    };
  });
}

export function getConnectorRoutePoints(
  conn: ConnectorElement,
  elements: WhiteboardElement[],
): WhiteboardPoint[] {
  const [start, end] = getConnectorEndpoints(conn, elements);
  if (conn.style === 'elbow') {
    return resolveElbowRoute(conn.points, start, end);
  }
  return [start, end];
}

export function connectorPathD(
  style: ConnectorStyle,
  a: WhiteboardPoint,
  b: WhiteboardPoint,
  route?: WhiteboardPoint[],
): string {
  if (style === 'elbow') {
    const pts = route && route.length >= 2 ? route : defaultElbowPoints(a, b);
    return elbowPathD(pts);
  }
  if (style === 'curve') {
    const cx = (a.x + b.x) / 2;
    return `M ${a.x} ${a.y} Q ${cx} ${a.y} ${b.x} ${b.y}`;
  }
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
}

function connectorPathSegments(
  style: ConnectorStyle,
  a: WhiteboardPoint,
  b: WhiteboardPoint,
  route?: WhiteboardPoint[],
): [WhiteboardPoint, WhiteboardPoint][] {
  if (style === 'elbow') {
    const pts = route && route.length >= 2 ? route : defaultElbowPoints(a, b);
    return elbowPathSegments(pts);
  }
  if (style === 'curve') {
    const cx = (a.x + b.x) / 2;
    const steps = 12;
    const segments: [WhiteboardPoint, WhiteboardPoint][] = [];
    let prev = a;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      const pt = {
        x: u * u * a.x + 2 * u * t * cx + t * t * b.x,
        y: u * u * a.y + 2 * u * t * a.y + t * t * b.y,
      };
      segments.push([prev, pt]);
      prev = pt;
    }
    return segments;
  }
  return [[a, b]];
}

export function distanceToSegment(p: WhiteboardPoint, a: WhiteboardPoint, b: WhiteboardPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

/** 命中连接线 / 画笔（便于选中） */
export function hitLineElement(
  elements: WhiteboardElement[],
  pt: WhiteboardPoint,
  threshold = 8,
): string | null {
  const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex);
  for (const el of sorted) {
    if (el.type === 'connector') {
      const [a, b] = getConnectorEndpoints(el, elements);
      if (!a || !b) continue;
      const route = getConnectorRoutePoints(el, elements);
      for (const [segA, segB] of connectorPathSegments(el.style, a, b, route)) {
        if (distanceToSegment(pt, segA, segB) <= threshold) return el.id;
      }
    }
    if (el.type === 'pen' && el.points.length > 1) {
      for (let i = 1; i < el.points.length; i++) {
        if (distanceToSegment(pt, el.points[i - 1], el.points[i]) <= threshold) return el.id;
      }
    }
  }
  return null;
}

export function makeConnectorBind(elementId: string, anchor: AnchorId): ConnectorBind {
  return { elementId, anchor };
}
