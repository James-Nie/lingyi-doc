import {
  CellData, CellStyle, CellCoord, coordToKey,
  DEFAULT_CELL_STYLE, DEFAULT_COLUMN_WIDTH, DEFAULT_ROW_HEIGHT,
  CellRange, SheetModel, getCellText, getCellAlign, ColumnDef, DataValidation,
} from '../types/index';
import { resolveColumnWidth } from '../utils/columnLayout';
import { resolveRowHeight, isRowLayoutHidden } from '../utils/rowLayout';
import type { BaseRowHeaderMeta, RecordTreeColumnMeta } from '../utils/rowTree';
import { getTreeContentRect } from '../utils/rowTree';
import { BASE_THEME, getSelectTagColors, computeBaseGridWidth, computeBaseGridScreenBounds } from './baseTheme';
import { findSelectOption, parseMultiSelectOptionIds } from '../utils/selectOptions';
import { cellValueIncludeTime, formatFreeformDateCellText } from '../utils/dateValidation';

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

export { BASE_THEME, applyBaseRenderConfig, resetStandardRenderConfig, getSelectTagColors, computeBaseGridWidth, computeBaseGridScreenBounds } from './baseTheme';

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

function resolveAxisSelection(isBaseMode?: boolean) {
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
  const frozenBoundaryX = viewport.config.headerWidth + viewport.getFrozenWidth(columnWidths);
  const frozenBoundaryY = viewport.getRowScreenTop(frozenRows, rowHeights);
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

/** 多维表行头宽度（容纳 hover 操作图标） */
export const BASE_HEADER_WIDTH = 72;

export type BaseRowHeaderAction = 'drag' | 'checkbox' | 'branchPlus' | 'collapse' | 'select';

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

// ==================== ViewportManager ====================

export class ViewportManager {
  private _scrollTop = 0;
  private _scrollLeft = 0;
  private _zoomLevel: number;
  private _config: RenderConfig;
  private _freezeState: { frozenRows: number; frozenCols: number } = { frozenRows: 0, frozenCols: 0 };

  constructor(config: Partial<RenderConfig> = {}) {
    this._config = { ...DEFAULT_RENDER_CONFIG, ...config };
    this._zoomLevel = this._config.zoomLevel;
  }

  get scrollTop(): number { return this._scrollTop; }
  get scrollLeft(): number { return this._scrollLeft; }
  get zoomLevel(): number { return this._zoomLevel; }
  get config(): RenderConfig { return this._config; }
  get freezeState(): { frozenRows: number; frozenCols: number } { return this._freezeState; }

  setFreezeState(state: { frozenRows: number; frozenCols: number }): void {
    this._freezeState = state;
  }

  setScrollPosition(
    scrollTop: number,
    scrollLeft: number,
    clamp?: {
      canvasWidth: number;
      canvasHeight: number;
      rowCount: number;
      colCount: number;
      columnWidths: Map<number, number>;
      rowHeights: Map<number, number>;
      /** 内容区底部额外可滚动高度（如普通表格「添加行」栏） */
      extraScrollBottom?: number;
    },
  ): void {
    let top = Math.max(0, scrollTop);
    let left = Math.max(0, scrollLeft);
    if (clamp) {
      const { maxTop, maxLeft } = this.getMaxScroll(
        clamp.canvasWidth,
        clamp.canvasHeight,
        clamp.rowCount,
        clamp.colCount,
        clamp.columnWidths,
        clamp.rowHeights,
        clamp.extraScrollBottom ?? 0,
      );
      top = Math.min(maxTop, top);
      left = Math.min(maxLeft, left);
    }
    this._scrollTop = top;
    this._scrollLeft = left;
  }

  /** 计算滚动上限（内容不足一屏时为 0） */
  getMaxScroll(
    canvasWidth: number,
    canvasHeight: number,
    rowCount: number,
    colCount: number,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    extraScrollBottom = 0,
  ): { maxTop: number; maxLeft: number } {
    const contentHeight = Math.max(0, canvasHeight - this._config.headerHeight);
    const contentWidth = Math.max(0, canvasWidth - this._config.headerWidth);

    let totalRowH = 0;
    for (let r = 0; r < rowCount; r++) {
      totalRowH += resolveRowHeight(r, rowHeights, this._config.defaultRowHeight) * this._zoomLevel;
    }
    const maxTop = Math.max(0, totalRowH + extraScrollBottom - contentHeight);

    const frozenWidth = this.getFrozenWidth(columnWidths);
    const frozenCols = this._freezeState.frozenCols;
    let totalScrollableColW = 0;
    for (let c = frozenCols; c < colCount; c++) {
      totalScrollableColW += resolveColumnWidth(c, columnWidths, this._config.defaultColumnWidth) * this._zoomLevel;
    }
    if (this._config.isBaseMode) {
      totalScrollableColW += BASE_THEME.addColumnWidth;
    }
    const scrollableViewportW = Math.max(0, contentWidth - frozenWidth);
    const maxLeft = Math.max(0, totalScrollableColW - scrollableViewportW);

    const frozenHeight = this.getFrozenHeight(rowHeights);
    const frozenRows = this._freezeState.frozenRows;
    let totalScrollableRowH = 0;
    for (let r = frozenRows; r < rowCount; r++) {
      totalScrollableRowH += resolveRowHeight(r, rowHeights, this._config.defaultRowHeight) * this._zoomLevel;
    }
    const scrollableViewportH = Math.max(0, contentHeight - frozenHeight);
    const maxTopFrozen = Math.max(0, totalScrollableRowH + extraScrollBottom - scrollableViewportH);

    return { maxTop: frozenRows > 0 ? maxTopFrozen : maxTop, maxLeft };
  }

  /** 将当前滚动位置限制在合法范围内 */
  clampScrollToBounds(
    canvasWidth: number,
    canvasHeight: number,
    rowCount: number,
    colCount: number,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    extraScrollBottom = 0,
  ): void {
    this.setScrollPosition(this._scrollTop, this._scrollLeft, {
      canvasWidth,
      canvasHeight,
      rowCount,
      colCount,
      columnWidths,
      rowHeights,
      extraScrollBottom,
    });
  }

  /** 冻结列总宽度（内容区，不含行头） */
  getFrozenWidth(columnWidths: Map<number, number>): number {
    let w = 0;
    for (let c = 0; c < this._freezeState.frozenCols; c++) {
      w += resolveColumnWidth(c, columnWidths, this._config.defaultColumnWidth) * this._zoomLevel;
    }
    return w;
  }

  /** 冻结行总高度（内容区，不含列头） */
  getFrozenHeight(rowHeights: Map<number, number>): number {
    let h = 0;
    for (let r = 0; r < this._freezeState.frozenRows; r++) {
      h += resolveRowHeight(r, rowHeights, this._config.defaultRowHeight) * this._zoomLevel;
    }
    return h;
  }

  /** 行在内容区的绝对 Y（未减 scrollTop） */
  getRowContentY(row: number, rowHeights: Map<number, number>): number {
    let y = 0;
    for (let r = 0; r < row; r++) {
      y += resolveRowHeight(r, rowHeights, this._config.defaultRowHeight) * this._zoomLevel;
    }
    return y;
  }

  /** 行在 Canvas 上的顶边 Y */
  getRowScreenTop(row: number, rowHeights: Map<number, number>): number {
    const frozenRows = this._freezeState.frozenRows;
    const frozenHeight = this.getFrozenHeight(rowHeights);
    if (row < frozenRows) {
      return this._config.headerHeight + this.getRowContentY(row, rowHeights);
    }
    const scrollableY = this.getRowContentY(row, rowHeights) - this.getRowContentY(frozenRows, rowHeights);
    return this._config.headerHeight + frozenHeight + scrollableY - this._scrollTop;
  }

  /** 将 Canvas 内容区 Y 转为绝对内容 Y（用于 hitTest） */
  contentYFromScreen(screenY: number, rowHeights: Map<number, number>): number {
    const relY = screenY - this._config.headerHeight;
    const frozenHeight = this.getFrozenHeight(rowHeights);
    if (relY < frozenHeight) return relY;
    return relY + this._scrollTop;
  }

  /** 列在内容区的绝对 X（未减 scrollLeft） */
  getColumnContentX(col: number, columnWidths: Map<number, number>): number {
    let x = 0;
    for (let c = 0; c < col; c++) {
      x += resolveColumnWidth(c, columnWidths, this._config.defaultColumnWidth) * this._zoomLevel;
    }
    return x;
  }

  /** 列在 Canvas 上的左边缘 X */
  getColumnScreenLeft(col: number, columnWidths: Map<number, number>): number {
    const frozenCols = this._freezeState.frozenCols;
    const frozenWidth = this.getFrozenWidth(columnWidths);
    if (col < frozenCols) {
      return this._config.headerWidth + this.getColumnContentX(col, columnWidths);
    }
    const scrollableX = this.getColumnContentX(col, columnWidths) - this.getColumnContentX(frozenCols, columnWidths);
    return this._config.headerWidth + frozenWidth + scrollableX - this._scrollLeft;
  }

  /** 将 Canvas 内容区 X 转为绝对内容 X（用于 hitTest） */
  contentXFromScreen(screenX: number, columnWidths: Map<number, number>): number {
    const relX = screenX - this._config.headerWidth;
    const frozenWidth = this.getFrozenWidth(columnWidths);
    if (relX < frozenWidth) return relX;
    return relX + this._scrollLeft;
  }

  /** 获取内容总尺寸（包含表头） */
  getTotalContentSize(
    rowCount: number,
    colCount: number,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
  ): { width: number; height: number } {
    let totalW = this._config.headerWidth;
    for (let c = 0; c < colCount; c++) {
      totalW += resolveColumnWidth(c, columnWidths, this._config.defaultColumnWidth) * this._zoomLevel;
    }
    if (this._config.isBaseMode) {
      totalW += BASE_THEME.addColumnWidth;
    }
    let totalH = this._config.headerHeight;
    for (let r = 0; r < rowCount; r++) {
      totalH += resolveRowHeight(r, rowHeights, this._config.defaultRowHeight) * this._zoomLevel;
    }
    return { width: totalW, height: totalH };
  }

  setZoomLevel(level: number): void {
    this._zoomLevel = Math.max(0.5, Math.min(3.0, level));
  }

  /** 计算当前可视区域内的行列范围 */
  calculateVisibleRange(
    canvasWidth: number,
    canvasHeight: number,
    rowCount: number,
    colCount: number,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
  ): VisibleRange {
    const contentWidth = canvasWidth - this._config.headerWidth;
    const contentHeight = canvasHeight - this._config.headerHeight;
    const frozenRows = this._freezeState.frozenRows;

    // 计算可见行范围（冻结行始终可见）
    let scrollStartRow = frozenRows;
    let accumY = 0;
    for (let r = frozenRows; r < rowCount; r++) {
      const h = resolveRowHeight(r, rowHeights, this._config.defaultRowHeight) * this._zoomLevel;
      if (accumY + h < this._scrollTop) {
        scrollStartRow = r + 1;
      }
      accumY += h;
    }

    let endRow = rowCount - 1;
    accumY = 0;
    for (let r = scrollStartRow; r < rowCount; r++) {
      const h = resolveRowHeight(r, rowHeights, this._config.defaultRowHeight) * this._zoomLevel;
      accumY += h;
      endRow = r;
      if (accumY >= contentHeight - this.getFrozenHeight(rowHeights) + this._scrollTop) break;
    }

    const startRow = frozenRows > 0 ? 0 : Math.max(0, scrollStartRow - 5);

    // 计算可见列范围（冻结列始终可见）
    const frozenCols = this._freezeState.frozenCols;
    let startCol = frozenCols;
    let endCol = colCount - 1;

    let accumX = 0;
    for (let c = frozenCols; c < colCount; c++) {
      const w = resolveColumnWidth(c, columnWidths, this._config.defaultColumnWidth) * this._zoomLevel;
      if (accumX + w < this._scrollLeft) {
        startCol = c + 1;
      }
      accumX += w;
    }

    accumX = 0;
    for (let c = startCol; c < colCount; c++) {
      const w = resolveColumnWidth(c, columnWidths, this._config.defaultColumnWidth) * this._zoomLevel;
      accumX += w;
      endCol = c;
      if (accumX >= contentWidth - this.getFrozenWidth(columnWidths) + this._scrollLeft) break;
    }

    // 缓冲区：上下左右各多加 5 个单元格
    return {
      startRow,
      endRow: Math.min(rowCount - 1, endRow + 5),
      startCol: 0,
      endCol: Math.min(colCount - 1, endCol + 5),
    };
  }

  /** 获取单元格在 Canvas 上的像素矩形 */
  getCellRect(
    coord: CellCoord,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
  ): { x: number; y: number; width: number; height: number } {
    const x = this.getColumnScreenLeft(coord.col, columnWidths);
    const y = this.getRowScreenTop(coord.row, rowHeights);
    const width = resolveColumnWidth(coord.col, columnWidths, this._config.defaultColumnWidth) * this._zoomLevel;
    const height = resolveRowHeight(coord.row, rowHeights, this._config.defaultRowHeight) * this._zoomLevel;

    return { x, y, width, height };
  }

  /** 根据像素坐标定位单元格（自动处理合并区域 → 返回主格坐标） */
  hitTest(
    clientX: number,
    clientY: number,
    canvasRect: DOMRect,
    rowCount: number,
    colCount: number,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    mergeRanges?: CellRange[],
  ): CellCoord | null {
    // 转为内容区坐标（冻结列不受 scrollLeft 影响）
    const x = this.contentXFromScreen(clientX - canvasRect.left, columnWidths);
    const y = this.contentYFromScreen(clientY - canvasRect.top, rowHeights);

    if (x < 0 || y < 0) return null;
    if (colCount <= 0 || rowCount <= 0) return null;

    let col: number | null = null;
    let accumX = 0;
    for (let c = 0; c < colCount; c++) {
      accumX += resolveColumnWidth(c, columnWidths, this._config.defaultColumnWidth) * this._zoomLevel;
      if (accumX > x) { col = c; break; }
    }
    if (col === null) return null;

    let row: number | null = null;
    let accumY = 0;
    for (let r = 0; r < rowCount; r++) {
      accumY += resolveRowHeight(r, rowHeights, this._config.defaultRowHeight) * this._zoomLevel;
      if (accumY > y) { row = r; break; }
    }
    if (row === null) return null;

    // 合并区域修正：点在合并子格内 → 返回主格坐标
    if (mergeRanges) {
      for (const range of mergeRanges) {
        if (row >= range.start.row && row <= range.end.row &&
            col >= range.start.col && col <= range.end.col) {
          const master = range.master || range.start;
          return { row: master.row, col: master.col };
        }
      }
    }

    return { row, col };
  }

  /** Test if a point is on a column resize handle */
  hitTestColumnResize(
    clientX: number,
    canvasRect: DOMRect,
    colCount: number,
    columnWidths: Map<number, number>,
  ): number | null {  // returns the column index BEFORE the handle
    const x = this.contentXFromScreen(clientX - canvasRect.left, columnWidths);
    let accumX = 0;

    for (let c = 0; c <= colCount; c++) {
      accumX += resolveColumnWidth(c, columnWidths, this._config.defaultColumnWidth) * this._zoomLevel;
      if (Math.abs(x - accumX) < 6 * this._zoomLevel) {
        return c;
      }
    }
    return null;
  }

  /** Test if a point is on a row resize handle */
  hitTestRowResize(
    clientY: number,
    canvasRect: DOMRect,
    rowCount: number,
    rowHeights: Map<number, number>,
  ): number | null {  // returns the row index BEFORE the handle
    const y = this.contentYFromScreen(clientY - canvasRect.top, rowHeights);
    let accumY = 0;

    for (let r = 0; r <= rowCount; r++) {
      accumY += resolveRowHeight(r, rowHeights, this._config.defaultRowHeight) * this._zoomLevel;
      if (Math.abs(y - accumY) < 6 * this._zoomLevel) {
        return r;
      }
    }
    return null;
  }

  /** Test if a point is on a column header (to select entire column) */
  hitTestColumnHeader(
    clientX: number,
    clientY: number,
    canvasRect: DOMRect,
  ): number | null {
    const inHeaderY = (clientY - canvasRect.top) >= 0 && (clientY - canvasRect.top) < this._config.headerHeight;
    if (!inHeaderY) return null;

    const x = clientX - canvasRect.left - this._config.headerWidth + this._scrollLeft;
    if (x < 0) return null; // Clicked on corner or row header area

    return null; // We'll resolve the actual column in handleMouseDown
  }

  /** Find which column header was clicked (returns column index) */
  findColumnAtX(
    clientX: number,
    canvasRect: DOMRect,
    colCount: number,
    columnWidths: Map<number, number>,
  ): number | null {
    const x = this.contentXFromScreen(clientX - canvasRect.left, columnWidths);
    if (x < 0) return null;

    let accumX = 0;
    for (let c = 0; c < colCount; c++) {
      accumX += resolveColumnWidth(c, columnWidths, this._config.defaultColumnWidth) * this._zoomLevel;
      if (accumX > x) return c;
    }
    return null;
  }

  /** 检测列头筛选图标点击区域（仅已开启筛选图标的列可点击） */
  hitTestColumnFilterIcon(
    clientX: number,
    clientY: number,
    canvasRect: DOMRect,
    colCount: number,
    columnWidths: Map<number, number>,
    filterIconCols?: number[],
  ): number | null {
    const relY = clientY - canvasRect.top;
    if (relY < 0 || relY >= this._config.headerHeight) return null;
    if (!filterIconCols?.length) return null;

    const col = this.findColumnAtX(clientX, canvasRect, colCount, columnWidths);
    if (col === null || !filterIconCols.includes(col)) return null;

    const colLeft = this.getColumnScreenLeft(col, columnWidths);
    const colWidth = resolveColumnWidth(col, columnWidths, this._config.defaultColumnWidth) * this._zoomLevel;
    const relX = clientX - canvasRect.left;
    const iconZoneLeft = colLeft + colWidth - 22 * this._zoomLevel;
    if (relX >= iconZoneLeft && relX <= colLeft + colWidth - 4) {
      return col;
    }
    return null;
  }

  /** Test if a point is on a row header (to select entire row) */
  hitTestRowHeader(
    clientX: number,
    clientY: number,
    canvasRect: DOMRect,
  ): boolean {
    const inHeaderX = (clientX - canvasRect.left) >= 0 && (clientX - canvasRect.left) < this._config.headerWidth;
    const inHeaderY = (clientY - canvasRect.top) >= this._config.headerHeight;
    return inHeaderX && inHeaderY;
  }

  /** Find which row header was clicked (returns row index) */
  findRowAtY(
    clientY: number,
    canvasRect: DOMRect,
    rowCount: number,
    rowHeights: Map<number, number>,
  ): number | null {
    const y = this.contentYFromScreen(clientY - canvasRect.top, rowHeights);
    if (y < 0) return null;

    let accumY = 0;
    for (let r = 0; r < rowCount; r++) {
      accumY += resolveRowHeight(r, rowHeights, this._config.defaultRowHeight) * this._zoomLevel;
      if (accumY > y) return r;
    }
    return null;
  }
}

// ==================== DirtyTracker ====================

interface DirtyRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class DirtyTracker {
  private _dirtyRects: DirtyRect[] = [];
  private _fullRedraw = false;

  markDirty(rect: DirtyRect): void {
    this._dirtyRects.push(rect);
  }

  markDirtyRange(
    range: CellRange,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    viewportManager: ViewportManager,
  ): void {
    const topLeft = viewportManager.getCellRect(range.start, columnWidths, rowHeights);
    const bottomRight = viewportManager.getCellRect(range.end, columnWidths, rowHeights);

    this._dirtyRects.push({
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x + bottomRight.width - topLeft.x,
      height: bottomRight.y + bottomRight.height - topLeft.y,
    });
  }

  markFullRedraw(): void {
    this._fullRedraw = true;
    this._dirtyRects = [];
  }

  get dirtyRects(): DirtyRect[] {
    return this._fullRedraw ? [] : this._mergeRects([...this._dirtyRects]);
  }

  get needsFullRedraw(): boolean {
    return this._fullRedraw;
  }

  clear(): void {
    this._dirtyRects = [];
    this._fullRedraw = false;
  }

  private _mergeRects(rects: DirtyRect[]): DirtyRect[] {
    if (rects.length <= 1) return rects;

    // 简单合并：如果两个矩形重叠或相邻，合并为一个
    const merged: DirtyRect[] = [];
    rects.sort((a, b) => a.y - b.y || a.x - b.x);

    for (const rect of rects) {
      const last = merged[merged.length - 1];
      if (last && this._overlaps(last, rect)) {
        const x1 = Math.min(last.x, rect.x);
        const y1 = Math.min(last.y, rect.y);
        const x2 = Math.max(last.x + last.width, rect.x + rect.width);
        const y2 = Math.max(last.y + last.height, rect.y + rect.height);
        last.x = x1;
        last.y = y1;
        last.width = x2 - x1;
        last.height = y2 - y1;
      } else {
        merged.push({ ...rect });
      }
    }
    return merged;
  }

  private _overlaps(a: DirtyRect, b: DirtyRect): boolean {
    return !(
      a.x + a.width < b.x ||
      b.x + b.width < a.x ||
      a.y + a.height < b.y ||
      b.y + b.height < a.y
    );
  }
}

// ==================== LayerManager ====================

interface Layer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dirty: boolean;
}

export class LayerManager {
  private _layers: Layer[] = [];
  private _parent: HTMLElement;
  private _width = 0;
  private _height = 0;

  constructor(parent: HTMLElement) {
    this._parent = parent;
    this._createLayers();
  }

  getLayer(index: LayerIndex): CanvasRenderingContext2D {
    return this._layers[index].ctx;
  }

  resize(width: number, height: number): void {
    this._width = width;
    this._height = height;
    for (let i = 0; i < this._layers.length; i++) {
      const layer = this._layers[i];
      // 使用 devicePixelRatio 确保高清显示
      const dpr = window.devicePixelRatio || 1;
      layer.canvas.width = width * dpr;
      layer.canvas.height = height * dpr;
      layer.canvas.style.width = `${width}px`;
      layer.canvas.style.height = `${height}px`;
      layer.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layer.dirty = true;
    }
  }

  clearLayer(index: LayerIndex): void {
    const layer = this._layers[index];
    layer.ctx.clearRect(0, 0, this._width, this._height);
    layer.dirty = false;
  }

  clearAll(): void {
    for (let i = 0; i < this._layers.length; i++) {
      this.clearLayer(i as LayerIndex);
    }
  }

  markDirty(index: LayerIndex): void {
    this._layers[index].dirty = true;
  }

  destroy(): void {
    for (const layer of this._layers) {
      layer.canvas.remove();
    }
    this._layers = [];
  }

  private _createLayers(): void {
    const layerNames = ['background', 'gridlines', 'merge-cells', 'content', 'selection', 'cursor', 'overlay'];

    for (let i = 0; i < layerNames.length; i++) {
      const canvas = document.createElement('canvas');
      canvas.style.cssText = `
        position: absolute;
        left: 0; top: 0;
        pointer-events: none;
        z-index: ${i};
      `;
      canvas.setAttribute('data-layer', layerNames[i]);
      this._parent.appendChild(canvas);

      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      this._layers.push({ canvas, ctx, dirty: true });
    }
  }
}

// ==================== CellRenderer ====================

export class CellRenderer {
  private _viewportManager: ViewportManager;

  constructor(viewportManager: ViewportManager) {
    this._viewportManager = viewportManager;
  }

  /** 绘制网格线 */
  drawGridlines(
    ctx: CanvasRenderingContext2D,
    visibleRange: VisibleRange,
    rowCount: number,
    colCount: number,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    freezeState: { frozenRows: number; frozenCols: number } = { frozenRows: 0, frozenCols: 0 },
  ): void {
    const config = this._viewportManager.config;

    ctx.strokeStyle = config.gridColor;
    ctx.lineWidth = config.isBaseMode ? 1 : 0.5;

    const canvasCssWidth = ctx.canvas.width / (window.devicePixelRatio || 1);
    const canvasCssHeight = ctx.canvas.height / (window.devicePixelRatio || 1);
    const baseBounds = config.isBaseMode
      ? computeBaseGridScreenBounds(
        config.headerWidth,
        config.headerHeight,
        colCount,
        rowCount,
        columnWidths,
        rowHeights,
        config.defaultColumnWidth,
        config.defaultRowHeight,
        this._viewportManager.zoomLevel,
        this._viewportManager.scrollLeft,
        canvasCssWidth,
        canvasCssHeight,
        (row, rh) => this._viewportManager.getRowScreenTop(row, rh),
      )
      : null;
    const gridLineRight = config.isBaseMode && baseBounds
      ? baseBounds.right
      : canvasCssWidth;
    const gridLineBottom = config.isBaseMode && baseBounds
      ? baseBounds.bottom
      : canvasCssHeight;

    // 绘制水平线
    const vm = this._viewportManager;
    const zoom = vm.zoomLevel;
    for (let r = 0; r <= rowCount; r++) {
      if (r > 0 && isRowLayoutHidden(r - 1, rowHeights, config.defaultRowHeight)) continue;
      const drawY = r < rowCount
        ? vm.getRowScreenTop(r, rowHeights)
        : vm.getRowScreenTop(rowCount - 1, rowHeights)
          + resolveRowHeight(rowCount - 1, rowHeights, config.defaultRowHeight) * zoom;
      if (drawY < config.headerHeight || drawY > ctx.canvas.height / (window.devicePixelRatio || 1)) {
        if (r > visibleRange.endRow + 1) break;
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(0, drawY);
      ctx.lineTo(gridLineRight, drawY);
      ctx.stroke();
    }

    // 多维表：添加列右缘竖线
    if (config.isBaseMode && gridLineRight > config.headerWidth) {
      ctx.beginPath();
      ctx.moveTo(gridLineRight, 0);
      ctx.lineTo(gridLineRight, gridLineBottom);
      ctx.stroke();
    }

    // 绘制垂直线（冻结列与可滚动列分区绘制，避免滚动时可滚动列边框侵入冻结区）
    const frozenCols = freezeState.frozenCols;
    const frozenWidth = frozenCols > 0
      ? Array.from({ length: frozenCols }, (_, c) =>
          resolveColumnWidth(c, columnWidths, config.defaultColumnWidth) * this._viewportManager.zoomLevel,
        ).reduce((a, b) => a + b, 0)
      : 0;
    const frozenBoundaryX = config.headerWidth + frozenWidth;

    const strokeVerticalGridLine = (c: number): 'break' | void => {
      if (config.isBaseMode && c === 0) return;
      let drawX: number;
      if (c < frozenCols) {
        drawX = config.headerWidth + Array.from({ length: c }, (_, i) =>
          resolveColumnWidth(i, columnWidths, config.defaultColumnWidth) * this._viewportManager.zoomLevel,
        ).reduce((a, b) => a + b, 0);
      } else if (c === frozenCols) {
        drawX = frozenBoundaryX;
      } else {
        const scrollableOffset = Array.from({ length: c - frozenCols }, (_, i) =>
          resolveColumnWidth(frozenCols + i, columnWidths, config.defaultColumnWidth) * this._viewportManager.zoomLevel,
        ).reduce((a, b) => a + b, 0);
        drawX = frozenBoundaryX + scrollableOffset - this._viewportManager.scrollLeft;
      }

      if (drawX < config.headerWidth || drawX > canvasCssWidth) {
        if (c > visibleRange.endCol + 1) return 'break';
        return;
      }
      ctx.beginPath();
      ctx.moveTo(drawX, 0);
      ctx.lineTo(drawX, gridLineBottom);
      ctx.stroke();
      if (config.isBaseMode && drawX > gridLineRight) return 'break';
    };

    if (frozenCols > 0) {
      for (let c = 0; c <= colCount; c++) {
        if (strokeVerticalGridLine(c) === 'break') break;
        if (c >= frozenCols) break;
      }
      if (frozenCols < colCount) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(frozenBoundaryX, 0, Math.max(0, canvasCssWidth - frozenBoundaryX), gridLineBottom);
        ctx.clip();
        for (let c = frozenCols + 1; c <= colCount; c++) {
          if (strokeVerticalGridLine(c) === 'break') break;
        }
        ctx.restore();
      }
    } else {
      for (let c = 0; c <= colCount; c++) {
        if (strokeVerticalGridLine(c) === 'break') break;
      }
    }

    // 冻结线
    if (freezeState.frozenRows > 0 || freezeState.frozenCols > 0) {
      ctx.strokeStyle = config.frozenLineColor;
      ctx.lineWidth = 1.5;
      if (freezeState.frozenCols > 0) {
        const lineX = config.headerWidth + frozenWidth;
        ctx.beginPath();
        ctx.moveTo(lineX, 0);
        ctx.lineTo(lineX, config.isBaseMode ? gridLineBottom : canvasCssHeight);
        ctx.stroke();
      }
      if (freezeState.frozenRows > 0) {
        const lineY = vm.getRowScreenTop(freezeState.frozenRows, rowHeights);
        ctx.beginPath();
        ctx.moveTo(0, lineY);
        ctx.lineTo(config.isBaseMode ? gridLineRight : canvasCssWidth, lineY);
        ctx.stroke();
      }
    }
  }

  /** 绘制单元格背景 */
  drawCellBackground(
    ctx: CanvasRenderingContext2D,
    coord: CellCoord,
    cellData: CellData | undefined,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    mergeRanges?: CellRange[],
  ): void {
    const config = this._viewportManager.config;
    if (isRowLayoutHidden(coord.row, rowHeights, config.defaultRowHeight)) return;

    // Skip non-main cells in merged ranges
    if (mergeRanges) {
      for (const range of mergeRanges) {
        if (coord.row >= range.start.row && coord.row <= range.end.row &&
            coord.col >= range.start.col && coord.col <= range.end.col) {
          const master = range.master || range.start;
          if (coord.row !== master.row || coord.col !== master.col) {
            return; // Don't draw background for merged sub-cells
          }
          break;
        }
      }
    }

    const rect = this._viewportManager.getCellRect(coord, columnWidths, rowHeights);
    const style = cellData?.style;

    ctx.fillStyle = resolveCellBackgroundFillColor(style, config, coord);

    // Extend background to cover entire merged range
    if (mergeRanges) {
      for (const range of mergeRanges) {
        if (coord.row === (range.master || range.start).row && coord.col === (range.master || range.start).col &&
            (range.start.row !== range.end.row || range.start.col !== range.end.col)) {
          const bottomRight = this._viewportManager.getCellRect(range.end, columnWidths, rowHeights);
          const fullW = bottomRight.x + bottomRight.width - rect.x;
          const fullH = bottomRight.y + bottomRight.height - rect.y;
          ctx.fillRect(rect.x, rect.y, fullW, fullH);
          return;
        }
      }
    }

    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  /** 绘制单元格内容 */
  /** Helper: wrap text into multiple lines to fit within maxWidth */
  private _wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    const words = text.split(' ');
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const testLine = currentLine ? currentLine + ' ' + word : word;

      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        // Current line is full — push it and start a new one
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) lines.push(currentLine);

    // If no words (single long string), split by character
    if (lines.length === 0 && text.length > 0) {
      lines.push(text);
    }

    return lines;
  }

  private _drawDropdownChevron(
    ctx: CanvasRenderingContext2D,
    rect: { x: number; y: number; width: number; height: number },
    zoom: number,
  ): void {
    const chevronX = rect.x + rect.width - 10 * zoom;
    const chevronY = rect.y + rect.height / 2;
    ctx.save();
    ctx.fillStyle = '#86909C';
    ctx.beginPath();
    ctx.moveTo(chevronX - 3 * zoom, chevronY - 2 * zoom);
    ctx.lineTo(chevronX + 3 * zoom, chevronY - 2 * zoom);
    ctx.lineTo(chevronX, chevronY + 2 * zoom);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private _drawDropdownTag(
    ctx: CanvasRenderingContext2D,
    text: string,
    color: string,
    x: number,
    y: number,
    maxWidth: number,
    zoom: number,
    showOptionColor: boolean,
  ): number {
    const paddingX = 8 * zoom;
    const paddingY = 3 * zoom;
    const fontSize = 12 * zoom;
    const borderRadius = 999;
    const fontFamily = this._viewportManager.config.fontFamily || 'Arial, sans-serif';
    ctx.font = `${fontSize}px ${fontFamily}`;
    const tagColors = showOptionColor
      ? getSelectTagColors(color)
      : { bg: '#F2F3F5', text: '#646A73' };
    let displayText = text;
    let textWidth = ctx.measureText(displayText).width;
    const tagWidth = Math.min(textWidth + paddingX * 2, maxWidth);
    const tagHeight = Math.min(fontSize + paddingY * 2, 24 * zoom);
    if (textWidth + paddingX * 2 > maxWidth) {
      while (displayText.length > 0 && ctx.measureText(`${displayText}…`).width + paddingX * 2 > maxWidth) {
        displayText = displayText.slice(0, -1);
      }
      displayText = `${displayText}…`;
      textWidth = ctx.measureText(displayText).width;
    }
    ctx.save();
    ctx.fillStyle = tagColors.bg;
    ctx.beginPath();
    ctx.roundRect(x, y, tagWidth, tagHeight, borderRadius);
    ctx.fill();
    ctx.fillStyle = tagColors.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayText, x + paddingX, y + tagHeight / 2);
    ctx.restore();
    return tagWidth;
  }

  private _drawDropdownListContent(
    ctx: CanvasRenderingContext2D,
    cellData: CellData | undefined,
    validation: DataValidation,
    rect: { x: number; y: number; width: number; height: number },
    zoom: number,
  ): void {
    const options = validation.options || [];
    const showOptionColor = validation.showOptionColor !== false;
    const chevronReserve = 14 * zoom;
    const padding = 4 * zoom;
    const maxContentWidth = Math.max(0, rect.width - padding * 2 - chevronReserve);
    const value = cellData?.value;
    const isMulti = validation.mode === 'multi';
    const startX = rect.x + padding;
    const tagHeight = Math.min(12 * zoom + 6 * zoom, rect.height - 4 * zoom);
    const tagY = rect.y + (rect.height - tagHeight) / 2;

    if (value && value.type !== 'empty') {
      if (isMulti) {
        const selectedIds = parseMultiSelectOptionIds(value, options);
        let currentX = startX;
        const gap = 4 * zoom;
        for (let i = 0; i < selectedIds.length; i++) {
          const option = findSelectOption(options, selectedIds[i]);
          const displayName = option?.name || selectedIds[i];
          const color = option?.color || '#646A73';
          const remaining = maxContentWidth - (currentX - startX);
          if (remaining <= 8 * zoom) break;
          const tagWidth = this._drawDropdownTag(
            ctx,
            displayName,
            color,
            currentX,
            tagY,
            remaining,
            zoom,
            showOptionColor,
          );
          currentX += tagWidth + gap;
        }
      } else {
        const raw = value.type === 'text' ? value.text : getCellText(value);
        const option = findSelectOption(options, raw);
        const displayName = option?.name || raw;
        const color = option?.color || '#646A73';
        if (displayName) {
          this._drawDropdownTag(
            ctx,
            displayName,
            color,
            startX,
            tagY,
            maxContentWidth,
            zoom,
            showOptionColor,
          );
        }
      }
    }

    this._drawDropdownChevron(ctx, rect, zoom);
  }

  private _drawDateCellContent(
    ctx: CanvasRenderingContext2D,
    cellData: CellData | undefined,
    validation: DataValidation,
    rect: { x: number; y: number; width: number; height: number },
    zoom: number,
  ): void {
    const includeTime = validation.includeTime ?? false;
    const chevronReserve = 14 * zoom;
    const padding = 4 * zoom;
    const maxContentWidth = Math.max(0, rect.width - padding * 2 - chevronReserve);
    const value = cellData?.value;

    if (value?.type === 'date') {
      const showTime = cellValueIncludeTime(value) || includeTime;
      const displayText = formatFreeformDateCellText(value.timestamp, showTime);
      if (displayText) {
        ctx.save();
        ctx.fillStyle = cellData?.style?.fontColor || '#1f2329';
        ctx.font = `${(cellData?.style?.fontSize ?? 11) * zoom}px Arial, sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        let text = displayText;
        let textWidth = ctx.measureText(text).width;
        if (textWidth > maxContentWidth && maxContentWidth > 0) {
          while (text.length > 1 && textWidth > maxContentWidth) {
            text = text.slice(0, -1);
            textWidth = ctx.measureText(`${text}…`).width;
          }
          text = `${text}…`;
        }
        ctx.fillText(text, rect.x + rect.width - chevronReserve - padding, rect.y + rect.height / 2);
        ctx.restore();
      }
    }

    this._drawDropdownChevron(ctx, rect, zoom);
  }

  drawCellContent(
    ctx: CanvasRenderingContext2D,
    coord: CellCoord,
    cellData: CellData | undefined,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    mergeRanges?: CellRange[],
    dropdownValidation?: DataValidation | null,
  ): void {
    const config = this._viewportManager.config;
    if (isRowLayoutHidden(coord.row, rowHeights, config.defaultRowHeight)) return;

    // Skip non-main cells in merged ranges (content drawn on master cell only)
    let mergeRange: CellRange | null = null;
    if (mergeRanges) {
      for (const range of mergeRanges) {
        if (coord.row >= range.start.row && coord.row <= range.end.row &&
            coord.col >= range.start.col && coord.col <= range.end.col) {
          const master = range.master || range.start;
          if (coord.row !== master.row || coord.col !== master.col) {
            return; // Sub-cell: skip content
          }
          mergeRange = range;
          break;
        }
      }
    }

    const rect = this._viewportManager.getCellRect(coord, columnWidths, rowHeights);
    const zoom = this._viewportManager.zoomLevel;

    // Extend rect for merged cells
    if (mergeRange && (mergeRange.start.row !== mergeRange.end.row || mergeRange.start.col !== mergeRange.end.col)) {
      const bottomRight = this._viewportManager.getCellRect(mergeRange.end, columnWidths, rowHeights);
      rect.width = bottomRight.x + bottomRight.width - rect.x;
      rect.height = bottomRight.y + bottomRight.height - rect.y;
    }

    if (dropdownValidation?.type === 'dropdownList') {
      this._drawDropdownListContent(ctx, cellData, dropdownValidation, rect, zoom);
      return;
    }

    if (dropdownValidation?.type === 'date') {
      this._drawDateCellContent(ctx, cellData, dropdownValidation, rect, zoom);
      return;
    }

    if (!cellData || cellData.value.type === 'empty') return;

    // ─── Boolean → Checkbox rendering ───
    if (cellData.value.type === 'boolean') {
      const checked = cellData.value.value;
      const primary = '#3370FF';
      const size = Math.min(14 * zoom, rect.width - 6, rect.height - 6);
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const hs = size / 2;
      const radius = 2 * zoom;

      ctx.save();
      ctx.strokeStyle = primary;
      ctx.lineWidth = 1.2 * zoom;
      ctx.beginPath();
      ctx.roundRect(cx - hs, cy - hs, size, size, radius);
      ctx.stroke();

      if (checked) {
        ctx.fillStyle = primary;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5 * zoom;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - hs * 0.35, cy);
        ctx.lineTo(cx - hs * 0.05, cy + hs * 0.4);
        ctx.lineTo(cx + hs * 0.45, cy - hs * 0.35);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    const style = cellData.style || DEFAULT_CELL_STYLE;
    const displayText = getCellText(cellData.value);

    // 设置字体
    const fontSize = (style.fontSize || DEFAULT_CELL_STYLE.fontSize!) * zoom;
    const fontFamily = style.fontFamily || DEFAULT_CELL_STYLE.fontFamily!;
    ctx.font = `${style.bold ? 'bold ' : ''}${style.italic ? 'italic ' : ''}${fontSize}px ${fontFamily}`;

    // 设置颜色（Error 用红色）
    const isError = cellData.value.type === 'error';
    ctx.fillStyle = style.fontColor || (isError ? '#d93025' : '#333333');

    // 文本裁剪
    const padding = 4 * zoom;

    // 垂直对齐：映射到 Canvas textBaseline + 计算 Y 坐标
    const vAlign = style.verticalAlign || 'middle';
    let textY: number;
    if (vAlign === 'top') {
      ctx.textBaseline = 'top';
      textY = rect.y + padding;
    } else if (vAlign === 'bottom') {
      ctx.textBaseline = 'bottom';
      textY = rect.y + rect.height - padding;
    } else {
      ctx.textBaseline = 'middle';
      textY = rect.y + rect.height / 2;
    }

    const maxWidth = rect.width - padding * 2;

    let text = displayText;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x + padding, rect.y, maxWidth, rect.height);
    ctx.clip();

    // 对齐 — 优先使用显式样式，否则根据值类型自动推断
    const align = style.horizontalAlign || getCellAlign(cellData.value);
    ctx.textAlign = align === 'right' ? 'right'
      : align === 'center' ? 'center' : 'left';

    // ── Text Wrapping ──
    if (style.textWrap && text) {
      const lineHeight = (style.fontSize || DEFAULT_CELL_STYLE.fontSize!) * zoom * 1.3;
      const maxLines = Math.floor(rect.height / lineHeight);
      const lines = this._wrapText(ctx, text, maxWidth);

      let drawY: number;
      if (vAlign === 'bottom') {
        drawY = rect.y + rect.height - padding - (Math.min(lines.length, maxLines) - 1) * lineHeight;
      } else if (vAlign === 'middle') {
        const totalH = Math.min(lines.length, maxLines) * lineHeight;
        drawY = rect.y + (rect.height - totalH) / 2 + lineHeight * 0.3; // approximate middle
      } else {
        drawY = rect.y + padding + lineHeight * 0.8;
      }
      ctx.textBaseline = 'alphabetic';

      for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
        let lineText = lines[i];
        // Last visible line: add ellipsis if there are more lines
        if (i === maxLines - 1 && maxLines < lines.length) {
          lineText = lines[i].slice(0, -1) + '\u2026';
        }
        const textX = align === 'right'
          ? rect.x + rect.width - padding
          : align === 'center'
            ? rect.x + rect.width / 2
            : rect.x + padding;
        ctx.fillText(lineText, textX, drawY + i * lineHeight);
      }

      // 下划线 & 删除线（只画第一行）
      if (style.underline || style.strikethrough) {
        const firstLine = lines[0] || text;
        const textWidth = ctx.measureText(firstLine).width;
        let lineStartX: number;
        switch (ctx.textAlign) {
          case 'right': lineStartX = rect.x + rect.width - padding - textWidth; break;
          case 'center': lineStartX = rect.x + rect.width / 2 - textWidth / 2; break;
          default: lineStartX = rect.x + padding;
        }
        const lineEndX = lineStartX + textWidth;
        if (style.underline) {
          ctx.fillRect(lineStartX, drawY + 2 * zoom, textWidth, Math.max(1, 1 * zoom));
        }
        if (style.strikethrough) {
          ctx.fillRect(lineStartX, drawY - lineHeight * 0.2, textWidth, Math.max(1, 1 * zoom));
        }
      }

      ctx.restore();
      return;
    }

    // ── Single-line (no wrap) ──
    // 截断文本
    if (ctx.measureText(text).width > maxWidth) {
      while (text.length > 0 && ctx.measureText(text + '\u2026').width > maxWidth) {
        text = text.slice(0, -1);
      }
      text += '\u2026';
    }

    const textX = align === 'right'
      ? rect.x + rect.width - padding
      : align === 'center'
        ? rect.x + rect.width / 2
        : rect.x + padding;

    ctx.fillText(text, textX, textY);

    // 下划线 & 删除线（Canvas 2D 不支持通过 font 属性设置）
    if (style.underline || style.strikethrough) {
      const textWidth = ctx.measureText(text).width;
      let lineStartX: number;
      switch (ctx.textAlign) {
        case 'right': lineStartX = textX - textWidth; break;
        case 'center': lineStartX = textX - textWidth / 2; break;
        default: lineStartX = textX;
      }
      const lineEndX = lineStartX + textWidth;

      // 下划线：基线下方 1~2px
      if (style.underline) {
        let underlineY: number;
        if (vAlign === 'top') underlineY = textY + fontSize * 1.1;
        else if (vAlign === 'bottom') underlineY = textY - 1 * zoom;
        else underlineY = textY + fontSize * 0.35;
        ctx.strokeStyle = style.fontColor || '#333333';
        ctx.lineWidth = 1 * zoom;
        ctx.beginPath();
        ctx.moveTo(lineStartX, underlineY);
        ctx.lineTo(lineEndX, underlineY);
        ctx.stroke();
      }

      // 删除线：文字中间
      if (style.strikethrough) {
        let strikeY: number;
        if (vAlign === 'top') strikeY = textY + fontSize * 0.6;
        else if (vAlign === 'bottom') strikeY = textY - fontSize * 0.45;
        else strikeY = textY;
        ctx.strokeStyle = style.fontColor || '#333333';
        ctx.lineWidth = 1 * zoom;
        ctx.beginPath();
        ctx.moveTo(lineStartX, strikeY);
        ctx.lineTo(lineEndX, strikeY);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  /** 绘制选区矩形（背景 + 边框 + 可选填充柄） */
  drawSelectionRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    showFillHandle = false,
  ): void {
    const config = this._viewportManager.config;
    if (w <= 0 || h <= 0) return;

    ctx.fillStyle = config.selectionColor;
    ctx.fillRect(x, y, w, h);

    const selBorder = config.isBaseMode ? BASE_AXIS_SELECTION.border : '#1a73e8';
    const selBorderWidth = config.isBaseMode ? BASE_AXIS_SELECTION.borderWidth : 2;
    ctx.strokeStyle = selBorder;
    ctx.lineWidth = selBorderWidth;
    ctx.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));

    if (showFillHandle) {
      const handleSize = 8;
      const hx = x + w - handleSize / 2;
      const hy = y + h - handleSize / 2;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(hx - 1, hy - 1, handleSize + 2, handleSize + 2);
      ctx.fillStyle = '#000000';
      ctx.fillRect(hx, hy, handleSize, handleSize);
    }
  }

  /** 绘制选区 */
  drawSelection(
    ctx: CanvasRenderingContext2D,
    range: CellRange,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    showFillHandle = true,
  ): void {
    const startRow = Math.min(range.start.row, range.end.row);
    const endRow = Math.max(range.start.row, range.end.row);
    const startCol = Math.min(range.start.col, range.end.col);
    const endCol = Math.max(range.start.col, range.end.col);

    const topLeft = this._viewportManager.getCellRect({ row: startRow, col: startCol }, columnWidths, rowHeights);
    const bottomRight = this._viewportManager.getCellRect({ row: endRow, col: endCol }, columnWidths, rowHeights);

    const x = topLeft.x;
    const y = topLeft.y;
    const w = bottomRight.x + bottomRight.width - topLeft.x;
    const h = bottomRight.y + bottomRight.height - topLeft.y;

    this.drawSelectionRect(ctx, x, y, w, h, showFillHandle);
  }

  /** 多维表第一列：按子记录缩进绘制选区（每行独立内容宽度） */
  drawBaseTreeColumnSelection(
    ctx: CanvasRenderingContext2D,
    startRow: number,
    endRow: number,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    rowTreeMeta: RecordTreeColumnMeta[] | undefined,
    showFillHandle = false,
  ): void {
    const zoom = this._viewportManager.zoomLevel;
    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);

    for (let r = minRow; r <= maxRow; r++) {
      const cellRect = this._viewportManager.getCellRect({ row: r, col: 0 }, columnWidths, rowHeights);
      const contentRect = getTreeContentRect(cellRect, 0, rowTreeMeta?.[r], zoom);
      const isSingleCell = minRow === maxRow;
      this.drawSelectionRect(
        ctx,
        contentRect.x,
        contentRect.y,
        contentRect.width,
        contentRect.height,
        showFillHandle && isSingleCell && r === maxRow,
      );
    }
  }

  /** 绘制复制来源区域（蚂蚁线虚线边框，Excel 风格） */
  drawCopyMarquee(
    ctx: CanvasRenderingContext2D,
    range: CellRange,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    dashOffset = 0,
    activeCell: CellCoord | null = null,
    showFill = true,
  ): void {
    const startRow = Math.min(range.start.row, range.end.row);
    const endRow = Math.max(range.start.row, range.end.row);
    const startCol = Math.min(range.start.col, range.end.col);
    const endCol = Math.max(range.start.col, range.end.col);

    const topLeft = this._viewportManager.getCellRect({ row: startRow, col: startCol }, columnWidths, rowHeights);
    const bottomRight = this._viewportManager.getCellRect({ row: endRow, col: endCol }, columnWidths, rowHeights);
    const x = topLeft.x;
    const y = topLeft.y;
    const w = bottomRight.x + bottomRight.width - topLeft.x;
    const h = bottomRight.y + bottomRight.height - topLeft.y;
    if (w <= 0 || h <= 0) return;

    ctx.save();

    if (showFill) {
      ctx.fillStyle = 'rgba(51, 112, 255, 0.06)';
      ctx.fillRect(x, y, w, h);

      if (
        activeCell &&
        activeCell.row >= startRow && activeCell.row <= endRow &&
        activeCell.col >= startCol && activeCell.col <= endCol
      ) {
        const activeRect = this._viewportManager.getCellRect(activeCell, columnWidths, rowHeights);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(activeRect.x, activeRect.y, activeRect.width, activeRect.height);
      }
    }

    // 内缩于选区实线边框（选区 stroke 在 x+1、线宽 2），避免双线重叠
    const inset = 4;
    const bx = x + inset;
    const by = y + inset;
    const bw = Math.max(0, w - inset * 2);
    const bh = Math.max(0, h - inset * 2);

    ctx.strokeStyle = '#3370FF';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.lineDashOffset = -dashOffset;
    ctx.strokeRect(bx + 0.5, by + 0.5, Math.max(0, bw - 1), Math.max(0, bh - 1));

    ctx.restore();
  }

  /** 绘制填充预览区域（虚线边框） */
  drawFillPreview(
    ctx: CanvasRenderingContext2D,
    range: CellRange,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
  ): void {
    const startRow = Math.min(range.start.row, range.end.row);
    const endRow = Math.max(range.start.row, range.end.row);
    const startCol = Math.min(range.start.col, range.end.col);
    const endCol = Math.max(range.start.col, range.end.col);
    const topLeft = this._viewportManager.getCellRect({ row: startRow, col: startCol }, columnWidths, rowHeights);
    const bottomRight = this._viewportManager.getCellRect({ row: endRow, col: endCol }, columnWidths, rowHeights);
    const x = topLeft.x;
    const y = topLeft.y;
    const w = bottomRight.x + bottomRight.width - topLeft.x;
    const h = bottomRight.y + bottomRight.height - topLeft.y;

    ctx.save();
    ctx.fillStyle = 'rgba(26, 115, 232, 0.06)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#1a73e8';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.restore();
  }

  /** 绘制公式引用区域高亮（虚线边框，橙色） */
  drawFormulaRangeHighlight(
    ctx: CanvasRenderingContext2D,
    range: { startRow: number; endRow: number; startCol: number; endCol: number },
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
  ): void {
    // Clamp to valid range
    const sr = Math.max(0, range.startRow);
    const er = Math.max(sr, range.endRow);
    const sc = Math.max(0, range.startCol);
    const ec = Math.max(sc, range.endCol);

    if (sr === er && sc === ec) {
      // Single cell highlight
      const rect = this._viewportManager.getCellRect({ row: sr, col: sc }, columnWidths, rowHeights);
      ctx.save();
      ctx.setLineDash([3, 2]);
      ctx.strokeStyle = '#FF6D01';
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      ctx.restore();
    } else {
      // Range highlight
      const topLeft = this._viewportManager.getCellRect({ row: sr, col: sc }, columnWidths, rowHeights);
      const bottomRight = this._viewportManager.getCellRect({ row: er, col: ec }, columnWidths, rowHeights);
      const x = topLeft.x;
      const y = topLeft.y;
      const w = bottomRight.x + bottomRight.width - topLeft.x;
      const h = bottomRight.y + bottomRight.height - topLeft.y;

      ctx.save();
      ctx.setLineDash([3, 2]);
      ctx.strokeStyle = '#FF6D01';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }
  }

  /** 绘制整行选区高亮（包括行头） */
  drawRowSelection(
    ctx: CanvasRenderingContext2D,
    row: number,
    colCount: number,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    canvasWidth: number,
  ): void {
    this.drawRowRangeSelection(ctx, row, row, colCount, columnWidths, rowHeights, canvasWidth);
  }

  /** 绘制连续多行选区（单一外框，无行间加粗分隔） */
  drawRowRangeSelection(
    ctx: CanvasRenderingContext2D,
    startRow: number,
    endRow: number,
    colCount: number,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    canvasWidth: number,
  ): void {
    const config = this._viewportManager.config;
    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const startCell = this._viewportManager.getCellRect({ row: minRow, col: 0 }, columnWidths, rowHeights);
    const endCell = this._viewportManager.getCellRect({ row: maxRow, col: colCount - 1 }, columnWidths, rowHeights);

    const x = config.headerWidth;
    const y = startCell.y;
    const w = endCell.x + endCell.width - config.headerWidth;
    const h = endCell.y + endCell.height - startCell.y;
    if (w <= 0 || h <= 0) return;

    const axisSel = resolveAxisSelection(config.isBaseMode);
    ctx.fillStyle = axisSel.fill;
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = axisSel.border;
    ctx.lineWidth = axisSel.borderWidth;
    ctx.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
  }

  /** 绘制整列选区高亮（列体区域，列头在 drawColumnHeaders 中绘制） */
  drawColumnSelection(
    ctx: CanvasRenderingContext2D,
    col: number,
    rowCount: number,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    _canvasHeight: number,
  ): void {
    this.drawColumnRangeSelection(ctx, col, col, rowCount, columnWidths, rowHeights);
  }

  /** 绘制连续多列选区（单一外框，无列间加粗分隔） */
  drawColumnRangeSelection(
    ctx: CanvasRenderingContext2D,
    startCol: number,
    endCol: number,
    rowCount: number,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
  ): void {
    const config = this._viewportManager.config;
    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);
    const startCell = this._viewportManager.getCellRect({ row: 0, col: minCol }, columnWidths, rowHeights);
    const endCell = this._viewportManager.getCellRect({ row: rowCount - 1, col: maxCol }, columnWidths, rowHeights);

    const x = startCell.x;
    const y = config.headerHeight;
    const w = endCell.x + endCell.width - startCell.x;
    const h = endCell.y + endCell.height - config.headerHeight;
    if (w <= 0 || h <= 0) return;

    const axisSel = resolveAxisSelection(config.isBaseMode);
    ctx.fillStyle = axisSel.fill;
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = axisSel.border;
    ctx.lineWidth = axisSel.borderWidth;
    ctx.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
  }

  /** 列拖拽预览（图2） */
  drawColumnDragPreview(
    ctx: CanvasRenderingContext2D,
    col: number,
    rowCount: number,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    canvasHeight: number,
  ): void {
    this.drawColumnRangeDragPreview(ctx, col, col, rowCount, columnWidths, rowHeights, canvasHeight);
  }

  /** 连续多列拖拽预览 */
  drawColumnRangeDragPreview(
    ctx: CanvasRenderingContext2D,
    startCol: number,
    endCol: number,
    rowCount: number,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    canvasHeight: number,
  ): void {
    const config = this._viewportManager.config;
    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);
    const startCell = this._viewportManager.getCellRect({ row: 0, col: minCol }, columnWidths, rowHeights);
    const endCell = this._viewportManager.getCellRect({ row: rowCount - 1, col: maxCol }, columnWidths, rowHeights);
    const x = startCell.x;
    const w = endCell.x + endCell.width - startCell.x;
    const h = Math.min(canvasHeight - config.headerHeight, endCell.y + endCell.height - config.headerHeight);

    const axisSel = resolveAxisSelection(config.isBaseMode);
    ctx.save();
    ctx.fillStyle = axisSel.fill;
    ctx.fillRect(x, config.headerHeight, w, h);
    ctx.strokeStyle = axisSel.border;
    ctx.lineWidth = axisSel.borderWidth;
    ctx.strokeRect(x + 1, config.headerHeight + 1, Math.max(0, w - 2), Math.max(0, h - 2));
    ctx.restore();
  }

  /** 列插入指示线（图2） */
  drawColumnInsertIndicator(
    ctx: CanvasRenderingContext2D,
    insertCol: number,
    colCount: number,
    columnWidths: Map<number, number>,
    canvasHeight: number,
  ): void {
    const config = this._viewportManager.config;
    const x = insertCol >= colCount
      ? this._viewportManager.getColumnScreenLeft(colCount - 1, columnWidths)
        + resolveColumnWidth(colCount - 1, columnWidths, config.defaultColumnWidth) * this._viewportManager.zoomLevel
      : this._viewportManager.getColumnScreenLeft(insertCol, columnWidths);

    const axisSel = resolveAxisSelection(config.isBaseMode);
    ctx.save();
    ctx.strokeStyle = axisSel.border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, config.headerHeight);
    ctx.lineTo(x, canvasHeight);
    ctx.stroke();

    ctx.fillStyle = axisSel.border;
    ctx.beginPath();
    ctx.moveTo(x, config.headerHeight);
    ctx.lineTo(x - 5, config.headerHeight - 6);
    ctx.lineTo(x + 5, config.headerHeight - 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** 行拖拽预览 */
  drawRowDragPreview(
    ctx: CanvasRenderingContext2D,
    row: number,
    colCount: number,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    canvasWidth: number,
  ): void {
    this.drawRowRangeDragPreview(ctx, row, row, colCount, columnWidths, rowHeights, canvasWidth);
  }

  /** 连续多行拖拽预览 */
  drawRowRangeDragPreview(
    ctx: CanvasRenderingContext2D,
    startRow: number,
    endRow: number,
    colCount: number,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    canvasWidth: number,
  ): void {
    const config = this._viewportManager.config;
    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const startCell = this._viewportManager.getCellRect({ row: minRow, col: 0 }, columnWidths, rowHeights);
    const endCell = this._viewportManager.getCellRect({ row: maxRow, col: colCount - 1 }, columnWidths, rowHeights);
    const y = startCell.y;
    const h = endCell.y + endCell.height - startCell.y;
    const w = Math.min(canvasWidth - config.headerWidth, endCell.x + endCell.width - config.headerWidth);

    const axisSel = resolveAxisSelection(config.isBaseMode);
    ctx.save();
    ctx.fillStyle = axisSel.fill;
    ctx.fillRect(config.headerWidth, y, w, h);
    ctx.strokeStyle = axisSel.border;
    ctx.lineWidth = axisSel.borderWidth;
    ctx.strokeRect(config.headerWidth + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
    ctx.restore();
  }

  /** 行插入指示线 */
  drawRowInsertIndicator(
    ctx: CanvasRenderingContext2D,
    insertRow: number,
    rowCount: number,
    rowHeights: Map<number, number>,
    canvasWidth: number,
  ): void {
    const config = this._viewportManager.config;
    let y = config.headerHeight;
    for (let r = 0; r < Math.min(insertRow, rowCount); r++) {
      y += resolveRowHeight(r, rowHeights, config.defaultRowHeight) * this._viewportManager.zoomLevel;
    }
    y -= this._viewportManager.scrollTop;

    const axisSel = resolveAxisSelection(config.isBaseMode);
    ctx.save();
    ctx.strokeStyle = axisSel.border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(config.headerWidth, y);
    ctx.lineTo(canvasWidth, y);
    ctx.stroke();

    ctx.fillStyle = axisSel.border;
    ctx.beginPath();
    ctx.moveTo(config.headerWidth, y);
    ctx.lineTo(config.headerWidth - 6, y - 5);
    ctx.lineTo(config.headerWidth - 6, y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** 绘制列头 */
  drawColumnHeaders(
    ctx: CanvasRenderingContext2D,
    visibleRange: VisibleRange,
    colCount: number,
    columnWidths: Map<number, number>,
    columnDefs?: ColumnDef[],
    hoveredCol?: number | null,
    selectedCols?: number[],
    sortRules?: { col: number; order: 'asc' | 'desc' }[],
    filterIconCols?: number[],
    activeFilterCols?: number[],
  ): void {
    const config = this._viewportManager.config;
    const zoom = this._viewportManager.zoomLevel;
    const dpr = window.devicePixelRatio || 1;
    const canvasWidth = ctx.canvas.width / dpr;
    const isBase = !!config.isBaseMode;
    const axisSel = resolveAxisSelection(isBase);
    const primaryColor = isBase ? '#3370FF' : '#1a73e8';
    const fontFamily = config.fontFamily || 'Arial, sans-serif';

    const headerRight = isBase
      ? Math.min(
        Math.max(
          config.headerWidth,
          computeBaseGridWidth(
            config.headerWidth,
            colCount,
            columnWidths,
            config.defaultColumnWidth,
            zoom,
          ) - this._viewportManager.scrollLeft,
        ),
        canvasWidth,
      )
      : canvasWidth;

    const frozenCols = this._viewportManager.freezeState.frozenCols;
    const frozenWidth = frozenCols > 0
      ? this._viewportManager.getFrozenWidth(columnWidths)
      : 0;
    const frozenBoundaryX = config.headerWidth + frozenWidth;

    ctx.fillStyle = config.headerBgColor;
    if (frozenCols > 0) {
      if (frozenBoundaryX > config.headerWidth) {
        ctx.fillRect(config.headerWidth, 0, frozenBoundaryX - config.headerWidth, config.headerHeight);
      }
      if (headerRight > frozenBoundaryX) {
        ctx.fillRect(frozenBoundaryX, 0, headerRight - frozenBoundaryX, config.headerHeight);
      }
    } else {
      ctx.fillRect(0, 0, headerRight, config.headerHeight);
    }

    const drawOneColumnHeader = (c: number) => {
      if (c < visibleRange.startCol || c >= colCount) return;
      const w = resolveColumnWidth(c, columnWidths, config.defaultColumnWidth) * zoom;
      if (w <= 0) return;
      const drawX = this._viewportManager.getColumnScreenLeft(c, columnWidths);
      if (drawX + w < 0 || drawX > canvasWidth) return;

      const isHovered = hoveredCol === c;
      const isSelected = selectedCols?.includes(c);
      const hasActiveFilter = activeFilterCols?.includes(c);
      const sortRule = sortRules?.find(s => s.col === c);
      const showFilterIcon = filterIconCols?.includes(c) ?? false;
      const isFrozenCol = c < frozenCols;

      if (isFrozenCol || isSelected || isHovered) {
        ctx.fillStyle = isSelected
          ? axisSel.headerBg
          : isHovered
            ? (isBase ? '#F7F8FA' : '#ebebeb')
            : config.headerBgColor;
        ctx.fillRect(drawX, 0, w, config.headerHeight);
      }

      const colDef = columnDefs?.[c];
      const headerText = colDef?.name || colToName(c);
      const fontSize = (isBase ? 12 : 11) * zoom;
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.fillStyle = isSelected ? primaryColor : config.headerTextColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      const padding = (isBase ? 12 : 8) * zoom;
      const iconWidth = (isBase ? 16 : 14) * zoom;
      let textX = drawX + padding;

      if (isBase && c === 0 && colDef) {
        const lockColor = isSelected ? primaryColor : (config.secondaryTextColor || '#86909C');
        this._drawLockIcon(ctx, textX + 6 * zoom, config.headerHeight / 2, 9 * zoom, lockColor);
        textX += iconWidth;
      }

      if (colDef) {
        const iconColor = isSelected ? primaryColor : (config.secondaryTextColor || '#86909C');
        this._drawFieldTypeIcon(ctx, colDef.type, textX + 6 * zoom, config.headerHeight / 2, 10 * zoom, iconColor, isBase);
        textX += iconWidth;
      }

      const lockExtra = isBase && c === 0 && colDef ? iconWidth : 0;
      const maxTextWidth = w - padding * 2 - (colDef ? iconWidth + lockExtra : 0) - (sortRule || showFilterIcon ? 14 * zoom : 0);
      let displayText = headerText;
      if (ctx.measureText(displayText).width > maxTextWidth) {
        while (displayText.length > 0 && ctx.measureText(displayText + '\u2026').width > maxTextWidth) {
          displayText = displayText.slice(0, -1);
        }
        displayText += '\u2026';
      }
      ctx.fillText(displayText, textX, config.headerHeight / 2);

      if (sortRule) {
        const arrowX = drawX + w - padding - 6 * zoom;
        const arrowY = config.headerHeight / 2;
        this._drawSortArrow(ctx, arrowX, arrowY, 5 * zoom, sortRule.order, isSelected ? primaryColor : '#86909C');
      }

      if (showFilterIcon) {
        const filterX = drawX + w - padding - (sortRule ? 14 * zoom : 6 * zoom);
        const filterY = config.headerHeight / 2;
        this._drawFilterIcon(ctx, filterX, filterY, 5 * zoom, hasActiveFilter ? primaryColor : '#86909C');
      }

      if (!isBase || drawX + w <= headerRight + 0.5) {
        ctx.strokeStyle = config.gridColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(drawX + w, 0);
        ctx.lineTo(drawX + w, config.headerHeight);
        ctx.stroke();
      }
    };

    if (frozenCols > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(frozenBoundaryX, 0, Math.max(0, canvasWidth - frozenBoundaryX), config.headerHeight);
      ctx.clip();
      for (let c = Math.max(visibleRange.startCol, frozenCols); c <= visibleRange.endCol; c++) {
        drawOneColumnHeader(c);
      }
      ctx.restore();
      for (let c = 0; c < frozenCols; c++) {
        drawOneColumnHeader(c);
      }
    } else {
      for (let c = visibleRange.startCol; c <= visibleRange.endCol; c++) {
        drawOneColumnHeader(c);
      }
    }

    // 绘制列头底部分隔线
    ctx.strokeStyle = config.gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, config.headerHeight);
    ctx.lineTo(isBase ? headerRight : canvasWidth, config.headerHeight);
    ctx.stroke();
  }

  /** 首列锁定图标 */
  private _drawLockIcon(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, size: number,
    color: string,
  ): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.2;
    const w = size * 0.55;
    const h = size * 0.45;
    const x = cx - w / 2;
    const y = cy - h / 2 + size * 0.08;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, y, w * 0.38, Math.PI, 0);
    ctx.stroke();
    ctx.restore();
  }

  /** 绘制字段类型小图标 */
  private _drawFieldTypeIcon(
    ctx: CanvasRenderingContext2D,
    type: ColumnDef['type'],
    cx: number, cy: number, size: number,
    color: string,
    isBaseStyle = false,
  ): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    const s = size;
    const x = cx;
    const y = cy - s / 2;
    switch (type) {
      case 'text': {
        if (isBaseStyle) {
          ctx.fillStyle = color;
          ctx.font = `600 ${s * 0.95}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('A', cx, cy - s * 0.08);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          const lineY = cy + s * 0.22;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(cx - s * 0.35, lineY + i * s * 0.18);
            ctx.lineTo(cx + s * 0.35, lineY + i * s * 0.18);
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = color;
          ctx.font = `${s}px Arial`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText('T', x, y);
        }
        break;
      }
      case 'number':
      case 'currency':
      case 'percent':
      case 'rating':
      case 'progress': {
        ctx.fillStyle = color;
        ctx.font = `${s}px Arial`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('#', x, y);
        break;
      }
      case 'boolean': {
        ctx.strokeRect(x, y, s, s);
        break;
      }
      case 'date':
      case 'datetime': {
        ctx.strokeRect(x, y, s, s);
        ctx.beginPath();
        ctx.moveTo(x + 2, y + s * 0.35);
        ctx.lineTo(x + s - 2, y + s * 0.35);
        ctx.stroke();
        break;
      }
      case 'select':
      case 'multiSelect': {
        if (isBaseStyle) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(cx, cy, s * 0.38, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(cx, cy, s * 0.14, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x + s / 2, y + s / 2, s / 3, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'user': {
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(x + s / 2, y + s * 0.4, s * 0.3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + s / 2, y + s * 0.9, s * 0.45, Math.PI, 0);
        ctx.stroke();
        break;
      }
      case 'link':
      case 'email':
      case 'phone': {
        ctx.fillStyle = color;
        ctx.font = `${s}px Arial`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(type === 'link' ? '\u2197' : '@', x, y);
        break;
      }
      case 'formula': {
        ctx.fillStyle = color;
        ctx.font = `${s}px Arial`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('f', x, y);
        break;
      }
      case 'autoNumber': {
        ctx.fillStyle = color;
        ctx.font = `${s}px Arial`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('1', x, y);
        break;
      }
      case 'attachment': {
        ctx.strokeRect(x + 1, y + s * 0.2, s - 2, s * 0.6);
        ctx.beginPath();
        ctx.moveTo(x + s * 0.5, y + s * 0.4);
        ctx.lineTo(x + s * 0.5, y + s * 0.8);
        ctx.stroke();
        break;
      }
      default: {
        ctx.fillStyle = color;
        ctx.font = `${s}px Arial`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('?', x, y);
      }
    }
    ctx.restore();
  }

  /** 绘制排序箭头 */
  private _drawSortArrow(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, size: number,
    order: 'asc' | 'desc',
    color: string,
  ): void {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    if (order === 'asc') {
      ctx.moveTo(cx, cy - size / 2);
      ctx.lineTo(cx - size / 2, cy + size / 2);
      ctx.lineTo(cx + size / 2, cy + size / 2);
    } else {
      ctx.moveTo(cx, cy + size / 2);
      ctx.lineTo(cx - size / 2, cy - size / 2);
      ctx.lineTo(cx + size / 2, cy - size / 2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** 绘制筛选图标（小漏斗） */
  private _drawFilterIcon(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, size: number,
    color: string,
  ): void {
    ctx.save();
    ctx.fillStyle = color;
    const w = size * 1.4;
    const h = size;
    const x = cx - w / 2;
    const y = cy - h / 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w * 0.65, y + h * 0.5);
    ctx.lineTo(x + w * 0.65, y + h);
    ctx.lineTo(x + w * 0.35, y + h * 0.8);
    ctx.lineTo(x + w * 0.35, y + h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** 多维表行头 hover：拖拽 + 复选框 */
  private _drawBaseRowHeaderHover(
    ctx: CanvasRenderingContext2D,
    drawY: number,
    h: number,
    zoom: number,
    isChecked?: boolean,
  ): void {
    const cy = drawY + h / 2;
    const iconSize = 14 * zoom;
    const padding = 6 * zoom;

    const dragCx = padding + 7 * zoom;
    this._drawDragHandle(ctx, dragCx, cy, 8 * zoom, '#86909C');

    const cbX = padding + 18 * zoom;
    this._drawRowCheckbox(ctx, cbX, cy - iconSize / 2, iconSize, !!isChecked, zoom);
  }

  /** 多维表行头：父记录分支操作（+ | 分支数，靠右不与折叠三角重叠） */
  private _drawBaseRowHeaderBranchActions(
    ctx: CanvasRenderingContext2D,
    drawY: number,
    h: number,
    headerWidth: number,
    childCount: number,
    zoom: number,
    highlight?: boolean,
  ): void {
    const cy = drawY + h / 2;
    const padding = 6 * zoom;
    const plusCx = headerWidth - padding - 20 * zoom;
    const sepX = headerWidth - padding - 11 * zoom;
    const badgeX = headerWidth - padding - 5 * zoom;

    this._drawPlusIcon(ctx, plusCx, cy, 9 * zoom, highlight ? '#3370FF' : '#86909C');

    ctx.save();
    ctx.strokeStyle = '#DEE0E3';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sepX, cy - 7 * zoom);
    ctx.lineTo(sepX, cy + 7 * zoom);
    ctx.stroke();
    ctx.restore();

    this._drawBranchCountBadge(ctx, badgeX, cy, childCount, zoom);
  }

  private _drawBranchCountBadge(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    _count: number,
    zoom: number,
  ): void {
    ctx.save();
    ctx.strokeStyle = '#86909C';
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    const s = 5 * zoom;
    ctx.beginPath();
    ctx.moveTo(cx - s, cy - s * 0.6);
    ctx.lineTo(cx - s, cy + s * 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - s, cy - s * 0.6);
    ctx.lineTo(cx + s * 0.2, cy - s * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.2, cy + s * 0.2);
    ctx.lineTo(cx + s * 0.5, cy + s * 0.2);
    ctx.stroke();
    ctx.restore();
  }

  private _drawDragHandle(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color = '#bbb'): void {
    ctx.save();
    ctx.fillStyle = color;
    const dotR = 1.2;
    const gapX = 3.5;
    const gapY = 3.5;
    for (let row = -1; row <= 1; row++) {
      for (let col = -1; col <= 0; col++) {
        ctx.beginPath();
        ctx.arc(cx + col * gapX, cy + row * gapY, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private _drawRowCheckbox(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, size: number, checked: boolean, zoom: number,
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 2 * zoom);
    if (checked) {
      ctx.fillStyle = '#3370FF';
      ctx.fill();
      ctx.strokeStyle = '#3370FF';
      ctx.lineWidth = 1 * zoom;
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5 * zoom;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x + 3 * zoom, y + size / 2);
      ctx.lineTo(x + size * 0.4, y + size - 3 * zoom);
      ctx.lineTo(x + size - 2 * zoom, y + 2 * zoom);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#C9CDD4';
      ctx.lineWidth = 1 * zoom;
      ctx.stroke();
    }
    ctx.restore();
  }

  private _drawExpandPanelIcon(
    ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number,
  ): void {
    ctx.save();
    const x = cx - w / 2;
    const y = cy - h / 2;
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.65, y);
    ctx.lineTo(x + w * 0.65, y + h);
    ctx.stroke();
    ctx.restore();
  }

  private _drawPlusIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color = '#666'): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy - size / 2);
    ctx.lineTo(cx, cy + size / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - size / 2, cy);
    ctx.lineTo(cx + size / 2, cy);
    ctx.stroke();
    ctx.restore();
  }

  private _drawTreeIndent(
    ctx: CanvasRenderingContext2D,
    drawY: number,
    h: number,
    depth: number,
    zoom: number,
  ): void {
    ctx.save();
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.setLineDash([2 * zoom, 2 * zoom]);
    const x = 8 + (depth - 1) * 12 * zoom;
    ctx.beginPath();
    ctx.moveTo(x, drawY);
    ctx.lineTo(x, drawY + h);
    ctx.stroke();
    ctx.restore();
  }

  private _drawTreeChevron(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number,
    expanded: boolean,
  ): void {
    ctx.save();
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (expanded) {
      ctx.moveTo(cx - size / 2, cy - size / 4);
      ctx.lineTo(cx, cy + size / 4);
      ctx.lineTo(cx + size / 2, cy - size / 4);
    } else {
      ctx.moveTo(cx - size / 4, cy - size / 2);
      ctx.lineTo(cx + size / 4, cy);
      ctx.lineTo(cx - size / 4, cy + size / 2);
    }
    ctx.stroke();
    ctx.restore();
  }

  private _drawChildCountBadge(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    count: number,
    zoom: number,
  ): void {
    ctx.save();
    ctx.font = `${10 * zoom}px Arial, sans-serif`;
    ctx.fillStyle = '#666';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('⎇', cx - 10 * zoom, cy);
    ctx.fillText(String(count), cx + 2 * zoom, cy);
    ctx.restore();
  }

  /** 绘制行头 */
  drawRowHeaders(
    ctx: CanvasRenderingContext2D,
    visibleRange: VisibleRange,
    rowCount: number,
    rowHeights: Map<number, number>,
    hoveredRow?: number | null,
    selectedRows?: number[],
    checkedRows?: number[],
    isBase?: boolean,
    rowTreeMeta?: BaseRowHeaderMeta[],
    activeRow?: number | null,
    /** 多维表：编辑区底部屏幕 Y，用于裁剪序号列背景，避免超出网格 */
    contentBottom?: number,
  ): void {
    const config = this._viewportManager.config;
    const zoom = this._viewportManager.zoomLevel;
    const dpr = window.devicePixelRatio || 1;
    const canvasHeight = ctx.canvas.height / dpr;

    const isBaseMode = !!config.isBaseMode || !!isBase;
    const axisSel = resolveAxisSelection(isBaseMode);
    const primaryColor = isBaseMode ? '#3370FF' : '#1a73e8';
    const fontFamily = config.fontFamily || 'Arial, sans-serif';
    const secondaryColor = config.secondaryTextColor || '#86909C';

    const rowHeaderFillBottom = isBaseMode && contentBottom !== undefined
      ? Math.min(canvasHeight, contentBottom)
      : canvasHeight;
    const rowHeaderFillHeight = Math.max(0, rowHeaderFillBottom - config.headerHeight);

    ctx.fillStyle = config.headerBgColor;
    if (rowHeaderFillHeight > 0) {
      ctx.fillRect(0, config.headerHeight, config.headerWidth, rowHeaderFillHeight);
    }

    let y = config.headerHeight;
    for (let r = 0; r <= visibleRange.endRow && r < rowCount; r++) {
      const h = resolveRowHeight(r, rowHeights, config.defaultRowHeight) * zoom;
      if (h === 0) {
        y += h;
        continue;
      }
      const drawY = this._viewportManager.getRowScreenTop(r, rowHeights);

      if (r >= visibleRange.startRow) {
        if (drawY + h >= 0 && drawY <= canvasHeight) {
          const isHovered = hoveredRow === r;
          const isSelected = selectedRows?.includes(r);
          const isChecked = checkedRows?.includes(r);
          const isActive = activeRow === r;
          const meta = rowTreeMeta?.[r];
          const depth = meta?.depth ?? 0;
          const showHoverControls = isBase && (isHovered || isChecked || isActive || isSelected);

          if (isActive && isBaseMode) {
            ctx.fillStyle = BASE_AXIS_SELECTION.headerBg;
            ctx.fillRect(0, drawY, config.headerWidth, h);
          } else if (isChecked && isBaseMode) {
            ctx.fillStyle = BASE_THEME.rowCheckedBg;
            ctx.fillRect(0, drawY, config.headerWidth, h);
          } else if (isSelected && !isChecked) {
            ctx.fillStyle = axisSel.headerBg;
            ctx.fillRect(0, drawY, config.headerWidth, h);
          } else if (isHovered && isBaseMode) {
            ctx.fillStyle = BASE_THEME.rowHoverBg;
            ctx.fillRect(0, drawY, config.headerWidth, h);
          }

          if (isBase) {
            if (showHoverControls) {
              this._drawBaseRowHeaderHover(ctx, drawY, h, zoom, isChecked);
            }

            if (depth === 0 && meta?.hasChildren) {
              const chevronCx = showHoverControls ? 38 * zoom : 22 * zoom;
              this._drawTreeChevron(
                ctx, chevronCx, drawY + h / 2, 8 * zoom,
                meta.isExpanded !== false,
              );
            }

            if (depth === 0 && !showHoverControls && !meta?.hasChildren) {
              ctx.font = `${12 * zoom}px ${fontFamily}`;
              ctx.fillStyle = isActive ? primaryColor : secondaryColor;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(String(r + 1), config.headerWidth / 2, drawY + h / 2);
            }

            if (!showHoverControls && meta?.hasChildren && meta.childCount > 0) {
              this._drawBaseRowHeaderBranchActions(
                ctx, drawY, h, config.headerWidth, meta.childCount, zoom, isHovered || isActive,
              );
            }
          } else {
            ctx.font = `${11 * zoom}px ${fontFamily}`;
            ctx.fillStyle = isSelected ? primaryColor : config.headerTextColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(r + 1), config.headerWidth / 2, drawY + h / 2);
          }

          ctx.strokeStyle = config.gridColor;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, drawY + h);
          ctx.lineTo(config.headerWidth, drawY + h);
          ctx.stroke();
        }
      }

      y += h;
    }

    // 多维表：序号列与首列之间不绘制竖线
    if (!isBaseMode) {
      ctx.strokeStyle = config.gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(config.headerWidth, 0);
      ctx.lineTo(config.headerWidth, canvasHeight);
      ctx.stroke();
    }
  }

  /** 绘制左上角 corner（全选区域） */
  drawCornerHeader(
    ctx: CanvasRenderingContext2D,
    checked?: boolean,
    hovered?: boolean,
  ): void {
    const config = this._viewportManager.config;
    const zoom = this._viewportManager.zoomLevel;
    const w = config.headerWidth;
    const h = config.headerHeight;
    const isBase = !!config.isBaseMode;
    const primaryColor = isBase ? '#3370FF' : '#1a73e8';
    const borderColor = isBase ? '#C9CDD4' : '#999';

    ctx.fillStyle = hovered ? (isBase ? '#F7F8FA' : '#ebebeb') : config.headerBgColor;
    ctx.fillRect(0, 0, w, h);

    const size = Math.min(14 * zoom, w - 10, h - 8);
    const cx = isBase ? 6 * zoom + size / 2 : w / 2;
    const cy = h / 2;
    const hs = size / 2;

    ctx.save();
    ctx.strokeStyle = checked ? primaryColor : borderColor;
    ctx.lineWidth = 1.2 * zoom;
    ctx.beginPath();
    ctx.roundRect(cx - hs, cy - hs, size, size, 2 * zoom);
    ctx.stroke();

    if (checked) {
      ctx.fillStyle = primaryColor;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5 * zoom;
      ctx.beginPath();
      ctx.moveTo(cx - hs * 0.5, cy);
      ctx.lineTo(cx - hs * 0.1, cy + hs * 0.5);
      ctx.lineTo(cx + hs * 0.5, cy - hs * 0.4);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = config.gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w, h);
    ctx.stroke();
    if (!isBase) {
      ctx.beginPath();
      ctx.moveTo(w, 0);
      ctx.lineTo(w, h);
      ctx.stroke();
    }
  }

  /** 绘制单元格边框（覆盖默认网格线） */
  drawCellBorders(
    ctx: CanvasRenderingContext2D,
    coord: CellCoord,
    cellData: CellData | undefined,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    mergeRanges?: CellRange[],
  ): void {
    const config = this._viewportManager.config;
    if (isRowLayoutHidden(coord.row, rowHeights, config.defaultRowHeight)) return;
    if (!cellData?.style) return;

    let rect = this._viewportManager.getCellRect(coord, columnWidths, rowHeights);

    if (mergeRanges) {
      for (const range of mergeRanges) {
        if (coord.row >= range.start.row && coord.row <= range.end.row
          && coord.col >= range.start.col && coord.col <= range.end.col) {
          const master = range.master || range.start;
          if (coord.row !== master.row || coord.col !== master.col) {
            return;
          }
          if (range.start.row !== range.end.row || range.start.col !== range.end.col) {
            const bottomRight = this._viewportManager.getCellRect(range.end, columnWidths, rowHeights);
            rect = {
              x: rect.x,
              y: rect.y,
              width: bottomRight.x + bottomRight.width - rect.x,
              height: bottomRight.y + bottomRight.height - rect.y,
            };
          }
          break;
        }
      }
    }

    const style = cellData.style;
    const zoom = this._viewportManager.zoomLevel;

    // Border thickness mapping
    const BORDER_PX: Record<string, number> = { thin: 1, medium: 2, thick: 3, dashed: 1, dotted: 1, double: 3, none: 0 };

    const drawSide = (side: 'top' | 'right' | 'bottom' | 'left', border: { color: string; style: string }) => {
      if (border.style === 'none') return;
      ctx.strokeStyle = border.color;
      ctx.lineWidth = (BORDER_PX[border.style] || 1) * zoom;

      if (border.style === 'dashed') ctx.setLineDash([4 * zoom, 2 * zoom]);
      else if (border.style === 'dotted') ctx.setLineDash([1 * zoom, 2 * zoom]);
      else if (border.style === 'double') ctx.setLineDash([]);
      else ctx.setLineDash([]);

      ctx.beginPath();
      let x1: number, y1: number, x2: number, y2: number;
      const halfW = ctx.lineWidth / 2;

      switch (side) {
        case 'top':
          y1 = y2 = rect.y + halfW;
          x1 = rect.x; x2 = rect.x + rect.width;
          break;
        case 'bottom':
          y1 = y2 = rect.y + rect.height - halfW;
          x1 = rect.x; x2 = rect.x + rect.width;
          break;
        case 'left':
          x1 = x2 = rect.x + halfW;
          y1 = rect.y; y2 = rect.y + rect.height;
          break;
        case 'right':
          x1 = x2 = rect.x + rect.width - halfW;
          y1 = rect.y; y2 = rect.y + rect.height;
          break;
        default:
          return;
      }
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Double border: draw a second line offset inward
      if (border.style === 'double') {
        const gap = 3 * zoom;
        ctx.beginPath();
        if (side === 'top') { y1 = y2 = rect.y + halfW + gap; }
        if (side === 'bottom') { y1 = y2 = rect.y + rect.height - halfW - gap; }
        if (side === 'left') { x1 = x2 = rect.x + halfW + gap; }
        if (side === 'right') { x1 = x2 = rect.x + rect.width - halfW - gap; }
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      ctx.setLineDash([]);
    };

    if (style.borderTop && style.borderTop.style !== 'none') drawSide('top', style.borderTop);
    if (style.borderRight && style.borderRight.style !== 'none') drawSide('right', style.borderRight);
    if (style.borderBottom && style.borderBottom.style !== 'none') drawSide('bottom', style.borderBottom);
    if (style.borderLeft && style.borderLeft.style !== 'none') drawSide('left', style.borderLeft);
  }
}

/** Helper function for column number to name */
function colToName(col: number): string {
  let name = '';
  let n = col;
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}
