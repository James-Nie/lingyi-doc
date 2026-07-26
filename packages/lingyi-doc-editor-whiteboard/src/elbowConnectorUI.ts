import type { ConnectorElement, WhiteboardPoint } from '@lingyi-doc/core-whiteboard';
import { distanceToSegment, dragElbowSegment, listEditableElbowSegments, type ElbowSegmentDragOpts } from '@lingyi-doc/core-whiteboard';
import { WB_COLORS } from './styles';
import { screenToWorld } from './canvas/selectionUi';

export function connectorElbowSegmentOpts(conn: ConnectorElement): ElbowSegmentDragOpts {
  return {
    lockStart: Boolean(conn.startBind),
    lockEnd: Boolean(conn.endBind),
  };
}

export const ELBOW_HANDLE = {
  endpointR: 7,
  endpointHitR: 12,
  pillLong: 16,
  pillShort: 6,
  pillHitLong: 22,
  pillHitShort: 14,
  /** 整段命中屏幕阈值（px），随 zoom 换算到世界坐标 */
  segmentHitScreen: 12,
} as const;

function fillPill(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  axis: 'h' | 'v',
  color: string,
): void {
  const { pillLong, pillShort } = ELBOW_HANDLE;
  const w = axis === 'h' ? pillLong : pillShort;
  const h = axis === 'h' ? pillShort : pillLong;
  const r = Math.min(w, h) / 2;
  const x = cx - w / 2;
  const y = cy - h / 2;

  ctx.fillStyle = color;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.fill();
}

export function drawElbowConnectorHandles(
  ctx: CanvasRenderingContext2D,
  route: WhiteboardPoint[],
  accent = WB_COLORS.accent,
  opts?: ElbowSegmentDragOpts,
): void {
  const { endpointR } = ELBOW_HANDLE;

  for (const seg of listEditableElbowSegments(route, opts)) {
    fillPill(ctx, seg.midpoint.x, seg.midpoint.y, seg.axis, accent);
  }

  for (const pt of [route[0], route[route.length - 1]]) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, endpointR, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/**
 * 折线段手柄命中：优先中点 pill，整段均可命中（解决「部分线段点不中」）。
 */
export function hitElbowSegmentHandle(
  route: WhiteboardPoint[],
  pt: WhiteboardPoint,
  opts?: ElbowSegmentDragOpts,
  zoom = 1,
): number | null {
  const { pillHitLong, pillHitShort, segmentHitScreen } = ELBOW_HANDLE;
  const segs = listEditableElbowSegments(route, opts);
  let best: { index: number; dist: number } | null = null;

  // 1) 中点 pill（优先）
  for (const seg of segs) {
    const { midpoint: m, axis, index } = seg;
    const hw = axis === 'h' ? pillHitLong / 2 : pillHitShort / 2;
    const hh = axis === 'h' ? pillHitShort / 2 : pillHitLong / 2;
    if (
      pt.x >= m.x - hw && pt.x <= m.x + hw
      && pt.y >= m.y - hh && pt.y <= m.y + hh
    ) {
      const dist = Math.hypot(pt.x - m.x, pt.y - m.y);
      if (!best || dist < best.dist) best = { index, dist };
    }
  }
  if (best) return best.index;

  // 2) 整段距离命中
  const threshold = screenToWorld(segmentHitScreen, zoom);
  for (const seg of segs) {
    const a = route[seg.index];
    const b = route[seg.index + 1];
    if (!a || !b) continue;
    const dist = distanceToSegment(pt, a, b);
    if (dist <= threshold && (!best || dist < best.dist)) {
      best = { index: seg.index, dist };
    }
  }
  return best?.index ?? null;
}

export function elbowSegmentHandleCursor(axis: 'h' | 'v'): string {
  return axis === 'h' ? 'ns-resize' : 'ew-resize';
}

export { dragElbowSegment };
