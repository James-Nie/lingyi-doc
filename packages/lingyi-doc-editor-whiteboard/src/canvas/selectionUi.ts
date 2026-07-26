import type React from 'react';
import { WB_COLORS } from '../styles';

/** 画布各类对象选中后的缩放控制点（屏幕像素尺寸，绘制时除以 zoom 抵消视口缩放） */
export const BOARD_SELECTION_UI = {
  /** 四角拖拽方块边长（屏幕 px，唯一尺寸源） */
  cornerSize: 10,
  cornerBorderWidth: 1.5,
  selectionLineWidth: 1,
  edgeDotOffset: 0,
  /** 角点命中区额外容差（屏幕 px） */
  resizeHitPad: 2,
} as const;

/** 屏幕像素 → 画布世界坐标（抵消 viewport.zoom） */
export function screenToWorld(px: number, zoom: number): number {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return px / z;
}

export function selectionCornerHalf(
  cornerSize: number = BOARD_SELECTION_UI.cornerSize,
): number {
  return cornerSize / 2;
}

export function selectionResizeCornerHit(
  cornerSize: number = BOARD_SELECTION_UI.cornerSize,
): number {
  return selectionCornerHalf(cornerSize) + 4;
}

export function selectionResizeEdgeHit(
  cornerSize: number = BOARD_SELECTION_UI.cornerSize,
): number {
  return selectionCornerHalf(cornerSize) + 4;
}

export function selectionEdgeDotR(
  cornerSize: number = BOARD_SELECTION_UI.cornerSize,
): number {
  return cornerSize * 0.45;
}

/** 在画布上绘制四角方形缩放控制点（大小不随 zoom 变化） */
export function drawResizeCornerHandle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  accent: string = WB_COLORS.accent,
  zoom = 1,
): void {
  const half = screenToWorld(selectionCornerHalf(), zoom);
  const border = screenToWorld(BOARD_SELECTION_UI.cornerBorderWidth, zoom);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - half, y - half, half * 2, half * 2);
  ctx.strokeStyle = accent;
  ctx.lineWidth = border;
  ctx.strokeRect(x - half, y - half, half * 2, half * 2);
}

/** DOM 覆盖层缩放控制点样式 */
export function resizeHandleDomStyle(accent: string = WB_COLORS.accent): React.CSSProperties {
  const { cornerSize, cornerBorderWidth } = BOARD_SELECTION_UI;
  return {
    width: cornerSize,
    height: cornerSize,
    borderRadius: 2,
    background: '#fff',
    border: `${cornerBorderWidth}px solid ${accent}`,
    boxSizing: 'border-box',
  };
}

/** 角点居中贴边时的 CSS 偏移（负半宽） */
export function resizeHandleEdgeOffset(): number {
  return -selectionCornerHalf();
}
