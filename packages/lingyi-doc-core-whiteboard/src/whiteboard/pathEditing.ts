import type { ConnectorPathPoint, ConnectorStyle, PathPointKind, WhiteboardPoint } from './types';
import { defaultElbowPoints, resolveElbowRoute, type ResolveElbowRouteOpts } from './elbowConnector';

/** 多点曲线自动手柄最大伸出（相对段长另有约束） */
const DEFAULT_HANDLE_LEN = 48;
/** 默认 S 曲线控制柄相对主轴跨度的比例（图2：水平出入） */
const DEFAULT_S_CURVE_HANDLE_RATIO = 0.5;

/** 默认两端点 S 形贝塞尔控制柄：主轴方向切线水平/垂直出入 */
export function defaultSCurveHandles(
  start: WhiteboardPoint,
  end: WhiteboardPoint,
): { handleOut: WhiteboardPoint; handleIn: WhiteboardPoint } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const hx = dx * DEFAULT_S_CURVE_HANDLE_RATIO;
    return {
      handleOut: { x: start.x + hx, y: start.y },
      handleIn: { x: end.x - hx, y: end.y },
    };
  }
  const hy = dy * DEFAULT_S_CURVE_HANDLE_RATIO;
  return {
    handleOut: { x: start.x, y: start.y + hy },
    handleIn: { x: end.x, y: end.y - hy },
  };
}

/** 三次贝塞尔上 t∈[0,1] 的点 */
export function cubicBezierPoint(
  p0: WhiteboardPoint,
  cp1: WhiteboardPoint,
  cp2: WhiteboardPoint,
  p1: WhiteboardPoint,
  t: number,
): WhiteboardPoint {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * cp1.x + 3 * u * t * t * cp2.x + t * t * t * p1.x,
    y: u * u * u * p0.y + 3 * u * u * t * cp1.y + 3 * u * t * t * cp2.y + t * t * t * p1.y,
  };
}

export function normalizePathPoint(
  p: WhiteboardPoint,
  defaultKind: PathPointKind = 'corner',
): ConnectorPathPoint {
  const ext = p as ConnectorPathPoint;
  return {
    x: p.x,
    y: p.y,
    kind: ext.kind ?? defaultKind,
    handleIn: ext.handleIn ?? null,
    handleOut: ext.handleOut ?? null,
  };
}

export function resolveHandleOut(
  pt: ConnectorPathPoint,
  prev: ConnectorPathPoint | null,
  next: ConnectorPathPoint | null,
): WhiteboardPoint {
  if (pt.handleOut) return pt.handleOut;
  if (next) {
    const dx = next.x - pt.x;
    const dy = next.y - pt.y;
    const len = Math.hypot(dx, dy) || 1;
    const d = Math.min(DEFAULT_HANDLE_LEN, len / 3);
    return { x: pt.x + (dx / len) * d, y: pt.y + (dy / len) * d };
  }
  if (prev) {
    const dx = pt.x - prev.x;
    const dy = pt.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const d = Math.min(DEFAULT_HANDLE_LEN, len / 3);
    return { x: pt.x + (dx / len) * d, y: pt.y + (dy / len) * d };
  }
  return { x: pt.x + DEFAULT_HANDLE_LEN, y: pt.y };
}

export function resolveHandleIn(
  pt: ConnectorPathPoint,
  prev: ConnectorPathPoint | null,
  next: ConnectorPathPoint | null,
): WhiteboardPoint {
  if (pt.handleIn) return pt.handleIn;
  if (prev) {
    const dx = pt.x - prev.x;
    const dy = pt.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const d = Math.min(DEFAULT_HANDLE_LEN, len / 3);
    return { x: pt.x - (dx / len) * d, y: pt.y - (dy / len) * d };
  }
  if (next) {
    const dx = next.x - pt.x;
    const dy = next.y - pt.y;
    const len = Math.hypot(dx, dy) || 1;
    const d = Math.min(DEFAULT_HANDLE_LEN, len / 3);
    return { x: pt.x - (dx / len) * d, y: pt.y - (dy / len) * d };
  }
  return { x: pt.x - DEFAULT_HANDLE_LEN, y: pt.y };
}

export function resolvePathHandles(points: ConnectorPathPoint[]): Array<{
  anchor: ConnectorPathPoint;
  handleIn: WhiteboardPoint;
  handleOut: WhiteboardPoint;
}> {
  return points.map((pt, i) => ({
    anchor: pt,
    handleIn: resolveHandleIn(pt, points[i - 1] ?? null, points[i + 1] ?? null),
    handleOut: resolveHandleOut(pt, points[i - 1] ?? null, points[i + 1] ?? null),
  }));
}

/** 各段路径中点（用于选中态实心手柄） */
export function curveSegmentMidpoints(points: ConnectorPathPoint[]): WhiteboardPoint[] {
  if (points.length < 2) return [];
  const mids: WhiteboardPoint[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cp1 = resolveHandleOut(p0, points[i - 1] ?? null, p1);
    const cp2 = resolveHandleIn(p1, p0, points[i + 2] ?? null);
    mids.push(cubicBezierPoint(p0, cp1, cp2, p1, 0.5));
  }
  return mids;
}

export function curvePathDFromPoints(points: ConnectorPathPoint[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cp1 = resolveHandleOut(p0, points[i - 1] ?? null, p1);
    const cp2 = resolveHandleIn(p1, p0, points[i + 2] ?? null);
    d += ` C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${p1.x} ${p1.y}`;
  }
  return d;
}

export function sampleCurvePathPoints(
  points: ConnectorPathPoint[],
  stepsPerSeg = 16,
): WhiteboardPoint[] {
  if (points.length < 2) return [...points];
  const out: WhiteboardPoint[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cp1 = resolveHandleOut(p0, points[i - 1] ?? null, p1);
    const cp2 = resolveHandleIn(p1, p0, points[i + 2] ?? null);
    const segSteps = i === points.length - 2 ? stepsPerSeg + 1 : stepsPerSeg;
    for (let s = 0; s < segSteps; s++) {
      if (i > 0 && s === 0) continue;
      const t = s / stepsPerSeg;
      out.push(cubicBezierPoint(p0, cp1, cp2, p1, t));
    }
  }
  return out;
}

export function curvePathSegments(
  points: ConnectorPathPoint[],
  stepsPerSeg = 12,
): [WhiteboardPoint, WhiteboardPoint][] {
  const sampled = sampleCurvePathPoints(points, stepsPerSeg);
  const segments: [WhiteboardPoint, WhiteboardPoint][] = [];
  for (let i = 1; i < sampled.length; i++) {
    segments.push([sampled[i - 1], sampled[i]]);
  }
  return segments;
}

export function initCurvePathPoints(
  start: WhiteboardPoint,
  end: WhiteboardPoint,
): ConnectorPathPoint[] {
  const { handleOut, handleIn } = defaultSCurveHandles(start, end);
  return [
    { ...normalizePathPoint(start, 'smooth'), handleIn: null, handleOut },
    { ...normalizePathPoint(end, 'smooth'), handleIn, handleOut: null },
  ];
}

/** 按新端点实时拟合曲线，保留中间控制点相对形态 */
export function refitCurvePathToEndpoints(
  points: ConnectorPathPoint[],
  start: WhiteboardPoint,
  end: WhiteboardPoint,
): ConnectorPathPoint[] {
  if (points.length < 2) return initCurvePathPoints(start, end);

  // 默认两端点 S 曲线：端点变化时重建主轴切线
  if (points.length === 2) {
    return initCurvePathPoints(start, end);
  }

  const oldStart = points[0];
  const oldEnd = points[points.length - 1];
  const oldDx = oldEnd.x - oldStart.x;
  const oldDy = oldEnd.y - oldStart.y;
  const oldLen = Math.hypot(oldDx, oldDy) || 1;
  const newLen = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  const scale = newLen / oldLen;

  const next = points.map(p => ({
    ...p,
    handleIn: p.handleIn ? { ...p.handleIn } : null,
    handleOut: p.handleOut ? { ...p.handleOut } : null,
  }));

  for (let i = 1; i < next.length - 1; i++) {
    const p = next[i];
    const t = oldLen > 1e-6
      ? ((p.x - oldStart.x) * oldDx + (p.y - oldStart.y) * oldDy) / (oldLen * oldLen)
      : i / (next.length - 1);
    const clamped = Math.max(0, Math.min(1, t));
    const baseX = oldStart.x + oldDx * clamped;
    const baseY = oldStart.y + oldDy * clamped;
    const perpX = p.x - baseX;
    const perpY = p.y - baseY;
    const newBaseX = start.x + (end.x - start.x) * clamped;
    const newBaseY = start.y + (end.y - start.y) * clamped;
    next[i] = {
      ...p,
      x: newBaseX + perpX * scale,
      y: newBaseY + perpY * scale,
      handleIn: null,
      handleOut: null,
    };
  }

  next[0] = { ...next[0], x: start.x, y: start.y, handleIn: null, handleOut: null };
  next[next.length - 1] = {
    ...next[next.length - 1],
    x: end.x,
    y: end.y,
    handleIn: null,
    handleOut: null,
  };

  return smoothCurvePath(next);
}

/** 实时预览：由起终点生成平滑贝塞尔路径 */
export function curvePathDFromEndpoints(start: WhiteboardPoint, end: WhiteboardPoint): string {
  return curvePathDFromPoints(initCurvePathPoints(start, end));
}

/** 曲线端点切线方向（用于箭头朝向） */
export function getCurvePathTangent(
  points: ConnectorPathPoint[],
  at: 'start' | 'end',
): { from: WhiteboardPoint; to: WhiteboardPoint } {
  const sampled = sampleCurvePathPoints(points, 20);
  if (sampled.length < 2) {
    const a = points[0];
    const b = points[points.length - 1];
    return at === 'start'
      ? { from: b, to: a }
      : { from: a, to: b };
  }
  if (at === 'start') {
    return { from: sampled[1], to: sampled[0] };
  }
  const n = sampled.length;
  return { from: sampled[n - 2], to: sampled[n - 1] };
}

export function ensureCurvePathPoints(
  points: WhiteboardPoint[],
  start: WhiteboardPoint,
  end: WhiteboardPoint,
): ConnectorPathPoint[] {
  let result: ConnectorPathPoint[];
  if (points.length >= 2) {
    const normalized = points.map(p => normalizePathPoint(p, 'smooth'));
    const eps = 0.5;
    const startMoved = Math.hypot(normalized[0].x - start.x, normalized[0].y - start.y) > eps;
    const endMoved = Math.hypot(
      normalized[normalized.length - 1].x - end.x,
      normalized[normalized.length - 1].y - end.y,
    ) > eps;
    result = startMoved || endMoved
      ? refitCurvePathToEndpoints(normalized, start, end)
      : normalized;
  } else {
    result = initCurvePathPoints(start, end);
  }
  return smoothCurvePath(result);
}

/**
 * 确保曲线全程平滑。
 * - 2 点：图2 默认 S 曲线（主轴水平/垂直切线）
 * - 多点：Catmull-Rom 风格对称手柄，过点连续光滑
 */
export function smoothCurvePath(points: ConnectorPathPoint[]): ConnectorPathPoint[] {
  if (points.length < 2) return points;

  if (points.length === 2) {
    const start = points[0];
    const end = points[1];
    // 若用户已显式编辑过手柄，保留；否则用默认 S
    const hasCustom =
      (start.handleOut != null && end.handleIn != null)
      && !isDefaultSCurveHandles(start, end, start.handleOut, end.handleIn);
    if (hasCustom) {
      return [
        { ...start, kind: 'smooth', handleIn: null, handleOut: start.handleOut },
        { ...end, kind: 'smooth', handleIn: end.handleIn, handleOut: null },
      ];
    }
    return initCurvePathPoints(start, end);
  }

  const next = points.map(p => ({
    ...p,
    kind: 'smooth' as const,
    handleIn: null as WhiteboardPoint | null,
    handleOut: null as WhiteboardPoint | null,
  }));

  for (let i = 0; i < next.length; i++) {
    const pt = next[i];
    const prev = next[i - 1] ?? null;
    const nxt = next[i + 1] ?? null;

    if (i === 0 && nxt) {
      // 多段起点：沿首段方向，保持过点光滑（非强制 S）
      const dx = nxt.x - pt.x;
      const dy = nxt.y - pt.y;
      const len = Math.hypot(dx, dy) || 1;
      const d = Math.min(DEFAULT_HANDLE_LEN, len / 3);
      next[i] = {
        ...pt,
        handleOut: { x: pt.x + (dx / len) * d, y: pt.y + (dy / len) * d },
        handleIn: null,
      };
      continue;
    }

    if (i === next.length - 1 && prev) {
      const dx = pt.x - prev.x;
      const dy = pt.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const d = Math.min(DEFAULT_HANDLE_LEN, len / 3);
      next[i] = {
        ...pt,
        handleIn: { x: pt.x - (dx / len) * d, y: pt.y - (dy / len) * d },
        handleOut: null,
      };
      continue;
    }

    if (prev && nxt) {
      // Catmull-Rom → cubic：切线平行于 (next - prev)
      const tx = nxt.x - prev.x;
      const ty = nxt.y - prev.y;
      const tLen = Math.hypot(tx, ty) || 1;
      const ux = tx / tLen;
      const uy = ty / tLen;
      const lenIn = Math.min(DEFAULT_HANDLE_LEN, Math.hypot(pt.x - prev.x, pt.y - prev.y) / 3);
      const lenOut = Math.min(DEFAULT_HANDLE_LEN, Math.hypot(nxt.x - pt.x, nxt.y - pt.y) / 3);
      next[i] = {
        ...pt,
        handleIn: { x: pt.x - ux * lenIn, y: pt.y - uy * lenIn },
        handleOut: { x: pt.x + ux * lenOut, y: pt.y + uy * lenOut },
      };
    }
  }
  return next;
}

function isDefaultSCurveHandles(
  start: WhiteboardPoint,
  end: WhiteboardPoint,
  handleOut: WhiteboardPoint,
  handleIn: WhiteboardPoint,
): boolean {
  const def = defaultSCurveHandles(start, end);
  const eps = 1.5;
  return Math.hypot(handleOut.x - def.handleOut.x, handleOut.y - def.handleOut.y) < eps
    && Math.hypot(handleIn.x - def.handleIn.x, handleIn.y - def.handleIn.y) < eps;
}

export function reverseConnectorPathPoints(points: ConnectorPathPoint[]): ConnectorPathPoint[] {
  return [...points].reverse().map(p => ({
    x: p.x,
    y: p.y,
    kind: p.kind,
    handleIn: p.handleOut ? { ...p.handleOut } : null,
    handleOut: p.handleIn ? { ...p.handleIn } : null,
  }));
}

export function movePathVertex(
  points: ConnectorPathPoint[],
  index: number,
  pos: WhiteboardPoint,
): ConnectorPathPoint[] {
  const next = points.map(p => ({ ...p }));
  const pt = next[index];
  const dx = pos.x - pt.x;
  const dy = pos.y - pt.y;
  next[index] = {
    ...pt,
    x: pos.x,
    y: pos.y,
    handleIn: pt.handleIn ? { x: pt.handleIn.x + dx, y: pt.handleIn.y + dy } : pt.handleIn,
    handleOut: pt.handleOut ? { x: pt.handleOut.x + dx, y: pt.handleOut.y + dy } : pt.handleOut,
  };
  return next;
}

export function movePathHandle(
  points: ConnectorPathPoint[],
  index: number,
  which: 'in' | 'out',
  pos: WhiteboardPoint,
): ConnectorPathPoint[] {
  const next = points.map(p => ({ ...p }));
  const pt = { ...next[index] };
  if (which === 'out') {
    pt.handleOut = pos;
    if (pt.kind === 'smooth') {
      pt.handleIn = { x: pt.x - (pos.x - pt.x), y: pt.y - (pos.y - pt.y) };
    }
  } else {
    pt.handleIn = pos;
    if (pt.kind === 'smooth') {
      pt.handleOut = { x: pt.x - (pos.x - pt.x), y: pt.y - (pos.y - pt.y) };
    }
  }
  next[index] = pt;
  return next;
}

export function togglePathPointKind(
  points: ConnectorPathPoint[],
  index: number,
): ConnectorPathPoint[] {
  const next = points.map(p => ({ ...p }));
  const pt = { ...next[index] };
  const prev = points[index - 1] ?? null;
  const nxt = points[index + 1] ?? null;
  pt.kind = pt.kind === 'smooth' ? 'corner' : 'smooth';
  if (pt.kind === 'smooth') {
    const out = resolveHandleOut(pt, prev, nxt);
    pt.handleOut = out;
    pt.handleIn = { x: pt.x - (out.x - pt.x), y: pt.y - (out.y - pt.y) };
  }
  next[index] = pt;
  return next;
}

export function setPathPointKind(
  points: ConnectorPathPoint[],
  index: number,
  kind: PathPointKind,
): ConnectorPathPoint[] {
  const pt = points[index];
  if ((pt.kind ?? 'corner') === kind) return points;
  const next = points.map(p => ({ ...p }));
  const target: ConnectorPathPoint = { ...next[index], kind };
  if (kind === 'smooth') {
    const out = resolveHandleOut(target, points[index - 1] ?? null, points[index + 1] ?? null);
    target.handleOut = out;
    target.handleIn = { x: target.x - (out.x - target.x), y: target.y - (out.y - target.y) };
  }
  next[index] = target;
  return next;
}

export function insertPathPointAt(
  points: ConnectorPathPoint[],
  index: number,
  pos: WhiteboardPoint,
): ConnectorPathPoint[] {
  const next = [...points];
  next.splice(index, 0, normalizePathPoint(pos, 'smooth'));
  return next;
}

export function insertPathPointOnSegment(
  points: ConnectorPathPoint[],
  segmentIndex: number,
  t = 0.5,
): ConnectorPathPoint[] {
  const p0 = points[segmentIndex];
  const p1 = points[segmentIndex + 1];
  const cp1 = resolveHandleOut(p0, points[segmentIndex - 1] ?? null, p1);
  const cp2 = resolveHandleIn(p1, p0, points[segmentIndex + 2] ?? null);
  const pos = cubicBezierPoint(p0, cp1, cp2, p1, t);
  return insertPathPointAt(points, segmentIndex + 1, pos);
}

export function findClosestCurveSegment(
  points: ConnectorPathPoint[],
  pt: WhiteboardPoint,
): { segmentIndex: number; t: number } {
  let best = { segmentIndex: 0, t: 0.5, dist: Infinity };
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cp1 = resolveHandleOut(p0, points[i - 1] ?? null, p1);
    const cp2 = resolveHandleIn(p1, p0, points[i + 2] ?? null);
    for (let s = 0; s <= 24; s++) {
      const t = s / 24;
      const sample = cubicBezierPoint(p0, cp1, cp2, p1, t);
      const d = Math.hypot(pt.x - sample.x, pt.y - sample.y);
      if (d < best.dist) best = { segmentIndex: i, t, dist: d };
    }
  }
  return { segmentIndex: best.segmentIndex, t: best.t };
}

export function deletePathPoint(
  points: ConnectorPathPoint[],
  index: number,
): ConnectorPathPoint[] {
  if (points.length <= 2 || index <= 0 || index >= points.length - 1) return points;
  return points.filter((_, i) => i !== index);
}

export function hitPathVertex(
  points: ConnectorPathPoint[],
  pt: WhiteboardPoint,
  radius = 10,
): number | null {
  let best: { index: number; dist: number } | null = null;
  for (let i = 0; i < points.length; i++) {
    const d = Math.hypot(pt.x - points[i].x, pt.y - points[i].y);
    if (d <= radius && (!best || d < best.dist)) best = { index: i, dist: d };
  }
  return best?.index ?? null;
}

export function hitPathHandle(
  points: ConnectorPathPoint[],
  pt: WhiteboardPoint,
  radius = 8,
): { index: number; which: 'in' | 'out' } | null {
  const handles = resolvePathHandles(points);
  let best: { index: number; which: 'in' | 'out'; dist: number } | null = null;
  for (let i = 0; i < handles.length; i++) {
    const { handleIn, handleOut } = handles[i];
    for (const which of ['in', 'out'] as const) {
      const hp = which === 'in' ? handleIn : handleOut;
      const d = Math.hypot(pt.x - hp.x, pt.y - hp.y);
      if (d <= radius && (!best || d < best.dist)) best = { index: i, which, dist: d };
    }
  }
  return best ? { index: best.index, which: best.which } : null;
}

export function migrateConnectorToStyle(
  points: WhiteboardPoint[],
  start: WhiteboardPoint,
  end: WhiteboardPoint,
  style: ConnectorStyle,
  elbowOpts?: ResolveElbowRouteOpts,
): ConnectorPathPoint[] {
  if (style === 'curve') {
    return smoothCurvePath(ensureCurvePathPoints(points, start, end));
  }
  if (style === 'elbow') {
    return resolveElbowRoute(points, start, end, elbowOpts).map(p => normalizePathPoint(p));
  }
  return [normalizePathPoint(start), normalizePathPoint(end)];
}
