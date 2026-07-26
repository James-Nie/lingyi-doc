import type { AnchorId, ShapeElement, ShapeKind } from '@lingyi-doc/core-whiteboard';
import { ANCHOR_IDS, getShapeRegistry, getSeqFullBounds, isSeqLifelineKind } from '@lingyi-doc/core-whiteboard';
import { SHAPE_DEFAULT_FILL, SHAPE_DEFAULT_STROKE, SHAPE_DEFAULT_STROKE_WIDTH } from '@lingyi-doc/core-whiteboard';
import {
  appendExtendedDiagramPath,
  drawExtendedDiagramBody,
  getExtendedDiagramOutlinePoints,
  isExtendedDiagramKind,
  type SeqDrawOptions,
} from './diagramShapePaths';

type Box = { x: number; y: number; w: number; h: number };

const VB = 24;

export {
  SHAPE_DEFAULT_FILL,
  SHAPE_DEFAULT_STROKE,
  SHAPE_DEFAULT_STROKE_WIDTH,
};

type Pt = [number, number];
type CanvasPoint = { x: number; y: number };

const POLYGON_POINTS: Partial<Record<ShapeKind, [number, number][]>> = {
  diamond: [[12, 4], [20, 12], [12, 20], [4, 12]],
  chevron: [[6, 5], [18, 12], [6, 19], [10, 12]],
  parallelogram: [[7, 5], [20, 5], [17, 19], [4, 19]],
  trapezoid: [[6, 5], [18, 5], [20, 19], [4, 19]],
  triangleRight: [[5, 5], [5, 19], [19, 19]],
  triangle: [[12, 5], [20, 19], [4, 19]],
  hexagon: [[8, 5], [16, 5], [20, 12], [16, 19], [8, 19], [4, 12]],
  pentagon: [[12, 4], [18.5, 9], [16, 17], [8, 17], [5.5, 9]],
  octagon: [[8, 4], [16, 4], [20, 8], [20, 16], [16, 20], [8, 20], [4, 16], [4, 8]],
  arrowLeft: [[19, 6], [10, 6], [10, 4], [4, 12], [10, 20], [10, 18], [19, 18]],
  arrowRight: [[5, 6], [14, 6], [14, 4], [20, 12], [14, 20], [14, 18], [5, 18]],
  arrowDouble: [[4, 12], [8, 8], [8, 10], [16, 10], [16, 8], [20, 12], [16, 16], [16, 14], [8, 14], [8, 16]],
};

/** 仅描边、不填充（与工具栏图标一致） */
const STROKE_ONLY = new Set<ShapeKind>(['braceLeft', 'braceRight']);

export function isStrokeOnlyShape(kind: ShapeKind): boolean {
  const meta = getShapeRegistry().getShape(kind);
  if (meta?.strokeOnly !== undefined) return meta.strokeOnly;
  return STROKE_ONLY.has(kind);
}

function cx(b: Box) { return b.x + b.w / 2; }
function cy(b: Box) { return b.y + b.h / 2; }

function innerBox(b: Box, pad = 0): Box {
  const px = b.w * pad;
  const py = b.h * pad;
  return { x: b.x + px, y: b.y + py, w: b.w - px * 2, h: b.h - py * 2 };
}

function mapX(x: number, inner: Box) { return inner.x + (x / VB) * inner.w; }
function mapY(y: number, inner: Box) { return inner.y + (y / VB) * inner.h; }

function withViewBox(
  ctx: CanvasRenderingContext2D,
  b: Box,
  pad: number,
  draw: () => void,
) {
  const inner = innerBox(b, pad);
  ctx.save();
  ctx.translate(inner.x, inner.y);
  ctx.scale(inner.w / VB, inner.h / VB);
  draw();
  ctx.restore();
}

function polygonFromPoints(
  ctx: CanvasRenderingContext2D,
  b: Box,
  points: [number, number][],
  pad = 0,
) {
  const inner = innerBox(b, pad);
  ctx.moveTo(mapX(points[0][0], inner), mapY(points[0][1], inner));
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(mapX(points[i][0], inner), mapY(points[i][1], inner));
  }
  ctx.closePath();
}

function fullRoundRectRadius(w: number, h: number): number {
  return Math.min(w, h) / 2;
}

/** 全圆角矩形（胶囊形）：四角为真圆弧，圆角半径 = min(宽, 高) / 2 */
export function fullRoundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const r = fullRoundRectRadius(w, h);
  if (r <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function sampleArc(
  cx: number,
  cy: number,
  r: number,
  start: number,
  end: number,
  steps: number,
  out: CanvasPoint[],
): void {
  for (let i = 0; i <= steps; i++) {
    const a = start + ((end - start) * i) / steps;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
}

function fullRoundRectOutlinePoints(x: number, y: number, w: number, h: number, arcSteps = 10): CanvasPoint[] {
  const r = fullRoundRectRadius(w, h);
  const pts: CanvasPoint[] = [];
  if (r <= 0) {
    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
  }

  pts.push({ x: x + r, y });
  pts.push({ x: x + w - r, y });
  sampleArc(x + w - r, y + r, r, -Math.PI / 2, 0, arcSteps, pts);
  if (h > 2 * r) pts.push({ x: x + w, y: y + h - r });
  sampleArc(x + w - r, y + h - r, r, 0, Math.PI / 2, arcSteps, pts);
  pts.push({ x: x + r, y: y + h });
  sampleArc(x + r, y + h - r, r, Math.PI / 2, Math.PI, arcSteps, pts);
  if (h > 2 * r) pts.push({ x, y: y + r });
  sampleArc(x + r, y + r, r, Math.PI, (3 * Math.PI) / 2, arcSteps, pts);
  return pts;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function starPath(ctx: CanvasRenderingContext2D, b: Box, points = 5) {
  const outer = Math.min(b.w, b.h) / 2 * 0.92;
  const inner = outer * 0.42;
  const centerX = cx(b);
  const centerY = cy(b);
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const px = centerX + r * Math.cos(a);
    const py = centerY + r * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function boundsFromViewBoxPoints(b: Box, points: [number, number][], pad = 0): Box {
  const inner = innerBox(b, pad);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [px, py] of points) {
    const mx = inner.x + (px / VB) * inner.w;
    const my = inner.y + (py / VB) * inner.h;
    minX = Math.min(minX, mx);
    maxX = Math.max(maxX, mx);
    minY = Math.min(minY, my);
    maxY = Math.max(maxY, my);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function starBounds(b: Box): Box {
  const outer = Math.min(b.w, b.h) / 2 * 0.92;
  const innerR = outer * 0.42;
  const centerX = cx(b);
  const centerY = cy(b);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : innerR;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = centerX + r * Math.cos(a);
    const py = centerY + r * Math.sin(a);
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function boundsFromPoints(points: Pt[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [px, py] of points) {
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function boundsFromCanvasPoints(points: CanvasPoint[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function plusArmThickness(bw: number, bh: number): number {
  return Math.min(bw, bh) * 0.34;
}

/** 十字形外轮廓顶点（顺时针，单一闭合路径，无内部交叉线） */
function plusSilhouettePoints(ox: number, oy: number, bw: number, bh: number): Pt[] {
  const t = plusArmThickness(bw, bh);
  const cxp = ox + bw / 2;
  const cyp = oy + bh / 2;
  const l = cxp - t / 2;
  const r = cxp + t / 2;
  const tp = cyp - t / 2;
  const bt = cyp + t / 2;
  return [
    [ox, tp],
    [l, tp],
    [l, oy],
    [r, oy],
    [r, tp],
    [ox + bw, tp],
    [ox + bw, bt],
    [r, bt],
    [r, oy + bh],
    [l, oy + bh],
    [l, bt],
    [ox, bt],
  ];
}

function traceRoundedPolygon(ctx: CanvasRenderingContext2D, points: Pt[], radius: number): void {
  const n = points.length;
  if (n < 3) return;

  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    const v1x = curr[0] - prev[0];
    const v1y = curr[1] - prev[1];
    const v2x = next[0] - curr[0];
    const v2y = next[1] - curr[1];
    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);
    const r = Math.min(radius, len1 / 2, len2 / 2);
    const sx = curr[0] - (v1x / len1) * r;
    const sy = curr[1] - (v1y / len1) * r;
    const ex = curr[0] + (v2x / len2) * r;
    const ey = curr[1] + (v2y / len2) * r;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
    ctx.quadraticCurveTo(curr[0], curr[1], ex, ey);
  }
  ctx.closePath();
}

function appendPlusSilhouettePath(ctx: CanvasRenderingContext2D, ox: number, oy: number, bw: number, bh: number): void {
  const pts = plusSilhouettePoints(ox, oy, bw, bh);
  const cr = Math.min(plusArmThickness(bw, bh) * 0.22, 4);
  traceRoundedPolygon(ctx, pts, cr);
}

function plusVisualBounds(b: Box): Box {
  return boundsFromPoints(plusSilhouettePoints(b.x, b.y, b.w, b.h));
}

/** 工具栏图标用 SVG path */
export function buildPlusSvgPathD(size = 24): string {
  const pad = size * 0.08;
  const pts = plusSilhouettePoints(pad, pad, size - pad * 2, size - pad * 2);
  const cr = Math.min(plusArmThickness(size - pad * 2, size - pad * 2) * 0.22, size * 0.08);
  const n = pts.length;
  const parts: string[] = [];

  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const v1x = curr[0] - prev[0];
    const v1y = curr[1] - prev[1];
    const v2x = next[0] - curr[0];
    const v2y = next[1] - curr[1];
    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);
    const r = Math.min(cr, len1 / 2, len2 / 2);
    const sx = curr[0] - (v1x / len1) * r;
    const sy = curr[1] - (v1y / len1) * r;
    const ex = curr[0] + (v2x / len2) * r;
    const ey = curr[1] + (v2y / len2) * r;
    if (i === 0) parts.push(`M${sx.toFixed(2)} ${sy.toFixed(2)}`);
    else parts.push(`L${sx.toFixed(2)} ${sy.toFixed(2)}`);
    parts.push(`Q${curr[0].toFixed(2)} ${curr[1].toFixed(2)} ${ex.toFixed(2)} ${ey.toFixed(2)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

export const PLUS_SHAPE_PATH_D = buildPlusSvgPathD();

function cloudVisualBounds(b: Box): Box {
  const pts = cloudOutlinePoints(b);
  return pts.length ? boundsFromCanvasPoints(pts) : b;
}

const SPEECH_BUBBLE_RECT_VB_POINTS: [number, number][] = [
  [3.5, 6], [20.5, 6], [20.5, 14.8], [3.5, 14.8], [15.3, 18],
];

const SPEECH_BUBBLE_OVAL_VB_POINTS: [number, number][] = [
  [4.2, 10], [19.8, 10], [12, 4.5], [12, 15.5], [5.2, 18.2],
];

export type DrawShapeOptions = SeqDrawOptions;

/** 图形实际绘制区域（用于选中框、控制点）；时序图仅含头部 */
export function getShapeVisualBounds(
  kind: ShapeKind,
  x: number,
  y: number,
  w: number,
  h: number,
): Box {
  const b = { x, y, w, h };
  const poly = POLYGON_POINTS[kind];
  if (poly) return boundsFromViewBoxPoints(b, poly, 0);
  if (kind === 'plus') return plusVisualBounds(b);
  if (kind === 'star') return starBounds(b);
  if (kind === 'circle') {
    const r = Math.min(w, h) / 2;
    return { x: x + w / 2 - r, y: y + h / 2 - r, w: r * 2, h: r * 2 };
  }
  if (kind === 'cylinder') {
    const ry = h * 0.11;
    return { x, y: y + ry, w, h: Math.max(h - ry * 2, 0) };
  }
  if (kind === 'cloud') return cloudVisualBounds(b);
  if (kind === 'braceLeft') return getBraceVisualBounds({ x, y, w, h }, 'left');
  if (kind === 'braceRight') return getBraceVisualBounds({ x, y, w, h }, 'right');
  if (kind === 'speechBubble') return speechBubbleBounds(b, 'speechBubble');
  if (kind === 'speechBubbleRect') return speechBubbleBounds(b, 'speechBubbleRect');
  return b;
}

/** 命中与布局使用的完整包围盒（时序图含生命线） */
export function getShapeInteractionBounds(el: ShapeElement): Box {
  if (isSeqLifelineKind(el.shapeKind)) {
    return getSeqFullBounds(el);
  }
  return getShapeVisualBounds(el.shapeKind, el.x, el.y, el.width, el.height);
}

/** 视觉包围盒与元素包围盒非线性映射（依赖 min(w,h) 或中心缩放） */
const UNIFORM_SCALED_SHAPE_KINDS = new Set<ShapeKind>(['star', 'circle', 'plus']);

const SQUARE_VISUAL_SHAPE_KINDS = new Set<ShapeKind>(['circle']);

type ShapeResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const RESIZE_MIN_SIZE = 24;

export function isUniformScaledShapeKind(kind: ShapeKind): boolean {
  const meta = getShapeRegistry().getShape(kind);
  if (meta?.uniformScaled !== undefined) return meta.uniformScaled;
  return UNIFORM_SCALED_SHAPE_KINDS.has(kind);
}

function resizeBoxByHandle(
  origin: Box,
  handle: ShapeResizeHandle,
  dx: number,
  dy: number,
  lockAspect = false,
): Box {
  let { x, y, w, h } = origin;

  if (handle.includes('e')) w = Math.max(RESIZE_MIN_SIZE, origin.w + dx);
  if (handle.includes('s')) h = Math.max(RESIZE_MIN_SIZE, origin.h + dy);
  if (handle.includes('w')) {
    const nextW = Math.max(RESIZE_MIN_SIZE, origin.w - dx);
    x = origin.x + origin.w - nextW;
    w = nextW;
  }
  if (handle.includes('n')) {
    const nextH = Math.max(RESIZE_MIN_SIZE, origin.h - dy);
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

  return { x, y, w, h };
}

function pickUniformResizeScale(
  handle: ShapeResizeHandle,
  scaleX: number,
  scaleY: number,
): number {
  if (handle === 'e' || handle === 'w') return scaleX;
  if (handle === 'n' || handle === 's') return scaleY;
  const growing = scaleX > 1 || scaleY > 1;
  return growing ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
}

function scaleBoxFromAnchor(
  origin: Box,
  handle: ShapeResizeHandle,
  scale: number,
  forceSquare = false,
): Box {
  const size = Math.max(RESIZE_MIN_SIZE, origin.w * scale);
  const newW = forceSquare ? size : Math.max(RESIZE_MIN_SIZE, origin.w * scale);
  const newH = forceSquare ? size : Math.max(RESIZE_MIN_SIZE, origin.h * scale);

  let x = origin.x;
  let y = origin.y;

  switch (handle) {
    case 'nw':
      x = origin.x + origin.w - newW;
      y = origin.y + origin.h - newH;
      break;
    case 'ne':
      y = origin.y + origin.h - newH;
      break;
    case 'sw':
      x = origin.x + origin.w - newW;
      break;
    case 'se':
      break;
    case 'e':
      y = origin.y + (origin.h - newH) / 2;
      break;
    case 'w':
      x = origin.x + origin.w - newW;
      y = origin.y + (origin.h - newH) / 2;
      break;
    case 'n':
      x = origin.x + (origin.w - newW) / 2;
      y = origin.y + origin.h - newH;
      break;
    case 's':
      x = origin.x + (origin.w - newW) / 2;
      break;
  }

  return { x, y, w: newW, h: newH };
}

function elementBoxFromUniformVisual(
  kind: ShapeKind,
  visual: Box,
  elementOrigin: Box,
): Box {
  const prevVisual = getShapeVisualBounds(
    kind,
    elementOrigin.x,
    elementOrigin.y,
    elementOrigin.w,
    elementOrigin.h,
  );
  if (prevVisual.w <= 1e-6 || prevVisual.h <= 1e-6) return elementOrigin;

  const scaleX = visual.w / prevVisual.w;
  const scaleY = visual.h / prevVisual.h;
  const scale = SQUARE_VISUAL_SHAPE_KINDS.has(kind)
    ? scaleX
    : (scaleX + scaleY) / 2;

  const aspect = elementOrigin.w / elementOrigin.h;
  const newMin = Math.min(elementOrigin.w, elementOrigin.h) * scale;

  let ew: number;
  let eh: number;
  if (aspect >= 1) {
    eh = newMin;
    ew = newMin * aspect;
  } else {
    ew = newMin;
    eh = newMin / aspect;
  }

  const cx = visual.x + visual.w / 2;
  const cy = visual.y + visual.h / 2;
  return { x: cx - ew / 2, y: cy - eh / 2, w: ew, h: eh };
}

/** 吸附后重新约束视觉包围盒形状（圆形/星星必须保持正方形） */
export function normalizeUniformScaledVisualBox(
  kind: ShapeKind,
  visualOrigin: Box,
  visualBox: Box,
  handle: ShapeResizeHandle,
): Box {
  if (!SQUARE_VISUAL_SHAPE_KINDS.has(kind)) return visualBox;
  const scaleX = visualBox.w / visualOrigin.w;
  const scaleY = visualBox.h / visualOrigin.h;
  const scale = pickUniformResizeScale(handle, scaleX, scaleY);
  return scaleBoxFromAnchor(visualOrigin, handle, scale, true);
}

/** 计算星星/圆形/十字形缩放后的视觉包围盒（用于吸附） */
export function computeUniformScaledVisualBox(
  kind: ShapeKind,
  visualOrigin: Box,
  handle: ShapeResizeHandle,
  dx: number,
  dy: number,
): Box {
  const raw = resizeBoxByHandle(visualOrigin, handle, dx, dy, false);
  const scale = pickUniformResizeScale(
    handle,
    raw.w / visualOrigin.w,
    raw.h / visualOrigin.h,
  );
  return scaleBoxFromAnchor(visualOrigin, handle, scale, SQUARE_VISUAL_SHAPE_KINDS.has(kind));
}

function solveElementForTargetVisual(
  kind: ShapeKind,
  targetVisual: Box,
  elementOrigin: Box,
  handle: ShapeResizeHandle,
): Box {
  const prevVisual = getShapeVisualBounds(
    kind,
    elementOrigin.x,
    elementOrigin.y,
    elementOrigin.w,
    elementOrigin.h,
  );
  const scale = pickUniformResizeScale(
    handle,
    targetVisual.w / prevVisual.w,
    targetVisual.h / prevVisual.h,
  );
  let elem = scaleBoxFromAnchor(elementOrigin, handle, scale, false);

  for (let i = 0; i < 12; i++) {
    const current = getShapeVisualBounds(kind, elem.x, elem.y, elem.w, elem.h);
    const dx = targetVisual.x - current.x;
    const dy = targetVisual.y - current.y;
    const dw = targetVisual.w - current.w;
    const dh = targetVisual.h - current.h;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01 && Math.abs(dw) < 0.01 && Math.abs(dh) < 0.01) {
      break;
    }
    const s = ((targetVisual.w / current.w) + (targetVisual.h / current.h)) / 2;
    elem = {
      x: elem.x + dx,
      y: elem.y + dy,
      w: Math.max(RESIZE_MIN_SIZE, elem.w * s),
      h: Math.max(RESIZE_MIN_SIZE, elem.h * s),
    };
  }

  return elem;
}

/** 由等比缩放后的视觉包围盒反算元素包围盒 */
export function elementBoxFromUniformScaledVisual(
  kind: ShapeKind,
  visualBox: Box,
  _visualOrigin: Box,
  elementOrigin: Box,
  handle: ShapeResizeHandle,
): Box {
  if (kind === 'circle') {
    return elementBoxFromUniformVisual(kind, visualBox, elementOrigin);
  }
  return solveElementForTargetVisual(kind, visualBox, elementOrigin, handle);
}

/** 星星/圆形/十字形：等比缩放视觉包围盒并反算元素包围盒 */
export function resizeUniformScaledShapeBox(
  kind: ShapeKind,
  visualOrigin: Box,
  elementOrigin: Box,
  handle: ShapeResizeHandle,
  dx: number,
  dy: number,
): Box {
  const targetVisual = computeUniformScaledVisualBox(kind, visualOrigin, handle, dx, dy);
  return elementBoxFromUniformScaledVisual(kind, targetVisual, visualOrigin, elementOrigin, handle);
}

/** 由视觉包围盒反算元素包围盒（缩放控制点用） */
export function elementBoxFromVisualBounds(
  kind: ShapeKind,
  visual: Box,
  prevElement?: Box,
): Box {
  if (prevElement && UNIFORM_SCALED_SHAPE_KINDS.has(kind)) {
    return elementBoxFromUniformVisual(kind, visual, prevElement);
  }

  const ref = getShapeVisualBounds(kind, 0, 0, 100, 100);
  const mxl = ref.x / 100;
  const myt = ref.y / 100;
  const rw = ref.w / 100;
  const rh = ref.h / 100;
  const ew = visual.w / rw;
  const eh = visual.h / rh;
  return {
    x: visual.x - ew * mxl,
    y: visual.y - eh * myt,
    w: ew,
    h: eh,
  };
}

/** 切换图形类型时保持视觉尺寸不变 */
export function retargetShapeKind(
  el: import('@lingyi-doc/core').ShapeElement,
  newKind: ShapeKind,
): Pick<import('@lingyi-doc/core').ShapeElement, 'shapeKind' | 'x' | 'y' | 'width' | 'height'> {
  if (el.shapeKind === newKind) {
    return { shapeKind: newKind, x: el.x, y: el.y, width: el.width, height: el.height };
  }
  const visual = getShapeVisualBounds(el.shapeKind, el.x, el.y, el.width, el.height);
  const box = elementBoxFromVisualBounds(newKind, visual);
  return {
    shapeKind: newKind,
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
  };
}

function drawPlusShape(
  ctx: CanvasRenderingContext2D,
  b: Box,
  fill: string,
  stroke: string,
  strokeWidth: number,
): void {
  ctx.beginPath();
  appendPlusSilhouettePath(ctx, b.x, b.y, b.w, b.h);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** 云形：手写贝塞尔路径，避免 ctx.addPath（兼容性差） */
function cloudPath(ctx: CanvasRenderingContext2D, b: Box) {
  const { x, y, w, h } = innerBox(b, 0);
  ctx.moveTo(x + w * 0.12, y + h * 0.72);
  ctx.bezierCurveTo(x - w * 0.02, y + h * 0.72, x - w * 0.02, y + h * 0.38, x + w * 0.2, y + h * 0.34);
  ctx.bezierCurveTo(x + w * 0.16, y + h * 0.1, x + w * 0.42, y + h * 0.02, x + w * 0.56, y + h * 0.18);
  ctx.bezierCurveTo(x + w * 0.7, y + h * 0.04, x + w * 0.9, y + h * 0.14, x + w * 0.84, y + h * 0.38);
  ctx.bezierCurveTo(x + w * 1.0, y + h * 0.42, x + w * 0.98, y + h * 0.7, x + w * 0.76, y + h * 0.74);
  ctx.bezierCurveTo(x + w * 0.7, y + h * 0.94, x + w * 0.4, y + h * 0.98, x + w * 0.24, y + h * 0.8);
  ctx.bezierCurveTo(x + w * 0.08, y + h * 0.92, x - w * 0.02, y + h * 0.8, x + w * 0.12, y + h * 0.72);
  ctx.closePath();
}

function blockArrowPath(ctx: CanvasRenderingContext2D, b: Box, dir: 'left' | 'right' | 'double') {
  if (dir === 'left') {
    polygonFromPoints(ctx, b, [[19, 6], [10, 6], [10, 4], [4, 12], [10, 20], [10, 18], [19, 18]]);
    return;
  }
  if (dir === 'right') {
    polygonFromPoints(ctx, b, [[5, 6], [14, 6], [14, 4], [20, 12], [14, 20], [14, 18], [5, 18]]);
    return;
  }
  polygonFromPoints(ctx, b, [[4, 12], [8, 8], [8, 10], [16, 10], [16, 8], [20, 12], [16, 16], [16, 14], [8, 14], [8, 16]]);
}

/**
 * 竖版花括号（SVG 圆弧方案，参考 100×200 标准路径参数化）
 *
 * 纵向 3 锚点：
 * - top：(stemX, topY)
 * - mid：(tipX, midY) 尖角
 * - bottom：(stemX, botY)
 *
 * 单条连续路径（从上外端起笔）：
 * 小钩弧 → 竖直线 → 平滑贝塞尔至尖点 → 平滑贝塞尔 → 竖直线 → 小钩弧
 */
const BRACE_ARC = {
  /** 参考 SVG 有效宽 / 半高 = 75/100，超出后不再横向拉伸 */
  maxWidthHalfHRatio: 75 / 100,
  /** 最小有效宽 / 半高，防止过窄时钩弧重叠 */
  minWidthHalfHRatio: 0.28,
  /** 内侧竖线 x，参考 SVG 50/75（相对有效宽 geomW） */
  stemXRatio: 50 / 75,
  /** 尖点水平凸出上限（相对半高，参考 SVG 50/100=0.5，收紧以保比例） */
  maxCuspHalfHRatio: 0.38,
  /** 两侧竖直段：衔接点距中线（相对半高，参考 SVG 50/100） */
  sideArcJoinRatio: 0.5,
  /** 中间尖点区：衔接点距中线（相对半高） */
  cuspArcJoinRatio: 0.38,
  /** 钩弧前竖直段长度（相对半高）参考 SVG 25/100 */
  hookStemRatio: 0.25,
  /** 钩弧半径（相对半高）参考 SVG 25/100 */
  hookArcRatio: 0.25,
  /** 尖角区：竖直切线控制点偏移（相对 arcJoin→mid 跨度） */
  cuspStemPull: 0.52,
  /** 尖角区：尖点接近控制点偏移（相对 arcJoin→mid 跨度） */
  cuspTipPull: 0.12,
} as const;

/** 工具栏图标包围盒（宽高比 ≈ 75:200） */
const BRACE_ICON_BOX: Box = { x: 8, y: 2, w: 8, h: 20 };

/** 纵向 3 锚点 */
export interface BraceVerticalAnchors {
  top: CanvasPoint;
  mid: CanvasPoint;
  bottom: CanvasPoint;
}

interface BraceArcLayout {
  topY: number;
  midY: number;
  botY: number;
  outerX: number;
  tipX: number;
  stemXSide: number;
  halfH: number;
  geomW: number;
  rHook: number;
  arcJoinYSide: number;
  arcJoinBotYSide: number;
  arcJoinYCusp: number;
  arcJoinBotYCusp: number;
  hookTopY: number;
  hookBotY: number;
  cuspDepth: number;
}

type BracePathSegment =
  | { t: 'M'; x: number; y: number }
  | { t: 'L'; x: number; y: number }
  | { t: 'A'; rx: number; ry: number; rot: number; large: 0 | 1; sweep: 0 | 1; x: number; y: number }
  | { t: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number };

/** 花括号有效横向宽度：随高度等比，clamp 到 [min, max] */
function resolveBraceGeomWidth(w: number, halfH: number): number {
  const maxW = halfH * BRACE_ARC.maxWidthHalfHRatio;
  const minW = halfH * BRACE_ARC.minWidthHalfHRatio;
  return Math.min(w, Math.max(minW, maxW));
}

function resolveBraceArcLayout(b: Box, side: 'left' | 'right'): BraceArcLayout {
  const { x, y, w, h } = b;
  const halfH = h / 2;
  const geomW = resolveBraceGeomWidth(w, halfH);
  const isLeft = side === 'left';
  const midY = y + halfH;
  const sideJoinOffset = halfH * BRACE_ARC.sideArcJoinRatio;
  const cuspJoinOffset = halfH * BRACE_ARC.cuspArcJoinRatio;
  const hookOffset = halfH * BRACE_ARC.hookStemRatio;
  const arcJoinYSide = midY - sideJoinOffset;
  const arcJoinBotYSide = midY + sideJoinOffset;
  const arcJoinYCusp = midY - cuspJoinOffset;
  const arcJoinBotYCusp = midY + cuspJoinOffset;
  const stemOffsetSide = geomW * BRACE_ARC.stemXRatio;
  const maxCuspDepth = halfH * BRACE_ARC.maxCuspHalfHRatio;
  const cuspDepth = Math.min(stemOffsetSide, maxCuspDepth);

  return {
    topY: y,
    midY,
    botY: y + h,
    outerX: isLeft ? x + geomW : x + w - geomW,
    tipX: isLeft ? x : x + w,
    stemXSide: isLeft ? x + stemOffsetSide : x + w - stemOffsetSide,
    halfH,
    geomW,
    rHook: halfH * BRACE_ARC.hookArcRatio,
    arcJoinYSide,
    arcJoinBotYSide,
    arcJoinYCusp,
    arcJoinBotYCusp,
    hookTopY: arcJoinYSide - hookOffset,
    hookBotY: arcJoinBotYSide + hookOffset,
    cuspDepth,
  };
}

/** 花括号实际绘制包围盒（宽不超过高度推导的上限） */
export function getBraceVisualBounds(b: Box, side: 'left' | 'right'): Box {
  const halfH = b.h / 2;
  const geomW = resolveBraceGeomWidth(b.w, halfH);
  if (side === 'left') {
    return { x: b.x, y: b.y, w: geomW, h: b.h };
  }
  return { x: b.x + b.w - geomW, y: b.y, w: geomW, h: b.h };
}

/** 解析纵向三等分语义锚点 */
export function getBraceVerticalAnchors(b: Box, side: 'left' | 'right'): BraceVerticalAnchors {
  const L = resolveBraceArcLayout(b, side);
  return {
    top: { x: L.stemXSide, y: L.topY },
    mid: { x: L.tipX, y: L.midY },
    bottom: { x: L.stemXSide, y: L.botY },
  };
}

function buildBraceArcSegments(L: BraceArcLayout, side: 'left' | 'right'): BracePathSegment[] {
  const isLeft = side === 'left';
  const hookSweepTop: 0 | 1 = isLeft ? 0 : 1;
  const hookSweepBot: 0 | 1 = isLeft ? 0 : 1;
  const halfSpan = L.midY - L.arcJoinYCusp;
  const stemPull = halfSpan * BRACE_ARC.cuspStemPull;
  const tipPull = Math.min(halfSpan * BRACE_ARC.cuspTipPull, L.cuspDepth * 0.28);

  const segments: BracePathSegment[] = [
    { t: 'M', x: L.outerX, y: L.topY },
    { t: 'A', rx: L.rHook, ry: L.rHook, rot: 0, large: 0, sweep: hookSweepTop, x: L.stemXSide, y: L.hookTopY },
    { t: 'L', x: L.stemXSide, y: L.arcJoinYSide },
  ];
  // 同 x 竖直延伸至尖点区（禁止横向台阶）
  if (Math.abs(L.arcJoinYSide - L.arcJoinYCusp) > 0.01) {
    segments.push({ t: 'L', x: L.stemXSide, y: L.arcJoinYCusp });
  }
  segments.push(
    {
      t: 'C',
      x1: L.stemXSide, y1: L.arcJoinYCusp + stemPull,
      x2: L.tipX, y2: L.midY - tipPull,
      x: L.tipX, y: L.midY,
    },
    {
      t: 'C',
      x1: L.tipX, y1: L.midY + tipPull,
      x2: L.stemXSide, y2: L.arcJoinBotYCusp - stemPull,
      x: L.stemXSide, y: L.arcJoinBotYCusp,
    },
  );
  if (Math.abs(L.arcJoinBotYSide - L.arcJoinBotYCusp) > 0.01) {
    segments.push({ t: 'L', x: L.stemXSide, y: L.arcJoinBotYSide });
  }
  segments.push(
    { t: 'L', x: L.stemXSide, y: L.hookBotY },
    { t: 'A', rx: L.rHook, ry: L.rHook, rot: 0, large: 0, sweep: hookSweepBot, x: L.outerX, y: L.botY },
  );
  return segments;
}

/** 圆形 SVG 弧（rx=ry）转 Canvas arc */
function appendCircularSvgArc(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  r: number,
  large: 0 | 1,
  sweep: 0 | 1,
  x1: number,
  y1: number,
): void {
  const dx = (x0 - x1) / 2;
  const dy = (y0 - y1) / 2;
  const rx = r;
  const ry = r;
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const dx2 = dx * dx;
  const dy2 = dy * dy;
  const lambda = dx2 / rx2 + dy2 / ry2;
  const rad = lambda > 1 ? Math.sqrt(lambda) : 1;
  const rxs = rx * rad;
  const rys = ry * rad;
  const rxs2 = rxs * rxs;
  const rys2 = rys * rys;
  const sign = large === sweep ? -1 : 1;
  const num = Math.max(0, rxs2 * rys2 - rxs2 * dy2 - rys2 * dx2);
  const den = rxs2 * dy2 + rys2 * dx2;
  const coef = den === 0 ? 0 : sign * Math.sqrt(num / den);
  const cxp = coef * ((rxs * dy) / rys);
  const cyp = coef * (-(rys * dx) / rxs);
  const cx = cxp + (x0 + x1) / 2;
  const cy = cyp + (y0 + y1) / 2;
  const start = Math.atan2((y0 - cy) / rys, (x0 - cx) / rxs);
  const end = Math.atan2((y1 - cy) / rys, (x1 - cx) / rxs);
  ctx.ellipse(cx, cy, rxs, rys, 0, start, end, sweep === 0);
}

function appendBraceSegmentsToCtx(ctx: CanvasRenderingContext2D, segments: BracePathSegment[]): void {
  let cx0 = 0;
  let cy0 = 0;
  for (const seg of segments) {
    if (seg.t === 'M') {
      ctx.moveTo(seg.x, seg.y);
      cx0 = seg.x;
      cy0 = seg.y;
    } else if (seg.t === 'L') {
      ctx.lineTo(seg.x, seg.y);
      cx0 = seg.x;
      cy0 = seg.y;
    } else if (seg.t === 'C') {
      ctx.bezierCurveTo(seg.x1, seg.y1, seg.x2, seg.y2, seg.x, seg.y);
      cx0 = seg.x;
      cy0 = seg.y;
    } else if (seg.t === 'A') {
      appendCircularSvgArc(ctx, cx0, cy0, seg.rx, seg.large, seg.sweep, seg.x, seg.y);
      cx0 = seg.x;
      cy0 = seg.y;
    }
  }
}

function formatBracePathCoord(n: number): string {
  return Number(n.toFixed(2)).toString();
}

function segmentsToBracePathD(segments: BracePathSegment[]): string {
  const f = formatBracePathCoord;
  return segments.map((seg) => {
    if (seg.t === 'M' || seg.t === 'L') return `${seg.t}${f(seg.x)} ${f(seg.y)}`;
    if (seg.t === 'C') {
      return `C${f(seg.x1)} ${f(seg.y1)} ${f(seg.x2)} ${f(seg.y2)} ${f(seg.x)} ${f(seg.y)}`;
    }
    if (seg.t === 'A') {
      return `A${f(seg.rx)} ${f(seg.ry)} ${seg.rot} ${seg.large} ${seg.sweep} ${f(seg.x)} ${f(seg.y)}`;
    }
    return '';
  }).join(' ');
}

function buildBracePathDFromBox(b: Box, side: 'left' | 'right'): string {
  return segmentsToBracePathD(buildBraceArcSegments(resolveBraceArcLayout(b, side), side));
}

export const BRACE_LEFT_PATH_D = buildBracePathDFromBox(BRACE_ICON_BOX, 'left');
export const BRACE_RIGHT_PATH_D = buildBracePathDFromBox(BRACE_ICON_BOX, 'right');

export function bracePathD(side: 'left' | 'right'): string {
  return side === 'left' ? BRACE_LEFT_PATH_D : BRACE_RIGHT_PATH_D;
}

function drawBraceShape(
  ctx: CanvasRenderingContext2D,
  b: Box,
  side: 'left' | 'right',
  stroke: string,
  strokeWidth: number,
): void {
  const d = buildBracePathDFromBox(b, side);
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(2, strokeWidth);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  if (typeof Path2D !== 'undefined') {
    ctx.stroke(new Path2D(d));
  } else {
    ctx.beginPath();
    appendBraceSegmentsToCtx(ctx, buildBraceArcSegments(resolveBraceArcLayout(b, side), side));
    ctx.stroke();
  }
  ctx.restore();
}

function cylinderPath(ctx: CanvasRenderingContext2D, b: Box) {
  const { x, y, w, h } = b;
  const rx = w / 2;
  // 确保长半轴(rx) > 短半轴(ry)，ry最大为rx的80%，最小为8
  const maxRy = rx * 0.8;
  const ry = Math.max(8, Math.min(maxRy, h * 0.11));
  const topY = y + ry;
  const bottomY = y + h - ry;
  // 绘制主体（不含顶部椭圆，顶部椭圆单独绘制以形成独立盖子效果）
  ctx.moveTo(x, topY);
  ctx.lineTo(x + w, topY);
  ctx.lineTo(x + w, bottomY);
  ctx.ellipse(cx(b), bottomY, rx, ry, 0, 0, Math.PI);
  ctx.lineTo(x, topY);
  ctx.closePath();
}

function speechBubbleRectPath(ctx: CanvasRenderingContext2D, b: Box) {
  withViewBox(ctx, b, 0, () => {
    const r = 2;
    ctx.moveTo(5.5, 6);
    ctx.lineTo(18.5, 6);
    ctx.arcTo(20.5, 6, 20.5, 8, r);
    ctx.lineTo(20.5, 12.8);
    ctx.arcTo(20.5, 14.8, 18.5, 14.8, r);
    ctx.lineTo(13.9, 14.8);
    ctx.lineTo(15.3, 18);
    ctx.lineTo(17.1, 14.8);
    ctx.lineTo(5.5, 14.8);
    ctx.arcTo(3.5, 14.8, 3.5, 12.8, r);
    ctx.lineTo(3.5, 8);
    ctx.arcTo(3.5, 6, 5.5, 6, r);
    ctx.closePath();
  });
}

function speechBubbleOvalPath(ctx: CanvasRenderingContext2D, b: Box) {
  withViewBox(ctx, b, 0, () => {
    const ecx = 12;
    const ecy = 10;
    const rx = 7.8;
    const ry = 5.5;
    const tailA = { x: 7.5, y: 14.2 };
    const tailTip = { x: 5.2, y: 18.2 };
    const tailB = { x: 9.2, y: 16.8 };

    const aTailA = Math.atan2((tailA.y - ecy) / ry, (tailA.x - ecx) / rx);
    const aTailB = Math.atan2((tailB.y - ecy) / ry, (tailB.x - ecx) / rx);

    ctx.moveTo(tailA.x, tailA.y);
    ctx.lineTo(tailTip.x, tailTip.y);
    ctx.lineTo(tailB.x, tailB.y);
    ctx.ellipse(ecx, ecy, rx, ry, 0, aTailB, aTailA, true);
    ctx.closePath();
  });
}

function speechBubbleBounds(b: Box, kind: 'speechBubble' | 'speechBubbleRect'): Box {
  const points = kind === 'speechBubbleRect'
    ? SPEECH_BUBBLE_RECT_VB_POINTS
    : SPEECH_BUBBLE_OVAL_VB_POINTS;
  return boundsFromViewBoxPoints(b, points, 0);
}

function speechBubbleTextBounds(b: Box, kind: 'speechBubble' | 'speechBubbleRect'): Box {
  if (kind === 'speechBubbleRect') {
    return {
      x: b.x,
      y: b.y + b.h * (6 / VB),
      w: b.w,
      h: b.h * ((14.8 - 6) / VB),
    };
  }
  return {
    x: b.x,
    y: b.y + b.h * (4.5 / VB),
    w: b.w,
    h: b.h * (11 / VB),
  };
}

function triangleTextBounds(b: Box): Box {
  // 内接于 viewBox [[12,5],[20,19],[4,19]] 的安全文字区
  return {
    x: b.x + b.w * (7 / VB),
    y: b.y + b.h * (8 / VB),
    w: b.w * (10 / VB),
    h: b.h * (7 / VB),
  };
}

function triangleRightTextBounds(b: Box): Box {
  return {
    x: b.x + b.w * (7 / VB),
    y: b.y + b.h * (7 / VB),
    w: b.w * (10 / VB),
    h: b.h * (9 / VB),
  };
}

/** 文字排版区域（气泡主体，不含尾巴） */
export function getShapeTextBounds(
  kind: ShapeKind,
  x: number,
  y: number,
  w: number,
  h: number,
): Box {
  const box = { x, y, w, h };
  if (kind === 'speechBubble' || kind === 'speechBubbleRect') {
    return speechBubbleTextBounds(box, kind);
  }
  if (kind === 'triangle') {
    return triangleTextBounds(box);
  }
  if (kind === 'triangleRight') {
    return triangleRightTextBounds(box);
  }
  if (kind === 'braceLeft' || kind === 'braceRight') {
    return { x, y, w, h };
  }
  if (kind === 'seqActor') {
    return { x, y: y + h * 0.64, w, h: h * 0.32 };
  }
  if (kind === 'seqBoundaryLifeline' || kind === 'seqControlLifeline' || kind === 'seqEntityLifeline') {
    return { x, y: y + h * 0.54, w, h: h * 0.4 };
  }
  // 数据流：文字在左右两个椭圆之间的区域
  if (kind === 'flowDataFlow') {
    const bodyHalfH = h / 2;
    const capRx = bodyHalfH * 0.6; // 水平半轴
    return { x: x + capRx, y, w: w - capRx * 2, h };
  }
  return getShapeVisualBounds(kind, x, y, w, h);
}

/** 命中检测：与选中框使用同一视觉包围盒 */
export function pointInShapeBounds(
  kind: ShapeKind,
  x: number,
  y: number,
  w: number,
  h: number,
  pt: { x: number; y: number },
  pad = 0,
): boolean {
  const box = getShapeVisualBounds(kind, x, y, w, h);
  return (
    pt.x >= box.x - pad
    && pt.x <= box.x + box.w + pad
    && pt.y >= box.y - pad
    && pt.y <= box.y + box.h + pad
  );
}

export function hitShapeElementAtPoint(
  el: ShapeElement,
  pt: { x: number; y: number },
  pad = 2,
): boolean {
  const box = getShapeInteractionBounds(el);
  return (
    pt.x >= box.x - pad
    && pt.x <= box.x + box.w + pad
    && pt.y >= box.y - pad
    && pt.y <= box.y + box.h + pad
  );
}

function normalizeDir(dx: number, dy: number): CanvasPoint {
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { x: 0, y: -1 };
  return { x: dx / len, y: dy / len };
}

function anchorDirection(anchor: AnchorId): CanvasPoint {
  switch (anchor) {
    case 'n': return { x: 0, y: -1 };
    case 's': return { x: 0, y: 1 };
    case 'e': return { x: 1, y: 0 };
    case 'w': return { x: -1, y: 0 };
    case 'ne': return normalizeDir(1, -1);
    case 'nw': return normalizeDir(-1, -1);
    case 'se': return normalizeDir(1, 1);
    case 'sw': return normalizeDir(-1, 1);
    default: return { x: 0, y: -1 };
  }
}

function boxAnchorPoint(box: Box, anchor: AnchorId): CanvasPoint {
  const centerX = box.x + box.w / 2;
  const centerY = box.y + box.h / 2;
  switch (anchor) {
    case 'n': return { x: centerX, y: box.y };
    case 's': return { x: centerX, y: box.y + box.h };
    case 'e': return { x: box.x + box.w, y: centerY };
    case 'w': return { x: box.x, y: centerY };
    case 'nw': return { x: box.x, y: box.y };
    case 'ne': return { x: box.x + box.w, y: box.y };
    case 'se': return { x: box.x + box.w, y: box.y + box.h };
    case 'sw': return { x: box.x, y: box.y + box.h };
    default: return { x: centerX, y: centerY };
  }
}

function cubicBezierPoint(
  p0: CanvasPoint,
  p1: CanvasPoint,
  p2: CanvasPoint,
  p3: CanvasPoint,
  t: number,
): CanvasPoint {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return {
    x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
    y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y,
  };
}

function sampleCubic(
  p0: CanvasPoint,
  p1: CanvasPoint,
  p2: CanvasPoint,
  p3: CanvasPoint,
  steps: number,
  out: CanvasPoint[],
): void {
  for (let i = 0; i <= steps; i++) {
    out.push(cubicBezierPoint(p0, p1, p2, p3, i / steps));
  }
}

function starOutlinePoints(b: Box): CanvasPoint[] {
  const outer = Math.min(b.w, b.h) / 2 * 0.92;
  const innerR = outer * 0.42;
  const centerX = cx(b);
  const centerY = cy(b);
  const pts: CanvasPoint[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : innerR;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push({ x: centerX + r * Math.cos(a), y: centerY + r * Math.sin(a) });
  }
  return pts;
}

function cloudOutlinePoints(b: Box): CanvasPoint[] {
  const { x, y, w, h } = b;
  const px = (fx: number) => x + w * fx;
  const py = (fy: number) => y + h * fy;
  const pts: CanvasPoint[] = [];
  const curves: [CanvasPoint, CanvasPoint, CanvasPoint, CanvasPoint][] = [
    [{ x: px(0.12), y: py(0.72) }, { x: px(-0.02), y: py(0.72) }, { x: px(-0.02), y: py(0.38) }, { x: px(0.2), y: py(0.34) }],
    [{ x: px(0.2), y: py(0.34) }, { x: px(0.16), y: py(0.1) }, { x: px(0.42), y: py(0.02) }, { x: px(0.56), y: py(0.18) }],
    [{ x: px(0.56), y: py(0.18) }, { x: px(0.7), y: py(0.04) }, { x: px(0.9), y: py(0.14) }, { x: px(0.84), y: py(0.38) }],
    [{ x: px(0.84), y: py(0.38) }, { x: px(1.0), y: py(0.42) }, { x: px(0.98), y: py(0.7) }, { x: px(0.76), y: py(0.74) }],
    [{ x: px(0.76), y: py(0.74) }, { x: px(0.7), y: py(0.94) }, { x: px(0.4), y: py(0.98) }, { x: px(0.24), y: py(0.8) }],
    [{ x: px(0.24), y: py(0.8) }, { x: px(0.08), y: py(0.92) }, { x: px(-0.02), y: py(0.8) }, { x: px(0.12), y: py(0.72) }],
  ];
  for (const seg of curves) {
    sampleCubic(seg[0], seg[1], seg[2], seg[3], 8, pts);
  }
  return pts;
}

function mapPolygonOutline(kind: ShapeKind, x: number, y: number, w: number, h: number): CanvasPoint[] | null {
  const poly = POLYGON_POINTS[kind];
  if (!poly) return null;
  const inner = innerBox({ x, y, w, h }, 0);
  return poly.map(([px, py]) => ({ x: mapX(px, inner), y: mapY(py, inner) }));
}

function dShapeOutlinePoints(x: number, y: number, w: number, h: number, arcSteps = 12): CanvasPoint[] {
  const r = h / 2;
  const arcCx = x + w - r;
  const arcCy = y + h / 2;
  const pts: CanvasPoint[] = [{ x, y }, { x: x + w - r, y }];
  sampleArc(arcCx, arcCy, r, -Math.PI / 2, Math.PI / 2, arcSteps, pts);
  pts.push({ x, y: y + h });
  return pts;
}

function roundRectOutlinePoints(
  x: number,
  y: number,
  w: number,
  h: number,
  cornerRadius: number,
  arcSteps = 6,
): CanvasPoint[] {
  const r = Math.min(cornerRadius, w / 2, h / 2);
  if (r <= 0) {
    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
  }
  const pts: CanvasPoint[] = [];
  pts.push({ x: x + r, y });
  pts.push({ x: x + w - r, y });
  sampleArc(x + w - r, y + r, r, -Math.PI / 2, 0, arcSteps, pts);
  pts.push({ x: x + w, y: y + h - r });
  sampleArc(x + w - r, y + h - r, r, 0, Math.PI / 2, arcSteps, pts);
  pts.push({ x: x + r, y: y + h });
  sampleArc(x + r, y + h - r, r, Math.PI / 2, Math.PI, arcSteps, pts);
  pts.push({ x, y: y + r });
  sampleArc(x + r, y + r, r, Math.PI, (3 * Math.PI) / 2, arcSteps, pts);
  return pts;
}

/** 沿椭圆弧采样（非等比例 rx/ry） */
function sampleEllipseArc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  start: number,
  end: number,
  steps: number,
  out: CanvasPoint[],
): void {
  for (let i = 0; i <= steps; i++) {
    const a = start + ((end - start) * i) / steps;
    out.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
}

function cylinderOutlinePoints(
  x: number,
  y: number,
  w: number,
  h: number,
  arcSteps = 10,
): CanvasPoint[] {
  const ry = h * 0.11;
  const cx = x + w / 2;
  const rx = w / 2;
  const pts: CanvasPoint[] = [];
  sampleEllipseArc(cx, y + ry, rx, ry, Math.PI, 0, arcSteps, pts);
  pts.push({ x: x + w, y: y + h - ry });
  sampleEllipseArc(cx, y + h - ry, rx, ry, 0, Math.PI, arcSteps, pts);
  pts.push({ x, y: y + ry });
  return pts;
}

/** 图形外轮廓采样点（用于连接锚点射线求交） */
export function getShapeOutlinePoints(
  kind: ShapeKind,
  x: number,
  y: number,
  w: number,
  h: number,
): CanvasPoint[] | null {
  const mapped = mapPolygonOutline(kind, x, y, w, h);
  if (mapped) return mapped;
  const b = { x, y, w, h };
  if (kind === 'plus') {
    return plusSilhouettePoints(x, y, w, h).map(([px, py]) => ({ x: px, y: py }));
  }
  if (kind === 'star') return starOutlinePoints(b);
  if (kind === 'cloud') return cloudOutlinePoints(b);
  if (kind === 'ellipse') return fullRoundRectOutlinePoints(x, y, w, h);
  if (kind === 'dShape') return dShapeOutlinePoints(x, y, w, h);
  if (kind === 'roundRect') return roundRectOutlinePoints(x, y, w, h, Math.min(12, w / 4, h / 4));
  if (kind === 'process') return roundRectOutlinePoints(x, y, w, h, Math.min(20, h / 2));
  if (kind === 'cylinder') return cylinderOutlinePoints(x, y, w, h);
  const extended = getExtendedDiagramOutlinePoints(kind, x, y, w, h);
  if (extended) return extended;
  return null;
}

function raySegmentIntersect(
  origin: CanvasPoint,
  dir: CanvasPoint,
  a: CanvasPoint,
  b: CanvasPoint,
): { point: CanvasPoint; t: number } | null {
  const segX = b.x - a.x;
  const segY = b.y - a.y;
  const denom = dir.x * segY - dir.y * segX;
  if (Math.abs(denom) < 1e-9) return null;
  const oax = a.x - origin.x;
  const oay = a.y - origin.y;
  const t = (oax * segY - oay * segX) / denom;
  const u = (oax * dir.y - oay * dir.x) / denom;
  if (t < 1e-6 || u < 0 || u > 1) return null;
  return { point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t }, t };
}

function rayPolygonIntersect(
  origin: CanvasPoint,
  dir: CanvasPoint,
  polygon: CanvasPoint[],
): CanvasPoint | null {
  let best: CanvasPoint | null = null;
  let bestT = Infinity;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    const hit = raySegmentIntersect(origin, dir, a, b);
    if (hit && hit.t < bestT) {
      bestT = hit.t;
      best = hit.point;
    }
  }
  return best;
}

function ellipseAnchorPoint(
  centerX: number,
  centerY: number,
  rx: number,
  ry: number,
  anchor: AnchorId,
): CanvasPoint {
  const dir = anchorDirection(anchor);
  const angle = Math.atan2(dir.y * rx, dir.x * ry);
  return {
    x: centerX + rx * Math.cos(angle),
    y: centerY + ry * Math.sin(angle),
  };
}

/** 图形连接锚点：从中心沿方向与轮廓求交，落在实际边线上 */
export function getShapeConnectorAnchorPoint(
  kind: ShapeKind,
  x: number,
  y: number,
  w: number,
  h: number,
  anchor: AnchorId,
): CanvasPoint {
  const centerX = x + w / 2;
  const centerY = y + h / 2;

  if (kind === 'circle') {
    const r = Math.min(w, h) / 2;
    return ellipseAnchorPoint(centerX, centerY, r, r, anchor);
  }

  const outline = getShapeOutlinePoints(kind, x, y, w, h);
  if (outline && outline.length >= 3) {
    const hit = rayPolygonIntersect(
      { x: centerX, y: centerY },
      anchorDirection(anchor),
      outline,
    );
    if (hit) return hit;
  }

  return boxAnchorPoint(getShapeVisualBounds(kind, x, y, w, h), anchor);
}

export function getShapeConnectorAnchors(
  el: import('@lingyi-doc/core').ShapeElement,
): { id: AnchorId; x: number; y: number }[] {
  return ANCHOR_IDS.map(id => ({
    id,
    ...getShapeConnectorAnchorPoint(el.shapeKind, el.x, el.y, el.width, el.height, id),
  }));
}

export function appendShapePath(
  ctx: CanvasRenderingContext2D,
  kind: ShapeKind,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const b: Box = { x, y, w, h };
  ctx.beginPath();

  switch (kind) {
    case 'roundRect':
      roundRectPath(ctx, x, y, w, h, Math.min(12, w / 4, h / 4));
      break;
    case 'ellipse':
      fullRoundRectPath(ctx, x, y, w, h);
      break;
    case 'circle': {
      const r = Math.min(w, h) / 2;
      ctx.arc(cx(b), cy(b), r, 0, Math.PI * 2);
      break;
    }
    case 'diamond':
      polygonFromPoints(ctx, b, [[12, 4], [20, 12], [12, 20], [4, 12]]);
      break;
    case 'rect':
    case 'document':
      ctx.rect(x, y, w, h);
      break;
    case 'cylinder':
      cylinderPath(ctx, b);
      break;
    case 'chevron':
      polygonFromPoints(ctx, b, [[6, 5], [18, 12], [6, 19], [10, 12]]);
      break;
    case 'dShape': {
      const r = h / 2;
      ctx.moveTo(x, y);
      ctx.lineTo(x + w - r, y);
      ctx.arc(x + w - r, cy(b), r, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
    }
    case 'parallelogram':
      polygonFromPoints(ctx, b, [[7, 5], [20, 5], [17, 19], [4, 19]]);
      break;
    case 'trapezoid':
      polygonFromPoints(ctx, b, [[6, 5], [18, 5], [20, 19], [4, 19]]);
      break;
    case 'speechBubble':
      speechBubbleOvalPath(ctx, b);
      break;
    case 'speechBubbleRect':
      speechBubbleRectPath(ctx, b);
      break;
    case 'triangleRight':
      polygonFromPoints(ctx, b, [[5, 5], [5, 19], [19, 19]]);
      break;
    case 'triangle':
      polygonFromPoints(ctx, b, [[12, 5], [20, 19], [4, 19]]);
      break;
    case 'star':
      starPath(ctx, b);
      break;
    case 'hexagon':
      polygonFromPoints(ctx, b, [[8, 5], [16, 5], [20, 12], [16, 19], [8, 19], [4, 12]]);
      break;
    case 'pentagon':
      polygonFromPoints(ctx, b, [[12, 4], [18.5, 9], [16, 17], [8, 17], [5.5, 9]]);
      break;
    case 'octagon':
      polygonFromPoints(ctx, b, [[8, 4], [16, 4], [20, 8], [20, 16], [16, 20], [8, 20], [4, 16], [4, 8]]);
      break;
    case 'arrowLeft':
      blockArrowPath(ctx, b, 'left');
      break;
    case 'arrowRight':
      blockArrowPath(ctx, b, 'right');
      break;
    case 'arrowDouble':
      blockArrowPath(ctx, b, 'double');
      break;
    case 'cloud':
      cloudPath(ctx, b);
      break;
    case 'plus':
      appendPlusSilhouettePath(ctx, x, y, w, h);
      break;
    case 'braceLeft':
    case 'braceRight':
      ctx.rect(x, y, w, h);
      break;
    case 'process':
      roundRectPath(ctx, x, y, w, h, Math.min(20, h / 2));
      break;
    default:
      if (isExtendedDiagramKind(kind)) {
        appendExtendedDiagramPath(ctx, kind, x, y, w, h);
      } else {
        ctx.rect(x, y, w, h);
      }
      break;
  }
}

export function drawShapeBodyImpl(
  ctx: CanvasRenderingContext2D,
  kind: ShapeKind,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke: string,
  strokeWidth: number,
  options?: DrawShapeOptions,
): void {
  const b: Box = { x, y, w, h };

  if (kind === 'braceLeft') {
    drawBraceShape(ctx, b, 'left', stroke, strokeWidth);
    return;
  }
  if (kind === 'braceRight') {
    drawBraceShape(ctx, b, 'right', stroke, strokeWidth);
    return;
  }

  if (kind === 'plus') {
    drawPlusShape(ctx, b, fill, stroke, strokeWidth);
    return;
  }

  if (isExtendedDiagramKind(kind)) {
    drawExtendedDiagramBody(ctx, kind, x, y, w, h, fill, stroke, strokeWidth, options);
    return;
  }

  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = 'round';
  appendShapePath(ctx, kind, x, y, w, h);
  ctx.fill();
  ctx.stroke();

  // 为圆柱体添加顶部独立椭圆盖子
  if (kind === 'cylinder') {
    const rx = w / 2;
    const ry = h * 0.11;
    const topY = y + ry;
    ctx.beginPath();
    // 绘制完整的椭圆，覆盖在主体上方
    ctx.ellipse(x + w / 2, topY, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

export function drawShapeBody(
  ctx: CanvasRenderingContext2D,
  kind: ShapeKind,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke: string,
  strokeWidth: number,
  options?: DrawShapeOptions,
): void {
  if (isExtendedDiagramKind(kind)) {
    drawShapeBodyImpl(ctx, kind, x, y, w, h, fill, stroke, strokeWidth, options);
    return;
  }
  const registry = getShapeRegistry();
  if (registry.hasCapability(kind, 'drawBody')) {
    registry.invoke(kind, 'drawBody', ctx, x, y, w, h, fill, stroke, strokeWidth);
    return;
  }
  drawShapeBodyImpl(ctx, kind, x, y, w, h, fill, stroke, strokeWidth, options);
}
