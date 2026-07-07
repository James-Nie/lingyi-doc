import type { AnchorId, ShapeElement, WhiteboardPoint } from '@lingyi-doc/core';
import { cloneWhiteboardElement, createConnectorElement, genWhiteboardId, makeConnectorBind } from '@lingyi-doc/core';
import { getShapeVisualBounds } from './shapePaths';

export type ShapeQuickAddSide = 'n' | 'e' | 's' | 'w';

export const SHAPE_QUICK_ADD_SIDES: ShapeQuickAddSide[] = ['n', 'e', 's', 'w'];

/** 图形选中态：缩放控制点、快捷添加圆点/箭头、旋转手柄 */
export const SHAPE_SELECTION_UI = {
  cornerHalf: 6,
  edgeShort: 5,
  edgeLong: 18,
  rotOffsetX: 14,
  rotOffsetY: 20,
  rotationR: 9,
  resizeCornerHit: 10,
  resizeEdgeHit: 12,
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
  const box = shapeSelectionBox(el);
  for (const id of SHAPE_QUICK_ADD_SIDES) {
    const anchor = shapeSideAnchorPos(box, id);
    if (Math.hypot(pt.x - anchor.x, pt.y - anchor.y) <= SHAPE_QUICK_ADD.hitR) {
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
