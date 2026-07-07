import type { WhiteboardPoint } from './types';

export type ElbowSegmentAxis = 'h' | 'v';

export interface ElbowSegment {
  index: number;
  axis: ElbowSegmentAxis;
  midpoint: WhiteboardPoint;
}

const EPS = 0.5;

export function segmentAxis(a: WhiteboardPoint, b: WhiteboardPoint): ElbowSegmentAxis | null {
  if (Math.abs(a.x - b.x) < EPS) return 'v';
  if (Math.abs(a.y - b.y) < EPS) return 'h';
  return null;
}

/** 默认正交折线路径（4 点 3 段，或 5 点 4 段） */
export function defaultElbowPoints(a: WhiteboardPoint, b: WhiteboardPoint): WhiteboardPoint[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) return [a, b];

  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // 终点在起点右下/左下等需要「下→横→上→横」四段
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

export function resolveElbowRoute(
  points: WhiteboardPoint[],
  start: WhiteboardPoint,
  end: WhiteboardPoint,
): WhiteboardPoint[] {
  if (points.length >= 4) {
    return [start, ...points.slice(1, -1), end];
  }
  return defaultElbowPoints(start, end);
}

export function elbowPathSegments(points: WhiteboardPoint[]): [WhiteboardPoint, WhiteboardPoint][] {
  const segs: [WhiteboardPoint, WhiteboardPoint][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    segs.push([points[i], points[i + 1]]);
  }
  return segs;
}

/** 圆角折线 SVG path */
export function elbowPathD(points: WhiteboardPoint[], cornerRadius = 10): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  const parts: string[] = [`M ${points[0].x} ${points[0].y}`];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
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

  const last = points[points.length - 1];
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

/** 拖动线段中点手柄，保持正交 */
export function dragElbowSegment(
  points: WhiteboardPoint[],
  segmentIndex: number,
  dx: number,
  dy: number,
): WhiteboardPoint[] {
  if (segmentIndex < 0 || segmentIndex >= points.length - 1) return points;

  const next = points.map(p => ({ ...p }));
  const a = next[segmentIndex];
  const b = next[segmentIndex + 1];
  const axis = segmentAxis(a, b);
  if (!axis) return points;

  if (axis === 'h') {
    a.y += dy;
    b.y += dy;
  } else {
    a.x += dx;
    b.x += dx;
  }

  return next;
}
