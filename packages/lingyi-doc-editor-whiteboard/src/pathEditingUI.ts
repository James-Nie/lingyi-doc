import type { ConnectorPathPoint, WhiteboardPoint } from '@lingyi-doc/core-whiteboard';
import { curveSegmentMidpoints } from '@lingyi-doc/core-whiteboard';
import { WB_COLORS } from './styles';

export const PATH_HANDLE = {
  anchorR: 6.5,
  anchorHitR: 12,
  /** 路径段中点实心手柄（图2） */
  midR: 4.5,
  midHitR: 10,
  handleR: 4,
  handleHitR: 8,
} as const;

/**
 * 选中态手柄：空心锚点 + 路径上实心中点（对齐图2），不绘制离线贝塞尔控制柄。
 */
export function drawCurvePathHandles(
  ctx: CanvasRenderingContext2D,
  points: ConnectorPathPoint[],
  opts?: { activeIndex?: number | null; accent?: string },
): void {
  const accent = opts?.accent ?? WB_COLORS.accent;
  const midFill = accent === WB_COLORS.accent ? '#8eb6ff' : accent;
  const activeIndex = opts?.activeIndex ?? null;
  const mids = curveSegmentMidpoints(points);

  ctx.save();

  // 段中点：实心浅蓝点
  for (const mid of mids) {
    ctx.beginPath();
    ctx.arc(mid.x, mid.y, PATH_HANDLE.midR, 0, Math.PI * 2);
    ctx.fillStyle = midFill;
    ctx.fill();
  }

  // 锚点：白底描边空心圆
  for (let i = 0; i < points.length; i++) {
    const anchor = points[i];
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, PATH_HANDLE.anchorR, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = activeIndex === i ? 2.5 : 2;
    ctx.stroke();
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

/** 命中路径段中点手柄 → 返回段索引 */
export function hitCurvePathMidpoint(
  points: ConnectorPathPoint[],
  pt: WhiteboardPoint,
): number | null {
  const mids = curveSegmentMidpoints(points);
  let best: { index: number; dist: number } | null = null;
  for (let i = 0; i < mids.length; i++) {
    const d = Math.hypot(pt.x - mids[i].x, pt.y - mids[i].y);
    if (d <= PATH_HANDLE.midHitR && (!best || d < best.dist)) {
      best = { index: i, dist: d };
    }
  }
  return best?.index ?? null;
}

/** @deprecated 图2 交互改为中点插点；保留供高级编辑兼容 */
export function hitCurvePathHandle(
  points: ConnectorPathPoint[],
  pt: WhiteboardPoint,
): { index: number; which: 'in' | 'out' } | null {
  void points;
  void pt;
  return null;
}
