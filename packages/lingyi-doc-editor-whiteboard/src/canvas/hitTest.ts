import type { AnchorId, ConnectorElement, ShapeElement, WhiteboardElement, WhiteboardPoint } from '@lingyi-doc/core-whiteboard';
import { anchorOutwardVector, getElementAnchors, getSeqLifelineHandlePoint, hitTableResizeEdge, isConnectable, isSeqLifelineKind, pointInElement, type ConnectionSnap, type TableElement } from '@lingyi-doc/core-whiteboard';
import { distanceToSegment } from '@lingyi-doc/core-whiteboard';
import { getBoardConnectorLabelBounds, getBoardConnectorRoute } from '../boardConnector';
import { measureConnectorLabelWidth } from './ConnectorLabelEditor';
import { elementBounds, type ResizeHandle } from '../viewportUtils';
import { getShapeConnectorAnchors, getShapeVisualBounds, hitShapeElementAtPoint } from './shapePaths';
import { SHAPE_SELECTION_UI, shapeInteractionPoint, shapeResizeHandlePos, shapeRotationHandlePos, shapeSelectionBox } from './shapeQuickAdd';
import {
  BOARD_SELECTION_UI,
  screenToWorld,
  selectionResizeCornerHit,
  selectionResizeEdgeHit,
} from './selectionUi';

function shapeInteractionHit(el: WhiteboardElement, pt: WhiteboardPoint, pad: number): boolean {
  if (el.type === 'shape') return hitShapeElementAtPoint(el as ShapeElement, pt, pad);
  return pointInElement(pt, el, pad);
}

function interactionAnchors(el: WhiteboardElement): { id: AnchorId; x: number; y: number }[] {
  if (el.type === 'shape') return getShapeConnectorAnchors(el as ShapeElement);
  return getElementAnchors(el);
}

/** 画板连线命中：与绘制共用 getBoardConnectorRoute，避免 manual/轮廓锚点错位 */
function hitBoardConnectorAtPoint(
  elements: WhiteboardElement[],
  pt: WhiteboardPoint,
  threshold: number,
): string | null {
  const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex);
  for (const el of sorted) {
    if (el.type === 'connector') {
      const route = getBoardConnectorRoute(el, elements);
      // 折线有圆角：可见弧相对尖角内收，适当放宽阈值
      const pad = el.style === 'elbow' ? Math.max(threshold, 4) : threshold;
      for (let i = 1; i < route.length; i++) {
        if (distanceToSegment(pt, route[i - 1], route[i]) <= pad) return el.id;
      }
      continue;
    }
    if (el.type === 'pen' && el.points.length > 1) {
      for (let i = 1; i < el.points.length; i++) {
        if (distanceToSegment(pt, el.points[i - 1], el.points[i]) <= threshold) return el.id;
      }
    }
  }
  return null;
}

export function interactionAnchorsForElement(el: WhiteboardElement): { id: AnchorId; x: number; y: number }[] {
  return interactionAnchors(el);
}

/** 在指定元素上选取最面向 target 的连接锚点（避免从图形错误一侧出线） */
export function resolveConnectionBindForElement(
  el: WhiteboardElement,
  target: WhiteboardPoint,
): ConnectionSnap | null {
  if (!isConnectable(el)) return null;
  const anchors = interactionAnchors(el);
  let best: (ConnectionSnap & { score: number }) | null = null;

  for (const a of anchors) {
    const toTarget = { x: target.x - a.x, y: target.y - a.y };
    const len = Math.hypot(toTarget.x, toTarget.y);
    if (len < 1e-6) continue;
    const outward = anchorOutwardVector(a.id);
    const align = (toTarget.x / len) * outward.x + (toTarget.y / len) * outward.y;
    if (!best || align > best.score) {
      best = {
        elementId: el.id,
        anchor: a.id,
        point: { x: a.x, y: a.y },
        score: align,
      };
    }
  }

  return best ? { elementId: best.elementId, anchor: best.anchor, point: best.point } : null;
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
  opts?: { excludeId?: string; snapRadius?: number; fromPoint?: WhiteboardPoint },
): ConnectionSnap | null {
  const snapRadius = opts?.snapRadius ?? 40;
  const fromPoint = opts?.fromPoint;
  let best: (ConnectionSnap & { score: number }) | null = null;

  for (const el of elements) {
    if (!isConnectable(el) || el.id === opts?.excludeId) continue;
    if (!shapeInteractionHit(el, pt, 20)) continue;
    for (const a of interactionAnchors(el)) {
      const dist = Math.hypot(pt.x - a.x, pt.y - a.y);
      if (dist > snapRadius) continue;

      let score = 1 - dist / snapRadius;
      if (fromPoint) {
        const approach = { x: pt.x - fromPoint.x, y: pt.y - fromPoint.y };
        const approachLen = Math.hypot(approach.x, approach.y);
        if (approachLen > 1e-6) {
          const outward = anchorOutwardVector(a.id);
          const align = -(approach.x / approachLen * outward.x + approach.y / approachLen * outward.y);
          score = score * 0.4 + Math.max(0, align) * 0.6;
        }
      }

      if (!best || score > best.score) {
        best = {
          elementId: el.id,
          anchor: a.id,
          point: { x: a.x, y: a.y },
          score,
        };
      }
    }
  }
  return best ? { elementId: best.elementId, anchor: best.anchor, point: best.point } : null;
}

const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const CORNER_HANDLES: ResizeHandle[] = ['nw', 'ne', 'se', 'sw'];
const EDGE_HANDLES: ResizeHandle[] = ['n', 'e', 's', 'w'];
const HANDLE_R_SCREEN = selectionResizeCornerHit();
const EDGE_HANDLE_HIT_R_SCREEN = selectionResizeEdgeHit();
const HANDLE_HIT_PAD_SCREEN = BOARD_SELECTION_UI.resizeHitPad;
const EDGE_HIT_DIST_SCREEN = 6;
const EDGE_CORNER_MARGIN_SCREEN = 14;

/** @deprecated 使用 hit 时传入 zoom 后的世界坐标半径；保留导出兼容旧引用 */
const HANDLE_R = HANDLE_R_SCREEN;

function hitShapeResizeEdge(
  box: { x: number; y: number; w: number; h: number },
  pt: WhiteboardPoint,
  zoom = 1,
): ResizeHandle | null {
  const { x, y, w, h } = box;
  const edgeHit = screenToWorld(EDGE_HIT_DIST_SCREEN, zoom);
  const cornerMargin = screenToWorld(EDGE_CORNER_MARGIN_SCREEN, zoom);
  if (w < cornerMargin * 2 || h < cornerMargin * 2) return null;

  if (
    Math.abs(pt.y - y) <= edgeHit
    && pt.x >= x + cornerMargin
    && pt.x <= x + w - cornerMargin
  ) {
    return 'n';
  }
  if (
    Math.abs(pt.y - (y + h)) <= edgeHit
    && pt.x >= x + cornerMargin
    && pt.x <= x + w - cornerMargin
  ) {
    return 's';
  }
  if (
    Math.abs(pt.x - (x + w)) <= edgeHit
    && pt.y >= y + cornerMargin
    && pt.y <= y + h - cornerMargin
  ) {
    return 'e';
  }
  if (
    Math.abs(pt.x - x) <= edgeHit
    && pt.y >= y + cornerMargin
    && pt.y <= y + h - cornerMargin
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

export function hitConnectorLabelAtPoint(
  elements: WhiteboardElement[],
  pt: WhiteboardPoint,
): ConnectorElement | null {
  const sorted = [...elements]
    .filter((el): el is ConnectorElement => el.type === 'connector' && !!el.text?.trim())
    .sort((a, b) => b.zIndex - a.zIndex);

  for (const conn of sorted) {
    const textWidth = measureConnectorLabelWidth(conn.text!.trim());
    const bounds = getBoardConnectorLabelBounds(conn, elements, textWidth);
    if (!bounds) continue;
    if (
      pt.x >= bounds.x
      && pt.x <= bounds.x + bounds.w
      && pt.y >= bounds.y
      && pt.y <= bounds.y + bounds.h
    ) {
      return conn;
    }
  }
  return null;
}

export function hitElementAtPoint(
  elements: WhiteboardElement[],
  pt: WhiteboardPoint,
  excludeTypes: string[] = [],
  zoom = 1,
): WhiteboardElement | null {
  const labelHit = hitConnectorLabelAtPoint(elements, pt);
  if (labelHit) return labelHit;

  const threshold = screenToWorld(10, zoom);
  const lineHit = hitBoardConnectorAtPoint(elements, pt, threshold);
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

const SEQ_EDGE_HANDLES: ResizeHandle[] = ['n', 'e', 'w'];

export function hitSeqLifelineHandle(
  elements: WhiteboardElement[],
  selectedIds: string[],
  pt: WhiteboardPoint,
  zoom = 1,
): string | null {
  if (selectedIds.length !== 1) return null;
  const el = elements.find(e => e.id === selectedIds[0]);
  if (!el || el.type !== 'shape' || el.locked || !isSeqLifelineKind(el.shapeKind)) return null;
  const shape = el as ShapeElement;
  const localPt = shapeInteractionPoint(shape, pt);
  const hp = getSeqLifelineHandlePoint(shape);
  const hitR = screenToWorld(HANDLE_R_SCREEN + HANDLE_HIT_PAD_SCREEN + 2, zoom);
  if (Math.hypot(localPt.x - hp.x, localPt.y - hp.y) <= hitR) {
    return el.id;
  }
  return null;
}

export function hitResizeHandle(
  elements: WhiteboardElement[],
  selectedIds: string[],
  pt: WhiteboardPoint,
  zoom = 1,
): { id: string; handle: ResizeHandle } | null {
  if (selectedIds.length !== 1) return null;
  const el = elements.find(e => e.id === selectedIds[0]);
  if (!el || el.type === 'connector' || el.type === 'pen' || el.type === 'mindmap') return null;

  const handleR = screenToWorld(HANDLE_R_SCREEN + HANDLE_HIT_PAD_SCREEN, zoom);
  const edgeHandleR = screenToWorld(EDGE_HANDLE_HIT_R_SCREEN, zoom);

  // 表格：四角优先命中方块手柄，其余边框仍可整表改大小
  if (el.type === 'table') {
    const box = elementBounds(el);
    for (const handle of CORNER_HANDLES) {
      const hp = handlePosition(box, handle);
      if (Math.hypot(pt.x - hp.x, pt.y - hp.y) <= handleR) {
        return { id: el.id, handle };
      }
    }
    const edge = hitTableResizeEdge(el as TableElement, pt);
    if (edge) return { id: el.id, handle: edge };
    return null;
  }

  const box = el.type === 'shape'
    ? getShapeVisualBounds(el.shapeKind, el.x, el.y, el.width, el.height)
    : elementBounds(el);
  const hitPt = el.type === 'shape'
    ? shapeInteractionPoint(el as ShapeElement, pt)
    : pt;

  for (const handle of CORNER_HANDLES) {
    const hp = el.type === 'shape'
      ? shapeResizeHandlePos(box, handle)
      : handlePosition(box, handle);
    if (Math.hypot(hitPt.x - hp.x, hitPt.y - hp.y) <= handleR) {
      return { id: el.id, handle };
    }
  }

  if (el.type === 'shape') {
    const edgeHandles = isSeqLifelineKind(el.shapeKind) ? SEQ_EDGE_HANDLES : EDGE_HANDLES;
    for (const handle of edgeHandles) {
      const hp = shapeResizeHandlePos(box, handle);
      if (Math.hypot(hitPt.x - hp.x, hitPt.y - hp.y) <= edgeHandleR) {
        return { id: el.id, handle };
      }
    }
    const edge = hitShapeResizeEdge(box, hitPt, zoom);
    if (edge) return { id: el.id, handle: edge };
    return null;
  }

  for (const handle of HANDLES) {
    if (CORNER_HANDLES.includes(handle)) continue;
    const hp = handlePosition(box, handle);
    if (Math.hypot(pt.x - hp.x, pt.y - hp.y) <= handleR) {
      return { id: el.id, handle };
    }
  }
  return null;
}

export function hitShapeRotationHandle(
  elements: WhiteboardElement[],
  selectedIds: string[],
  pt: WhiteboardPoint,
): string | null {
  if (selectedIds.length !== 1) return null;
  const el = elements.find(e => e.id === selectedIds[0]);
  if (!el || el.type !== 'shape' || el.locked) return null;
  const shape = el as ShapeElement;
  const localPt = shapeInteractionPoint(shape, pt);
  const hp = shapeRotationHandlePos(shapeSelectionBox(shape));
  const hitR = SHAPE_SELECTION_UI.rotationR + 6;
  if (Math.hypot(localPt.x - hp.x, localPt.y - hp.y) <= hitR) return el.id;
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
