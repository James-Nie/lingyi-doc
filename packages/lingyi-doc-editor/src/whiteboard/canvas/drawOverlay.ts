import type { AnchorId, ConnectorElement, ShapeElement, ShapeKind, WhiteboardElement, WhiteboardPoint } from '@lingyi-doc/core';
import { connectorPathD } from '@lingyi-doc/core';
import { WB_COLORS } from '../styles';
import { elementBounds, type ResizeHandle } from '../viewportUtils';
import { SHAPE_DEFAULT_FILL, SHAPE_DEFAULT_STROKE, SHAPE_DEFAULT_STROKE_WIDTH } from '@lingyi-doc/core';
import type { AlignmentGuide } from './alignmentGuides';
import { getShapeVisualBounds, drawShapeBody } from './shapePaths';
import { HANDLES, interactionAnchorsForElement } from './hitTest';
import {
  SHAPE_QUICK_ADD,
  SHAPE_QUICK_ADD_SIDES,
  SHAPE_SELECTION_UI,
  computeQuickAddBounds,
  isShapeQuickAddSide,
  oppositeQuickAddSide,
  shapeEdgePoint,
  shapeSelectionBox,
  shapeSideAnchorPos,
  type ShapeQuickAddSide,
} from './shapeQuickAdd';

export interface OverlayState {
  selectedIds: string[];
  marquee: { x: number; y: number; w: number; h: number } | null;
  createPreview: { x: number; y: number; w: number; h: number } | null;
  createPreviewShapeKind?: ShapeKind | null;
  liveConnector: { start: WhiteboardPoint; end: WhiteboardPoint } | null;
  livePenPoints: WhiteboardPoint[] | null;
  connectorStyle?: string;
  penColor?: string;
  penWidth?: number;
  penMode?: string;
  connectTarget: { element: WhiteboardElement; anchor: AnchorId } | null;
  connectorEndpoints: { start: WhiteboardPoint; end: WhiteboardPoint } | null;
  alignmentGuides?: AlignmentGuide[];
  zoom?: number;
  readOnly?: boolean;
  hoveredId?: string | null;
  shapeQuickAddHover?: ShapeQuickAddSide | null;
}

const CORNER_HANDLES: ResizeHandle[] = ['nw', 'ne', 'se', 'sw'];
const EDGE_HANDLES: ResizeHandle[] = ['n', 'e', 's', 'w'];

function selectionBox(elements: WhiteboardElement[], ids: string[]) {
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

function handlePos(box: { x: number; y: number; w: number; h: number }, handle: ResizeHandle) {
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

function drawAlignmentGuides(
  ctx: CanvasRenderingContext2D,
  guides: AlignmentGuide[],
  zoom: number,
): void {
  if (!guides.length) return;
  ctx.save();
  const lineW = 1 / Math.max(zoom, 0.1);
  const tick = 4 / Math.max(zoom, 0.1);

  for (const g of guides) {
    if (g.kind === 'spacing' && g.spacing) {
      const { orient, from, to, cross } = g.spacing;
      ctx.strokeStyle = '#ff4d4f';
      ctx.fillStyle = '#ff4d4f';
      ctx.lineWidth = lineW;
      ctx.setLineDash([]);
      if (orient === 'h') {
        const mid = (from + to) / 2;
        ctx.beginPath();
        ctx.moveTo(from, cross);
        ctx.lineTo(to, cross);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(from, cross - tick);
        ctx.lineTo(from, cross + tick);
        ctx.moveTo(to, cross - tick);
        ctx.lineTo(to, cross + tick);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(mid, cross, 1.5 / Math.max(zoom, 0.1), 0, Math.PI * 2);
        ctx.fill();
      } else {
        const mid = (from + to) / 2;
        ctx.beginPath();
        ctx.moveTo(cross, from);
        ctx.lineTo(cross, to);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cross - tick, from);
        ctx.lineTo(cross + tick, from);
        ctx.moveTo(cross - tick, to);
        ctx.lineTo(cross + tick, to);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cross, mid, 1.5 / Math.max(zoom, 0.1), 0, Math.PI * 2);
        ctx.fill();
      }
      continue;
    }

    const color = g.kind === 'size' ? '#3370ff' : '#ff4d4f';
    ctx.strokeStyle = color;
    ctx.lineWidth = lineW;
    ctx.setLineDash(g.kind === 'size' ? [4, 3] : []);
    ctx.beginPath();
    if (g.axis === 'x') {
      ctx.moveTo(g.pos, g.start);
      ctx.lineTo(g.pos, g.end);
    } else {
      ctx.moveTo(g.start, g.pos);
      ctx.lineTo(g.end, g.pos);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawQuickAddDot(
  ctx: CanvasRenderingContext2D,
  pt: WhiteboardPoint,
  accent: string,
) {
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, SHAPE_QUICK_ADD.dotR, 0, Math.PI * 2);
  ctx.fillStyle = '#9ec5ff';
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawQuickAddArrow(
  ctx: CanvasRenderingContext2D,
  pt: WhiteboardPoint,
  dir: ShapeQuickAddSide,
  accent: string,
) {
  const { x, y } = pt;
  const r = SHAPE_QUICK_ADD.arrowR;
  const tri = r * 0.55;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.save();
  ctx.translate(x, y);
  const rot = dir === 'n' ? -Math.PI / 2
    : dir === 's' ? Math.PI / 2
      : dir === 'w' ? Math.PI
        : 0;
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(tri * 0.5, 0);
  ctx.lineTo(-tri * 0.4, -tri * 0.45);
  ctx.lineTo(-tri * 0.4, tri * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawQuickAddPreview(
  ctx: CanvasRenderingContext2D,
  el: ShapeElement,
  dir: ShapeQuickAddSide,
  accent: string,
) {
  const srcBox = shapeSelectionBox(el);
  const preview = computeQuickAddBounds(el, dir);
  const ghostBox = getShapeVisualBounds(
    el.shapeKind,
    preview.x,
    preview.y,
    preview.width,
    preview.height,
  );
  const from = shapeEdgePoint(srcBox, dir);
  const to = shapeEdgePoint(ghostBox, oppositeQuickAddSide(dir));

  ctx.save();
  ctx.strokeStyle = '#c9cdd4';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.fillStyle = '#c9cdd4';
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - Math.cos(angle - 0.45) * 8, to.y - Math.sin(angle - 0.45) * 8);
  ctx.lineTo(to.x - Math.cos(angle + 0.45) * 8, to.y - Math.sin(angle + 0.45) * 8);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.45;
  drawShapeBody(
    ctx,
    el.shapeKind,
    preview.x,
    preview.y,
    preview.width,
    preview.height,
    el.fill,
    el.stroke,
    el.strokeWidth,
  );
  ctx.globalAlpha = 1;
  ctx.restore();

  drawQuickAddArrow(ctx, shapeSideAnchorPos(srcBox, dir), dir, accent);
}

function drawShapeSelection(
  ctx: CanvasRenderingContext2D,
  el: ShapeElement,
  quickAddHover?: ShapeQuickAddSide | null,
) {
  const box = shapeSelectionBox(el);
  const accent = WB_COLORS.accent;
  const { cornerHalf, edgeShort, edgeLong, rotOffsetX, rotOffsetY } = SHAPE_SELECTION_UI;

  ctx.save();
  ctx.setLineDash([]);

  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(box.x, box.y, box.w, box.h);

  if (el.locked) {
    ctx.restore();
    return;
  }

  for (const handle of CORNER_HANDLES) {
    const hp = handlePos(box, handle);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(hp.x - cornerHalf, hp.y - cornerHalf, cornerHalf * 2, cornerHalf * 2);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(hp.x - cornerHalf, hp.y - cornerHalf, cornerHalf * 2, cornerHalf * 2);
  }

  for (const handle of EDGE_HANDLES) {
    const hp = handlePos(box, handle);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    if (handle === 'n' || handle === 's') {
      ctx.fillRect(hp.x - edgeLong / 2, hp.y - edgeShort, edgeLong, edgeShort * 2);
      ctx.strokeRect(hp.x - edgeLong / 2, hp.y - edgeShort, edgeLong, edgeShort * 2);
    } else {
      ctx.fillRect(hp.x - edgeShort, hp.y - edgeLong / 2, edgeShort * 2, edgeLong);
      ctx.strokeRect(hp.x - edgeShort, hp.y - edgeLong / 2, edgeShort * 2, edgeLong);
    }
  }

  if (isShapeQuickAddSide(quickAddHover)) {
    drawQuickAddPreview(ctx, el, quickAddHover, accent);
    for (const id of SHAPE_QUICK_ADD_SIDES) {
      if (id === quickAddHover) continue;
      drawQuickAddDot(ctx, shapeSideAnchorPos(box, id), accent);
    }
  } else {
    for (const id of SHAPE_QUICK_ADD_SIDES) {
      drawQuickAddDot(ctx, shapeSideAnchorPos(box, id), accent);
    }
  }

  drawRotationHandle(
    ctx,
    box.x - rotOffsetX,
    box.y + box.h + rotOffsetY,
    accent,
  );

  ctx.restore();
}

function drawRotationHandle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
): void {
  const r = SHAPE_SELECTION_UI.rotationR;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const start = Math.PI * 0.72;
  const end = Math.PI * 1.62;
  ctx.beginPath();
  ctx.arc(x, y, r, start, end);
  ctx.stroke();

  const tip = (angle: number, dir: number) => {
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    const tx = -Math.sin(angle) * dir;
    const ty = Math.cos(angle) * dir;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + tx * 4 - Math.cos(angle) * 3, py + ty * 4 - Math.sin(angle) * 3);
    ctx.lineTo(px + tx * 4 + Math.cos(angle) * 3, py + ty * 4 + Math.sin(angle) * 3);
    ctx.closePath();
    ctx.fill();
  };

  tip(start, -1);
  tip(end, 1);
  ctx.restore();
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  elements: WhiteboardElement[],
  state: OverlayState,
): void {
  const {
    selectedIds,
    marquee,
    createPreview,
    createPreviewShapeKind,
    liveConnector,
    livePenPoints,
    connectorStyle = 'arrow',
    penColor = '#e53935',
    penWidth = 3,
    penMode,
    connectTarget,
    connectorEndpoints,
    alignmentGuides,
    zoom = 1,
    readOnly,
    hoveredId,
    shapeQuickAddHover,
  } = state;

  if (alignmentGuides?.length) {
    drawAlignmentGuides(ctx, alignmentGuides, zoom);
  }

  if (marquee && marquee.w > 2 && marquee.h > 2) {
    ctx.strokeStyle = WB_COLORS.accent;
    ctx.fillStyle = 'rgba(51, 112, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.fillRect(marquee.x, marquee.y, marquee.w, marquee.h);
    ctx.strokeRect(marquee.x, marquee.y, marquee.w, marquee.h);
  }

  if (createPreview && createPreview.w > 0 && createPreview.h > 0) {
    if (createPreviewShapeKind) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      drawShapeBody(
        ctx,
        createPreviewShapeKind,
        createPreview.x,
        createPreview.y,
        createPreview.w,
        createPreview.h,
        SHAPE_DEFAULT_FILL,
        SHAPE_DEFAULT_STROKE,
        SHAPE_DEFAULT_STROKE_WIDTH,
      );
      ctx.globalAlpha = 1;
      ctx.restore();
    } else {
      ctx.strokeStyle = WB_COLORS.accent;
      ctx.fillStyle = 'rgba(51, 112, 255, 0.06)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(createPreview.x, createPreview.y, createPreview.w, createPreview.h);
      ctx.fillRect(createPreview.x, createPreview.y, createPreview.w, createPreview.h);
      ctx.setLineDash([]);
    }
  }

  if (livePenPoints && livePenPoints.length > 1) {
    ctx.beginPath();
    ctx.moveTo(livePenPoints[0].x, livePenPoints[0].y);
    for (let i = 1; i < livePenPoints.length; i++) {
      ctx.lineTo(livePenPoints[i].x, livePenPoints[i].y);
    }
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = penMode === 'highlighter' ? 0.5 : 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (liveConnector) {
    const d = connectorPathD(connectorStyle as 'arrow', liveConnector.start, liveConnector.end);
    ctx.strokeStyle = '#3370ff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke(new Path2D(d));
    ctx.setLineDash([]);
  }

  if (connectTarget) {
    const el = connectTarget.element;
    const tb = elementBounds(el);
    ctx.strokeStyle = WB_COLORS.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(tb.x - 2, tb.y - 2, tb.w + 4, tb.h + 4);
    for (const a of interactionAnchorsForElement(el)) {
      ctx.beginPath();
      ctx.arc(a.x, a.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = connectTarget.anchor === a.id ? WB_COLORS.accent : '#fff';
      ctx.fill();
      ctx.strokeStyle = WB_COLORS.accent;
      ctx.stroke();
    }
  }

  const box = selectionBox(elements, selectedIds);
  const single = selectedIds.length === 1 ? elements.find(e => e.id === selectedIds[0]) : null;
  const hideBox = selectedIds.length === 1 && (single?.type === 'shape' || single?.type === 'mindmap');

  if (!readOnly && single?.type === 'shape') {
    drawShapeSelection(ctx, single as ShapeElement, shapeQuickAddHover);
  }

  if (!readOnly && hoveredId && hoveredId !== single?.id) {
    const hovered = elements.find(e => e.id === hoveredId);
    if (hovered?.type === 'shape') {
      const hb = shapeSelectionBox(hovered as ShapeElement);
      ctx.strokeStyle = `${WB_COLORS.accent}88`;
      ctx.lineWidth = 2;
      ctx.strokeRect(hb.x - 1, hb.y - 1, hb.w + 2, hb.h + 2);
    }
  }

  if (box && selectedIds.length > 0 && !hideBox) {
    ctx.strokeStyle = WB_COLORS.selectBorder;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(box.x - 2, box.y - 2, box.w + 4, box.h + 4);
    ctx.setLineDash([]);
  }

  if (!readOnly && box && selectedIds.length === 1 && single
    && single.type !== 'connector' && single.type !== 'pen' && single.type !== 'mindmap' && single.type !== 'shape') {
    for (const handle of HANDLES) {
      const hp = handlePos(box, handle);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = WB_COLORS.accent;
      ctx.lineWidth = 2;
      ctx.fillRect(hp.x - 6, hp.y - 6, 12, 12);
      ctx.strokeRect(hp.x - 6, hp.y - 6, 12, 12);
    }
  }

  if (!readOnly && connectorEndpoints && single?.type === 'connector') {
    for (const pt of [connectorEndpoints.start, connectorEndpoints.end]) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = WB_COLORS.accent;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}
