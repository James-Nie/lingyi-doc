import type { AnchorId } from './types';
import type { WhiteboardPoint } from './types';

export type ElbowSegmentAxis = 'h' | 'v';

export interface ElbowSegment {
  index: number;
  axis: ElbowSegmentAxis;
  midpoint: WhiteboardPoint;
}

/** 出线/入线 stub 长度（px） */
export const ELBOW_STUB_MIN = 16;
export const ELBOW_STUB_DEFAULT = 20;
export const ELBOW_STUB_MAX = 32;

/** 相邻共线线段合并吸附阈值（px） */
export const ELBOW_MERGE_EPS = 4;

export interface ElbowObstacle {
  id?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ResolveElbowRouteOpts {
  startAnchor?: AnchorId;
  endAnchor?: AnchorId;
  stubLen?: number;
  obstacles?: ElbowObstacle[];
}

const EPS = 0.5;

const ANCHOR_OUTWARD: Record<AnchorId, WhiteboardPoint> = {
  n: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  e: { x: 1, y: 0 },
  w: { x: -1, y: 0 },
  ne: { x: 1, y: -1 },
  nw: { x: -1, y: -1 },
  se: { x: 1, y: 1 },
  sw: { x: -1, y: 1 },
};

function normalizeVector(v: WhiteboardPoint): WhiteboardPoint {
  const len = Math.hypot(v.x, v.y);
  if (len < 1e-9) return { x: 0, y: -1 };
  return { x: v.x / len, y: v.y / len };
}

function clampStubLen(len?: number): number {
  if (len == null || !Number.isFinite(len)) return ELBOW_STUB_DEFAULT;
  return Math.max(ELBOW_STUB_MIN, Math.min(ELBOW_STUB_MAX, len));
}

function dist(a: WhiteboardPoint, b: WhiteboardPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 锚点外法线（由图形中心指向锚点） */
export function anchorOutwardVector(anchor: AnchorId): WhiteboardPoint {
  return normalizeVector(ANCHOR_OUTWARD[anchor]);
}

/** 锚点内法线（由锚点指向图形内部） */
export function anchorInwardVector(anchor: AnchorId): WhiteboardPoint {
  const outward = anchorOutwardVector(anchor);
  return { x: -outward.x, y: -outward.y };
}

/** 锚点出线/入线主轴 */
export function anchorAxis(anchor: AnchorId): ElbowSegmentAxis {
  const outward = anchorOutwardVector(anchor);
  return Math.abs(outward.x) >= Math.abs(outward.y) ? 'h' : 'v';
}

export function extendFromAnchor(
  point: WhiteboardPoint,
  anchor: AnchorId,
  distance: number,
): WhiteboardPoint {
  const dir = anchorOutwardVector(anchor);
  return { x: point.x + dir.x * distance, y: point.y + dir.y * distance };
}

export function anchorInwardReferencePoint(
  anchor: AnchorId,
  point: WhiteboardPoint,
  distance = 40,
): WhiteboardPoint {
  const inward = anchorInwardVector(anchor);
  return { x: point.x - inward.x * distance, y: point.y - inward.y * distance };
}

export function segmentAxis(a: WhiteboardPoint, b: WhiteboardPoint): ElbowSegmentAxis | null {
  if (Math.abs(a.x - b.x) < EPS) return 'v';
  if (Math.abs(a.y - b.y) < EPS) return 'h';
  return null;
}

export interface SimplifyOrthogonalPathOpts {
  /** 合并共线时保留的点索引（如锚点 stub） */
  lockedIndices?: Set<number>;
}

/** 路径是否共线（同一水平或垂直轴） */
export function isCollinearOrthogonalPath(points: WhiteboardPoint[]): boolean {
  if (points.length < 2) return false;
  const axis = segmentAxis(points[0], points[1]);
  if (!axis) return false;
  for (let i = 0; i < points.length - 1; i++) {
    if (segmentAxis(points[i], points[i + 1]) !== axis) return false;
  }
  return true;
}

/** 合并共线冗余折点 */
export function simplifyOrthogonalPath(
  points: WhiteboardPoint[],
  mergeEps = ELBOW_MERGE_EPS,
  opts?: SimplifyOrthogonalPathOpts,
): WhiteboardPoint[] {
  if (points.length < 3) return points.map(p => ({ ...p }));

  let result = points.map(p => ({ ...p }));

  const collapse = (pts: WhiteboardPoint[]): WhiteboardPoint[] => {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      if (opts?.lockedIndices?.has(i)) {
        out.push(pts[i]);
        continue;
      }
      const prev = out[out.length - 1];
      const curr = pts[i];
      const next = pts[i + 1];
      const axisIn = segmentAxis(prev, curr);
      const axisOut = segmentAxis(curr, next);
      if (axisIn && axisOut && axisIn === axisOut) {
        if (
          (axisIn === 'h' && Math.abs(curr.y - prev.y) < mergeEps && Math.abs(curr.y - next.y) < mergeEps)
          || (axisIn === 'v' && Math.abs(curr.x - prev.x) < mergeEps && Math.abs(curr.x - next.x) < mergeEps)
        ) {
          continue;
        }
      }
      out.push(curr);
    }
    out.push(pts[pts.length - 1]);
    return out;
  };

  let prevLen = 0;
  while (result.length !== prevLen) {
    prevLen = result.length;
    result = collapse(result);
  }
  return result;
}

/** 默认正交折线路径（无锚点约束） */
export function defaultElbowPoints(a: WhiteboardPoint, b: WhiteboardPoint): WhiteboardPoint[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) return [a, b];

  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx > 40 && absDy > 40 && dx > 0 && dy > 0) {
    const midY = a.y + dy * 0.55;
    const approachX = b.x - Math.min(48, absDx * 0.25);
    return [
      a,
      { x: a.x, y: midY },
      { x: approachX, y: midY },
      { x: approachX, y: b.y },
      b,
    ];
  }

  if (absDx >= absDy) {
    const midX = a.x + dx / 2;
    return [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b];
  }

  const midY = a.y + dy / 2;
  return [a, { x: a.x, y: midY }, { x: b.x, y: midY }, b];
}

/** 两 stub 间正交折弯（保证末段沿 endAxis、首段沿 startAxis） */
function routeBetweenStubsSimple(
  startStub: WhiteboardPoint,
  endStub: WhiteboardPoint,
  startAxis: ElbowSegmentAxis,
  endAxis: ElbowSegmentAxis,
): WhiteboardPoint[] {
  const dx = endStub.x - startStub.x;
  const dy = endStub.y - startStub.y;

  if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) return [];

  if (startAxis === 'h' && endAxis === 'h') {
    const midX = startStub.x + dx / 2;
    return [{ x: midX, y: startStub.y }, { x: midX, y: endStub.y }];
  }

  if (startAxis === 'v' && endAxis === 'v') {
    const midY = startStub.y + dy / 2;
    return [{ x: startStub.x, y: midY }, { x: endStub.x, y: midY }];
  }

  if (startAxis === 'h' && endAxis === 'v') {
    return [{ x: endStub.x, y: startStub.y }];
  }

  return [{ x: startStub.x, y: endStub.y }];
}

function segmentDepartsFromStubCorrectly(
  stub: WhiteboardPoint,
  to: WhiteboardPoint,
  anchor: AnchorId,
): boolean {
  const dx = to.x - stub.x;
  const dy = to.y - stub.y;
  if (Math.hypot(dx, dy) < EPS) return true;

  const outward = anchorOutwardVector(anchor);
  const segAxis = segmentAxis(stub, to);
  if (!segAxis) return false;

  const ax = anchorAxis(anchor);
  if (ax !== segAxis) return true;

  if (ax === 'h') return outward.x > 0 ? dx > EPS : dx < -EPS;
  return outward.y > 0 ? dy > EPS : dy < -EPS;
}

function segmentArrivesAtStubCorrectly(
  from: WhiteboardPoint,
  stub: WhiteboardPoint,
  anchor: AnchorId,
): boolean {
  const dx = stub.x - from.x;
  const dy = stub.y - from.y;
  if (Math.hypot(dx, dy) < EPS) return true;

  const outward = anchorOutwardVector(anchor);
  const segAxis = segmentAxis(from, stub);
  if (!segAxis) return false;

  const ax = anchorAxis(anchor);
  if (ax !== segAxis) return true;

  if (ax === 'h') {
    const inwardX = -outward.x;
    return inwardX > 0 ? dx > EPS : dx < -EPS;
  }
  const inwardY = -outward.y;
  return inwardY > 0 ? dy > EPS : dy < -EPS;
}

function middlePathValid(
  middle: WhiteboardPoint[],
  startStub: WhiteboardPoint,
  endStub: WhiteboardPoint,
  startAnchor: AnchorId,
  endAnchor: AnchorId,
): boolean {
  if (middle.length < 2) return true;
  if (!segmentDepartsFromStubCorrectly(startStub, middle[1], startAnchor)) return false;
  if (!segmentArrivesAtStubCorrectly(middle[middle.length - 2], endStub, endAnchor)) return false;
  return true;
}

function segmentCrossesRectInterior(
  a: WhiteboardPoint,
  b: WhiteboardPoint,
  rect: ElbowObstacle,
  margin = 3,
): boolean {
  const rx0 = rect.x + margin;
  const ry0 = rect.y + margin;
  const rx1 = rect.x + rect.w - margin;
  const ry1 = rect.y + rect.h - margin;
  const axis = segmentAxis(a, b);
  if (!axis) return false;

  if (axis === 'h') {
    const y = a.y;
    if (y <= ry0 || y >= ry1) return false;
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    return maxX > rx0 && minX < rx1;
  }

  const x = a.x;
  if (x <= rx0 || x >= rx1) return false;
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return maxY > ry0 && minY < ry1;
}

function pathCrossesObstacles(path: WhiteboardPoint[], obstacles?: ElbowObstacle[]): boolean {
  if (!obstacles?.length) return false;
  for (let i = 0; i < path.length - 1; i++) {
    for (const obs of obstacles) {
      if (segmentCrossesRectInterior(path[i], path[i + 1], obs)) return true;
    }
  }
  return false;
}

function pathTotalLength(points: WhiteboardPoint[]): number {
  let len = 0;
  for (let i = 0; i < points.length - 1; i++) len += dist(points[i], points[i + 1]);
  return len;
}

function generateRouteCandidates(
  startStub: WhiteboardPoint,
  endStub: WhiteboardPoint,
  startAxis: ElbowSegmentAxis,
  endAxis: ElbowSegmentAxis,
  detour = 40,
): WhiteboardPoint[][] {
  const dx = endStub.x - startStub.x;
  const dy = endStub.y - startStub.y;
  const cands: WhiteboardPoint[][] = [];

  if (startAxis === 'h' && endAxis === 'h') {
    const midX = startStub.x + dx / 2;
    const leftX = Math.min(startStub.x, endStub.x) - detour;
    const rightX = Math.max(startStub.x, endStub.x) + detour;
    cands.push(
      [{ x: midX, y: startStub.y }, { x: midX, y: endStub.y }],
      [{ x: leftX, y: startStub.y }, { x: leftX, y: endStub.y }],
      [{ x: rightX, y: startStub.y }, { x: rightX, y: endStub.y }],
    );
  } else if (startAxis === 'h' && endAxis === 'v') {
    const midY = startStub.y + dy / 2;
    const topY = Math.min(startStub.y, endStub.y) - detour;
    const bottomY = Math.max(startStub.y, endStub.y) + detour;
    cands.push(
      [{ x: endStub.x, y: startStub.y }],
      [{ x: startStub.x, y: endStub.y }],
      [{ x: startStub.x, y: midY }, { x: endStub.x, y: midY }],
      [{ x: startStub.x, y: topY }, { x: endStub.x, y: topY }],
      [{ x: startStub.x, y: bottomY }, { x: endStub.x, y: bottomY }],
    );
  } else if (startAxis === 'v' && endAxis === 'h') {
    const midX = startStub.x + dx / 2;
    const leftX = Math.min(startStub.x, endStub.x) - detour;
    const rightX = Math.max(startStub.x, endStub.x) + detour;
    cands.push(
      [{ x: startStub.x, y: endStub.y }],
      [{ x: endStub.x, y: startStub.y }],
      [{ x: midX, y: startStub.y }, { x: midX, y: endStub.y }],
      [{ x: leftX, y: startStub.y }, { x: leftX, y: endStub.y }],
      [{ x: rightX, y: startStub.y }, { x: rightX, y: endStub.y }],
    );
  } else {
    const midY = startStub.y + dy / 2;
    const topY = Math.min(startStub.y, endStub.y) - detour;
    const bottomY = Math.max(startStub.y, endStub.y) + detour;
    cands.push(
      [{ x: startStub.x, y: midY }, { x: endStub.x, y: midY }],
      [{ x: startStub.x, y: topY }, { x: endStub.x, y: topY }],
      [{ x: startStub.x, y: bottomY }, { x: endStub.x, y: bottomY }],
    );
  }

  return cands;
}

function pickBestRouteBends(
  startStub: WhiteboardPoint,
  endStub: WhiteboardPoint,
  startAxis: ElbowSegmentAxis,
  endAxis: ElbowSegmentAxis,
  startAnchor: AnchorId | undefined,
  endAnchor: AnchorId | undefined,
  obstacles: ElbowObstacle[] | undefined,
  detour: number,
): WhiteboardPoint[] | null {
  const candidates = generateRouteCandidates(startStub, endStub, startAxis, endAxis, detour);
  let best: WhiteboardPoint[] | null = null;
  let bestLen = Infinity;

  for (const bends of candidates) {
    const middle = [startStub, ...bends, endStub];
    if (!isOrthogonalPath(middle)) continue;
    if (pathCrossesObstacles(middle, obstacles)) continue;
    if (startAnchor && endAnchor && !middlePathValid(middle, startStub, endStub, startAnchor, endAnchor)) {
      continue;
    }
    const len = pathTotalLength(middle);
    if (len < bestLen) {
      bestLen = len;
      best = bends;
    }
  }
  return best;
}

function routeBetweenStubs(
  startStub: WhiteboardPoint,
  endStub: WhiteboardPoint,
  startAxis: ElbowSegmentAxis,
  endAxis: ElbowSegmentAxis,
  obstacles?: ElbowObstacle[],
  anchors?: { start?: AnchorId; end?: AnchorId },
): WhiteboardPoint[] {
  const detours = [40, 64, 96, 140, 200];
  for (const detour of detours) {
    const best = pickBestRouteBends(
      startStub,
      endStub,
      startAxis,
      endAxis,
      anchors?.start,
      anchors?.end,
      obstacles,
      detour,
    );
    if (best) return best;
  }

  const simple = routeBetweenStubsSimple(startStub, endStub, startAxis, endAxis);
  const middle = [startStub, ...simple, endStub];
  if (!pathCrossesObstacles(middle, obstacles)) return simple;

  const fallback = pickBestRouteBends(
    startStub,
    endStub,
    startAxis,
    endAxis,
    anchors?.start,
    anchors?.end,
    obstacles,
    280,
  );
  if (fallback) return fallback;

  for (const detour of [320, 400, 520]) {
    const wide = pickBestRouteBends(
      startStub,
      endStub,
      startAxis,
      endAxis,
      anchors?.start,
      anchors?.end,
      obstacles,
      detour,
    );
    if (wide) return wide;
  }

  return simple;
}

/** 锚点感知折线：起终点沿锚点法线出线/入线，中间正交连接 */
export function defaultElbowPointsWithAnchors(
  start: WhiteboardPoint,
  startAnchor: AnchorId,
  end: WhiteboardPoint,
  endAnchor: AnchorId,
  stubLen = ELBOW_STUB_DEFAULT,
  obstacles?: ElbowObstacle[],
): WhiteboardPoint[] {
  const stub = clampStubLen(stubLen);
  const startStub = extendFromAnchor(start, startAnchor, stub);
  const endStub = extendFromAnchor(end, endAnchor, stub);
  const bends = routeBetweenStubs(
    startStub,
    endStub,
    anchorAxis(startAnchor),
    anchorAxis(endAnchor),
    obstacles,
    { start: startAnchor, end: endAnchor },
  );
  return simplifyOrthogonalPath([start, startStub, ...bends, endStub, end]);
}

function routeCrossesObstacles(
  route: WhiteboardPoint[],
  obstacles?: ElbowObstacle[],
): boolean {
  return pathCrossesObstacles(route, obstacles);
}

function inferAnchorFacing(point: WhiteboardPoint, other: WhiteboardPoint): AnchorId {
  const dx = other.x - point.x;
  const dy = other.y - point.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'e' : 'w';
  return dy > 0 ? 's' : 'n';
}

function endpointsMatch(a: WhiteboardPoint, b: WhiteboardPoint): boolean {
  return dist(a, b) <= EPS * 2;
}

/** 端点移动时按路径参数插值平移中间折点（整体平移时保持正交） */
export function shiftElbowPointsForEndpointMove(
  points: WhiteboardPoint[],
  nextStart: WhiteboardPoint,
  nextEnd: WhiteboardPoint,
): WhiteboardPoint[] {
  if (points.length < 2) return [nextStart, nextEnd];
  const prevStart = points[0];
  const prevEnd = points[points.length - 1];
  const dStart = { x: nextStart.x - prevStart.x, y: nextStart.y - prevStart.y };
  const dEnd = { x: nextEnd.x - prevEnd.x, y: nextEnd.y - prevEnd.y };
  const n = points.length - 1;
  return points.map((p, i) => {
    if (i === 0) return { ...nextStart };
    if (i === n) return { ...nextEnd };
    const t = i / n;
    return {
      x: p.x + dStart.x * (1 - t) + dEnd.x * t,
      y: p.y + dStart.y * (1 - t) + dEnd.y * t,
    };
  });
}

/** 绑定端点变化后：能平移则平移，否则丢弃旧折点以便自动重算 */
function prepareElbowPointsForEndpointMove(
  points: WhiteboardPoint[],
  start: WhiteboardPoint,
  end: WhiteboardPoint,
): WhiteboardPoint[] {
  if (points.length < 2) return points;
  if (endpointsMatch(points[0], start) && endpointsMatch(points[points.length - 1], end)) {
    return points;
  }
  const shifted = shiftElbowPointsForEndpointMove(points, start, end);
  if (
    isOrthogonalPath(shifted)
    && endpointsMatch(shifted[0], start)
    && endpointsMatch(shifted[shifted.length - 1], end)
  ) {
    return shifted;
  }
  return [start, end];
}

function ensureOrthogonalElbowRoute(
  candidate: WhiteboardPoint[],
  points: WhiteboardPoint[],
  start: WhiteboardPoint,
  end: WhiteboardPoint,
  startAnchor: AnchorId | undefined,
  endAnchor: AnchorId | undefined,
  stub: number,
  obstacles?: ElbowObstacle[],
): WhiteboardPoint[] {
  if (isOrthogonalPath(candidate)) return candidate;
  return resolveAnchoredElbowRoute(
    points,
    start,
    end,
    startAnchor ?? inferAnchorFacing(start, end),
    endAnchor ?? inferAnchorFacing(end, start),
    stub,
    obstacles,
  );
}

function extractInteriorBends(
  points: WhiteboardPoint[],
  start: WhiteboardPoint,
  end: WhiteboardPoint,
  startStub: WhiteboardPoint,
  endStub: WhiteboardPoint,
  stub: number,
): WhiteboardPoint[] {
  if (points.length < 4) return [];
  const threshold = stub * 0.55;
  return points.slice(1, -1).filter(p =>
    dist(p, start) > threshold
    && dist(p, end) > threshold
    && dist(p, startStub) > threshold
    && dist(p, endStub) > threshold,
  ).map(p => ({ ...p }));
}

function resolveAnchoredElbowRoute(
  points: WhiteboardPoint[],
  start: WhiteboardPoint,
  end: WhiteboardPoint,
  startAnchor: AnchorId,
  endAnchor: AnchorId,
  stubLen: number,
  obstacles?: ElbowObstacle[],
): WhiteboardPoint[] {
  const stub = clampStubLen(stubLen);
  const prepared = prepareElbowPointsForEndpointMove(points, start, end);
  const startStub = extendFromAnchor(start, startAnchor, stub);
  const endStub = extendFromAnchor(end, endAnchor, stub);
  const bends = extractInteriorBends(prepared, start, end, startStub, endStub, stub);

  if (bends.length > 0) {
    const route = simplifyOrthogonalPath([start, startStub, ...bends, endStub, end]);
    const middle = [startStub, ...bends, endStub];
    if (
      isOrthogonalPath(route)
      && !pathCrossesObstacles(middle, obstacles)
      && middlePathValid(middle, startStub, endStub, startAnchor, endAnchor)
      && !routeCrossesObstacles(route, obstacles)
    ) {
      return route;
    }
  }

  const auto = defaultElbowPointsWithAnchors(start, startAnchor, end, endAnchor, stub, obstacles);
  if (!routeCrossesObstacles(auto, obstacles)) return auto;

  return auto;
}

/** 手动模式：保留用户拖出的折点；共线直线时保留 stub 以显示操作柄 */
export function resolveManualElbowRoute(
  points: WhiteboardPoint[],
  start: WhiteboardPoint,
  end: WhiteboardPoint,
  opts?: ResolveElbowRouteOpts,
): WhiteboardPoint[] {
  const startAnchor = opts?.startAnchor;
  const endAnchor = opts?.endAnchor;
  const stub = clampStubLen(opts?.stubLen);
  const prepared = prepareElbowPointsForEndpointMove(points, start, end);

  // 拖动/存储的路径已是完整正交路由且端点与绑定一致时直接复用，避免重建破坏正交
  if (
    prepared.length >= 2
    && isOrthogonalPath(prepared)
    && endpointsMatch(prepared[0], start)
    && endpointsMatch(prepared[prepared.length - 1], end)
  ) {
    const locked = new Set<number>();
    if (startAnchor && prepared.length >= 3) locked.add(1);
    if (endAnchor && prepared.length >= 3) locked.add(prepared.length - 2);
    return simplifyOrthogonalPath(
      prepared.map(p => ({ ...p })),
      ELBOW_MERGE_EPS,
      { lockedIndices: locked.size ? locked : undefined },
    );
  }

  const startStub = startAnchor ? extendFromAnchor(start, startAnchor, stub) : start;
  const endStub = endAnchor ? extendFromAnchor(end, endAnchor, stub) : end;
  const bends = extractInteriorBends(prepared, start, end, startStub, endStub, stub);

  if (startAnchor && endAnchor) {
    if (bends.length === 0) {
      return [start, startStub, endStub, end];
    }

    const endStubIndex = 1 + bends.length;
    return ensureOrthogonalElbowRoute(
      simplifyOrthogonalPath(
        [start, startStub, ...bends, endStub, end],
        ELBOW_MERGE_EPS,
        { lockedIndices: new Set([1, endStubIndex]) },
      ),
      prepared,
      start,
      end,
      startAnchor,
      endAnchor,
      stub,
      opts?.obstacles,
    );
  }

  if (startAnchor) {
    if (bends.length === 0) {
      return [start, startStub, end];
    }
    return ensureOrthogonalElbowRoute(
      simplifyOrthogonalPath(
        [start, startStub, ...bends, end],
        ELBOW_MERGE_EPS,
        { lockedIndices: new Set([1]) },
      ),
      prepared,
      start,
      end,
      startAnchor,
      endAnchor,
      stub,
      opts?.obstacles,
    );
  }

  if (endAnchor) {
    if (bends.length === 0) {
      return [start, endStub, end];
    }
    const endStubIndex = bends.length;
    return ensureOrthogonalElbowRoute(
      simplifyOrthogonalPath(
        [start, ...bends, endStub, end],
        ELBOW_MERGE_EPS,
        { lockedIndices: new Set([endStubIndex]) },
      ),
      prepared,
      start,
      end,
      startAnchor,
      endAnchor,
      stub,
      opts?.obstacles,
    );
  }

  if (prepared.length <= 2) return [start, end];

  const interior = prepared.slice(1, -1);
  return ensureOrthogonalElbowRoute(
    simplifyOrthogonalPath([start, ...interior, end]),
    prepared,
    start,
    end,
    startAnchor,
    endAnchor,
    stub,
    opts?.obstacles,
  );
}

export function resolveElbowRoute(
  points: WhiteboardPoint[],
  start: WhiteboardPoint,
  end: WhiteboardPoint,
  opts?: ResolveElbowRouteOpts,
): WhiteboardPoint[] {
  const stubLen = clampStubLen(opts?.stubLen);
  const startAnchor = opts?.startAnchor;
  const endAnchor = opts?.endAnchor;

  if (startAnchor || endAnchor) {
    return resolveAnchoredElbowRoute(
      points,
      start,
      end,
      startAnchor ?? inferAnchorFacing(start, end),
      endAnchor ?? inferAnchorFacing(end, start),
      stubLen,
      opts?.obstacles,
    );
  }

  if (points.length >= 4) {
    const candidate = simplifyOrthogonalPath([start, ...points.slice(1, -1), end]);
    if (isOrthogonalPath(candidate) && !pathCrossesObstacles(candidate, opts?.obstacles)) {
      return candidate;
    }
  }

  const fallback = defaultElbowPoints(start, end);
  if (!pathCrossesObstacles(fallback, opts?.obstacles)) return fallback;

  return defaultElbowPointsWithAnchors(
    start,
    inferAnchorFacing(start, end),
    end,
    inferAnchorFacing(end, start),
    stubLen,
    opts?.obstacles,
  );
}

export function isOrthogonalPath(points: WhiteboardPoint[]): boolean {
  if (points.length < 2) return true;
  for (let i = 0; i < points.length - 1; i++) {
    if (!segmentAxis(points[i], points[i + 1])) return false;
  }
  return true;
}

export function elbowPathSegments(points: WhiteboardPoint[]): [WhiteboardPoint, WhiteboardPoint][] {
  const segs: [WhiteboardPoint, WhiteboardPoint][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    segs.push([points[i], points[i + 1]]);
  }
  return segs;
}

/** 圆角折线 SVG path；不足 3 点时先补全正交路径 */
export function elbowPathD(points: WhiteboardPoint[], cornerRadius = 10): string {
  if (points.length < 2) return '';
  const pts = points.length < 3
    ? defaultElbowPoints(points[0], points[points.length - 1])
    : points;

  if (pts.length === 2 || isCollinearOrthogonalPath(pts)) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    return `M ${first.x} ${first.y} L ${last.x} ${last.y}`;
  }

  const parts: string[] = [`M ${pts[0].x} ${pts[0].y}`];

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];
    const inLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const outLen = Math.hypot(next.x - curr.x, next.y - curr.y);
    const cr = Math.min(cornerRadius, inLen / 2, outLen / 2);

    if (cr < 1 || inLen < EPS || outLen < EPS) {
      parts.push(`L ${curr.x} ${curr.y}`);
      continue;
    }

    const inDx = (curr.x - prev.x) / inLen;
    const inDy = (curr.y - prev.y) / inLen;
    const outDx = (next.x - curr.x) / outLen;
    const outDy = (next.y - curr.y) / outLen;
    const bx = curr.x - inDx * cr;
    const by = curr.y - inDy * cr;
    const ax = curr.x + outDx * cr;
    const ay = curr.y + outDy * cr;
    parts.push(`L ${bx} ${by}`);
    parts.push(`Q ${curr.x} ${curr.y} ${ax} ${ay}`);
  }

  const last = pts[pts.length - 1];
  parts.push(`L ${last.x} ${last.y}`);
  return parts.join(' ');
}

export function listElbowSegments(points: WhiteboardPoint[]): ElbowSegment[] {
  const out: ElbowSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const axis = segmentAxis(a, b);
    if (!axis) continue;
    out.push({
      index: i,
      axis,
      midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    });
  }
  return out;
}

export interface ElbowSegmentDragOpts {
  /** 锁定起点 stub 段（有 startBind 时） */
  lockStart?: boolean;
  /** 锁定终点 stub 段（有 endBind 时） */
  lockEnd?: boolean;
  /** 两端均绑定：等价于 lockStart + lockEnd */
  anchored?: boolean;
  merge?: boolean;
}

function resolveElbowSegmentLocks(opts?: ElbowSegmentDragOpts): { lockStart: boolean; lockEnd: boolean } {
  const lockStart = opts?.lockStart ?? Boolean(opts?.anchored);
  const lockEnd = opts?.lockEnd ?? Boolean(opts?.anchored);
  return { lockStart, lockEnd };
}

/** 可编辑折线段（排除起终点 stub 段） */
export function listEditableElbowSegments(
  points: WhiteboardPoint[],
  opts?: ElbowSegmentDragOpts,
): ElbowSegment[] {
  const { lockStart, lockEnd } = resolveElbowSegmentLocks(opts);
  const all = listElbowSegments(points);
  if (!lockStart && !lockEnd) return all;
  return all.filter(seg => {
    if (lockStart && seg.index === 0) return false;
    if (lockEnd && seg.index >= points.length - 2) return false;
    return true;
  });
}

function insertCollinearElbowBend(
  points: WhiteboardPoint[],
  segmentIndex: number,
  axis: ElbowSegmentAxis,
  dx: number,
  dy: number,
): WhiteboardPoint[] | null {
  const a = points[segmentIndex];
  const b = points[segmentIndex + 1];
  if (axis === 'h' && Math.abs(dy) > EPS) {
    const y = a.y + dy;
    return [
      ...points.slice(0, segmentIndex + 1),
      { x: a.x, y },
      { x: b.x, y },
      ...points.slice(segmentIndex + 1),
    ];
  }
  if (axis === 'v' && Math.abs(dx) > EPS) {
    const x = a.x + dx;
    return [
      ...points.slice(0, segmentIndex + 1),
      { x, y: a.y },
      { x, y: b.y },
      ...points.slice(segmentIndex + 1),
    ];
  }
  return null;
}

/** 拖动线段中点手柄，保持正交；stub 段不可拖；结束后合并共线段 */
export function dragElbowSegment(
  points: WhiteboardPoint[],
  segmentIndex: number,
  dx: number,
  dy: number,
  opts?: ElbowSegmentDragOpts,
): WhiteboardPoint[] {
  if (segmentIndex < 0 || segmentIndex >= points.length - 1) return points;
  const { lockStart, lockEnd } = resolveElbowSegmentLocks(opts);
  if (lockStart && segmentIndex === 0) return points;
  if (lockEnd && segmentIndex >= points.length - 2) return points;

  const a = points[segmentIndex];
  const b = points[segmentIndex + 1];
  const axis = segmentAxis(a, b);
  if (!axis) return points;

  // 共线 stub 间单段：垂直/水平拖动时插入折点，避免破坏正交
  const dualStub = lockStart && lockEnd && points.length === 4 && segmentIndex === 1;
  const startStubOnly = lockStart && !lockEnd && points.length === 3 && segmentIndex === 1;
  const endStubOnly = !lockStart && lockEnd && points.length === 3 && segmentIndex === 0;
  if (
    (dualStub || startStubOnly || endStubOnly)
    && isCollinearOrthogonalPath(points)
  ) {
    const inserted = insertCollinearElbowBend(points, segmentIndex, axis, dx, dy);
    if (inserted && isOrthogonalPath(inserted)) return inserted;
  }

  const next = points.map(p => ({ ...p }));
  const na = next[segmentIndex];
  const nb = next[segmentIndex + 1];

  if (axis === 'h') {
    na.y += dy;
    nb.y += dy;
  } else {
    na.x += dx;
    nb.x += dx;
  }

  if (!isOrthogonalPath(next)) return points;

  const locked = new Set<number>();
  if (lockStart && next.length >= 3) locked.add(1);
  if (lockEnd && next.length >= 3) locked.add(next.length - 2);
  return opts?.merge === false
    ? next
    : simplifyOrthogonalPath(next, ELBOW_MERGE_EPS, {
      lockedIndices: locked.size ? locked : undefined,
    });
}
