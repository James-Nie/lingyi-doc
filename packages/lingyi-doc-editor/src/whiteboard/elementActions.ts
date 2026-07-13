import type { ConnectorElement, ShapeElement, WhiteboardElement, WhiteboardPoint } from '@lingyi-doc/core';
import { connectorEndArrow, connectorStartArrow } from '@lingyi-doc/core';
import { elementBounds } from './viewportUtils';

/** 切换箭头方向：仅交换两端箭头样式，路径与绑定保持不变 */
export function reverseConnectorDirection(
  conn: ConnectorElement,
): ConnectorElement {
  const startArrow = connectorStartArrow(conn);
  const endArrow = connectorEndArrow(conn);
  return {
    ...conn,
    arrowStart: endArrow,
    arrowEnd: startArrow,
  };
}

export function rotateConnector90(
  conn: ConnectorElement,
  resolveEndpoints: (c: ConnectorElement) => [WhiteboardPoint, WhiteboardPoint],
): ConnectorElement {
  const [a, b] = resolveEndpoints(conn);
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const rot = (pt: WhiteboardPoint): WhiteboardPoint => {
    const dx = pt.x - cx;
    const dy = pt.y - cy;
    return { x: cx - dy, y: cy + dx };
  };
  const newA = rot(a);
  const newB = rot(b);
  return {
    ...conn,
    points: [newA, newB],
    x: Math.min(newA.x, newB.x),
    y: Math.min(newA.y, newB.y),
    width: Math.abs(newB.x - newA.x) || 1,
    height: Math.abs(newB.y - newA.y) || 1,
    startBind: undefined,
    endBind: undefined,
  };
}

export type ZOrderAction = 'front' | 'back' | 'forward' | 'backward';

export type CopiedShapeStyle = Partial<Pick<
  ShapeElement,
  | 'fill'
  | 'stroke'
  | 'strokeWidth'
  | 'fontSize'
  | 'textColor'
  | 'textAlign'
  | 'textVerticalAlign'
  | 'fontWeight'
  | 'fontStyle'
  | 'textUnderline'
  | 'textLineThrough'
  | 'textHighlight'
>>;

const TRANSFORMABLE = new Set(['shape', 'text', 'sticky', 'image', 'section']);

export function canTransformElement(el: WhiteboardElement): boolean {
  return TRANSFORMABLE.has(el.type);
}

export function canCopyStyle(el: WhiteboardElement): el is ShapeElement {
  return el.type === 'shape';
}

export function extractShapeStyle(el: ShapeElement): CopiedShapeStyle {
  return {
    fill: el.fill,
    stroke: el.stroke,
    strokeWidth: el.strokeWidth,
    fontSize: el.fontSize,
    textColor: el.textColor,
    textAlign: el.textAlign,
    textVerticalAlign: el.textVerticalAlign,
    fontWeight: el.fontWeight,
    fontStyle: el.fontStyle,
    textUnderline: el.textUnderline,
    textLineThrough: el.textLineThrough,
    textHighlight: el.textHighlight,
  };
}

export function applyShapeStyle(el: ShapeElement, style: CopiedShapeStyle): ShapeElement {
  return { ...el, ...style };
}

export function reorderZIndex(
  elements: WhiteboardElement[],
  ids: string[],
  mode: ZOrderAction,
): WhiteboardElement[] {
  const idSet = new Set(ids);
  let list = [...elements].sort((a, b) => a.zIndex - b.zIndex);

  if (mode === 'front') {
    const selected = list.filter(e => idSet.has(e.id));
    const rest = list.filter(e => !idSet.has(e.id));
    list = [...rest, ...selected];
  } else if (mode === 'back') {
    const selected = list.filter(e => idSet.has(e.id));
    const rest = list.filter(e => !idSet.has(e.id));
    list = [...selected, ...rest];
  } else if (mode === 'forward') {
    for (let i = list.length - 2; i >= 0; i -= 1) {
      if (idSet.has(list[i].id) && !idSet.has(list[i + 1].id)) {
        [list[i], list[i + 1]] = [list[i + 1], list[i]];
      }
    }
  } else if (mode === 'backward') {
    for (let i = 1; i < list.length; i += 1) {
      if (idSet.has(list[i].id) && !idSet.has(list[i - 1].id)) {
        [list[i], list[i - 1]] = [list[i - 1], list[i]];
      }
    }
  }

  return list.map((el, index) => ({ ...el, zIndex: index }));
}

export function flipElements(
  elements: WhiteboardElement[],
  ids: string[],
  axis: 'x' | 'y',
): WhiteboardElement[] {
  const idSet = new Set(ids);
  return elements.map(el => {
    if (!idSet.has(el.id) || !canTransformElement(el)) return el;
    if (axis === 'x') return { ...el, flipX: !el.flipX };
    return { ...el, flipY: !el.flipY };
  });
}

export function rotateElements(
  elements: WhiteboardElement[],
  ids: string[],
  deltaDeg = 90,
): WhiteboardElement[] {
  const idSet = new Set(ids);
  return elements.map(el => {
    if (!idSet.has(el.id) || !canTransformElement(el)) return el;
    const next = ((el.rotation ?? 0) + deltaDeg) % 360;
    return { ...el, rotation: next < 0 ? next + 360 : next };
  });
}

/** 根据指针相对旋转中心的拖拽角度计算新 rotation（度） */
export function rotationFromPointerDrag(
  originRotation: number,
  center: { x: number; y: number },
  startAngle: number,
  pt: WhiteboardPoint,
): number {
  const curAngle = Math.atan2(pt.y - center.y, pt.x - center.x);
  let delta = curAngle - startAngle;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const deg = originRotation + (delta * 180) / Math.PI;
  return snapRotationDeg(((deg % 360) + 360) % 360);
}

export const ROTATION_SNAP_DEG = 5;

/** 旋转角度吸附到 0/90/180/270° */
export function snapRotationDeg(deg: number, threshold = ROTATION_SNAP_DEG): number {
  const normalized = ((deg % 360) + 360) % 360;
  for (const target of [0, 90, 180, 270]) {
    let diff = Math.abs(normalized - target);
    if (diff > 180) diff = 360 - diff;
    if (diff <= threshold) return target;
  }
  return normalized;
}

export function toggleLockElements(
  elements: WhiteboardElement[],
  ids: string[],
): WhiteboardElement[] {
  const idSet = new Set(ids);
  const selected = elements.filter(e => idSet.has(e.id));
  const allLocked = selected.length > 0 && selected.every(e => e.locked);
  return elements.map(el => (
    idSet.has(el.id) ? { ...el, locked: !allLocked } : el
  ));
}

export function selectionBounds(
  elements: WhiteboardElement[],
  ids: string[],
): { x: number; y: number; w: number; h: number } | null {
  const selected = elements.filter(e => ids.includes(e.id));
  if (!selected.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of selected) {
    const b = elementBounds(el);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
