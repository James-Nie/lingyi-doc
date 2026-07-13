import type { ConnectorPathPoint, ConnectorStyle, PathPointKind, WhiteboardPoint } from './types';
import { defaultElbowPoints, resolveElbowRoute, type ResolveElbowRouteOpts } from './elbowConnector';

const DEFAULT_HANDLE_LEN = 48;

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
      const u = 1 - t;
      out.push({
        x: u * u * u * p0.x + 3 * u * u * t * cp1.x + 3 * u * t * t * cp2.x + t * t * t * p1.x,
        y: u * u * u * p0.y + 3 * u * u * t * cp1.y + 3 * u * t * t * cp2.y + t * t * t * p1.y,
      });
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
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(72, len * 0.28);
  const midBow = {
    x: mid.x - (dy / len) * bow,
    y: mid.y + (dx / len) * bow,
  };
  return [
    normalizePathPoint(start, 'smooth'),
    normalizePathPoint(midBow, 'smooth'),
    normalizePathPoint(end, 'smooth'),
  ];
}

/** 按新端点实时拟合曲线，保留中间控制点相对形态 */
export function refitCurvePathToEndpoints(
  points: ConnectorPathPoint[],
  start: WhiteboardPoint,
  end: WhiteboardPoint,
): ConnectorPathPoint[] {
  if (points.length < 2) return initCurvePathPoints(start, end);

  const oldStart = points[0];
  const oldEnd = points[points.length - 1];
  const oldDx = oldEnd.x - oldStart.x;
  const oldDy = oldEnd.y - oldStart.y;
  const oldLen = Math.hypot(oldDx, oldDy) || 1;
  const newLen = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  const scale = newLen / oldLen;

  if (points.length === 3) {
    const autoOld = initCurvePathPoints(oldStart, oldEnd);
    const autoNew = initCurvePathPoints(start, end);
    const mid = points[1];
    const offsetX = mid.x - autoOld[1].x;
    const offsetY = mid.y - autoOld[1].y;
    return smoothCurvePath([
      { ...autoNew[0], handleIn: null, handleOut: null },
      {
        ...autoNew[1],
        x: autoNew[1].x + offsetX * scale,
        y: autoNew[1].y + offsetY * scale,
        kind: 'smooth' as const,
        handleIn: null,
        handleOut: null,
      },
      { ...autoNew[2], handleIn: null, handleOut: null },
    ]);
  }

  const next = points.map(p => ({
    ...p,
    handleIn: p.handleIn ? { ...p.handleIn } : null,
    handleOut: p.handleOut ? { ...p.handleOut } : null,
  }));

  for (let i = 1; i < next.length - 1; i++) {
    const p = next[i];
    const t = oldLen > 1e-6
      ? ((p.x - oldStart.x) * oldDx + (p.y - oldStart.y) * oldDy) / (oldLen * oldLen)
      : 0.5;
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
      handleIn: p.kind === 'smooth' ? null : p.handleIn,
      handleOut: p.kind === 'smooth' ? null : p.handleOut,
    };
  }

  next[0] = { ...next[0], x: start.x, y: start.y, handleIn: null };
  next[next.length - 1] = { ...next[next.length - 1], x: end.x, y: end.y, handleOut: null };

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
  if (points.length >= 3) {
    const normalized = points.map((p, i) => normalizePathPoint(
      p,
      'smooth',
    ));
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

/** 确保曲线全程平滑（无端点折角） */
export function smoothCurvePath(points: ConnectorPathPoint[]): ConnectorPathPoint[] {
  if (points.length < 2) return points;
  const next = points.map((p, i) => {
    const pt: ConnectorPathPoint = {
      ...p,
      kind: 'smooth',
      handleIn: p.handleIn ? { ...p.handleIn } : null,
      handleOut: p.handleOut ? { ...p.handleOut } : null,
    };
    if (i === 0 || i === points.length - 1) return pt;
    return { ...pt, handleIn: null, handleOut: null };
  });

  for (let i = 0; i < next.length; i++) {
    const pt = next[i];
    const prev = next[i - 1] ?? null;
    const nxt = next[i + 1] ?? null;
    const out = resolveHandleOut(pt, prev, nxt);
    if (i === 0) {
      next[i] = { ...pt, handleOut: out, handleIn: null };
    } else if (i === next.length - 1) {
      const inp = resolveHandleIn(pt, prev, null);
      next[i] = { ...pt, handleIn: inp, handleOut: null };
    } else {
      next[i] = {
        ...pt,
        handleOut: out,
        handleIn: { x: pt.x - (out.x - pt.x), y: pt.y - (out.y - pt.y) },
      };
    }
  }
  return next;
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
  const u = 1 - t;
  const pos = {
    x: u * u * u * p0.x + 3 * u * u * t * cp1.x + 3 * u * t * t * cp2.x + t * t * t * p1.x,
    y: u * u * u * p0.y + 3 * u * u * t * cp1.y + 3 * u * t * t * cp2.y + t * t * t * p1.y,
  };
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
      const u = 1 - t;
      const sample = {
        x: u * u * u * p0.x + 3 * u * u * t * cp1.x + 3 * u * t * t * cp2.x + t * t * t * p1.x,
        y: u * u * u * p0.y + 3 * u * u * t * cp1.y + 3 * u * t * t * cp2.y + t * t * t * p1.y,
      };
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
