import { RecordRow, ColumnDef } from '@lingyi-doc/core-types';
import { ViewportManager } from '../index';

// ==================== 日历视图配置 ====================

export type CalendarViewType = 'month' | 'week' | 'day';

export interface CalendarViewConfig {
  viewId: string;
  viewName: string;
  dateFieldId: string;              // 按哪个日期字段排布
  viewType: CalendarViewType;
  cardTitleFieldId: string;         // 卡片标题字段
  cardColorFieldId?: string;        // 卡片颜色字段
  maxCardsPerCell: number;          // 每格最大显示记录数
  cellMinHeight: number;            // 日期格最小高度
  showWeekend: boolean;
  firstDayOfWeek: 0 | 1;            // 0=周日, 1=周一
}

export interface CalendarDayCell {
  date: Date;
  x: number;
  y: number;
  width: number;
  height: number;
  records: RecordRow[];
  isCurrentMonth: boolean;
  isToday: boolean;
}

export interface CalendarCard {
  record: RecordRow;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  title: string;
}

// ==================== CalendarRenderer ====================

export class CalendarRenderer {
  private _viewportManager: ViewportManager;
  private _dayCells: Map<string, CalendarDayCell> = new Map(); // dateKey -> cell
  private _cards: Map<string, CalendarCard> = new Map(); // recordId -> card

  constructor(viewportManager: ViewportManager) {
    this._viewportManager = viewportManager;
  }

  /** 渲染日历视图 */
  render(
    ctx: CanvasRenderingContext2D,
    config: CalendarViewConfig,
    records: RecordRow[],
    columnDefs: ColumnDef[],
    scrollTop: number,
    viewportWidth: number,
    viewportHeight: number,
  ): void {
    const zoom = this._viewportManager.zoomLevel;

    switch (config.viewType) {
      case 'month':
        this._renderMonthView(ctx, config, records, viewportWidth, viewportHeight, zoom);
        break;
      case 'week':
        this._renderWeekView(ctx, config, records, viewportWidth, viewportHeight, zoom);
        break;
      case 'day':
        this._renderDayView(ctx, config, records, viewportWidth, viewportHeight, zoom);
        break;
    }
  }

  // ─── 月视图 ───

  private _renderMonthView(
    ctx: CanvasRenderingContext2D,
    config: CalendarViewConfig,
    records: RecordRow[],
    viewportWidth: number,
    viewportHeight: number,
    zoom: number,
  ): void {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // 计算当月第一天和最后一天
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);

    // 计算日历网格起始日（周日/周一）
    const firstDayWeek = firstDay.getDay();
    const startOffset = (firstDayWeek - config.firstDayOfWeek + 7) % 7;
    const gridStart = new Date(firstDay.getTime() - startOffset * 24 * 60 * 60 * 1000);

    // 计算网格尺寸
    const headerHeight = 40 * zoom;
    const dayNamesHeight = 24 * zoom;
    const topOffset = headerHeight + dayNamesHeight;
    const cellWidth = viewportWidth / 7;
    const cellHeight = Math.max(config.cellMinHeight * zoom, (viewportHeight - topOffset) / 6);

    // 绘制标题
    ctx.font = `bold ${18 * zoom}px Arial, sans-serif`;
    ctx.fillStyle = '#333';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${currentYear}年${currentMonth + 1}月`, 12 * zoom, headerHeight / 2);

    // 绘制星期标题
    const dayNames = config.firstDayOfWeek === 1
      ? ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
      : ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    ctx.font = `${12 * zoom}px Arial, sans-serif`;
    ctx.fillStyle = '#666';
    ctx.textAlign = 'center';

    for (let i = 0; i < 7; i++) {
      const x = i * cellWidth + cellWidth / 2;
      ctx.fillText(dayNames[i], x, headerHeight + dayNamesHeight / 2);
    }

    // 星期标题底边框
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 1 * zoom;
    ctx.beginPath();
    ctx.moveTo(0, topOffset);
    ctx.lineTo(viewportWidth, topOffset);
    ctx.stroke();

    // 将记录按日期分组
    const dateMap = this._mapRecordsToDates(records, config.dateFieldId, gridStart, 42);

    // 绘制日期格
    this._dayCells.clear();
    for (let week = 0; week < 6; week++) {
      for (let day = 0; day < 7; day++) {
        const cellIndex = week * 7 + day;
        const cellDate = new Date(gridStart.getTime() + cellIndex * 24 * 60 * 60 * 1000);
        const dateKey = this._dateToKey(cellDate);
        const x = day * cellWidth;
        const y = topOffset + week * cellHeight;

        const cell: CalendarDayCell = {
          date: cellDate,
          x, y, width: cellWidth, height: cellHeight,
          records: dateMap.get(dateKey) || [],
          isCurrentMonth: cellDate.getMonth() === currentMonth,
          isToday: this._isSameDay(cellDate, today),
        };
        this._dayCells.set(dateKey, cell);

        this._drawDayCell(ctx, cell, config, zoom);
      }
    }
  }

  // ─── 周视图 ───

  private _renderWeekView(
    ctx: CanvasRenderingContext2D,
    config: CalendarViewConfig,
    records: RecordRow[],
    viewportWidth: number,
    viewportHeight: number,
    zoom: number,
  ): void {
    const today = new Date();
    const weekStart = new Date(today.getTime() - today.getDay() * 24 * 60 * 60 * 1000);

    const headerHeight = 40 * zoom;
    const timeColWidth = 50 * zoom;
    const dayWidth = (viewportWidth - timeColWidth) / 7;
    const hourHeight = 60 * zoom;

    // 标题
    ctx.font = `bold ${16 * zoom}px Arial, sans-serif`;
    ctx.fillStyle = '#333';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('周视图', 12 * zoom, headerHeight / 2);

    // 日期头
    ctx.font = `${12 * zoom}px Arial, sans-serif`;
    ctx.fillStyle = '#666';
    ctx.textAlign = 'center';

    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000);
      const x = timeColWidth + i * dayWidth + dayWidth / 2;
      const text = `${date.getMonth() + 1}/${date.getDate()}`;
      ctx.fillText(text, x, headerHeight / 2);
    }

    // 时间线
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 0.5 * zoom;
    for (let h = 0; h < 24; h++) {
      const y = headerHeight + h * hourHeight;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(viewportWidth, y);
      ctx.stroke();

      // 时间标签
      ctx.font = `${10 * zoom}px Arial, sans-serif`;
      ctx.fillStyle = '#999';
      ctx.textAlign = 'right';
      ctx.fillText(`${h}:00`, timeColWidth - 6 * zoom, y + 6 * zoom);
    }
  }

  // ─── 日视图 ───

  private _renderDayView(
    ctx: CanvasRenderingContext2D,
    config: CalendarViewConfig,
    records: RecordRow[],
    viewportWidth: number,
    viewportHeight: number,
    zoom: number,
  ): void {
    const today = new Date();
    const headerHeight = 40 * zoom;
    const timeColWidth = 50 * zoom;
    const hourHeight = 80 * zoom;

    // 标题
    ctx.font = `bold ${16 * zoom}px Arial, sans-serif`;
    ctx.fillStyle = '#333';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`, 12 * zoom, headerHeight / 2);

    // 时间线
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 0.5 * zoom;
    for (let h = 0; h < 24; h++) {
      const y = headerHeight + h * hourHeight;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(viewportWidth, y);
      ctx.stroke();

      ctx.font = `${10 * zoom}px Arial, sans-serif`;
      ctx.fillStyle = '#999';
      ctx.textAlign = 'right';
      ctx.fillText(`${h}:00`, timeColWidth - 6 * zoom, y + 6 * zoom);
    }
  }

  // ─── 绘制日期格 ───

  private _drawDayCell(
    ctx: CanvasRenderingContext2D,
    cell: CalendarDayCell,
    config: CalendarViewConfig,
    zoom: number,
  ): void {
    const dateKey = this._dateToKey(cell.date);

    // 背景
    if (cell.isToday) {
      ctx.fillStyle = '#E8F0FE';
      ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
    } else if (!cell.isCurrentMonth) {
      ctx.fillStyle = '#F8F9FA';
      ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
    }

    // 边框
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 0.5 * zoom;
    ctx.strokeRect(cell.x, cell.y, cell.width, cell.height);

    // 日期数字
    const dateNum = cell.date.getDate();
    ctx.font = cell.isToday ? `bold ${14 * zoom}px Arial, sans-serif` : `${12 * zoom}px Arial, sans-serif`;
    ctx.fillStyle = cell.isToday ? '#1a73e8' : cell.isCurrentMonth ? '#333' : '#999';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(String(dateNum), cell.x + 6 * zoom, cell.y + 4 * zoom);

    // 今天标记
    if (cell.isToday) {
      const circleRadius = 14 * zoom;
      ctx.fillStyle = '#1a73e8';
      ctx.beginPath();
      ctx.arc(cell.x + 16 * zoom, cell.y + 16 * zoom, circleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(dateNum), cell.x + 16 * zoom, cell.y + 16 * zoom);
    }

    // 记录卡片
    let cardY = cell.y + 28 * zoom;
    const cardHeight = 20 * zoom;
    const cardGap = 2 * zoom;
    const paddingX = 4 * zoom;
    const maxCardWidth = cell.width - paddingX * 2;

    for (let i = 0; i < Math.min(cell.records.length, config.maxCardsPerCell); i++) {
      const record = cell.records[i];
      const title = record[config.cardTitleFieldId] || '未命名';
      const color = config.cardColorFieldId
        ? String(record[config.cardColorFieldId] || '#2196F3')
        : '#2196F3';

      const card: CalendarCard = {
        record,
        x: cell.x + paddingX,
        y: cardY,
        width: maxCardWidth,
        height: cardHeight,
        color: String(color),
        title: String(title).slice(0, 20),
      };
      this._cards.set(record._id, card);

      // 卡片背景
      ctx.fillStyle = color + '20';
      ctx.fillRect(card.x, card.y, card.width, card.height);
      ctx.fillStyle = color;
      ctx.fillRect(card.x, card.y, 3 * zoom, card.height);

      // 卡片文字
      ctx.font = `${10 * zoom}px Arial, sans-serif`;
      ctx.fillStyle = '#333';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      let displayText = String(title);
      if (ctx.measureText(displayText).width > maxCardWidth - 8 * zoom) {
        while (displayText.length > 0 && ctx.measureText(displayText + '\u2026').width > maxCardWidth - 8 * zoom) {
          displayText = displayText.slice(0, -1);
        }
        displayText += '\u2026';
      }
      ctx.fillText(displayText, card.x + 6 * zoom, card.y + card.height / 2);

      cardY += cardHeight + cardGap;
    }

    // 溢出标记
    if (cell.records.length > config.maxCardsPerCell) {
      const remaining = cell.records.length - config.maxCardsPerCell;
      ctx.font = `${10 * zoom}px Arial, sans-serif`;
      ctx.fillStyle = '#999';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`+${remaining} 更多`, cell.x + cell.width / 2, cardY + 10 * zoom);
    }
  }

  // ─── 辅助方法 ───

  private _mapRecordsToDates(
    records: RecordRow[],
    dateFieldId: string,
    gridStart: Date,
    totalDays: number,
  ): Map<string, RecordRow[]> {
    const map = new Map<string, RecordRow[]>();

    for (const record of records) {
      const dateValue = record[dateFieldId];
      if (!dateValue) continue;

      const date = new Date(dateValue as string | number);
      const key = this._dateToKey(date);

      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(record);
    }

    return map;
  }

  private _dateToKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private _isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
  }

  /** Hit test 记录卡片 */
  hitTestCard(clientX: number, clientY: number): string | null {
    for (const [recordId, card] of this._cards) {
      if (clientX >= card.x && clientX <= card.x + card.width &&
          clientY >= card.y && clientY <= card.y + card.height) {
        return recordId;
      }
    }
    return null;
  }
}
