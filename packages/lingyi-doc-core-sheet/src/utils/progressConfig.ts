import type { CellValue } from '@lingyi-doc/core-types';

/** 进度条轨道背景（与编辑态 Ant Slider rail 对齐） */
export const PROGRESS_RAIL_BG = '#F0F0F0';

/** 按进度区间取填充色（预览 / 编辑共用） */
export function getProgressColor(progress: number): string {
  if (progress >= 100) return '#52c41a';
  if (progress >= 60) return '#1677ff';
  return '#fa8c16';
}

export function parseProgressValue(value: CellValue): number {
  if (value.type === 'number') return Math.max(0, Math.min(100, value.value));
  if (value.type === 'text') return Math.max(0, Math.min(100, parseFloat(value.text) || 0));
  return 0;
}

export interface ProgressLayout {
  paddingX: number;
  barX: number;
  barY: number;
  barWidth: number;
  railHeight: number;
  textWidth: number;
  gap: number;
  thumbRadius: number;
  /** 拇指中心相对单元格左侧的 x */
  thumbCx: number;
  thumbCy: number;
  /** 百分比文字中心 */
  textCx: number;
  textCy: number;
}

/** 计算进度条布局（画布预览与拖拽命中共用） */
export function computeProgressLayout(
  cellWidth: number,
  cellHeight: number,
  progress: number,
  zoom: number,
): ProgressLayout {
  const paddingX = 8 * zoom;
  const gap = 8 * zoom;
  const textWidth = 34 * zoom;
  const railHeight = Math.max(3, 4 * zoom);
  const thumbRadius = Math.max(5, 7 * zoom);
  const available = Math.max(0, cellWidth - paddingX * 2);
  const barWidth = Math.max(thumbRadius * 2, available - gap - textWidth);
  const barX = paddingX;
  const barY = (cellHeight - railHeight) / 2;
  const ratio = Math.max(0, Math.min(1, progress / 100));
  const thumbCx = barX + thumbRadius + (barWidth - thumbRadius * 2) * ratio;
  const thumbCy = cellHeight / 2;
  const textCx = barX + barWidth + gap + textWidth / 2;
  const textCy = cellHeight / 2;
  return {
    paddingX,
    barX,
    barY,
    barWidth,
    railHeight,
    textWidth,
    gap,
    thumbRadius,
    thumbCx,
    thumbCy,
    textCx,
    textCy,
  };
}

/** 根据相对单元格的 x 坐标换算进度（步进 1，拖拽更顺滑） */
export function progressFromCellRelX(
  relX: number,
  cellWidth: number,
  cellHeight: number,
  zoom: number,
  step = 1,
): number {
  const layout = computeProgressLayout(cellWidth, cellHeight, 0, zoom);
  const usable = Math.max(1, layout.barWidth - layout.thumbRadius * 2);
  const offset = relX - layout.barX - layout.thumbRadius;
  const raw = (Math.max(0, Math.min(usable, offset)) / usable) * 100;
  const snapped = Math.round(raw / step) * step;
  return Math.max(0, Math.min(100, snapped));
}
