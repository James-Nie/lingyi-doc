import type { AnchorId, ShapeKind } from '@lingyi-doc/core';
import { ANCHOR_IDS } from '@lingyi-doc/core';
import {
  SHAPE_DEFAULT_FILL,
  SHAPE_DEFAULT_STROKE,
  SHAPE_DEFAULT_STROKE_WIDTH,
} from '@lingyi-doc/core';

type Box = { x: number; y: number; w: number; h: number };

const VB = 24;

export {
  SHAPE_DEFAULT_FILL,
  SHAPE_DEFAULT_STROKE,
  SHAPE_DEFAULT_STROKE_WIDTH,
};

type Pt = [number, number];

const POLYGON_POINTS: Partial<Record<ShapeKind, [number, number][]>> = {
  diamond: [[12, 4], [20, 12], [12, 20], [4, 12]],
  chevron: [[6, 5], [18, 12], [6, 19], [10, 12]],
  parallelogram: [[7, 5], [20, 5], [17, 19], [4, 19]],
  trapezoid: [[6, 5], [18, 5], [20, 19], [4, 19]],
  triangleRight: [[5, 5], [5, 19], [19, 19]],
  triangle: [[12, 5], [20, 19], [4, 19]],
  hexagon: [[12, 4], [18, 7.5], [18, 16.5], [12, 20], [6, 16.5], [6, 7.5]],
  pentagon: [[12, 4], [18.5, 9], [16, 17], [8, 17], [5.5, 9]],
  octagon: [[8, 4], [16, 4], [20, 8], [20, 16], [16, 20], [8, 20], [4, 16], [4, 8]],
  arrowLeft: [[19, 6], [10, 6], [10, 4], [4, 12], [10, 20], [10, 18], [19, 18]],
  arrowRight: [[5, 6], [14, 6], [14, 4], [20, 12], [14, 20], [14, 18], [5, 18]],
  arrowDouble: [[4, 12], [8, 8], [8, 10], [16, 10], [16, 8], [20, 12], [16, 16], [16, 14], [8, 14], [8, 16]],
};

/** 仅描边、不填充（与工具栏图标一致） */
const STROKE_ONLY = new Set<ShapeKind>(['braceLeft', 'braceRight']);

export function isStrokeOnlyShape(kind: ShapeKind): boolean {
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
  const { x, y, w, h } = b;
  return {
    x: x - w * 0.02,
    y: y + h * 0.02,
    w: w * 1.02,
    h: h * 0.96,
  };
}

/** 图形实际绘制区域（用于选中框、控制点、命中检测） */
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
  if (kind === 'braceLeft' || kind === 'braceRight') return b;
  if (kind === 'speechBubble' || kind === 'speechBubbleRect') {
    return speechBubbleBounds(b);
  }
  return b;
}

/** 由视觉包围盒反算元素包围盒（缩放控制点用） */
export function elementBoxFromVisualBounds(kind: ShapeKind, visual: Box): Box {
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

function drawBraceShape(
  ctx: CanvasRenderingContext2D,
  b: Box,
  side: 'left' | 'right',
  stroke: string,
  strokeWidth: number,
): void {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(2, strokeWidth);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  withViewBox(ctx, b, 0, () => {
    if (side === 'left') {
      ctx.beginPath();
      ctx.moveTo(19, 4);
      ctx.bezierCurveTo(13, 4, 12, 8, 14, 12);
      ctx.bezierCurveTo(12, 16, 13, 20, 19, 20);
      ctx.stroke();
      for (const y of [7, 12, 17]) {
        ctx.beginPath();
        ctx.moveTo(4, y);
        ctx.lineTo(14, y);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(5, 4);
      ctx.bezierCurveTo(11, 4, 12, 8, 10, 12);
      ctx.bezierCurveTo(12, 16, 11, 20, 5, 20);
      ctx.stroke();
      for (const y of [7, 12, 17]) {
        ctx.beginPath();
        ctx.moveTo(10, y);
        ctx.lineTo(20, y);
        ctx.stroke();
      }
    }
  });
}

function cylinderPath(ctx: CanvasRenderingContext2D, b: Box) {
  const { x, y, w, h } = b;
  const rx = w / 2;
  const ry = h * 0.11;
  const topY = y + ry;
  const bottomY = y + h - ry;
  ctx.moveTo(x, topY);
  ctx.ellipse(cx(b), topY, rx, ry, 0, Math.PI, 0);
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

function speechBubbleBounds(b: Box): Box {
  return { x: b.x, y: b.y, w: b.w, h: b.h };
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

/** 文字排版区域（气泡主体，不含尾巴） */
export function getShapeTextBounds(
  kind: ShapeKind,
  x: number,
  y: number,
  w: number,
  h: number,
): Box {
  if (kind === 'speechBubble' || kind === 'speechBubbleRect') {
    return speechBubbleTextBounds({ x, y, w, h }, kind);
  }
  if (kind === 'braceLeft' || kind === 'braceRight') {
    return { x, y, w, h };
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
  el: import('@lingyi-doc/core').ShapeElement,
  pt: { x: number; y: number },
  pad = 2,
): boolean {
  return pointInShapeBounds(el.shapeKind, el.x, el.y, el.width, el.height, pt, pad);
}

type CanvasPoint = { x: number; y: number };

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
      polygonFromPoints(ctx, b, [[12, 4], [18, 7.5], [18, 16.5], [12, 20], [6, 16.5], [6, 7.5]]);
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
      ctx.rect(x, y, w, h);
      break;
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

  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = 'round';
  appendShapePath(ctx, kind, x, y, w, h);
  ctx.fill();
  ctx.stroke();
}
