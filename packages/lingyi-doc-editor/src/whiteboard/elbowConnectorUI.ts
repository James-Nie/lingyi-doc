import type { ConnectorElement, WhiteboardPoint } from '@lingyi-doc/core';
import { dragElbowSegment, listEditableElbowSegments, type ElbowSegmentDragOpts } from '@lingyi-doc/core';
import { WB_COLORS } from './styles';

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

export function hitElbowSegmentHandle(
  route: WhiteboardPoint[],
  pt: WhiteboardPoint,
  opts?: ElbowSegmentDragOpts,
): number | null {
  const { pillHitLong, pillHitShort } = ELBOW_HANDLE;
  let best: { index: number; dist: number } | null = null;

  for (const seg of listEditableElbowSegments(route, opts)) {
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
  return best?.index ?? null;
}

export function elbowSegmentHandleCursor(axis: 'h' | 'v'): string {
  return axis === 'h' ? 'ns-resize' : 'ew-resize';
}
