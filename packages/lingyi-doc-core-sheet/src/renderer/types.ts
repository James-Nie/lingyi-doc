import {
  CellStyle, CellCoord, CellRange,
  DEFAULT_COLUMN_WIDTH, DEFAULT_ROW_HEIGHT,
} from '@lingyi-doc/core-types';
import type { ViewportManager } from './ViewportManager';
import type { BaseRowHeaderMeta } from '../utils/rowTree';

export { BASE_THEME, applyBaseRenderConfig, resetStandardRenderConfig, getSelectTagColors, computeBaseGridWidth, computeBaseGridScreenBounds } from './baseTheme';

// DOC_COMMENT_HIGHLIGHT_* — imported from @lingyi-doc/core-types in files that need them

// ==================== 渲染层定义 ====================

export const RENDER_LAYERS = {
  BACKGROUND: 0,
  GRIDLINES: 1,
  MERGE_CELLS: 2,
  CONTENT: 3,
  SELECTION: 4,
  CURSOR: 5,
  OVERLAY: 6,
} as const;

export type LayerIndex = typeof RENDER_LAYERS[keyof typeof RENDER_LAYERS];

// ==================== 可视区域 ====================

export interface VisibleRange {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

// ==================== 渲染配置 ====================

export interface RenderConfig {
  defaultColumnWidth: number;
  defaultRowHeight: number;
  headerWidth: number;     // 行头宽度
  headerHeight: number;    // 列头高度
  scrollbarSize: number;
  zoomLevel: number;
  backgroundColor: string;
  gridColor: string;
  headerBgColor: string;
  headerTextColor: string;
  selectionColor: string;
  frozenLineColor: string;
  /** 多维表模式 */
  isBaseMode?: boolean;
  cellTextColor?: string;
  secondaryTextColor?: string;
  fontFamily?: string;
}

export const DEFAULT_RENDER_CONFIG: RenderConfig = {
  defaultColumnWidth: DEFAULT_COLUMN_WIDTH,
  defaultRowHeight: DEFAULT_ROW_HEIGHT,
  headerWidth: 46,
  headerHeight: 25,
  scrollbarSize: 12,
  zoomLevel: 1,
  backgroundColor: '#ffffff',
  gridColor: '#d4d4d4',
  headerBgColor: '#f5f5f5',
  headerTextColor: '#666666',
  selectionColor: 'rgba(74, 137, 243, 0.06)',
  frozenLineColor: '#a0a0a0',
};

/** 行/列选中样式（图1） */
export const AXIS_SELECTION = {
  border: '#4A89F3',
  fill: 'rgba(74, 137, 243, 0.06)',
  headerBg: '#E8EBF2',
  borderWidth: 2,
} as const;

/** 多维表选中样式 */
export const BASE_AXIS_SELECTION = {
  border: '#3370FF',
  fill: 'rgba(51, 112, 255, 0.06)',
  headerBg: '#E8F0FF',
  borderWidth: 2,
} as const;

export function resolveAxisSelection(isBaseMode?: boolean) {
  return isBaseMode ? BASE_AXIS_SELECTION : AXIS_SELECTION;
}

const TRANSPARENT_BG_VALUES = new Set(['transparent', 'none', '']);

function parseAlphaFromCssColor(color: string): number | null {
  const rgba = color.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgba) return null;
  const parts = rgba[1].split(',').map(part => part.trim());
  if (parts.length < 4) return null;
  const alpha = parseFloat(parts[3]);
  return Number.isFinite(alpha) ? alpha : null;
}

function isTransparentBackgroundColor(color: string | undefined): boolean {
  if (!color) return true;
  const trimmed = color.trim().toLowerCase();
  if (TRANSPARENT_BG_VALUES.has(trimmed)) return true;
  const alpha = parseAlphaFromCssColor(trimmed);
  return alpha !== null && alpha <= 0;
}

function toOpaqueCssColor(color: string): string {
  const trimmed = color.trim();
  const alpha = parseAlphaFromCssColor(trimmed);
  if (alpha === null) return trimmed;
  const rgb = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!rgb) return trimmed;
  return `rgb(${rgb[1]}, ${rgb[2]}, ${rgb[3]})`;
}

/** 解析单元格背景色；普通表格与多维表首列始终返回不透明颜色 */
export function resolveCellBackgroundFillColor(
  style: CellStyle | undefined,
  config: RenderConfig,
  coord: CellCoord,
): string {
  const custom = style?.backgroundColor;
  if (custom && !isTransparentBackgroundColor(custom)) {
    if (config.isBaseMode && coord.col > 0) return custom;
    return toOpaqueCssColor(custom);
  }
  if (!config.isBaseMode && coord.row % 2 === 0) {
    return '#fafafa';
  }
  return config.backgroundColor || '#ffffff';
}

/** 多维表行头宽度（容纳 hover 操作图标） */
export const BASE_HEADER_WIDTH = 72;

export type BaseRowHeaderAction = 'drag' | 'checkbox' | 'branchPlus' | 'collapse' | 'select';

/** 冻结列右边界（屏幕坐标，不随横向滚动变化） */
export function getFrozenPaneBoundaryX(
  viewport: ViewportManager,
  columnWidths: Map<number, number>,
  frozenCols: number,
): number {
  if (frozenCols <= 0) return viewport.config.headerWidth;
  return viewport.config.headerWidth + viewport.getFrozenWidth(columnWidths);
}

/** 冻结行下边界（屏幕坐标，不随纵向滚动变化） */
export function getFrozenPaneBoundaryY(
  viewport: ViewportManager,
  rowHeights: Map<number, number>,
  frozenRows: number,
): number {
  if (frozenRows <= 0) return viewport.config.headerHeight;
  return viewport.config.headerHeight + viewport.getFrozenHeight(rowHeights);
}

/** 将 Canvas 裁剪到可滚动区域，避免滚动内容绘制到冻结窗格上 */
export function clipCanvasToScrollablePane(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportManager,
  columnWidths: Map<number, number>,
  rowHeights: Map<number, number>,
  frozenRows: number,
  frozenCols: number,
  containerWidth: number,
  containerHeight: number,
): (() => void) | null {
  if (frozenRows === 0 && frozenCols === 0) return null;
  const frozenBoundaryX = getFrozenPaneBoundaryX(viewport, columnWidths, frozenCols);
  const frozenBoundaryY = getFrozenPaneBoundaryY(viewport, rowHeights, frozenRows);
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    frozenBoundaryX,
    frozenBoundaryY,
    Math.max(0, containerWidth - frozenBoundaryX),
    Math.max(0, containerHeight - frozenBoundaryY),
  );
  ctx.clip();
  return () => ctx.restore();
}

/**
 * 用不透明色铺满冻结行列区域（内容层），挡住滚动区文字溢出/叠绘。
 * 注意：会盖住下层样式，调用后需按单元格重绘冻结区背景。
 * 边界使用固定冻结线，不随滚动移动。
 */
export function fillFrozenPanesOpaque(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportManager,
  columnWidths: Map<number, number>,
  rowHeights: Map<number, number>,
  frozenRows: number,
  frozenCols: number,
  containerWidth: number,
  containerHeight: number,
  fillColor = '#ffffff',
): void {
  if (frozenRows === 0 && frozenCols === 0) return;
  const headerW = viewport.config.headerWidth;
  const headerH = viewport.config.headerHeight;
  const frozenBoundaryX = getFrozenPaneBoundaryX(viewport, columnWidths, frozenCols);
  const frozenBoundaryY = getFrozenPaneBoundaryY(viewport, rowHeights, frozenRows);

  ctx.fillStyle = fillColor;
  if (frozenCols > 0) {
    ctx.fillRect(
      headerW,
      headerH,
      Math.max(0, frozenBoundaryX - headerW),
      Math.max(0, containerHeight - headerH),
    );
  }
  if (frozenRows > 0) {
    ctx.fillRect(
      headerW,
      headerH,
      Math.max(0, containerWidth - headerW),
      Math.max(0, frozenBoundaryY - headerH),
    );
  }
}

/** 检测多维表行头 hover 图标点击区域 */
export function hitTestBaseRowHeader(
  relX: number,
  headerWidth: number,
  meta?: BaseRowHeaderMeta,
): BaseRowHeaderAction {
  const padding = 4;
  if (relX < padding + 16) return 'drag';
  if (relX < padding + 34) return 'checkbox';
  if (meta?.hasChildren) {
    if (relX >= padding + 10 && relX <= padding + 30) return 'collapse';
    if (relX >= padding + 38 && relX <= padding + 58) return 'collapse';
    if (relX > headerWidth - padding - 16) return 'branchPlus';
  }
  return 'select';
}

/** 检测行头树形折叠按钮 */
export function hitTestBaseRowTree(
  relX: number,
  meta: BaseRowHeaderMeta | undefined,
): 'collapse' | null {
  if (!meta?.hasChildren) return null;
  const chevronX = 4 + meta.depth * 12;
  if (relX >= chevronX - 2 && relX <= chevronX + 16) return 'collapse';
  return null;
}
