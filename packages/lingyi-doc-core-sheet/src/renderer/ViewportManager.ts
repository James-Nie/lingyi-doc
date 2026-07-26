import { CellCoord, CellRange, DEFAULT_COLUMN_WIDTH, DEFAULT_ROW_HEIGHT } from '@lingyi-doc/core-types';
import { resolveColumnWidth } from '../utils/columnLayout';
import { resolveRowHeight } from '../utils/rowLayout';
import { BASE_THEME, computeBaseGridWidth } from './baseTheme';
import type { RenderConfig, VisibleRange } from './types';
import { DEFAULT_RENDER_CONFIG } from './types';

// ==================== ViewportManager ====================

interface AxisPrefixCache {
  source: Map<number, number>;
  count: number;
  zoom: number;
  defaultSize: number;
  checksum: number;
  /** prefix[i] = 前 i 行/列的尺寸之和（zoom 后） */
  prefix: Float64Array;
}

function axisMapChecksum(map: Map<number, number>): number {
  let h = map.size | 0;
  for (const [k, v] of map) {
    h = (Math.imul(h ^ (k | 0), 16777619) + (v | 0)) | 0;
  }
  return h;
}

/** 在 [lo, hi] 内找最小 i 使 prefix[i] >= target；若都不满足返回 hi */
function lowerBoundPrefix(prefix: Float64Array, target: number, lo: number, hi: number): number {
  let left = lo;
  let right = hi;
  while (left < right) {
    const mid = (left + right) >> 1;
    if (prefix[mid] >= target) right = mid;
    else left = mid + 1;
  }
  return left;
}

/** 找最小 index ∈ [0, count) 使 prefix[index+1] > offset（与线性扫描 accum > offset 一致） */
function findIndexByOffset(prefix: Float64Array, offset: number, count: number): number | null {
  if (count <= 0 || offset < 0 || offset >= prefix[count]) return null;
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (prefix[mid + 1] > offset) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export class ViewportManager {
  private _scrollTop = 0;
  private _scrollLeft = 0;
  private _zoomLevel: number;
  private _config: RenderConfig;
  private _freezeState: { frozenRows: number; frozenCols: number } = { frozenRows: 0, frozenCols: 0 };
  private _rowCache: AxisPrefixCache | null = null;
  private _colCache: AxisPrefixCache | null = null;

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

  /** 布局变更后可主动失效（可选；默认按 Map checksum 自动失效） */
  invalidateAxisLayoutCache(): void {
    this._rowCache = null;
    this._colCache = null;
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

  private _ensureAxisPrefix(
    cache: AxisPrefixCache | null,
    count: number,
    source: Map<number, number>,
    zoom: number,
    defaultSize: number,
    resolveSize: (index: number, map: Map<number, number>, def: number) => number,
  ): AxisPrefixCache {
    const checksum = axisMapChecksum(source);
    if (
      cache
      && cache.source === source
      && cache.count >= count
      && cache.zoom === zoom
      && cache.defaultSize === defaultSize
      && cache.checksum === checksum
    ) {
      return cache;
    }

    const prefix = new Float64Array(count + 1);
    for (let i = 0; i < count; i++) {
      prefix[i + 1] = prefix[i] + resolveSize(i, source, defaultSize) * zoom;
    }
    return { source, count, zoom, defaultSize, checksum, prefix };
  }

  private _ensureRowPrefix(rowCount: number, rowHeights: Map<number, number>): Float64Array {
    this._rowCache = this._ensureAxisPrefix(
      this._rowCache,
      rowCount,
      rowHeights,
      this._zoomLevel,
      this._config.defaultRowHeight,
      resolveRowHeight,
    );
    return this._rowCache.prefix;
  }

  private _ensureColPrefix(colCount: number, columnWidths: Map<number, number>): Float64Array {
    this._colCache = this._ensureAxisPrefix(
      this._colCache,
      colCount,
      columnWidths,
      this._zoomLevel,
      this._config.defaultColumnWidth,
      resolveColumnWidth,
    );
    return this._colCache.prefix;
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

    const rowPrefix = this._ensureRowPrefix(rowCount, rowHeights);
    const colPrefix = this._ensureColPrefix(colCount, columnWidths);

    const totalRowH = rowPrefix[rowCount];
    const maxTop = Math.max(0, totalRowH + extraScrollBottom - contentHeight);

    const frozenCols = this._freezeState.frozenCols;
    const frozenWidth = colPrefix[frozenCols];
    let totalScrollableColW = colPrefix[colCount] - frozenWidth;
    if (this._config.isBaseMode) {
      totalScrollableColW += BASE_THEME.addColumnWidth;
    }
    const scrollableViewportW = Math.max(0, contentWidth - frozenWidth);
    const maxLeft = Math.max(0, totalScrollableColW - scrollableViewportW);

    const frozenRows = this._freezeState.frozenRows;
    const frozenHeight = rowPrefix[frozenRows];
    const totalScrollableRowH = rowPrefix[rowCount] - frozenHeight;
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
    const frozenCols = this._freezeState.frozenCols;
    if (frozenCols <= 0) return 0;
    const prefix = this._ensureColPrefix(frozenCols, columnWidths);
    return prefix[frozenCols];
  }

  /** 冻结行总高度（内容区，不含列头） */
  getFrozenHeight(rowHeights: Map<number, number>): number {
    const frozenRows = this._freezeState.frozenRows;
    if (frozenRows <= 0) return 0;
    const prefix = this._ensureRowPrefix(frozenRows, rowHeights);
    return prefix[frozenRows];
  }

  /** 行在内容区的绝对 Y（未减 scrollTop） */
  getRowContentY(row: number, rowHeights: Map<number, number>): number {
    if (row <= 0) return 0;
    const prefix = this._ensureRowPrefix(row, rowHeights);
    return prefix[row];
  }

  /** 行在 Canvas 上的顶边 Y */
  getRowScreenTop(row: number, rowHeights: Map<number, number>): number {
    const frozenRows = this._freezeState.frozenRows;
    const need = Math.max(row, frozenRows);
    const prefix = this._ensureRowPrefix(need, rowHeights);
    const frozenHeight = prefix[frozenRows];
    if (row < frozenRows) {
      return this._config.headerHeight + prefix[row];
    }
    const scrollableY = prefix[row] - prefix[frozenRows];
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
    if (col <= 0) return 0;
    const prefix = this._ensureColPrefix(col, columnWidths);
    return prefix[col];
  }

  /** 列在 Canvas 上的左边缘 X */
  getColumnScreenLeft(col: number, columnWidths: Map<number, number>): number {
    const frozenCols = this._freezeState.frozenCols;
    const need = Math.max(col, frozenCols);
    const prefix = this._ensureColPrefix(need, columnWidths);
    const frozenWidth = prefix[frozenCols];
    if (col < frozenCols) {
      return this._config.headerWidth + prefix[col];
    }
    const scrollableX = prefix[col] - prefix[frozenCols];
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
    const rowPrefix = this._ensureRowPrefix(rowCount, rowHeights);
    const colPrefix = this._ensureColPrefix(colCount, columnWidths);
    let totalW = this._config.headerWidth + colPrefix[colCount];
    if (this._config.isBaseMode) {
      totalW += BASE_THEME.addColumnWidth;
    }
    const totalH = this._config.headerHeight + rowPrefix[rowCount];
    return { width: totalW, height: totalH };
  }

  setZoomLevel(level: number): void {
    const next = Math.max(0.5, Math.min(3.0, level));
    if (next !== this._zoomLevel) {
      this._zoomLevel = next;
      this.invalidateAxisLayoutCache();
    }
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
    if (rowCount <= 0 || colCount <= 0) {
      return { startRow: 0, endRow: -1, startCol: 0, endCol: -1 };
    }

    const contentWidth = canvasWidth - this._config.headerWidth;
    const contentHeight = canvasHeight - this._config.headerHeight;
    const frozenRows = this._freezeState.frozenRows;
    const frozenCols = this._freezeState.frozenCols;

    const rowPrefix = this._ensureRowPrefix(rowCount, rowHeights);
    const colPrefix = this._ensureColPrefix(colCount, columnWidths);
    const frozenHeight = rowPrefix[Math.min(frozenRows, rowCount)];
    const frozenWidth = colPrefix[Math.min(frozenCols, colCount)];

    // 第一个「底边越过 scrollTop」的行（完全在视口上方的行被跳过）
    let scrollStartRow = frozenRows;
    if (rowCount > frozenRows) {
      const topTarget = this._scrollTop + rowPrefix[frozenRows];
      const bottomIdx = lowerBoundPrefix(rowPrefix, topTarget, frozenRows + 1, rowCount);
      scrollStartRow = Math.min(Math.max(frozenRows, bottomIdx - 1), rowCount - 1);
    }

    // 最后一个「顶边仍在视口底之上」的行
    let endRow = Math.max(scrollStartRow, rowCount > 0 ? rowCount - 1 : 0);
    if (rowCount > scrollStartRow) {
      const scrollableViewportH = Math.max(0, contentHeight - frozenHeight);
      const bottomTarget = rowPrefix[frozenRows] + this._scrollTop + scrollableViewportH;
      const idx = lowerBoundPrefix(rowPrefix, bottomTarget, scrollStartRow, rowCount);
      if (idx >= rowCount) {
        endRow = rowCount - 1;
      } else if (idx > scrollStartRow && rowPrefix[idx] >= bottomTarget) {
        endRow = idx - 1;
      } else {
        endRow = idx;
      }
      endRow = Math.min(Math.max(endRow, scrollStartRow), rowCount - 1);
    }

    const startRow = frozenRows > 0 ? 0 : Math.max(0, scrollStartRow - 5);

    let startCol = frozenCols;
    if (colCount > frozenCols) {
      const leftTarget = this._scrollLeft + colPrefix[frozenCols];
      const rightIdx = lowerBoundPrefix(colPrefix, leftTarget, frozenCols + 1, colCount);
      startCol = Math.min(Math.max(frozenCols, rightIdx - 1), colCount - 1);
    }

    let endCol = Math.max(startCol, colCount > 0 ? colCount - 1 : 0);
    if (colCount > startCol) {
      const scrollableViewportW = Math.max(0, contentWidth - frozenWidth);
      const rightTarget = colPrefix[frozenCols] + this._scrollLeft + scrollableViewportW;
      const idx = lowerBoundPrefix(colPrefix, rightTarget, startCol, colCount);
      if (idx >= colCount) {
        endCol = colCount - 1;
      } else if (idx > startCol && colPrefix[idx] >= rightTarget) {
        endCol = idx - 1;
      } else {
        endCol = idx;
      }
      endCol = Math.min(Math.max(endCol, startCol), colCount - 1);
    }

    return {
      startRow,
      endRow: Math.min(rowCount - 1, endRow + 5),
      startCol: frozenCols > 0 ? 0 : Math.max(0, startCol - 2),
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

    const colPrefix = this._ensureColPrefix(colCount, columnWidths);
    const rowPrefix = this._ensureRowPrefix(rowCount, rowHeights);
    const col = findIndexByOffset(colPrefix, x, colCount);
    const row = findIndexByOffset(rowPrefix, y, rowCount);
    if (col === null || row === null) return null;

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
    if (colCount < 0) return null;
    const prefix = this._ensureColPrefix(Math.max(colCount, 0), columnWidths);
    const threshold = 6 * this._zoomLevel;
    for (let c = 0; c < colCount; c++) {
      if (Math.abs(x - prefix[c + 1]) < threshold) return c;
    }
    const trailing = prefix[colCount] + this._config.defaultColumnWidth * this._zoomLevel;
    if (Math.abs(x - trailing) < threshold) return colCount;
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
    if (rowCount < 0) return null;
    const prefix = this._ensureRowPrefix(Math.max(rowCount, 0), rowHeights);
    const threshold = 6 * this._zoomLevel;
    for (let r = 0; r < rowCount; r++) {
      if (Math.abs(y - prefix[r + 1]) < threshold) return r;
    }
    // 兼容旧逻辑：再检查「最后一行之后」一格默认行高处
    const trailing = prefix[rowCount] + this._config.defaultRowHeight * this._zoomLevel;
    if (Math.abs(y - trailing) < threshold) return rowCount;
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
    if (x < 0 || colCount <= 0) return null;
    const prefix = this._ensureColPrefix(colCount, columnWidths);
    return findIndexByOffset(prefix, x, colCount);
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
    if (y < 0 || rowCount <= 0) return null;
    const prefix = this._ensureRowPrefix(rowCount, rowHeights);
    return findIndexByOffset(prefix, y, rowCount);
  }
}
