import { CellData, CellCoord, CellRange, CellStyle, CellValue, ImageValue, ColumnDef, SelectOption, getCellText, getCellAlign, DEFAULT_CELL_STYLE, DEFAULT_COLUMN_WIDTH, DEFAULT_ROW_HEIGHT, NumberFormat, DateFormat } from '@lingyi-doc/core-types';
import { findSelectOption, getSelectDisplayName, parseMultiSelectOptionIds } from '../utils/selectOptions';
import { getRatingConfig, parseRatingValue, computeRatingLayout, getRatingItemColors } from '../utils/ratingConfig';
import {
  computeProgressLayout,
  getProgressColor,
  parseProgressValue,
  PROGRESS_RAIL_BG,
} from '../utils/progressConfig';
import {
  formatCurrencyDisplay,
  getCurrencyConfig,
} from '../utils/currencyConfig';
import { ViewportManager, VisibleRange } from './index';
import { getSelectTagColors } from './baseTheme';
import { formatColumnDateString } from '../utils/columnDateFormat';
import { getPersonAvatarText } from '../utils/recordHistory';
import { drawStar, drawPaperclip } from '../utils/canvasShapes';

// ==================== AsyncAssetManager ====================

/**
 * 异步加载图片的管理器
 */
export class AsyncAssetManager {
  private _imageCache = new Map<string, ImageBitmap>();
  private _pendingLoads = new Set<string>();
  private _onAssetLoaded: (() => void) | null = null;

  async loadImage(url: string): Promise<void> {
    if (this._imageCache.has(url) || this._pendingLoads.has(url)) return;
    this._pendingLoads.add(url);

    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      this._imageCache.set(url, bitmap);
      this._pendingLoads.delete(url);
      this._onAssetLoaded?.();
    } catch {
      this._pendingLoads.delete(url);
    }
  }

  getImage(url: string): ImageBitmap | undefined {
    return this._imageCache.get(url);
  }

  hasImage(url: string): boolean {
    return this._imageCache.has(url);
  }

  setOnAssetLoaded(callback: () => void): void {
    this._onAssetLoaded = callback;
  }

  /** 预加载一批图片 */
  async preloadImages(urls: string[]): Promise<void> {
    await Promise.all(urls.map(url => this.loadImage(url)));
  }

  clear(): void {
    this._imageCache.forEach(b => b.close?.());
    this._imageCache.clear();
    this._pendingLoads.clear();
  }
}

// ==================== TextMetricsCache ====================

export class TextMetricsCache {
  private _cache = new Map<string, TextMetrics>();

  measure(ctx: CanvasRenderingContext2D, text: string, font: string): TextMetrics {
    const key = `${font}:${text}`;
    if (!this._cache.has(key)) {
      this._cache.set(key, ctx.measureText(text));
    }
    return this._cache.get(key)!;
  }

  clear(): void {
    this._cache.clear();
  }
}

// ==================== BaseCellRenderer ====================

export interface BaseCellRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BaseCellRendererOptions {
  viewportManager: ViewportManager;
  assetManager?: AsyncAssetManager;
  textMetricsCache?: TextMetricsCache;
}

export interface DrawBaseCellOptions {
  /** 进度字段：选中 / 悬停 / 拖拽时显示滑块 */
  showProgressThumb?: boolean;
}

export class BaseCellRenderer {
  private _viewportManager: ViewportManager;
  private _assetManager: AsyncAssetManager;
  private _textMetricsCache: TextMetricsCache;
  private _userColorCache = new Map<string, string>();

  constructor(options: BaseCellRendererOptions) {
    this._viewportManager = options.viewportManager;
    this._assetManager = options.assetManager || new AsyncAssetManager();
    this._textMetricsCache = options.textMetricsCache || new TextMetricsCache();
  }

  get assetManager(): AsyncAssetManager {
    return this._assetManager;
  }

  // ─── 公共入口：根据字段类型路由到对应绘制方法 ───

  /**
   * 
   * @param ctx 
   * @param coord 
   * @param cellData 
   * @param columnDef 
   * @param columnWidths 
   * @param rowHeights 
   * @param mergeRanges 
   * @param contentInsetLeft 
   * @param options 
   * @returns 
   */
  drawBaseCellContent(
    ctx: CanvasRenderingContext2D,
    coord: CellCoord,
    cellData: CellData,
    columnDef: ColumnDef,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    mergeRanges?: CellRange[],
    contentInsetLeft = 0,
    options?: DrawBaseCellOptions,
  ): void {
    const rect = this._getCellRect(coord, columnWidths, rowHeights, mergeRanges);
    if (!rect) return;

    const drawRect: BaseCellRect = contentInsetLeft > 0
      ? { ...rect, x: rect.x + contentInsetLeft, width: Math.max(0, rect.width - contentInsetLeft) }
      : rect;

    const type = columnDef.type;
    const value = cellData.value;

    ctx.save();

    switch (type) {
      case 'select':       this._drawSelectTag(ctx, value, columnDef, drawRect); break;
      case 'multiSelect':  this._drawMultiSelectTags(ctx, value, columnDef, drawRect); break;
      case 'user':
      case 'createdBy':
      case 'updatedBy':
        this._drawUserAvatar(ctx, value, columnDef, drawRect);
        break;
      case 'rating':       this._drawRating(ctx, value, columnDef, drawRect); break;
      case 'progress':     this._drawProgressBar(ctx, value, drawRect, options?.showProgressThumb); break;
      case 'attachment':   this._drawAttachmentIcon(ctx, value, drawRect); break;
      case 'autoNumber':   this._drawAutoNumber(ctx, value, columnDef, drawRect); break;
      case 'currency':     this._drawCurrency(ctx, value, columnDef, drawRect); break;
      case 'percent':      this._drawPercent(ctx, value, drawRect); break;
      case 'boolean':      this._drawBooleanCheckbox(ctx, value, drawRect); break;
      case 'date':
      case 'datetime':
      case 'createdTime':
      case 'updatedTime':
        this._drawDateCell(ctx, value, columnDef, drawRect);
        break;
      case 'multilineText': this._drawMultilineText(ctx, value, cellData.style, drawRect); break;
      default:
        if (value.type === 'image') {
          this._drawImage(ctx, value, drawRect);
        } else {
          this._drawDefaultText(ctx, value, cellData.style, drawRect);
        }
        break;
    }

    ctx.restore();
  }

  // ─── 工具方法 ───

  private _getCellRect(
    coord: CellCoord,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    mergeRanges?: CellRange[],
  ): BaseCellRect | null {
    const rect = this._viewportManager.getCellRect(coord, columnWidths, rowHeights);

    if (mergeRanges) {
      for (const range of mergeRanges) {
        if (coord.row >= range.start.row && coord.row <= range.end.row &&
            coord.col >= range.start.col && coord.col <= range.end.col) {
          const master = range.master || range.start;
          if (coord.row !== master.row || coord.col !== master.col) return null;
          const bottomRight = this._viewportManager.getCellRect(range.end, columnWidths, rowHeights);
          return {
            x: rect.x, y: rect.y,
            width: bottomRight.x + bottomRight.width - rect.x,
            height: bottomRight.y + bottomRight.height - rect.y,
          };
        }
      }
    }

    return rect;
  }

  private _getZoom(): number {
    return this._viewportManager.zoomLevel;
  }

  private _getPadding(): number {
    const isBase = this._viewportManager.config.isBaseMode;
    return (isBase ? 12 : 4) * this._getZoom();
  }

  private _getTextColor(style?: CellStyle): string {
    const isBase = this._viewportManager.config.isBaseMode;
    return style?.fontColor || (isBase
      ? (this._viewportManager.config.cellTextColor || '#1F2329')
      : '#333333');
  }

  private _getFont(style?: CellStyle): string {
    const zoom = this._getZoom();
    const isBase = this._viewportManager.config.isBaseMode;
    const fontSize = (style?.fontSize || (isBase ? 13 : DEFAULT_CELL_STYLE.fontSize) || 11) * zoom;
    const fontFamily = style?.fontFamily
      || this._viewportManager.config.fontFamily
      || DEFAULT_CELL_STYLE.fontFamily
      || 'Arial, sans-serif';
    return `${style?.bold ? 'bold ' : ''}${style?.italic ? 'italic ' : ''}${fontSize}px ${fontFamily}`;
  }

  // ─── 布尔复选框 ───

  private _drawBooleanCheckbox(
    ctx: CanvasRenderingContext2D,
    value: CellValue,
    rect: BaseCellRect,
  ): void {
    let checked = false;
    if (value.type === 'boolean') checked = value.value;
    else if (value.type === 'text') checked = value.text.toUpperCase() === 'TRUE' || value.text === '1' || value.text === '是';

    const zoom = this._getZoom();
    const size = Math.min(14 * zoom, rect.height - 6, rect.width - 6);
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const hs = size / 2;
    const radius = 2 * zoom;

    ctx.save();
    const primary = this._viewportManager.config.isBaseMode ? '#3370FF' : '#1a73e8';
    ctx.strokeStyle = checked ? primary : (this._viewportManager.config.isBaseMode ? '#C9CDD4' : '#ccc');
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
      ctx.beginPath();
      ctx.moveTo(cx - hs * 0.35, cy);
      ctx.lineTo(cx - hs * 0.05, cy + hs * 0.4);
      ctx.lineTo(cx + hs * 0.45, cy - hs * 0.35);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ─── 默认文本绘制（复用 CellRenderer 能力） ───

  private _drawDefaultText(
    ctx: CanvasRenderingContext2D,
    value: CellValue,
    style: CellStyle | undefined,
    rect: BaseCellRect,
  ): void {
    if (value.type === 'empty') return;

    const zoom = this._getZoom();
    const padding = this._getPadding();
    const displayText = getCellText(value);
    const isError = value.type === 'error';

    ctx.font = this._getFont(style);
    ctx.fillStyle = isError ? '#d93025' : this._getTextColor(style);
    ctx.textBaseline = 'middle';

    const align = style?.horizontalAlign || getCellAlign(value);
    ctx.textAlign = align === 'right' ? 'right' : align === 'center' ? 'center' : 'left';

    const maxWidth = rect.width - padding * 2;
    let text = displayText;

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
    const textY = rect.y + rect.height / 2;

    ctx.fillText(text, textX, textY);
  }

  // ─── 多行文本（预览：按行绘制，超出裁剪） ───

  private _drawMultilineText(
    ctx: CanvasRenderingContext2D,
    value: CellValue,
    style: CellStyle | undefined,
    rect: BaseCellRect,
  ): void {
    if (value.type === 'empty') return;

    const zoom = this._getZoom();
    const padding = this._getPadding();
    const raw = getCellText(value);
    if (!raw) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();

    ctx.font = this._getFont(style);
    ctx.fillStyle = value.type === 'error' ? '#d93025' : this._getTextColor(style);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const fontSize = (style?.fontSize || 13) * zoom;
    const lineHeight = fontSize * 1.35;
    const maxWidth = Math.max(0, rect.width - padding * 2);
    const maxBottom = rect.y + rect.height - padding;
    let y = rect.y + padding;

    const paragraphs = raw.split('\n');
    for (const para of paragraphs) {
      if (y + lineHeight > maxBottom + 1) break;
      let rest = para.length === 0 ? ' ' : para;
      while (rest.length > 0 && y + lineHeight <= maxBottom + 1) {
        let fit = rest.length;
        while (fit > 1 && ctx.measureText(rest.slice(0, fit)).width > maxWidth) {
          fit -= 1;
        }
        let line = rest.slice(0, fit);
        rest = rest.slice(fit);
        if (rest.length > 0 && y + lineHeight * 2 > maxBottom + 1) {
          while (line.length > 0 && ctx.measureText(`${line}…`).width > maxWidth) {
            line = line.slice(0, -1);
          }
          line = `${line}…`;
          ctx.fillText(line, rect.x + padding, y);
          y = maxBottom + 1;
          break;
        }
        ctx.fillText(line, rect.x + padding, y);
        y += lineHeight;
      }
    }
    ctx.restore();
  }

  // ─── 日期单元格绘制 ───

  private _drawDateCell(
    ctx: CanvasRenderingContext2D,
    value: CellValue,
    columnDef: ColumnDef,
    rect: BaseCellRect,
  ): void {
    if (value.type === 'empty') return;

    let timestamp = 0;
    if (value.type === 'date') {
      timestamp = value.timestamp;
    } else if (value.type === 'text') {
      timestamp = Date.parse(value.text);
    } else if (value.type === 'number') {
      timestamp = value.value;
    }

    if (isNaN(timestamp) || timestamp <= 0) {
      this._drawDefaultText(ctx, value, undefined, rect);
      return;
    }

    const formatStr = columnDef.format || 'YYYY/MM/DD';
    const displayText = formatColumnDateString(timestamp, formatStr);

    const zoom = this._getZoom();
    const padding = this._getPadding();
    const isError = value.type === 'error';

    ctx.font = this._getFont(undefined);
    ctx.fillStyle = isError ? '#d93025' : '#333333';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right'; // 日期右对齐

    const maxWidth = rect.width - padding * 2;
    let text = displayText;

    // 截断文本
    if (ctx.measureText(text).width > maxWidth) {
      while (text.length > 0 && ctx.measureText(text + '\u2026').width > maxWidth) {
        text = text.slice(0, -1);
      }
      text += '\u2026';
    }

    const textX = rect.x + rect.width - padding;
    const textY = rect.y + rect.height / 2;

    ctx.fillText(text, textX, textY);
  }

  // ─── 单选标签 ───

  private _drawSelectTag(
    ctx: CanvasRenderingContext2D,
    value: CellValue,
    columnDef: ColumnDef,
    rect: BaseCellRect,
  ): void {
    if (value.type === 'empty') return;

    const text = value.type === 'text' ? value.text : getCellText(value);
    if (!text) return;

    const option = findSelectOption(columnDef.options, text);
    const displayText = option?.name || text;
    const color = option?.color || '#646A73';
    const isBase = this._viewportManager.config.isBaseMode;
    const tagColors = getSelectTagColors(color);

    const zoom = this._getZoom();
    const paddingX = (isBase ? 8 : 8) * zoom;
    const paddingY = (isBase ? 4 : 3) * zoom;
    const fontSize = (isBase ? 12 : 12) * zoom;
    const borderRadius = (isBase ? 4 : 4) * zoom;

    ctx.font = `${fontSize}px ${this._viewportManager.config.fontFamily || 'Arial, sans-serif'}`;
    const textWidth = this._textMetricsCache.measure(ctx, displayText, ctx.font).width;
    const tagWidth = Math.min(textWidth + paddingX * 2, rect.width - paddingX);
    const tagHeight = Math.min(fontSize + paddingY * 2, rect.height - 8 * zoom);

    const tagX = rect.x + this._getPadding() - (isBase ? 0 : 2);
    const tagY = rect.y + (rect.height - tagHeight) / 2;

    ctx.fillStyle = tagColors.bg;
    this._roundRect(ctx, tagX, tagY, tagWidth, tagHeight, borderRadius);
    ctx.fill();

    if (!isBase) {
      ctx.strokeStyle = color + '60';
      ctx.lineWidth = 0.5 * zoom;
      this._roundRect(ctx, tagX, tagY, tagWidth, tagHeight, borderRadius);
      ctx.stroke();
    }

    ctx.fillStyle = tagColors.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayText, tagX + paddingX, tagY + tagHeight / 2);
  }

  // ─── 多选标签 ───

  private _drawMultiSelectTags(
    ctx: CanvasRenderingContext2D,
    value: CellValue,
    columnDef: ColumnDef,
    rect: BaseCellRect,
  ): void {
    const selectedIds = parseMultiSelectOptionIds(value, columnDef.options);
    if (selectedIds.length === 0) return;

    const zoom = this._getZoom();
    const paddingX = 6 * zoom;
    const paddingY = 2 * zoom;
    const fontSize = 11 * zoom;
    const borderRadius = 3 * zoom;
    const gap = 4 * zoom;
    const maxHeight = rect.height - 4;

    ctx.font = `${fontSize}px Arial, sans-serif`;

    let currentX = rect.x + 2;
    const startY = rect.y + (rect.height - (fontSize + paddingY * 2)) / 2;
    let drawnCount = 0;

    for (const id of selectedIds) {
      const option = findSelectOption(columnDef.options, id);
      const displayName = option?.name || id;
      const color = option?.color || '#999999';

      const textWidth = this._textMetricsCache.measure(ctx, displayName, ctx.font).width;
      const tagWidth = textWidth + paddingX * 2;
      const tagHeight = Math.min(fontSize + paddingY * 2, maxHeight);

      if (currentX + tagWidth > rect.x + rect.width - 20 * zoom) {
        const remaining = selectedIds.length - drawnCount;
        const plusText = `+${remaining}`;
        const plusWidth = ctx.measureText(plusText).width + paddingX * 2;

        if (currentX + plusWidth <= rect.x + rect.width - 2) {
          ctx.fillStyle = '#e0e0e0';
          this._roundRect(ctx, currentX, startY, plusWidth, tagHeight, borderRadius);
          ctx.fill();
          ctx.fillStyle = '#666';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(plusText, currentX + plusWidth / 2, startY + tagHeight / 2);
        }
        break;
      }

      // 标签背景
      ctx.fillStyle = color + '20';
      this._roundRect(ctx, currentX, startY, tagWidth, tagHeight, borderRadius);
      ctx.fill();

      // 文字
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(displayName, currentX + paddingX, startY + tagHeight / 2);

      currentX += tagWidth + gap;
      drawnCount++;
    }
  }

  // ─── 人员头像 ───

  private _drawUserAvatar(
    ctx: CanvasRenderingContext2D,
    value: CellValue,
    columnDef: ColumnDef,
    rect: BaseCellRect,
  ): void {
    let userName = '';
    if (value.type === 'text') userName = value.text;
    else if (value.type === 'number') userName = String(value.value);

    if (!userName) return;

    const zoom = this._getZoom();
    const avatarSize = Math.min(22 * zoom, rect.height - 4);
    const radius = avatarSize / 2;
    const cx = rect.x + 8 * zoom + radius;
    const cy = rect.y + rect.height / 2;
    const avatarText = getPersonAvatarText(userName);

    // 绘制圆形头像
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    const bgColor = this._getUserColor(userName);
    ctx.fillStyle = bgColor;
    ctx.fillRect(cx - radius, cy - radius, avatarSize, avatarSize);
    ctx.fillStyle = '#fff';
    const fontSize = avatarText.length > 1
      ? Math.max(8, 10 * zoom)
      : Math.max(10, 12 * zoom);
    ctx.font = `600 ${fontSize}px Arial, "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(avatarText, cx, cy + 0.5 * zoom);
    ctx.restore();

    // 绘制名字文本
    const nameX = cx + radius + 6 * zoom;
    const maxNameWidth = rect.x + rect.width - nameX - 4 * zoom;
    if (maxNameWidth > 10 * zoom) {
      ctx.font = `${Math.max(11, 13 * zoom)}px Arial, "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.fillStyle = '#1f2329';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      let nameText = userName;
      if (ctx.measureText(nameText).width > maxNameWidth) {
        while (nameText.length > 0 && ctx.measureText(nameText + '\u2026').width > maxNameWidth) {
          nameText = nameText.slice(0, -1);
        }
        nameText += '\u2026';
      }
      ctx.fillText(nameText, nameX, cy);
    }
  }

  /**
   * 绘制评分 
   * @param ctx Canvas 上下文
   * @param value 评分值
   * @param columnDef 列定义
   * @param rect 绘制矩形
   */
  private _drawRating(
    ctx: CanvasRenderingContext2D,
    value: CellValue,
    columnDef: ColumnDef,
    rect: BaseCellRect,
  ): void {
    const config = getRatingConfig(columnDef);
    const rating = parseRatingValue(value, config);
    const zoom = this._getZoom();
    const layout = computeRatingLayout(rect.width, rect.height, config, zoom);
    const startX = rect.x + layout.startX;
    const startY = rect.y + layout.startY;

    for (let i = 0; i < layout.count; i++) {
      const itemValue = config.min + i;
      const x = startX + i * (layout.itemSize + layout.gap);
      const filled = rating >= itemValue;
      const halfFilled = config.iconKey === 'star' && !filled && rating >= itemValue - 0.5;
      this._drawRatingItem(ctx, x, startY, layout.itemSize, filled, halfFilled, config, itemValue, zoom);
    }
  }

  /**
   * 绘制单个评分项（图示样式：彩色激活 / 灰色未激活，无圆形底）
   * @param ctx Canvas 上下文
   * @param x 评分项中心 x 坐标
   * @param y 评分项中心 y 坐标
   * @param size 评分项大小
   * @param filled 是否填充
   * @param halfFilled 是否半填充
   * @param config 评分配置
   * @param itemValue 评分项值
   * @param zoom 缩放比例
   */
  private _drawRatingItem(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    filled: boolean,
    halfFilled: boolean,
    config: ReturnType<typeof getRatingConfig>,
    itemValue: number,
    zoom: number,
  ): void {
    const { iconDef } = config;
    const cx = x + size / 2;
    const cy = y + size / 2;
    const active = filled || halfFilled;
    const colors = getRatingItemColors(iconDef, active);

    ctx.save();

    if (iconDef.isNumber) {
      // 数字样式：圆角背景 + 数字
      const r = 2 * zoom;
      ctx.beginPath();
      ctx.roundRect(x, y + (size - size * 0.85) / 2, size, size * 0.85, r);
      ctx.fillStyle = colors.color;
      ctx.fill();
      ctx.font = `bold ${Math.max(8, size * 0.45)}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = active ? '#FFFFFF' : '#999999';
      ctx.fillText(String(itemValue), cx, cy);
    } else {
      // 字符/emoji 样式：统一处理
      if (!active && iconDef.useEmoji) {
        ctx.filter = 'grayscale(1)';
        ctx.globalAlpha = 0.35;
      }
      ctx.font = `${Math.max(8, size * 0.75)}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = colors.color;
      ctx.fillText(iconDef.char, cx, cy + size * 0.02);
    }

    ctx.restore();
  }

  /** 绘制星形 */
  private _drawStarShape(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    outerR: number,
    filled: boolean,
    color: string,
  ): void {
    drawStar(ctx, cx, cy, outerR, filled, color);
    if (filled) {
      ctx.strokeStyle = '#D4A000';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  // ─── 进度条 ───

  private _drawProgressBar(
    ctx: CanvasRenderingContext2D,
    value: CellValue,
    rect: BaseCellRect,
    showThumb = false,
  ): void {
    const progress = parseProgressValue(value);
    const zoom = this._getZoom();
    const layout = computeProgressLayout(rect.width, rect.height, progress, zoom);
    const fillColor = getProgressColor(progress);
    const railY = rect.y + layout.barY;
    const railX = rect.x + layout.barX;
    const radius = layout.railHeight / 2;

    // 轨道
    ctx.fillStyle = PROGRESS_RAIL_BG;
    this._roundRect(ctx, railX, railY, layout.barWidth, layout.railHeight, radius);
    ctx.fill();

    // 填充
    const fillWidth = Math.min((layout.barWidth * progress) / 100, layout.barWidth);
    if (fillWidth > 0.5) {
      ctx.fillStyle = fillColor;
      const fillRadius = Math.min(radius, fillWidth / 2);
      this._roundRect(ctx, railX, railY, fillWidth, layout.railHeight, fillRadius);
      ctx.fill();
    }

    // 百分比文字（右侧，与编辑态一致；空值不显示）
    if (value.type !== 'empty') {
      ctx.font = `600 ${Math.max(10, 11 * zoom)}px -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", sans-serif`;
      ctx.fillStyle = '#333333';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const textRight = rect.x + layout.barX + layout.barWidth + layout.gap + layout.textWidth;
      ctx.fillText(`${Math.round(progress)}%`, textRight, rect.y + layout.textCy);
    }

    // 滑块：仅选中 / 悬停 / 拖拽时显示
    if (showThumb) {
      const cx = rect.x + layout.thumbCx;
      const cy = rect.y + layout.thumbCy;
      const r = layout.thumbRadius;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, 2 * zoom);
      ctx.strokeStyle = fillColor;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = Math.max(0.5, 1 * zoom);
      ctx.stroke();
    }
  }

  // ─── 附件图标 ───

  private _drawAttachmentIcon(
    ctx: CanvasRenderingContext2D,
    value: CellValue,
    rect: BaseCellRect,
  ): void {
    let count = 0;
    if (value.type === 'number') count = value.value;
    else if (value.type === 'text') {
      try {
        const items = JSON.parse(value.text);
        if (Array.isArray(items)) count = items.length;
      } catch {
        count = parseInt(value.text, 10) || 0;
      }
    }

    const zoom = this._getZoom();
    const iconSize = Math.min(18 * zoom, rect.height - 6);
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;

    // 绘制文件图标（简化的折角纸张）
    ctx.save();
    ctx.translate(cx - iconSize / 2, cy - iconSize / 2);
    ctx.scale(iconSize / 24, iconSize / 24);

    // 纸张主体
    ctx.fillStyle = '#E3F2FD';
    ctx.strokeStyle = '#1976D2';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(2, 2);
    ctx.lineTo(16, 2);
    ctx.lineTo(22, 8);
    ctx.lineTo(22, 22);
    ctx.lineTo(2, 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 折角
    ctx.fillStyle = '#1976D2';
    ctx.beginPath();
    ctx.moveTo(16, 2);
    ctx.lineTo(22, 8);
    ctx.lineTo(16, 8);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // 数量角标
    if (count > 0) {
      const badgeSize = 12 * zoom;
      const badgeX = cx + iconSize / 2 - badgeSize / 2;
      const badgeY = cy - iconSize / 2 - badgeSize / 2;

      ctx.fillStyle = '#F44336';
      ctx.beginPath();
      ctx.arc(badgeX + badgeSize / 2, badgeY + badgeSize / 2, badgeSize / 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(8, 9 * zoom)}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.min(count, 99)), badgeX + badgeSize / 2, badgeY + badgeSize / 2);
    }
  }

  // ─── 自动编号 ───

  private _drawAutoNumber(
    ctx: CanvasRenderingContext2D,
    value: CellValue,
    columnDef: ColumnDef,
    rect: BaseCellRect,
  ): void {
    const prefix = columnDef.format || '';
    const text = value.type === 'text' ? value.text : getCellText(value);
    const displayText = prefix + text;

    const zoom = this._getZoom();
    const padding = this._getPadding();

    ctx.font = `${Math.max(10, 11 * zoom)}px Arial, sans-serif`;
    ctx.fillStyle = '#999';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const maxWidth = rect.width - padding * 2;
    let display = displayText;
    if (ctx.measureText(display).width > maxWidth) {
      while (display.length > 0 && ctx.measureText(display + '\u2026').width > maxWidth) {
        display = display.slice(0, -1);
      }
      display += '\u2026';
    }

    ctx.fillText(display, rect.x + padding, rect.y + rect.height / 2);
  }

  // ─── 货币 ───

  private _drawCurrency(
    ctx: CanvasRenderingContext2D,
    value: CellValue,
    columnDef: ColumnDef,
    rect: BaseCellRect,
  ): void {
    if (value.type === 'empty') return;

    let num = 0;
    if (value.type === 'number') num = value.value;
    else if (value.type === 'text') num = parseFloat(value.text) || 0;

    const padding = this._getPadding();
    const colCfg = getCurrencyConfig(columnDef);
    const cellFmt = value.type === 'number' && value.format?.kind === 'currency' ? value.format : null;
    const config = {
      symbol: columnDef.currencySymbol || cellFmt?.symbol || colCfg.symbol,
      symbolAlign: (columnDef.currencySymbolAlign
        || (cellFmt?.symbolPosition === 'suffix' ? 'right' : undefined)
        || colCfg.symbolAlign) as ReturnType<typeof getCurrencyConfig>['symbolAlign'],
      precision: columnDef.currencyPrecision != null
        ? colCfg.precision
        : (cellFmt?.decimals ?? colCfg.precision),
    };
    const text = formatCurrencyDisplay(num, config);

    ctx.font = this._getFont();
    ctx.fillStyle = '#333';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const maxWidth = rect.width - padding * 2;
    let display = text;
    if (ctx.measureText(display).width > maxWidth) {
      while (display.length > 0 && ctx.measureText(display + '\u2026').width > maxWidth) {
        display = display.slice(0, -1);
      }
      display += '\u2026';
    }

    ctx.fillText(display, rect.x + rect.width - padding, rect.y + rect.height / 2);
  }

  // ─── 百分比 ───

  private _drawPercent(
    ctx: CanvasRenderingContext2D,
    value: CellValue,
    rect: BaseCellRect,
  ): void {
    if (value.type === 'empty') return;

    let num = 0;
    if (value.type === 'number') num = value.value;
    else if (value.type === 'text') num = parseFloat(value.text) || 0;

    const zoom = this._getZoom();
    const padding = this._getPadding();
    const decimals = (value.type === 'number' && value.format?.kind === 'percent') ? value.format.decimals : 2;

    const text = `${(num * 100).toFixed(Math.max(0, Math.min(10, decimals)))}%`;

    ctx.font = this._getFont();
    ctx.fillStyle = '#333';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const maxWidth = rect.width - padding * 2;
    let display = text;
    if (ctx.measureText(display).width > maxWidth) {
      while (display.length > 0 && ctx.measureText(display + '\u2026').width > maxWidth) {
        display = display.slice(0, -1);
      }
      display += '\u2026';
    }

    ctx.fillText(display, rect.x + rect.width - padding, rect.y + rect.height / 2);
  }

  // ─── 工具：绘制圆角矩形 ───

  private _roundRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, width: number, height: number, radius: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  // ─── 工具：获取用户颜色（根据 ID 哈希） ───

  private _getUserColor(userId: string): string {
    if (this._userColorCache.has(userId)) {
      return this._userColorCache.get(userId)!;
    }

    const colors = [
      '#7c3aed', '#ea580c', '#2563eb', '#059669', '#dc2626',
      '#0891b2', '#db2777', '#E91E63', '#9C27B0', '#3F51B5',
      '#2196F3', '#009688', '#4CAF50', '#FF9800', '#FF5722',
    ];

    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash |= 0;
    }

    const color = colors[Math.abs(hash) % colors.length];
    this._userColorCache.set(userId, color);
    return color;
  }

  // ─── 图片渲染 ───

  private _drawImage(
    ctx: CanvasRenderingContext2D,
    value: ImageValue,
    rect: BaseCellRect,
  ): void {
    if (value.images.length === 0) return;

    const zoom = this._getZoom();
    const padding = this._getPadding();
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

    value.images.forEach((image, index) => {
      const x = startX + index * (imageWidth + gap);
      const y = rect.y + padding;

      // 绘制背景
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(x, y, imageWidth, imageHeight);

      // 绘制边框
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, imageWidth - 1, imageHeight - 1);

      // 尝试绘制图片
      if (assetManager) {
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
          ctx.fillStyle = '#ddd';
          ctx.fillRect(x + 4, y + 4, imageWidth - 8, imageHeight - 8);
        }
      } else {
        ctx.fillStyle = '#ddd';
        ctx.fillRect(x + 4, y + 4, imageWidth - 8, imageHeight - 8);
      }
    });
  }

  private _drawSingleImage(
    ctx: CanvasRenderingContext2D,
    image: import('@lingyi-doc/core-types').CellImage,
    rect: BaseCellRect,
    padding: number,
    zoom: number,
    assetManager?: AsyncAssetManager,
  ): void {
    const maxWidth = rect.width - padding * 2;
    const maxHeight = rect.height - padding * 2;

    if (assetManager) {
      const bitmap = assetManager.getImage(image.url);
      if (bitmap) {
        const scale = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height);
        const drawWidth = bitmap.width * scale;
        const drawHeight = bitmap.height * scale;
        const x = rect.x + (rect.width - drawWidth) / 2;
        const y = rect.y + (rect.height - drawHeight) / 2;
        ctx.drawImage(bitmap, x, y, drawWidth, drawHeight);
        return;
      } else {
        assetManager.loadImage(image.url);
      }
    }

    // 占位符
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(rect.x + padding, rect.y + padding, maxWidth, maxHeight);
    ctx.fillStyle = '#999';
    ctx.font = `${12 * zoom}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🖼️', rect.x + rect.width / 2, rect.y + rect.height / 2);
  }
}
