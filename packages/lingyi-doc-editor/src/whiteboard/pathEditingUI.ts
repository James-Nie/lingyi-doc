import type { ConnectorPathPoint, WhiteboardPoint } from '@lingyi-doc/core';
import { resolvePathHandles } from '@lingyi-doc/core';
import { WB_COLORS } from './styles';

export const PATH_HANDLE = {
  anchorR: 7,
  anchorHitR: 12,
  handleR: 4,
  handleHitR: 8,
} as const;

export function drawCurvePathHandles(
  ctx: CanvasRenderingContext2D,
  points: ConnectorPathPoint[],
  opts?: { activeIndex?: number | null; accent?: string },
): void {
  const accent = opts?.accent ?? WB_COLORS.accent;
  const activeIndex = opts?.activeIndex ?? null;
  const handles = resolvePathHandles(points);

  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = accent;
  ctx.fillStyle = accent;

  for (let i = 0; i < handles.length; i++) {
    const { anchor, handleIn, handleOut } = handles[i];
    const showIn = i > 0;
    const showOut = i < handles.length - 1;

    if (showIn) {
      ctx.beginPath();
      ctx.moveTo(anchor.x, anchor.y);
      ctx.lineTo(handleIn.x, handleIn.y);
      ctx.stroke();
    }
    if (showOut) {
      ctx.beginPath();
      ctx.moveTo(anchor.x, anchor.y);
      ctx.lineTo(handleOut.x, handleOut.y);
      ctx.stroke();
    }

    if (showIn) {
      ctx.beginPath();
      ctx.arc(handleIn.x, handleIn.y, PATH_HANDLE.handleR, 0, Math.PI * 2);
      ctx.fill();
    }
    if (showOut) {
      ctx.beginPath();
      ctx.arc(handleOut.x, handleOut.y, PATH_HANDLE.handleR, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, PATH_HANDLE.anchorR, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = activeIndex === i ? 2.5 : 2;
    ctx.stroke();
    ctx.fillStyle = accent;
  }

  ctx.restore();
}

export function hitCurvePathVertex(
  points: ConnectorPathPoint[],
  pt: WhiteboardPoint,
): number | null {
  const { anchorHitR } = PATH_HANDLE;
  let best: { index: number; dist: number } | null = null;
  for (let i = 0; i < points.length; i++) {
    const d = Math.hypot(pt.x - points[i].x, pt.y - points[i].y);
    if (d <= anchorHitR && (!best || d < best.dist)) best = { index: i, dist: d };
  }
  return best?.index ?? null;
}

export function hitCurvePathHandle(
  points: ConnectorPathPoint[],
  pt: WhiteboardPoint,
): { index: number; which: 'in' | 'out' } | null {
  const handles = resolvePathHandles(points);
  let best: { index: number; which: 'in' | 'out'; dist: number } | null = null;
  for (let i = 0; i < handles.length; i++) {
    const { handleIn, handleOut } = handles[i];
    if (i > 0) {
      const d = Math.hypot(pt.x - handleIn.x, pt.y - handleIn.y);
      if (d <= PATH_HANDLE.handleHitR && (!best || d < best.dist)) {
        best = { index: i, which: 'in', dist: d };
      }
    }
    if (i < handles.length - 1) {
      const d = Math.hypot(pt.x - handleOut.x, pt.y - handleOut.y);
      if (d <= PATH_HANDLE.handleHitR && (!best || d < best.dist)) {
        best = { index: i, which: 'out', dist: d };
      }
    }
  }
  return best ? { index: best.index, which: best.which } : null;
}
