import type { ResizeHandle } from '../viewportUtils';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AlignmentGuide {
  kind: 'align' | 'spacing' | 'size';
  axis: 'x' | 'y';
  pos: number;
  start: number;
  end: number;
  /** 等距辅助：orient=h 为水平间距，from/to 为间距两端坐标，cross 为标注线位置 */
  spacing?: { orient: 'h' | 'v'; from: number; to: number; cross: number };
  /** 尺寸一致：w 或 h */
  sizeDim?: 'w' | 'h';
}

export interface SnapBoxResult {
  box: Box;
  guides: AlignmentGuide[];
}

const DEFAULT_THRESHOLD = 6;
const MIN_SIZE = 24;

function effectiveThreshold(zoom = 1): number {
  return DEFAULT_THRESHOLD / Math.max(zoom, 0.1);
}

type Axis = 'x' | 'y';

function axisEdges(box: Box, axis: Axis): number[] {
  if (axis === 'x') {
    return [box.x, box.x + box.w, box.x + box.w / 2];
  }
  return [box.y, box.y + box.h, box.y + box.h / 2];
}

function axisSpan(box: Box, axis: Axis): [number, number] {
  if (axis === 'x') return [box.y, box.y + box.h];
  return [box.x, box.x + box.w];
}

function overlap1D(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && a1 > b0;
}

function overlapMid(a0: number, a1: number, b0: number, b1: number): number {
  return (Math.max(a0, b0) + Math.min(a1, b1)) / 2;
}

function mergeGuide(
  guides: AlignmentGuide[],
  axis: Axis,
  pos: number,
  boxes: Box[],
  kind: AlignmentGuide['kind'] = 'align',
  sizeDim?: 'w' | 'h',
): void {
  let start = Infinity;
  let end = -Infinity;
  for (const b of boxes) {
    const [s, e] = axisSpan(b, axis);
    start = Math.min(start, s);
    end = Math.max(end, e);
  }
  const pad = 8;
  const existing = guides.find(
    g => g.kind === kind && g.axis === axis && Math.abs(g.pos - pos) < 0.5,
  );
  if (existing) {
    existing.start = Math.min(existing.start, start - pad);
    existing.end = Math.max(existing.end, end + pad);
    return;
  }
  guides.push({
    kind,
    axis,
    pos,
    start: start - pad,
    end: end + pad,
    sizeDim,
  });
}

function addSpacingGuide(
  guides: AlignmentGuide[],
  orient: 'h' | 'v',
  from: number,
  to: number,
  cross: number,
): void {
  const dup = guides.some(
    g => g.kind === 'spacing'
      && g.spacing?.orient === orient
      && Math.abs(g.spacing.from - from) < 1
      && Math.abs(g.spacing.to - to) < 1,
  );
  if (dup) return;
  guides.push({
    kind: 'spacing',
    axis: orient === 'h' ? 'y' : 'x',
    pos: cross,
    start: from,
    end: to,
    spacing: { orient, from, to, cross },
  });
}

function snapAxisPosition(
  box: Box,
  refs: Box[],
  axis: Axis,
  threshold: number,
): { delta: number; guides: AlignmentGuide[] } {
  const guides: AlignmentGuide[] = [];
  const moving = axisEdges(box, axis);
  let bestDelta = Infinity;
  const matches: { pos: number; ref: Box }[] = [];

  for (const ref of refs) {
    const refVals = axisEdges(ref, axis);
    for (const m of moving) {
      for (const r of refVals) {
        const delta = r - m;
        if (Math.abs(delta) > threshold) continue;
        if (Math.abs(delta) < Math.abs(bestDelta)) {
          bestDelta = delta;
          matches.length = 0;
          matches.push({ pos: r, ref });
        } else if (Math.abs(delta) === Math.abs(bestDelta)) {
          matches.push({ pos: r, ref });
        }
      }
    }
  }

  if (!Number.isFinite(bestDelta) || Math.abs(bestDelta) > threshold) {
    return { delta: 0, guides };
  }

  const snapped = { ...box };
  if (axis === 'x') snapped.x += bestDelta;
  else snapped.y += bestDelta;

  for (const m of matches) {
    mergeGuide(guides, axis, m.pos, [snapped, m.ref]);
  }

  return { delta: bestDelta, guides };
}

function snapAxisSize(
  box: Box,
  refs: Box[],
  axis: Axis,
  threshold: number,
): { delta: number; guides: AlignmentGuide[] } {
  const guides: AlignmentGuide[] = [];
  const maxEdge = axis === 'x' ? box.x + box.w : box.y + box.h;
  let bestDelta = Infinity;
  const matches: { pos: number; ref: Box }[] = [];

  for (const ref of refs) {
    for (const r of axisEdges(ref, axis)) {
      const delta = r - maxEdge;
      if (Math.abs(delta) > threshold) continue;
      if (Math.abs(delta) < Math.abs(bestDelta)) {
        bestDelta = delta;
        matches.length = 0;
        matches.push({ pos: r, ref });
      } else if (Math.abs(delta) === Math.abs(bestDelta)) {
        matches.push({ pos: r, ref });
      }
    }
  }

  if (!Number.isFinite(bestDelta) || Math.abs(bestDelta) > threshold) {
    return { delta: 0, guides };
  }

  const snapped = { ...box };
  if (axis === 'x') snapped.w = Math.max(MIN_SIZE, snapped.w + bestDelta);
  else snapped.h = Math.max(MIN_SIZE, snapped.h + bestDelta);

  for (const m of matches) {
    mergeGuide(guides, axis, m.pos, [snapped, m.ref]);
  }

  return { delta: bestDelta, guides };
}

function hGap(left: Box, right: Box): number | null {
  if (!overlap1D(left.y, left.y + left.h, right.y, right.y + right.h)) return null;
  const g = right.x - (left.x + left.w);
  return g >= 0 ? g : null;
}

function vGap(top: Box, bottom: Box): number | null {
  if (!overlap1D(top.x, top.x + top.w, bottom.x, bottom.x + bottom.w)) return null;
  const g = bottom.y - (top.y + top.h);
  return g >= 0 ? g : null;
}

/** 收集等距辅助线（含吸附后的盒子） */
function collectEqualSpacingGuides(boxes: Box[], threshold: number): AlignmentGuide[] {
  const guides: AlignmentGuide[] = [];

  const hClusters: Box[][] = [];
  for (const box of boxes) {
    let cluster = hClusters.find(c => c.some(b => overlap1D(b.y, b.y + b.h, box.y, box.y + box.h)));
    if (cluster) cluster.push(box);
    else hClusters.push([box]);
  }

  for (const cluster of hClusters) {
    const sorted = [...cluster].sort((a, b) => a.x - b.x);
    const gaps: { g: number; from: number; to: number; cross: number }[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const g = hGap(sorted[i], sorted[i + 1]);
      if (g == null) continue;
      gaps.push({
        g,
        from: sorted[i].x + sorted[i].w,
        to: sorted[i + 1].x,
        cross: overlapMid(sorted[i].y, sorted[i].y + sorted[i].h, sorted[i + 1].y, sorted[i + 1].y + sorted[i + 1].h),
      });
    }
    for (let i = 0; i < gaps.length; i++) {
      for (let j = i + 1; j < gaps.length; j++) {
        if (Math.abs(gaps[i].g - gaps[j].g) <= threshold) {
          addSpacingGuide(guides, 'h', gaps[i].from, gaps[i].to, gaps[i].cross);
          addSpacingGuide(guides, 'h', gaps[j].from, gaps[j].to, gaps[j].cross);
        }
      }
    }
  }

  const vClusters: Box[][] = [];
  for (const box of boxes) {
    let cluster = vClusters.find(c => c.some(b => overlap1D(b.x, b.x + b.w, box.x, box.x + box.w)));
    if (cluster) cluster.push(box);
    else vClusters.push([box]);
  }

  for (const cluster of vClusters) {
    const sorted = [...cluster].sort((a, b) => a.y - b.y);
    const gaps: { g: number; from: number; to: number; cross: number }[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const g = vGap(sorted[i], sorted[i + 1]);
      if (g == null) continue;
      gaps.push({
        g,
        from: sorted[i].y + sorted[i].h,
        to: sorted[i + 1].y,
        cross: overlapMid(sorted[i].x, sorted[i].x + sorted[i].w, sorted[i + 1].x, sorted[i + 1].x + sorted[i + 1].w),
      });
    }
    for (let i = 0; i < gaps.length; i++) {
      for (let j = i + 1; j < gaps.length; j++) {
        if (Math.abs(gaps[i].g - gaps[j].g) <= threshold) {
          addSpacingGuide(guides, 'v', gaps[i].from, gaps[i].to, gaps[i].cross);
          addSpacingGuide(guides, 'v', gaps[j].from, gaps[j].to, gaps[j].cross);
        }
      }
    }
  }

  return guides;
}

/** 等距吸附：将移动盒置于两参考盒之间居中，或匹配已有间距 */
function snapEqualSpacing(
  box: Box,
  refs: Box[],
  threshold: number,
): { box: Box; guides: AlignmentGuide[] } {
  let best: { box: Box; score: number } | null = null;

  for (let i = 0; i < refs.length; i++) {
    for (let j = i + 1; j < refs.length; j++) {
      const a = refs[i];
      const b = refs[j];
      const left = a.x <= b.x ? a : b;
      const right = a.x <= b.x ? b : a;
      const total = right.x - (left.x + left.w);
      if (total < box.w) continue;
      if (!overlap1D(left.y, left.y + left.h, box.y, box.y + box.h)
        && !overlap1D(right.y, right.y + right.h, box.y, box.y + box.h)) {
        continue;
      }
      const idealX = left.x + left.w + (total - box.w) / 2;
      const delta = idealX - box.x;
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < best.score)) {
        best = { box: { ...box, x: idealX }, score: Math.abs(delta) };
      }
    }
  }

  const refHGaps: number[] = [];
  for (let i = 0; i < refs.length; i++) {
    for (let j = i + 1; j < refs.length; j++) {
      const g = hGap(refs[i], refs[j]);
      if (g != null && g > 0) refHGaps.push(g);
    }
  }

  for (const ref of refs) {
    if (ref.x + ref.w <= box.x && overlap1D(ref.y, ref.y + ref.h, box.y, box.y + box.h)) {
      for (const g of refHGaps) {
        const idealX = ref.x + ref.w + g;
        const delta = idealX - box.x;
        if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < best.score)) {
          best = { box: { ...box, x: idealX }, score: Math.abs(delta) };
        }
      }
    }
    if (box.x + box.w <= ref.x && overlap1D(ref.y, ref.y + ref.h, box.y, box.y + box.h)) {
      for (const g of refHGaps) {
        const idealX = ref.x - g - box.w;
        const delta = idealX - box.x;
        if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < best.score)) {
          best = { box: { ...box, x: idealX }, score: Math.abs(delta) };
        }
      }
    }
  }

  const refVGaps: number[] = [];
  for (let i = 0; i < refs.length; i++) {
    for (let j = i + 1; j < refs.length; j++) {
      const g = vGap(refs[i], refs[j]);
      if (g != null && g > 0) refVGaps.push(g);
    }
  }

  let result = best?.box ?? box;

  for (const ref of refs) {
    if (ref.y + ref.h <= box.y && overlap1D(ref.x, ref.x + ref.w, box.x, box.x + box.w)) {
      for (const g of refVGaps) {
        const idealY = ref.y + ref.h + g;
        const delta = idealY - result.y;
        if (Math.abs(delta) <= threshold) {
          result = { ...result, y: idealY };
        }
      }
    }
    if (result.y + result.h <= ref.y && overlap1D(ref.x, ref.x + ref.w, box.x, box.x + box.w)) {
      for (const g of refVGaps) {
        const idealY = ref.y - g - result.h;
        const delta = idealY - result.y;
        if (Math.abs(delta) <= threshold) {
          result = { ...result, y: idealY };
        }
      }
    }
  }

  for (let i = 0; i < refs.length; i++) {
    for (let j = i + 1; j < refs.length; j++) {
      const a = refs[i];
      const b = refs[j];
      const top = a.y <= b.y ? a : b;
      const bottom = a.y <= b.y ? b : a;
      const total = bottom.y - (top.y + top.h);
      if (total < result.h) continue;
      if (!overlap1D(top.x, top.x + top.w, result.x, result.x + result.w)
        && !overlap1D(bottom.x, bottom.x + bottom.w, result.x, result.x + result.w)) {
        continue;
      }
      const idealY = top.y + top.h + (total - result.h) / 2;
      const delta = idealY - result.y;
      if (Math.abs(delta) <= threshold) {
        result = { ...result, y: idealY };
      }
    }
  }

  const allBoxes = [...refs, result];
  const guides = collectEqualSpacingGuides(allBoxes, threshold);
  return { box: result, guides };
}

/** 移动元素：位置对齐 + 等距吸附 */
export function snapBoxPosition(
  box: Box,
  refs: Box[],
  threshold = DEFAULT_THRESHOLD,
  zoom = 1,
): SnapBoxResult {
  if (!refs.length) return { box, guides: [] };
  const t = threshold === DEFAULT_THRESHOLD ? effectiveThreshold(zoom) : threshold;

  const snapX = snapAxisPosition(box, refs, 'x', t);
  const afterX = { ...box, x: box.x + snapX.delta };
  const snapY = snapAxisPosition(afterX, refs, 'y', t);
  const aligned = { ...afterX, y: afterX.y + snapY.delta };

  const spacing = snapEqualSpacing(aligned, refs, t);

  return {
    box: spacing.box,
    guides: [...snapX.guides, ...snapY.guides, ...spacing.guides],
  };
}

/** 创建预览：位置 + 右/下边对齐 */
export function snapBoxBounds(
  box: Box,
  refs: Box[],
  threshold = DEFAULT_THRESHOLD,
  zoom = 1,
): SnapBoxResult {
  if (!refs.length) return { box, guides: [] };
  const t = threshold === DEFAULT_THRESHOLD ? effectiveThreshold(zoom) : threshold;

  const pos = snapBoxPosition(box, refs, t, zoom);
  let current = pos.box;
  const guides = [...pos.guides];

  const snapRight = snapAxisSize(current, refs, 'x', t);
  if (snapRight.delta !== 0) {
    current = { ...current, w: Math.max(MIN_SIZE, current.w + snapRight.delta) };
    guides.push(...snapRight.guides);
  }

  const snapBottom = snapAxisSize(current, refs, 'y', t);
  if (snapBottom.delta !== 0) {
    current = { ...current, h: Math.max(MIN_SIZE, current.h + snapBottom.delta) };
    guides.push(...snapBottom.guides);
  }

  return { box: current, guides };
}

/** 缩放时：边缘对齐 + 宽/高与其他图形一致 */
export function snapResizeBox(
  box: Box,
  handle: ResizeHandle,
  refs: Box[],
  threshold = DEFAULT_THRESHOLD,
  zoom = 1,
): SnapBoxResult {
  if (!refs.length) return { box, guides: [] };
  const t = threshold === DEFAULT_THRESHOLD ? effectiveThreshold(zoom) : threshold;
  let current = { ...box };
  const guides: AlignmentGuide[] = [];

  const affectsW = handle.includes('e') || handle.includes('w');
  const affectsH = handle.includes('n') || handle.includes('s');

  if (affectsW) {
    for (const ref of refs) {
      if (Math.abs(current.w - ref.w) > t) continue;
      if (handle.includes('e')) {
        current.w = ref.w;
      } else if (handle.includes('w')) {
        const right = current.x + current.w;
        current.w = ref.w;
        current.x = right - ref.w;
      }
      mergeGuide(guides, 'x', current.x + current.w, [current, ref], 'size', 'w');
      mergeGuide(guides, 'x', current.x, [current, ref], 'size', 'w');
    }
  }

  if (affectsH) {
    for (const ref of refs) {
      if (Math.abs(current.h - ref.h) > t) continue;
      if (handle.includes('s')) {
        current.h = ref.h;
      } else if (handle.includes('n')) {
        const bottom = current.y + current.h;
        current.h = ref.h;
        current.y = bottom - ref.h;
      }
      mergeGuide(guides, 'y', current.y + current.h, [current, ref], 'size', 'h');
      mergeGuide(guides, 'y', current.y, [current, ref], 'size', 'h');
    }
  }

  if (handle.includes('e')) {
    const snap = snapAxisSize(current, refs, 'x', t);
    if (snap.delta !== 0) {
      current = { ...current, w: Math.max(MIN_SIZE, current.w + snap.delta) };
      guides.push(...snap.guides);
    }
  }
  if (handle.includes('s')) {
    const snap = snapAxisSize(current, refs, 'y', t);
    if (snap.delta !== 0) {
      current = { ...current, h: Math.max(MIN_SIZE, current.h + snap.delta) };
      guides.push(...snap.guides);
    }
  }
  if (handle.includes('w')) {
    const right = current.x + current.w;
    for (const ref of refs) {
      for (const r of axisEdges(ref, 'x')) {
        const delta = r - current.x;
        if (Math.abs(delta) <= t) {
          current.x = r;
          current.w = Math.max(MIN_SIZE, right - r);
          mergeGuide(guides, 'x', r, [current, ref]);
        }
      }
    }
  }
  if (handle.includes('n')) {
    const bottom = current.y + current.h;
    for (const ref of refs) {
      for (const r of axisEdges(ref, 'y')) {
        const delta = r - current.y;
        if (Math.abs(delta) <= t) {
          current.y = r;
          current.h = Math.max(MIN_SIZE, bottom - r);
          mergeGuide(guides, 'y', r, [current, ref]);
        }
      }
    }
  }

  return { box: current, guides };
}

export function unionBounds(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function isAlignableElementType(type: string): boolean {
  return type !== 'connector' && type !== 'pen';
}
