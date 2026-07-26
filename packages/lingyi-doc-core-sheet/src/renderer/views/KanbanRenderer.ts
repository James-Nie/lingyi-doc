import { RecordRow, ColumnDef, CellCoord } from '@lingyi-doc/core-types';
import { ViewportManager } from '../index';

// ==================== 看板视图配置 ====================

export interface KanbanViewConfig {
  viewId: string;
  viewName: string;
  groupFieldId: string;           // 按哪个字段分组（单选/人员字段）
  columnWidth: number;            // 每列宽度
  columnGap: number;              // 列间距
  cardMinHeight: number;          // 卡片最小高度
  cardGap: number;                // 卡片间距
  cardFields: string[];           // 卡片上显示哪些字段
  coverFieldId?: string;          // 封面图字段
  sortFieldId?: string;           // 排序字段
  sortOrder: 'asc' | 'desc';
  columnHeaderHeight: number;     // 列头高度
  laneFieldId?: string;           // 泳道分组字段（二级分组）
}

export interface KanbanColumn {
  id: string;
  name: string;
  color?: string;
  records: RecordRow[];
  order: string;
}

export interface KanbanCard {
  record: RecordRow;
  x: number;
  y: number;
  width: number;
  height: number;
  columnId: string;
}

export interface KanbanDragState {
  card: RecordRow;
  startX: number;
  startY: number;
  sourceColumnId: string;
  ghostOffsetX: number;
  ghostOffsetY: number;
}

// ==================== KanbanRenderer ====================

export class KanbanRenderer {
  private _viewportManager: ViewportManager;
  private _columns: KanbanColumn[] = [];
  private _cards: Map<string, KanbanCard> = new Map(); // recordId -> card

  constructor(viewportManager: ViewportManager) {
    this._viewportManager = viewportManager;
  }

  /** 按分组字段将记录分组 */
  groupRecords(records: RecordRow[], groupFieldId: string, columnDefs: ColumnDef[]): KanbanColumn[] {
    const groupField = columnDefs.find(c => c.id === groupFieldId);
    const groups = new Map<string, KanbanColumn>();

    // 初始化所有选项作为列
    if (groupField?.options) {
      for (const opt of groupField.options) {
        groups.set(opt.id, {
          id: opt.id,
          name: opt.name,
          color: opt.color,
          records: [],
          order: opt.id, // 用选项ID作为顺序
        });
      }
    }

    // 未分组记录放入 "未分组" 列
    groups.set('__ungrouped', {
      id: '__ungrouped',
      name: '未分组',
      color: '#999999',
      records: [],
      order: 'zzzz',
    });

    for (const record of records) {
      const fieldValue = record[groupFieldId];
      let groupId = '__ungrouped';

      if (fieldValue !== undefined && fieldValue !== null) {
        if (typeof fieldValue === 'string') {
          groupId = fieldValue;
        } else if (Array.isArray(fieldValue)) {
          groupId = fieldValue[0] || '__ungrouped';
        }
      }

      const group = groups.get(groupId) || groups.get('__ungrouped')!;
      group.records.push(record);
    }

    // 排序列
    this._columns = Array.from(groups.values()).sort((a, b) => a.order.localeCompare(b.order));
    return this._columns;
  }

  /** 计算可视区域卡片 */
  calculateVisibleCards(scrollTop: number, viewportHeight: number, config: KanbanViewConfig): KanbanCard[] {
    const visibleCards: KanbanCard[] = [];
    let columnX = 0;

    for (const column of this._columns) {
      const columnRight = columnX + config.columnWidth;
      // 只渲染可视列
      if (columnRight >= 0 && columnX <= viewportHeight * 2) { // 简单判据
        let cardY = config.columnHeaderHeight + 8;

        for (const record of column.records) {
          const cardHeight = this._calculateCardHeight(record, config);

          // 虚拟滚动：只渲染可视区域内的卡片
          if (cardY + cardHeight >= scrollTop && cardY <= scrollTop + viewportHeight) {
            const card: KanbanCard = {
              record,
              x: columnX + 8,
              y: cardY,
              width: config.columnWidth - 16,
              height: cardHeight,
              columnId: column.id,
            };
            visibleCards.push(card);
            this._cards.set(record._id, card);
          }

          cardY += cardHeight + config.cardGap;
        }
      }

      columnX += config.columnWidth + config.columnGap;
    }

    return visibleCards;
  }

  /** 渲染看板视图 */
  render(
    ctx: CanvasRenderingContext2D,
    config: KanbanViewConfig,
    records: RecordRow[],
    columnDefs: ColumnDef[],
    scrollTop: number,
    viewportHeight: number,
  ): void {
    // 1. 分组
    this.groupRecords(records, config.groupFieldId, columnDefs);

    // 2. 绘制列头
    let columnX = 0;
    for (const column of this._columns) {
      this._drawColumnHeader(ctx, column, columnX, config.columnWidth, config.columnHeaderHeight);
      columnX += config.columnWidth + config.columnGap;
    }

    // 3. 绘制可视卡片
    const visibleCards = this.calculateVisibleCards(scrollTop, viewportHeight, config);
    for (const card of visibleCards) {
      this._drawCard(ctx, card, columnDefs, config);
    }
  }

  /** 绘制列头 */
  private _drawColumnHeader(
    ctx: CanvasRenderingContext2D,
    column: KanbanColumn,
    x: number,
    width: number,
    height: number,
  ): void {
    const zoom = this._viewportManager.zoomLevel;
    const radius = 6 * zoom;

    // 列头背景
    ctx.fillStyle = column.color ? column.color + '15' : '#F5F5F5';
    this._roundRect(ctx, x, 0, width, height, radius);
    ctx.fill();

    // 列头顶部颜色条
    if (column.color) {
      ctx.fillStyle = column.color;
      ctx.fillRect(x, 0, width, 3 * zoom);
    }

    // 列名
    ctx.font = `bold ${14 * zoom}px Arial, sans-serif`;
    ctx.fillStyle = '#333';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(column.name, x + 12 * zoom, height / 2);

    // 记录数量
    ctx.font = `${12 * zoom}px Arial, sans-serif`;
    ctx.fillStyle = '#999';
    const countText = `${column.records.length}`;
    ctx.fillText(countText, x + width - 12 * zoom - ctx.measureText(countText).width, height / 2);
  }

  /** 计算卡片高度 */
  private _calculateCardHeight(record: RecordRow, config: KanbanViewConfig): number {
    const fieldCount = config.cardFields.length;
    return Math.max(config.cardMinHeight, 40 + fieldCount * 28);
  }

  /** 绘制卡片 */
  private _drawCard(
    ctx: CanvasRenderingContext2D,
    card: KanbanCard,
    columnDefs: ColumnDef[],
    config: KanbanViewConfig,
  ): void {
    const zoom = this._viewportManager.zoomLevel;
    const radius = 6 * zoom;

    // 卡片背景
    ctx.fillStyle = '#FFFFFF';
    this._roundRect(ctx, card.x, card.y, card.width, card.height, radius);
    ctx.fill();

    // 卡片边框
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 1 * zoom;
    this._roundRect(ctx, card.x, card.y, card.width, card.height, radius);
    ctx.stroke();

    // 绘制卡片内字段
    let fieldY = card.y + 10 * zoom;
    const paddingX = 10 * zoom;
    const fieldGap = 6 * zoom;

    for (const fieldId of config.cardFields) {
      const fieldDef = columnDefs.find(c => c.id === fieldId);
      if (!fieldDef) continue;

      const fieldValue = card.record[fieldId];
      const maxFieldWidth = card.width - paddingX * 2;

      // 字段标签
      ctx.font = `${10 * zoom}px Arial, sans-serif`;
      ctx.fillStyle = '#999';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(fieldDef.name, card.x + paddingX, fieldY);
      fieldY += 14 * zoom;

      // 字段值
      ctx.font = `${12 * zoom}px Arial, sans-serif`;
      ctx.fillStyle = '#333';

      let displayText = fieldValue !== undefined && fieldValue !== null ? String(fieldValue) : '';
      if (ctx.measureText(displayText).width > maxFieldWidth) {
        while (displayText.length > 0 && ctx.measureText(displayText + '\u2026').width > maxFieldWidth) {
          displayText = displayText.slice(0, -1);
        }
        displayText += '\u2026';
      }

      ctx.fillText(displayText, card.x + paddingX, fieldY);
      fieldY += 18 * zoom + fieldGap;
    }
  }

  /** 获取卡片位置（用于拖拽） */
  getCardRect(recordId: string): { x: number; y: number; width: number; height: number } | null {
    const card = this._cards.get(recordId);
    return card ? { x: card.x, y: card.y, width: card.width, height: card.height } : null;
  }

  /** 计算拖拽目标列 */
  hitTestColumn(clientX: number, scrollLeft: number, config: KanbanViewConfig): string | null {
    let columnX = -scrollLeft;
    for (const column of this._columns) {
      if (clientX >= columnX && clientX < columnX + config.columnWidth) {
        return column.id;
      }
      columnX += config.columnWidth + config.columnGap;
    }
    return null;
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
