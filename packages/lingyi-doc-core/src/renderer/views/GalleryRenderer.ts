import { RecordRow, ColumnDef } from '../../types/index';
import { ViewportManager } from '../index';

// ==================== 画廊视图配置 ====================

export type GalleryLayoutType = 'grid' | 'masonry';
export type GalleryCardSize = 'small' | 'medium' | 'large';

export interface GalleryViewConfig {
  viewId: string;
  viewName: string;
  coverFieldId?: string;            // 封面图字段（附件字段）
  cardTitleFieldId: string;         // 卡片标题字段
  displayFields: string[];          // 卡片上显示的其他字段
  layoutType: GalleryLayoutType;
  cardSize: GalleryCardSize;
  columnCount: number;              // 网格列数（小/中/大）
  cardGap: number;
  cardAspectRatio: number;          // 封面图宽高比
}

export interface GalleryCard {
  record: RecordRow;
  x: number;
  y: number;
  width: number;
  height: number;
  imageHeight: number;
  columnIndex: number;
}

export interface GalleryColumn {
  x: number;
  width: number;
  currentHeight: number;
  cards: GalleryCard[];
}

// ==================== GalleryRenderer ====================

export class GalleryRenderer {
  private _viewportManager: ViewportManager;
  private _cards: Map<string, GalleryCard> = new Map();
  private _columns: GalleryColumn[] = [];

  constructor(viewportManager: ViewportManager) {
    this._viewportManager = viewportManager;
  }

  /** 根据卡片大小获取列数 */
  getColumnCount(cardSize: GalleryCardSize, viewportWidth: number): number {
    const minWidths = { small: 160, medium: 240, large: 320 };
    return Math.max(1, Math.floor(viewportWidth / minWidths[cardSize]));
  }

  /** 计算卡片尺寸 */
  getCardSize(cardSize: GalleryCardSize, columnWidth: number): { width: number; height: number; imageHeight: number } {
    const zoom = this._viewportManager.zoomLevel;
    const gap = 16 * zoom;
    const width = columnWidth - gap;

    switch (cardSize) {
      case 'small':
        return { width, height: 140 * zoom, imageHeight: 80 * zoom };
      case 'medium':
        return { width, height: 220 * zoom, imageHeight: 140 * zoom };
      case 'large':
        return { width, height: 340 * zoom, imageHeight: 220 * zoom };
    }
  }

  /** 渲染画廊视图 */
  render(
    ctx: CanvasRenderingContext2D,
    config: GalleryViewConfig,
    records: RecordRow[],
    columnDefs: ColumnDef[],
    scrollTop: number,
    viewportWidth: number,
    viewportHeight: number,
  ): void {
    const zoom = this._viewportManager.zoomLevel;
    const gap = config.cardGap * zoom;

    // 1. 计算布局
    const columnCount = this.getColumnCount(config.cardSize, viewportWidth);
    const columnWidth = viewportWidth / columnCount;
    const cardSize = this.getCardSize(config.cardSize, columnWidth);

    // 2. 初始化列
    this._columns = [];
    for (let i = 0; i < columnCount; i++) {
      this._columns.push({
        x: i * columnWidth + gap / 2,
        width: columnWidth - gap,
        currentHeight: gap,
        cards: [],
      });
    }

    // 3. 分配卡片到列（瀑布流：最短列优先）
    this._cards.clear();
    for (let i = 0; i < records.length; i++) {
      const record = records[i];

      // 选择高度最短的列
      let shortestColumn = 0;
      for (let j = 1; j < columnCount; j++) {
        if (this._columns[j].currentHeight < this._columns[shortestColumn].currentHeight) {
          shortestColumn = j;
        }
      }

      const column = this._columns[shortestColumn];
      const cardHeight = this._calculateCardHeight(record, config, cardSize.imageHeight, zoom);

      const card: GalleryCard = {
        record,
        x: column.x,
        y: column.currentHeight,
        width: cardSize.width,
        height: cardHeight,
        imageHeight: cardSize.imageHeight,
        columnIndex: shortestColumn,
      };

      column.cards.push(card);
      column.currentHeight += cardHeight + gap;
      this._cards.set(record._id, card);
    }

    // 4. 只渲染可视区域卡片
    for (const card of this._cards.values()) {
      if (card.y + card.height < scrollTop || card.y > scrollTop + viewportHeight) continue;

      this._drawCard(ctx, card, config, columnDefs, zoom);
    }
  }

  /** 计算卡片高度（根据内容动态调整） */
  private _calculateCardHeight(record: RecordRow, config: GalleryViewConfig, imageHeight: number, zoom: number): number {
    const fieldCount = config.displayFields.length;
    const titleHeight = 22 * zoom;
    const fieldHeight = 18 * zoom;
    const padding = 12 * zoom;
    return imageHeight + titleHeight + fieldCount * fieldHeight + padding * 2;
  }

  /** 绘制卡片 */
  private _drawCard(
    ctx: CanvasRenderingContext2D,
    card: GalleryCard,
    config: GalleryViewConfig,
    columnDefs: ColumnDef[],
    zoom: number,
  ): void {
    const radius = 8 * zoom;

    // 卡片背景
    ctx.fillStyle = '#FFFFFF';
    this._roundRect(ctx, card.x, card.y - zoom, card.width, card.height, radius);
    ctx.fill();

    // 卡片边框
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 1 * zoom;
    this._roundRect(ctx, card.x, card.y - zoom, card.width, card.height, radius);
    ctx.stroke();

    // 封面图区域
    const imageY = card.y;
    const imageHeight = card.imageHeight;

    if (config.coverFieldId && card.record[config.coverFieldId]) {
      // 如果有封面图，绘制图片（简化：用渐变色代替）
      const gradient = ctx.createLinearGradient(card.x, imageY, card.x, imageY + imageHeight);
      gradient.addColorStop(0, '#E3F2FD');
      gradient.addColorStop(1, '#BBDEFB');
      ctx.fillStyle = gradient;
      ctx.fillRect(card.x, imageY, card.width, imageHeight);

      // 附件图标提示
      ctx.fillStyle = '#1976D2';
      ctx.font = `${12 * zoom}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('📎 附件', card.x + card.width / 2, imageY + imageHeight / 2);
    } else {
      // 无封面图：默认背景
      ctx.fillStyle = '#F5F5F5';
      ctx.fillRect(card.x, imageY, card.width, imageHeight);
    }

    // 封面图底边框
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 0.5 * zoom;
    ctx.beginPath();
    ctx.moveTo(card.x, imageY + imageHeight);
    ctx.lineTo(card.x + card.width, imageY + imageHeight);
    ctx.stroke();

    // 卡片内容区域
    let contentY = imageY + imageHeight + 8 * zoom;
    const paddingX = 12 * zoom;
    const maxTextWidth = card.width - paddingX * 2;

    // 标题
    const title = card.record[config.cardTitleFieldId] || '未命名';
    ctx.font = `bold ${14 * zoom}px Arial, sans-serif`;
    ctx.fillStyle = '#333';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let titleText = String(title);
    if (ctx.measureText(titleText).width > maxTextWidth) {
      while (titleText.length > 0 && ctx.measureText(titleText + '\u2026').width > maxTextWidth) {
        titleText = titleText.slice(0, -1);
      }
      titleText += '\u2026';
    }
    ctx.fillText(titleText, card.x + paddingX, contentY);
    contentY += 22 * zoom;

    // 其他字段
    for (const fieldId of config.displayFields) {
      const fieldDef = columnDefs.find(c => c.id === fieldId);
      if (!fieldDef) continue;

      const fieldValue = card.record[fieldId];
      let displayText = fieldValue !== undefined && fieldValue !== null ? String(fieldValue) : '';

      ctx.font = `${11 * zoom}px Arial, sans-serif`;
      ctx.fillStyle = '#666';

      if (ctx.measureText(displayText).width > maxTextWidth) {
        while (displayText.length > 0 && ctx.measureText(displayText + '\u2026').width > maxTextWidth) {
          displayText = displayText.slice(0, -1);
        }
        displayText += '\u2026';
      }

      ctx.fillText(displayText, card.x + paddingX, contentY);
      contentY += 18 * zoom;
    }
  }

  /** 获取卡片位置 */
  getCardRect(recordId: string): { x: number; y: number; width: number; height: number } | null {
    const card = this._cards.get(recordId);
    return card ? { x: card.x, y: card.y, width: card.width, height: card.height } : null;
  }

  /** Hit test */
  hitTestCard(clientX: number, clientY: number, scrollTop: number): string | null {
    for (const [recordId, card] of this._cards) {
      if (clientX >= card.x && clientX <= card.x + card.width &&
          clientY + scrollTop >= card.y && clientY + scrollTop <= card.y + card.height) {
        return recordId;
      }
    }
    return null;
  }

  /** 获取总内容高度（用于滚动条） */
  getTotalHeight(): number {
    if (this._columns.length === 0) return 0;
    return Math.max(...this._columns.map(c => c.currentHeight)) + 16 * this._viewportManager.zoomLevel;
  }

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
}
