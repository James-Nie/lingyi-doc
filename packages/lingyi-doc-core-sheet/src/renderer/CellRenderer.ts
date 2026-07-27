import {
  CellData, CellStyle, CellCoord, coordToKey,
  DEFAULT_CELL_STYLE, DEFAULT_COLUMN_WIDTH, DEFAULT_ROW_HEIGHT,
  CellRange, SheetModel, getCellText, getCellAlign, ColumnDef, DataValidation, BorderStyle,
  ImageValue,
} from '@lingyi-doc/core-types';
import { resolveColumnWidth } from '../utils/columnLayout';
import { resolveRowHeight, isRowLayoutHidden } from '../utils/rowLayout';
import { BASE_THEME, getSelectTagColors, computeBaseGridWidth, computeBaseGridScreenBounds } from './baseTheme';
import { findSelectOption, parseMultiSelectOptionIds } from '../utils/selectOptions';
import {
  applyBorderLineDash,
  resolveBorderLineWidth,
  shouldDrawCellBorderSide,
  type BorderLineStyle,
} from '../utils/borderStyles';
import {
  cellValueIncludeTime,
  formatFreeformDateCellText,
  shouldShowFreeformDateTime,
} from '../utils/dateValidation';
import { drawFieldTypeIcon } from '../utils/fieldTypeIcons';

import type { BaseRowHeaderMeta, RecordTreeColumnMeta } from '../utils/rowTree';
import { getTreeContentRect } from '../utils/rowTree';

import type { ViewportManager } from './ViewportManager';
import type { RenderConfig, VisibleRange } from './types';
import { AXIS_SELECTION, BASE_AXIS_SELECTION, resolveAxisSelection, resolveCellBackgroundFillColor } from './types';
import { colToName } from '@lingyi-doc/core-types';
import { AsyncAssetManager } from './BaseCellRenderer';

// Re-use comment highlight colors from core-types
import { DOC_COMMENT_HIGHLIGHT_SELECTED_BG, DOC_COMMENT_HIGHLIGHT_IDLE_BG } from '@lingyi-doc/core-types';

export interface CellRendererOptions {
  assetManager?: AsyncAssetManager;
}

export class CellRenderer {
  protected _viewportManager: ViewportManager;
  protected _assetManager: AsyncAssetManager;

  constructor(viewportManager: ViewportManager, options?: CellRendererOptions) {
    this._viewportManager = viewportManager;
    this._assetManager = options?.assetManager || new AsyncAssetManager();
  }

  get assetManager(): AsyncAssetManager {
    return this._assetManager;
  }

  get viewportManager(): ViewportManager {
    return this._viewportManager;
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
    skipRow?: (row: number) => boolean,
    /** 分组视图：整行跳过分割竖线（分组头 / 添加记录行） */
    skipLayoutRow?: (row: number) => boolean,
    /** 分组视图：横线起点、右边线、网格色覆盖 */
    groupedGridOpts?: {
      horizontalLineLeft?: number;
      skipRightEdge?: boolean;
      gridColor?: string;
    },
  ): void {
    const config = this._viewportManager.config;

    ctx.strokeStyle = groupedGridOpts?.gridColor ?? config.gridColor;
    ctx.lineWidth = config.isBaseMode ? 1 : 0.5;

    const horizontalLineLeft = groupedGridOpts?.horizontalLineLeft ?? 0;

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

    // 绘制水平线（冻结行与可滚动行分区，避免滚动时横线侵入冻结区）
    const vm = this._viewportManager;
    const zoom = vm.zoomLevel;
    const frozenRows = freezeState.frozenRows;
    const frozenBoundaryY = frozenRows > 0
      ? config.headerHeight + vm.getFrozenHeight(rowHeights)
      : config.headerHeight;

    const strokeHorizontalGridLine = (r: number): 'break' | void => {
      if (r > 0 && isRowLayoutHidden(r - 1, rowHeights, config.defaultRowHeight)) return;
      if (skipRow?.(r)) return;
      let drawY: number;
      if (frozenRows > 0 && r === frozenRows) {
        // 冻结行下边界固定，不随 scrollTop 移动
        drawY = frozenBoundaryY;
      } else if (r < rowCount) {
        drawY = vm.getRowScreenTop(r, rowHeights);
      } else {
        drawY = vm.getRowScreenTop(rowCount - 1, rowHeights)
          + resolveRowHeight(rowCount - 1, rowHeights, config.defaultRowHeight) * zoom;
      }
      if (drawY < config.headerHeight || drawY > canvasCssHeight) {
        if (r > visibleRange.endRow + 1) return 'break';
        return;
      }
      ctx.beginPath();
      ctx.moveTo(horizontalLineLeft, drawY);
      ctx.lineTo(gridLineRight, drawY);
      ctx.stroke();
    };

    if (frozenRows > 0) {
      for (let r = 0; r <= frozenRows; r++) {
        if (strokeHorizontalGridLine(r) === 'break') break;
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(
        horizontalLineLeft,
        frozenBoundaryY,
        Math.max(0, gridLineRight - horizontalLineLeft),
        Math.max(0, canvasCssHeight - frozenBoundaryY),
      );
      ctx.clip();
      const scrollLineStart = Math.max(frozenRows + 1, visibleRange.startRow);
      for (let r = scrollLineStart; r <= rowCount; r++) {
        if (strokeHorizontalGridLine(r) === 'break') break;
      }
      ctx.restore();
    } else {
      const lineStart = Math.max(0, visibleRange.startRow);
      for (let r = lineStart; r <= rowCount; r++) {
        if (strokeHorizontalGridLine(r) === 'break') break;
      }
    }

    // 多维表：添加列右缘竖线
    if (config.isBaseMode && gridLineRight > config.headerWidth && !groupedGridOpts?.skipRightEdge) {
      if (skipLayoutRow) {
        const segStartRow = Math.max(0, visibleRange.startRow);
        const segEndRow = Math.min(rowCount - 1, visibleRange.endRow);
        let segTop: number | null = null;
        for (let r = segStartRow; r <= segEndRow; r++) {
          const rowTop = vm.getRowScreenTop(r, rowHeights);
          const rowH = resolveRowHeight(r, rowHeights, config.defaultRowHeight) * zoom;
          const rowBottom = rowTop + rowH;
          if (skipLayoutRow(r)) {
            if (segTop !== null) {
              ctx.beginPath();
              ctx.moveTo(gridLineRight, segTop);
              ctx.lineTo(gridLineRight, rowTop);
              ctx.stroke();
              segTop = null;
            }
          } else {
            if (segTop === null) segTop = rowTop;
            if (r === segEndRow) {
              ctx.beginPath();
              ctx.moveTo(gridLineRight, segTop);
              ctx.lineTo(gridLineRight, rowBottom);
              ctx.stroke();
              segTop = null;
            }
          }
        }
      } else if (frozenRows > 0) {
        // 冻结行以下再画右缘，避免竖线画进冻结区上方
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, frozenBoundaryY, canvasCssWidth, Math.max(0, canvasCssHeight - frozenBoundaryY));
        ctx.clip();
        ctx.beginPath();
        ctx.moveTo(gridLineRight, frozenBoundaryY);
        ctx.lineTo(gridLineRight, gridLineBottom);
        ctx.stroke();
        ctx.restore();
        // 冻结行内右缘（固定）
        ctx.beginPath();
        ctx.moveTo(gridLineRight, 0);
        ctx.lineTo(gridLineRight, frozenBoundaryY);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(gridLineRight, 0);
        ctx.lineTo(gridLineRight, gridLineBottom);
        ctx.stroke();
      }
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

      if (skipLayoutRow) {
        const segStartRow = Math.max(0, visibleRange.startRow);
        const segEndRow = Math.min(rowCount - 1, visibleRange.endRow);
        let segTop: number | null = null;
        for (let r = segStartRow; r <= segEndRow; r++) {
          const rowTop = vm.getRowScreenTop(r, rowHeights);
          const rowH = resolveRowHeight(r, rowHeights, config.defaultRowHeight) * zoom;
          const rowBottom = rowTop + rowH;
          if (skipLayoutRow(r)) {
            if (segTop !== null) {
              ctx.beginPath();
              ctx.moveTo(drawX, segTop);
              ctx.lineTo(drawX, rowTop);
              ctx.stroke();
              segTop = null;
            }
          } else {
            if (segTop === null) segTop = rowTop;
            if (r === segEndRow) {
              ctx.beginPath();
              ctx.moveTo(drawX, segTop);
              ctx.lineTo(drawX, rowBottom);
              ctx.stroke();
              segTop = null;
            }
          }
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(drawX, 0);
        ctx.lineTo(drawX, gridLineBottom);
        ctx.stroke();
      }
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
        const lineY = frozenBoundaryY;
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
  protected _wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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

  /**
   * 绘制下拉箭头
   * @param ctx 画布上下文
   * @param rect 下拉箭头的矩形区域
   * @param zoom 缩放比例
   * 
   */
  protected _drawDropdownChevron(
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

  /**
   * 绘制下拉标签
   * @param ctx 画布上下文
   * @param text 标签文本
   * @param color 标签颜色
   * @param x 标签左上角x坐标
   * @param y 标签左上角y坐标
   * @param maxWidth 标签最大宽度
   * @param zoom 
   * @param showOptionColor 
   * @returns 标签宽度
   */
  protected _drawDropdownTag(
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

  protected _drawDropdownListContent(
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

  /**
   * 绘制日期单元格内容
   * @param ctx 画布上下文
   * @param cellData 单元格数据
   * @param validation 单元格验证
   * @param rect 单元格矩形区域
   * @param zoom 缩放比例
   * @returns 无
   */
  protected _drawDateCellContent(
    ctx: CanvasRenderingContext2D,
    cellData: CellData | undefined,
    validation: DataValidation,
    rect: { x: number; y: number; width: number; height: number },
    zoom: number,
  ): void {
    const chevronReserve = 14 * zoom;
    const padding = 4 * zoom;
    const maxContentWidth = Math.max(0, rect.width - padding * 2 - chevronReserve);
    const value = cellData?.value;

    if (value?.type === 'date') {
      const showTime = shouldShowFreeformDateTime(value);
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

  /**
   * 绘制单元格内容
   * @param ctx 上画布上下文
   * @param coord 单元格坐标
   * @param cellData 单元格数据
   * @param columnWidths 列宽度映射
   * @param rowHeights 行高度映射
   * @param mergeRanges 合并区域数组
   * @param dropdownValidation 下拉列表验证
   * @returns 无
   */
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

    // ─── Image → Canvas rendering ───
    if (cellData.value.type === 'image') {
      this._drawImage(ctx, cellData.value, rect);
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

  /**
   * 绘制列头
   */
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
      const fontSize = (isBase ? 14 : 12) * zoom;
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.fillStyle = isSelected ? primaryColor : config.headerTextColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      const padding = (isBase ? 12 : 8) * zoom;
      const iconWidth = (isBase ? 22 : 16) * zoom;
      let textX = drawX + padding;

      if (isBase && c === 0 && colDef) {
        const lockColor = isSelected ? primaryColor : (config.secondaryTextColor || '#86909C');
        this._drawLockIcon(ctx, textX + 6 * zoom, config.headerHeight / 2, 16 * zoom, lockColor);
        textX += iconWidth;
      }

      if (colDef) {
        const iconColor = isSelected ? primaryColor : (config.secondaryTextColor || '#86909C');
        this._drawFieldTypeIcon(ctx, colDef.type, textX + 8 * zoom, config.headerHeight / 2, 14 * zoom, iconColor, isBase);
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
        this._drawFilterIcon(ctx, filterX, filterY, 16 * zoom, hasActiveFilter ? primaryColor : '#86909C');
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

  /**
   * 绘制首列锁定图标
   */
  protected _drawLockIcon(
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
  protected _drawFieldTypeIcon(
    ctx: CanvasRenderingContext2D,
    type: ColumnDef['type'],
    cx: number, cy: number, size: number,
    color: string,
    _isBaseStyle = false,
  ): void {
    drawFieldTypeIcon(ctx, type, cx, cy, size, color);
  }

  /** 绘制排序箭头 */
  protected _drawSortArrow(
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
  protected _drawFilterIcon(
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
    const cx = isBase ? 6 * zoom + size / 2 + 18 : w / 2;
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

  /** 绘制单元格边框（覆盖默认网格线；共享边去重，避免内边框双线叠加） */
  drawCellBorders(
    ctx: CanvasRenderingContext2D,
    coord: CellCoord,
    cellData: CellData | undefined,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    mergeRanges?: CellRange[],
    getCellAt?: (row: number, col: number) => CellData | undefined,
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
    const drawSide = (side: 'top' | 'right' | 'bottom' | 'left', border: { color: string; style: string }) => {
      if (border.style === 'none') return;
      ctx.strokeStyle = border.color;
      ctx.lineWidth = resolveBorderLineWidth(border.style as BorderLineStyle, zoom);
      applyBorderLineDash(ctx, border.style as BorderLineStyle, zoom);

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

    const neighborSide = (side: 'top' | 'right' | 'bottom' | 'left'): BorderStyle | undefined => {
      if (!getCellAt) return undefined;
      switch (side) {
        case 'top':
          return getCellAt(coord.row - 1, coord.col)?.style?.borderBottom;
        case 'left':
          return getCellAt(coord.row, coord.col - 1)?.style?.borderRight;
        case 'right':
          return getCellAt(coord.row, coord.col + 1)?.style?.borderLeft;
        case 'bottom':
          return getCellAt(coord.row + 1, coord.col)?.style?.borderTop;
      }
    };

    if (shouldDrawCellBorderSide('top', style.borderTop, neighborSide)) {
      drawSide('top', style.borderTop!);
    }
    if (shouldDrawCellBorderSide('left', style.borderLeft, neighborSide)) {
      drawSide('left', style.borderLeft!);
    }
    if (shouldDrawCellBorderSide('right', style.borderRight, neighborSide)) {
      drawSide('right', style.borderRight!);
    }
    if (shouldDrawCellBorderSide('bottom', style.borderBottom, neighborSide)) {
      drawSide('bottom', style.borderBottom!);
    }
  }

  /** 评论单元格背景高亮（选中态 / 普通态） */
  drawCellCommentHighlight(
    ctx: CanvasRenderingContext2D,
    coord: CellCoord,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    selected: boolean,
    mergeRanges?: CellRange[],
  ): void {
    const config = this._viewportManager.config;
    if (isRowLayoutHidden(coord.row, rowHeights, config.defaultRowHeight)) return;

    if (mergeRanges) {
      for (const range of mergeRanges) {
        if (coord.row >= range.start.row && coord.row <= range.end.row
            && coord.col >= range.start.col && coord.col <= range.end.col) {
          const master = range.master || range.start;
          if (coord.row !== master.row || coord.col !== master.col) return;
          break;
        }
      }
    }

    let rect = this._viewportManager.getCellRect(coord, columnWidths, rowHeights);
    if (mergeRanges) {
      for (const range of mergeRanges) {
        const master = range.master || range.start;
        if (coord.row === master.row && coord.col === master.col
            && (range.start.row !== range.end.row || range.start.col !== range.end.col)) {
          const bottomRight = this._viewportManager.getCellRect(range.end, columnWidths, rowHeights);
          rect = {
            ...rect,
            width: bottomRight.x + bottomRight.width - rect.x,
            height: bottomRight.y + bottomRight.height - rect.y,
          };
          break;
        }
      }
    }

    ctx.fillStyle = selected ? DOC_COMMENT_HIGHLIGHT_SELECTED_BG : DOC_COMMENT_HIGHLIGHT_IDLE_BG;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  /** 查找替换匹配单元格高亮（浅黄 / 当前浅绿） */
  drawFindMatchHighlight(
    ctx: CanvasRenderingContext2D,
    coord: CellCoord,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    active: boolean,
    matchBg: string,
    activeBg: string,
    mergeRanges?: CellRange[],
  ): void {
    const config = this._viewportManager.config;
    if (isRowLayoutHidden(coord.row, rowHeights, config.defaultRowHeight)) return;

    if (mergeRanges) {
      for (const range of mergeRanges) {
        if (coord.row >= range.start.row && coord.row <= range.end.row
            && coord.col >= range.start.col && coord.col <= range.end.col) {
          const master = range.master || range.start;
          if (coord.row !== master.row || coord.col !== master.col) return;
          break;
        }
      }
    }

    let rect = this._viewportManager.getCellRect(coord, columnWidths, rowHeights);
    if (mergeRanges) {
      for (const range of mergeRanges) {
        const master = range.master || range.start;
        if (coord.row === master.row && coord.col === master.col
            && (range.start.row !== range.end.row || range.start.col !== range.end.col)) {
          const bottomRight = this._viewportManager.getCellRect(range.end, columnWidths, rowHeights);
          rect = {
            ...rect,
            width: bottomRight.x + bottomRight.width - rect.x,
            height: bottomRight.y + bottomRight.height - rect.y,
          };
          break;
        }
      }
    }

    if (rect.width <= 0 || rect.height <= 0) return;
    ctx.fillStyle = active ? activeBg : matchBg;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    if (active) {
      ctx.strokeStyle = '#81C784';
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.x + 1, rect.y + 1, Math.max(0, rect.width - 2), Math.max(0, rect.height - 2));
    }
  }

  /** 单元格右上角评论角标（Excel 风格小三角） */
  drawCellCommentMarker(
    ctx: CanvasRenderingContext2D,
    coord: CellCoord,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    mergeRanges?: CellRange[],
  ): void {
    const config = this._viewportManager.config;
    if (isRowLayoutHidden(coord.row, rowHeights, config.defaultRowHeight)) return;

    if (mergeRanges) {
      for (const range of mergeRanges) {
        if (coord.row >= range.start.row && coord.row <= range.end.row
            && coord.col >= range.start.col && coord.col <= range.end.col) {
          const master = range.master || range.start;
          if (coord.row !== master.row || coord.col !== master.col) return;
          break;
        }
      }
    }

    let rect = this._viewportManager.getCellRect(coord, columnWidths, rowHeights);
    if (mergeRanges) {
      for (const range of mergeRanges) {
        const master = range.master || range.start;
        if (coord.row === master.row && coord.col === master.col
            && (range.start.row !== range.end.row || range.start.col !== range.end.col)) {
          const bottomRight = this._viewportManager.getCellRect(range.end, columnWidths, rowHeights);
          rect = {
            ...rect,
            width: bottomRight.x + bottomRight.width - rect.x,
            height: bottomRight.y + bottomRight.height - rect.y,
          };
          break;
        }
      }
    }

    const zoom = this._viewportManager.zoomLevel;
    const size = Math.max(6, 9 * zoom);
    const x2 = rect.x + rect.width;
    const y1 = rect.y;

    ctx.save();
    ctx.fillStyle = '#F7C900';
    ctx.beginPath();
    ctx.moveTo(x2, y1);
    ctx.lineTo(x2, y1 + size);
    ctx.lineTo(x2 - size, y1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** 行评论角标（右侧方形数字徽章） */
  drawRowCommentBadge(
    ctx: CanvasRenderingContext2D,
    coord: CellCoord,
    count: number,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    mergeRanges?: CellRange[],
  ): void {
    const config = this._viewportManager.config;
    if (isRowLayoutHidden(coord.row, rowHeights, config.defaultRowHeight)) return;

    if (mergeRanges) {
      for (const range of mergeRanges) {
        if (coord.row >= range.start.row && coord.row <= range.end.row
            && coord.col >= range.start.col && coord.col <= range.end.col) {
          const master = range.master || range.start;
          if (coord.row !== master.row || coord.col !== master.col) return;
          break;
        }
      }
    }

    const rect = this._viewportManager.getCellRect(coord, columnWidths, rowHeights);
    if (rect.width <= 0 || rect.height <= 0) return;

    const zoom = this._viewportManager.zoomLevel;
    const badgeSize = Math.max(14, Math.round(16 * zoom));
    const fontSize = Math.max(10, Math.round(11 * zoom));
    const label = count > 99 ? '99+' : String(count);
    const x = rect.x + rect.width - badgeSize - 4;
    const y = rect.y + (rect.height - badgeSize) / 2;

    ctx.save();
    ctx.fillStyle = '#F7C900';
    ctx.beginPath();
    ctx.roundRect(x, y, badgeSize, badgeSize, 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `600 ${fontSize}px ${config.fontFamily ?? '-apple-system, sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + badgeSize / 2, y + badgeSize / 2 + 0.5);
    ctx.restore();
  }

  // ─── 图片渲染 ───

  protected _drawImage(
    ctx: CanvasRenderingContext2D,
    value: ImageValue,
    rect: { x: number; y: number; width: number; height: number },
  ): void {
    if (value.images.length === 0) return;

    const zoom = this._viewportManager.zoomLevel;
    const padding = 4 * zoom;
    const assetManager = this._assetManager;

    // 单张图片：居中渲染
    if (value.images.length === 1) {
      this._drawSingleImage(ctx, value.images[0], rect, padding, zoom, assetManager);
      return;
    }

    // 多张图片：横向排列，带间距
    const gap = 4 * zoom;
    const imageHeight = rect.height - padding * 2;
    const imageWidth = imageHeight; // 正方形缩略图
    const totalWidth = value.images.length * imageWidth + (value.images.length - 1) * gap;
    const startX = rect.x + (rect.width - totalWidth) / 2;

    value.images.forEach((image) => {
      const x = startX + value.images.indexOf(image) * (imageWidth + gap);
      const y = rect.y + padding;

      // 绘制背景
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(x, y, imageWidth, imageHeight);

      // 绘制边框
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, imageWidth - 1, imageHeight - 1);

      // 尝试绘制图片
      const bitmap = assetManager.getImage(image.url);
      if (bitmap) {
        const scale = Math.min(imageWidth / bitmap.width, imageHeight / bitmap.height);
        const drawWidth = bitmap.width * scale;
        const drawHeight = bitmap.height * scale;
        const drawX = x + (imageWidth - drawWidth) / 2;
        const drawY = y + (imageHeight - drawHeight) / 2;
        ctx.drawImage(bitmap, drawX, drawY, drawWidth, drawHeight);
      } else {
        assetManager.loadImage(image.url);
        // 绘制加载占位符
        this._drawImagePlaceholder(ctx, x, y, imageWidth, imageHeight, zoom);
      }
    });
  }

  protected _drawSingleImage(
    ctx: CanvasRenderingContext2D,
    image: import('@lingyi-doc/core-types').CellImage,
    rect: { x: number; y: number; width: number; height: number },
    padding: number,
    zoom: number,
    assetManager: AsyncAssetManager,
  ): void {
    const maxWidth = rect.width - padding * 2;
    const maxHeight = rect.height - padding * 2;

    const bitmap = assetManager.getImage(image.url);
    if (bitmap) {
      const scale = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height);
      const drawWidth = bitmap.width * scale;
      const drawHeight = bitmap.height * scale;
      const x = rect.x + (rect.width - drawWidth) / 2;
      const y = rect.y + (rect.height - drawHeight) / 2;
      ctx.drawImage(bitmap, x, y, drawWidth, drawHeight);
      return;
    }

    assetManager.loadImage(image.url);

    // 占位符
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(rect.x + padding, rect.y + padding, maxWidth, maxHeight);
    ctx.fillStyle = '#999';
    ctx.font = `${12 * zoom}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🖼️', rect.x + rect.width / 2, rect.y + rect.height / 2);
  }

  protected _drawImagePlaceholder(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    zoom: number,
  ): void {
    ctx.fillStyle = '#ddd';
    ctx.fillRect(x + 4, y + 4, width - 8, height - 8);
    ctx.fillStyle = '#999';
    ctx.font = `${12 * zoom}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🖼️', x + width / 2, y + height / 2);
  }

  /**
   * 绘制拖动句柄
   * @param ctx 画布上下文
   * @param cx 拖动句柄中心X坐标
   * @param cy 拖动句柄中心Y坐标
   * @param size 拖动句柄大小
   * @param color 拖动句柄颜色
   * @returns 无
   */
  protected _drawDragHandle(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color = '#bbb'): void {
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

  /**
   * 绘制行复选框
   * @param ctx 画布上下文
   * @param x 复选框左上角X坐标
   * @param y 复选框左上角Y坐标
   * @param size 复选框大小
   * @param checked 是否选中
   * @param zoom 缩放级别
   * @returns 无
   */
  protected _drawRowCheckbox(
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

  /**
   * 绘制展开面板图标
   * @param ctx 画布上下文
   * @param cx 图标中心X坐标
   * @param cy 图标中心Y坐标
   * @param w 图标宽度
   * @param h 图标高度
   * @returns 无
   */
  protected _drawExpandPanelIcon(
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

  /**
   * 绘制+图标
   * @param ctx 上画布上下文
   * @param cx 图标中心X坐标
   * @param cy 图标中心Y坐标
   * @param size 图标大小
   * @param color 图标颜色
   * @returns 无
   */
  protected _drawPlusIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color = '#666'): void {
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

  /**
   * 绘制行头
   * @param ctx 上画布上下文
   * @param visibleRange 可见范围
   * @param rowCount 行数
   * @param columnWidths 列索引到宽度映射
   * @param rowHeights 行高度映射
   * @param hoveredRow 鼠标悬停行索引
   * @param selectedRows 选中行索引数组
   * @param checkedRows 选中行索引数组
   * @param rowTreeMeta 行头元数据数组
   * @param activeRow 活动行索引
   * @returns 无
   */
  drawRowHeaders(
    ctx: CanvasRenderingContext2D,
    visibleRange: VisibleRange,
    rowCount: number,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    hoveredRow?: number | null,
    selectedRows?: number[],
    checkedRows?: number[],
    rowTreeMeta?: BaseRowHeaderMeta[],
    activeRow?: number | null,
    /** 多维表：编辑区底部屏幕 Y，用于裁剪序号列背景，避免超出网格 */
    contentBottom?: number,
    /** 分组视图：序号由内容层绘制，跳过行头列（0–headerWidth）一切绘制 */
    suppressRowNumbers?: boolean,
    /** 分组视图：分组头/添加记录行，行头区使用页面底色 */
    isGroupLayoutRow?: (row: number) => boolean,
    /** 分组视图：记录行固定显示拖拽+复选框 */
    pinnedRowControls?: (row: number) => boolean,
  ): void {
    const config = this._viewportManager.config;
    const zoom = this._viewportManager.zoomLevel;
    const dpr = window.devicePixelRatio || 1;
    const canvasHeight = ctx.canvas.height / dpr;

    const isBaseMode = !!config.isBaseMode;
    const axisSel = resolveAxisSelection(isBaseMode);
    const primaryColor = isBaseMode ? '#3370FF' : '#1a73e8';
    const fontFamily = config.fontFamily || 'Arial, sans-serif';
    const secondaryColor = config.secondaryTextColor || '#86909C';

    if (suppressRowNumbers) {
      return;
    }

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
          const isLayoutRow = isGroupLayoutRow?.(r) ?? false;
          const showHoverControls = isBaseMode && !isLayoutRow
            && ((pinnedRowControls?.(r) ?? false) || isHovered || isChecked || isActive || isSelected);

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

          if (isBaseMode) {
            if (showHoverControls) {
              this._drawBaseRowHeaderHover(ctx, drawY, h, zoom, isChecked);
            }

            if (depth === 0 && meta?.hasChildren) {
              const chevronCx =  38 * zoom + 15;
              this._drawTreeChevron(
                ctx, chevronCx, drawY + h / 2, 8 * zoom,
                meta.isExpanded !== false,
              );
            }

            if (depth === 0 && !showHoverControls && !meta?.hasChildren && !suppressRowNumbers) {
              ctx.font = `${12 * zoom}px ${fontFamily}`;
              ctx.fillStyle = isActive ? primaryColor : secondaryColor;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(String(r + 1), config.headerWidth / 2, drawY + h / 2);
            }

            /** 多维表行头：父记录分支操作（+ | 分支数，靠右不与折叠三角重叠） */
            // if (!showHoverControls && meta?.hasChildren && meta.childCount > 0) {
            //   this._drawBaseRowHeaderBranchActions(
            //     ctx, drawY, h, config.headerWidth + (columnWidths.get(1) ?? 0), meta.childCount, zoom, isHovered || isActive,
            //   );
            // }
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

    if (!isBaseMode) {
      ctx.strokeStyle = config.gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(config.headerWidth, 0);
      ctx.lineTo(config.headerWidth, canvasHeight);
      ctx.stroke();
    }
  }

  /**
   * 多维表行头：父记录分支操作（+ | 分支数，靠右不与折叠三角重叠）
   * @param ctx 上下文
   * @param drawY 行头顶部 y 坐标
   * @param h 行头高度
   * @param zoom 缩放比例
   * @param isChecked 是否选中
   */
  protected _drawBaseRowHeaderHover(
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

  /**
   * 多维表行头：父记录分支操作（+ | 分支数，靠右不与折叠三角重叠）
   * @param ctx 上下文
   * @param drawY 行头顶部 y 坐标
   * @param h 行头高度
   * @param headerWidth 行头宽度
   * @param childCount 子记录分支数
   * @param zoom 缩放比例
   * @param highlight 是否高亮
   */
  protected _drawBaseRowHeaderBranchActions(
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

  /** 多维表行头：父记录分支数徽章 */
  protected _drawBranchCountBadge(
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

  /**
   * 多维表行头：子记录折叠三角
   * @param ctx 上下文
   * @param cx 三角中心 x 坐标
   * @param cy 三角中心 y 坐标
   * @param size 三角大小
   * @param expanded 是否展开
   */
  protected _drawTreeChevron(
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

  /**
   * 多维表行头：子记录分支数徽章
   * @param ctx 上下文
   * @param cx 徽章中心 x 坐标
   * @param cy 徽章中心 y 坐标
   * @param count 分支数
   * @param zoom 缩放比例
   */
  protected _drawChildCountBadge(
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
}

// Re-export colToName for backward compatibility
export { colToName } from '@lingyi-doc/core-types';
