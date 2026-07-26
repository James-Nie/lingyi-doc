import type { AnchorId, ShapeElement, WhiteboardPoint } from '@lingyi-doc/core-whiteboard';
import { cloneWhiteboardElement, createConnectorElement, genWhiteboardId, makeConnectorBind } from '@lingyi-doc/core-whiteboard';
import type { ResizeHandle } from '../viewportUtils';
import {
  BOARD_SELECTION_UI,
  selectionEdgeDotR,
  selectionResizeCornerHit,
  selectionResizeEdgeHit,
} from './selectionUi';
import { getShapeVisualBounds } from './shapePaths';

export type ShapeQuickAddSide = 'n' | 'e' | 's' | 'w';

export const SHAPE_QUICK_ADD_SIDES: ShapeQuickAddSide[] = ['n', 'e', 's', 'w'];

/** 图形选中态：缩放控制点、快捷添加圆点/箭头、旋转手柄 */
export const SHAPE_SELECTION_UI = {
  ...BOARD_SELECTION_UI,
  cornerHalf: BOARD_SELECTION_UI.cornerSize / 2,
  edgeDotR: selectionEdgeDotR(),
  resizeCornerHit: selectionResizeCornerHit(),
  resizeEdgeHit: selectionResizeEdgeHit(),
  rotOffsetX: 11,
  rotOffsetY: 14,
  rotationR: 8,
} as const;

export const SHAPE_QUICK_ADD = {
  sideOffset: 18,
  dotR: 7,
  arrowR: 14,
  gap: 48,
  hitR: 20,
} as const;

export function shapeSelectionBox(el: ShapeElement) {
  return getShapeVisualBounds(el.shapeKind, el.x, el.y, el.width, el.height);
}

/** 图形缩放控制点位置（边中点为浅蓝圆点） */
export function shapeResizeHandlePos(
  box: { x: number; y: number; w: number; h: number },
  handle: ResizeHandle,
): WhiteboardPoint {
  const { x, y, w, h } = box;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const o = SHAPE_SELECTION_UI.edgeDotOffset;
  switch (handle) {
    case 'nw': return { x, y };
    case 'n': return { x: cx, y: y - o };
    case 'ne': return { x: x + w, y };
    case 'e': return { x: x + w + o, y: cy };
    case 'se': return { x: x + w, y: y + h };
    case 's': return { x: cx, y: y + h + o };
    case 'sw': return { x, y: y + h };
    case 'w': return { x: x - o, y: cy };
  }
}

/** 图形旋转中心（与 canvas 绘制 transform 一致） */
export function shapeRotationCenter(el: ShapeElement): WhiteboardPoint {
  return { x: el.x + el.width / 2, y: el.y + el.height / 2 };
}

/** 将画布位移转换到图形未旋转的局部坐标系（用于缩放拖拽） */
export function shapeInteractionDelta(rotation: number, dx: number, dy: number): { dx: number; dy: number } {
  if (!rotation) return { dx, dy };
  const rad = (-rotation * Math.PI) / 180;
  return {
    dx: dx * Math.cos(rad) - dy * Math.sin(rad),
    dy: dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}

/** 将画布坐标转换到图形未旋转的局部坐标系（用于 hit test） */
export function shapeInteractionPoint(el: ShapeElement, pt: WhiteboardPoint): WhiteboardPoint {
  const rotation = el.rotation ?? 0;
  if (!rotation) return pt;
  const center = shapeRotationCenter(el);
  const rad = (-rotation * Math.PI) / 180;
  const dx = pt.x - center.x;
  const dy = pt.y - center.y;
  return {
    x: center.x + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: center.y + dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}

/** 左下角旋转手柄圆心（布局坐标） */
export function shapeRotationHandlePos(box: { x: number; y: number; w: number; h: number }): WhiteboardPoint {
  const { rotOffsetX, rotOffsetY } = SHAPE_SELECTION_UI;
  return { x: box.x - rotOffsetX, y: box.y + box.h + rotOffsetY };
}

export function shapeSideAnchorPos(
  box: { x: number; y: number; w: number; h: number },
  id: ShapeQuickAddSide,
): WhiteboardPoint {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const o = SHAPE_QUICK_ADD.sideOffset;
  switch (id) {
    case 'n': return { x: cx, y: box.y - o };
    case 's': return { x: cx, y: box.y + box.h + o };
    case 'e': return { x: box.x + box.w + o, y: cy };
    case 'w': return { x: box.x - o, y: cy };
  }
}

export function shapeEdgePoint(
  box: { x: number; y: number; w: number; h: number },
  id: ShapeQuickAddSide,
): WhiteboardPoint {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  switch (id) {
    case 'n': return { x: cx, y: box.y };
    case 's': return { x: cx, y: box.y + box.h };
    case 'e': return { x: box.x + box.w, y: cy };
    case 'w': return { x: box.x, y: cy };
  }
}

export function oppositeQuickAddSide(id: ShapeQuickAddSide): ShapeQuickAddSide {
  switch (id) {
    case 'n': return 's';
    case 's': return 'n';
    case 'e': return 'w';
    case 'w': return 'e';
  }
}

export function hitShapeQuickAdd(el: ShapeElement, pt: WhiteboardPoint): ShapeQuickAddSide | null {
  if (el.locked) return null;
  const localPt = shapeInteractionPoint(el, pt);
  const box = shapeSelectionBox(el);
  for (const id of SHAPE_QUICK_ADD_SIDES) {
    const anchor = shapeSideAnchorPos(box, id);
    if (Math.hypot(localPt.x - anchor.x, localPt.y - anchor.y) <= SHAPE_QUICK_ADD.hitR) {
      return id;
    }
  }
  return null;
}

export function computeQuickAddBounds(
  el: ShapeElement,
  direction: ShapeQuickAddSide,
): { x: number; y: number; width: number; height: number } {
  const gap = SHAPE_QUICK_ADD.gap;
  switch (direction) {
    case 'e':
      return { x: el.x + el.width + gap, y: el.y, width: el.width, height: el.height };
    case 'w':
      return { x: el.x - el.width - gap, y: el.y, width: el.width, height: el.height };
    case 's':
      return { x: el.x, y: el.y + el.height + gap, width: el.width, height: el.height };
    case 'n':
      return { x: el.x, y: el.y - el.height - gap, width: el.width, height: el.height };
  }
}

export function createAdjacentShape(
  source: ShapeElement,
  direction: ShapeQuickAddSide,
  zIndex: number,
): ShapeElement {
  const bounds = computeQuickAddBounds(source, direction);
  const base = cloneWhiteboardElement(source) as ShapeElement;
  return {
    ...base,
    id: genWhiteboardId(),
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    zIndex,
    text: undefined,
    locked: false,
  };
}

/** 快捷添加相邻图形时，自动创建两图形间的箭头连接线 */
export function createQuickAddConnector(
  sourceId: string,
  targetId: string,
  direction: ShapeQuickAddSide,
  zIndex: number,
) {
  return createConnectorElement(
    'arrow',
    0,
    0,
    1,
    1,
    zIndex,
    {
      startBind: makeConnectorBind(sourceId, direction),
      endBind: makeConnectorBind(targetId, oppositeQuickAddSide(direction)),
    },
  );
}

export function isShapeQuickAddSide(id: AnchorId | null | undefined): id is ShapeQuickAddSide {
  return id === 'n' || id === 'e' || id === 's' || id === 'w';
}
