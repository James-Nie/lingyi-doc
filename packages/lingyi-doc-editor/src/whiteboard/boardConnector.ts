import type {
  AnchorId,
  ConnectorElement,
  WhiteboardElement,
  WhiteboardPoint,
} from '@lingyi-doc/core';
import { getAnchorPoint, resolveElbowRoute } from '@lingyi-doc/core';
import { getShapeConnectorAnchorPoint } from './canvas/shapePaths';

/** 画板连接锚点：图形走轮廓求交，其余元素走默认包围盒 */
export function getBoardAnchorPoint(el: WhiteboardElement, anchor: AnchorId): WhiteboardPoint {
  if (el.type === 'shape') {
    return getShapeConnectorAnchorPoint(
      el.shapeKind,
      el.x,
      el.y,
      el.width,
      el.height,
      anchor,
    );
  }
  return getAnchorPoint(el, anchor);
}

export function getBoardConnectorEndpoints(
  conn: ConnectorElement,
  elements: WhiteboardElement[],
): [WhiteboardPoint, WhiteboardPoint] {
  const pts = conn.points;
  let start = pts[0] ?? { x: conn.x, y: conn.y };
  let end = pts[pts.length - 1] ?? { x: conn.x + conn.width, y: conn.y + conn.height };

  if (conn.startBind) {
    const el = elements.find(e => e.id === conn.startBind!.elementId);
    if (el) start = getBoardAnchorPoint(el, conn.startBind.anchor);
  }
  if (conn.endBind) {
    const el = elements.find(e => e.id === conn.endBind!.elementId);
    if (el) end = getBoardAnchorPoint(el, conn.endBind.anchor);
  }
  return [start, end];
}

export function getBoardConnectorRoute(
  conn: ConnectorElement,
  elements: WhiteboardElement[],
): WhiteboardPoint[] {
  const [start, end] = getBoardConnectorEndpoints(conn, elements);
  if (conn.style === 'elbow') {
    return resolveElbowRoute(conn.points, start, end);
  }
  return [start, end];
}

export function syncBoardConnectors(elements: WhiteboardElement[]): WhiteboardElement[] {
  return elements.map(el => {
    if (el.type !== 'connector') return el;
    const [start, end] = getBoardConnectorEndpoints(el, elements);
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
