import { ViewportManager } from '../index';

// ==================== 日历卡片数据 ====================

export interface CalendarRenderCard {
  recordId: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  color: CalendarColorKey;
  spanDays: number;
  isContinuation: boolean;
  isAllDay: boolean;
}

export type CalendarColorKey = 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'gray';

export const CALENDAR_COLORS: Record<CalendarColorKey, { bg: string; border: string; text: string }> = {
  blue:   { bg: '#E8F0FE', border: '#1A73E8', text: '#1967D2' },
  green:  { bg: '#E6F4EA', border: '#34A853', text: '#1E8E3E' },
  yellow: { bg: '#FEF7E0', border: '#F9AB00', text: '#B06000' },
  red:    { bg: '#FCE8E6', border: '#EA4335', text: '#D93025' },
  purple: { bg: '#F3E8FD', border: '#A142F4', text: '#8430CE' },
  gray:   { bg: '#F1F3F4', border: '#9AA0A6', text: '#5F6368' },
};

// ==================== 多日跨度布局 ====================

export interface SpanLayout {
  card: CalendarRenderCard;
  startCol: number;
  colSpan: number;
  isContinuation: boolean;
}

// ==================== 渲染配置 ====================

export interface CalendarRenderConfig {
  currentDate: string;
  showWeekend: boolean;
  firstDayOfWeek: 0 | 1;
  maxCardsPerCell: number;
  cellMinHeight: number;
}

// ==================== 计算常量 ====================

const HEADER_HEIGHT = 40;
const DAY_NAMES_HEIGHT = 24;
const TIME_COL_WIDTH = 60;
const PIXELS_PER_HOUR = 60;
const HOURS_IN_DAY = 24;
const CARD_HEIGHT = 22;
const CARD_HEIGHT_COMPACT = 16;
const CARD_GAP = 1;
const DAY_NUMBER_ROW_HEIGHT = 28;
const BAR_HEIGHT = 22;
const BAR_RADIUS = 3;

// ==================== 命中测试结果 ====================

export interface HitTestResult {
  type: 'card' | 'cell' | 'span' | 'more-btn' | 'add-btn' | 'slot' | 'header' | null;
  recordId?: string;
  dateKey?: string;
  slotKey?: string;
}

// ==================== 内部数据结构 ====================

interface MonthCell {
  dateKey: string;
  date: Date;
  x: number;
  y: number;
  width: number;
  height: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  cards: CalendarRenderCard[];
}

interface CardRect {
  recordId: string;
  dateKey: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SpanRect {
  recordId: string;
  dateKey: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SlotRect {
  slotKey: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// ==================== CalendarRenderer ====================

export class CalendarRenderer {
  private _viewportManager: ViewportManager;
  private _monthCells: MonthCell[] = [];
  private _cardRects: CardRect[] = [];
  private _spanRects: SpanRect[] = [];
  private _addBtnRects: { dateKey: string; x: number; y: number; width: number; height: number }[] = [];
  private _moreBtnRects: { dateKey: string; x: number; y: number; width: number; height: number }[] = [];
  private _slotRects: SlotRect[] = [];
  private _cellRects: { dateKey: string; x: number; y: number; width: number; height: number }[] = [];

  constructor(viewportManager: ViewportManager) {
    this._viewportManager = viewportManager;
  }

  render(
    ctx: CanvasRenderingContext2D,
    config: CalendarRenderConfig,
    viewType: 'month' | 'week' | 'day',
    dateMap: Map<string, CalendarRenderCard[]>,
    spansPerWeek: SpanLayout[][],
    scrollTop: number,
    scrollLeft: number,
    viewportWidth: number,
    viewportHeight: number,
    hoveredCell: { dateKey: string; type: string } | null,
    expandedDates: Set<string>,
    expandedSlots: Set<string>,
  ): void {
    this._clearRects();
    const zoom = this._viewportManager.zoomLevel;

    switch (viewType) {
      case 'month':
        this._renderMonthView(ctx, config, dateMap, spansPerWeek, scrollTop, viewportWidth, viewportHeight, zoom, hoveredCell, expandedDates);
        break;
      case 'week':
        this._renderWeekView(ctx, config, dateMap, spansPerWeek, scrollTop, scrollLeft, viewportWidth, viewportHeight, zoom, hoveredCell, expandedSlots);
        break;
      case 'day':
        this._renderDayView(ctx, config, dateMap, spansPerWeek, scrollTop, scrollLeft, viewportWidth, viewportHeight, zoom, hoveredCell, expandedSlots);
        break;
    }
  }

  // ==================== 月视图 ====================

  private _renderMonthView(
    ctx: CanvasRenderingContext2D,
    config: CalendarRenderConfig,
    dateMap: Map<string, CalendarRenderCard[]>,
    spansPerWeek: SpanLayout[][],
    scrollTop: number,
    viewportWidth: number,
    viewportHeight: number,
    zoom: number,
    hoveredCell: { dateKey: string; type: string } | null,
    expandedDates: Set<string>,
  ): void {
    const currentDate = new Date(config.currentDate);
    const today = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    const firstDay = new Date(currentYear, currentMonth, 1);
    const firstDayWeek = firstDay.getDay();
    const startOffset = (firstDayWeek - config.firstDayOfWeek + 7) % 7;
    const gridStart = new Date(firstDay.getTime() - startOffset * 24 * 60 * 60 * 1000);

    const showWeekend = config.showWeekend;
    const colCount = showWeekend ? 7 : 5;
    const totalCells = 6 * 7; // always compute 42 dates, then filter
    const allDates: { date: Date; dateKey: string; col: number; week: number }[] = [];

    for (let i = 0; i < totalCells; i++) {
      const d = new Date(gridStart.getTime() + i * 24 * 60 * 60 * 1000);
      const dayOfWeek = d.getDay();
      if (!showWeekend && (dayOfWeek === 0 || dayOfWeek === 6)) continue;
      const week = Math.floor(i / 7);
      const col = showWeekend ? (i % 7) : this._getWeekdayCol(d, config.firstDayOfWeek);
      allDates.push({ date: d, dateKey: this._dateToKey(d), col, week });
    }

    const cellWidth = viewportWidth / colCount;
    const topOffset = (HEADER_HEIGHT + DAY_NAMES_HEIGHT) * zoom;
    const cellHeight = Math.max(config.cellMinHeight * zoom, (viewportHeight - topOffset) / 6);

    if (cellHeight <= 0) return;

    this._monthCells = [];

    this._drawMonthDayNames(ctx, config, cellWidth, zoom, topOffset);

    const weekCount = 6;
    for (let week = 0; week < weekCount; week++) {
      const weekDates = allDates.filter(d => d.week === week);
      if (weekDates.length === 0) continue;
      const weekDateKeys = weekDates.map(d => d.dateKey);

      const dateRowY = topOffset + week * (DAY_NUMBER_ROW_HEIGHT * zoom + cellHeight);

      for (const item of weekDates) {
        const d = item.date;
        const dateKey = item.dateKey;
        const day = item.col;
        const x = day * cellWidth;
        const isToday = this._isSameDay(d, today);
        const isCurrentMonth = d.getMonth() === currentMonth;

        this._drawDateNumber(ctx, x, dateRowY, cellWidth, DAY_NUMBER_ROW_HEIGHT * zoom, d, isToday, isCurrentMonth, zoom);
        this._cellRects.push({ dateKey, x, y: dateRowY, width: cellWidth, height: DAY_NUMBER_ROW_HEIGHT * zoom });
      }

      const cardRowY = dateRowY + DAY_NUMBER_ROW_HEIGHT * zoom;

      // 先计算多日跨度条占用的高度（不渲染，仅计算）
      const weekSpans = spansPerWeek[week] || [];
      const spanStartY = cardRowY + 2 * zoom;
      const visibleSpanCount = weekSpans.filter(s => {
        const startIdx = s.startCol - 1;
        return startIdx >= 0 && startIdx < weekDateKeys.length;
      }).length;
      const spanRenderedH = visibleSpanCount > 0
        ? visibleSpanCount * (BAR_HEIGHT * zoom) + (visibleSpanCount - 1) * (CARD_GAP * zoom)
        : 0;
      // 单日卡片渲染在跨度条下方
      const singleCardStartY = spanStartY + (spanRenderedH > 0 ? spanRenderedH + CARD_GAP * zoom : 0);

      for (const item of weekDates) {
        const d = item.date;
        const dateKey = item.dateKey;
        const day = item.col;
        const x = day * cellWidth;
        const isToday = this._isSameDay(d, today);
        const isCurrentMonth = d.getMonth() === currentMonth;

        const allCards = dateMap.get(dateKey) || [];
        const startCards = allCards.filter(c => c.spanDays <= 1);
        const effectiveMax = expandedDates.has(dateKey) ? 999 : config.maxCardsPerCell;
        const visibleCards = startCards.slice(0, effectiveMax);
        const hasMore = startCards.length > effectiveMax;

        const cell: MonthCell = {
          dateKey, date: d, x, y: cardRowY, width: cellWidth, height: cellHeight,
          isCurrentMonth, isToday, cards: visibleCards,
        };
        this._monthCells.push(cell);
        this._cellRects.push({ dateKey, x, y: cardRowY, width: cellWidth, height: cellHeight });

        // 1. 先画单元格背景
        if (isToday) {
          ctx.fillStyle = '#f0f5ff';
        } else if (isCurrentMonth) {
          ctx.fillStyle = '#fff';
        } else {
          ctx.fillStyle = '#fafbfc';
        }
        ctx.fillRect(x, cardRowY, cellWidth, cellHeight);

        // 2. 画单日卡片（在跨度条下方）
        let cardY = singleCardStartY;
        for (const card of visibleCards) {
          this._drawMonthCard(ctx, card, x + 4 * zoom, cardY, cellWidth - 8 * zoom, CARD_HEIGHT * zoom, zoom);
          this._cardRects.push({
            recordId: card.recordId,
            dateKey,
            x: x + 4 * zoom,
            y: cardY,
            width: cellWidth - 8 * zoom,
            height: CARD_HEIGHT * zoom,
          });
          cardY += (CARD_HEIGHT + CARD_GAP) * zoom;
        }

        if (hasMore) {
          const moreY = cardY + 2 * zoom;
          const remainCount = startCards.length - effectiveMax;
          const label = `还有 ${remainCount} 条记录`;
          ctx.font = `${11 * zoom}px Arial, sans-serif`;
          const isHoveredMore = hoveredCell && hoveredCell.type === 'more-btn' && hoveredCell.dateKey === dateKey;
          ctx.fillStyle = isHoveredMore ? '#3370ff' : '#8f959e';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const labelW = ctx.measureText(label).width;
          ctx.fillText(label, x + 6 * zoom, moreY + 8 * zoom);
          this._moreBtnRects.push({ dateKey, x: x + 4 * zoom, y: moreY, width: labelW + 8 * zoom, height: 16 * zoom });
        }

        if (hoveredCell && hoveredCell.dateKey === dateKey) {
          this._drawAddBtn(ctx, x + cellWidth - 24 * zoom, dateRowY + 4 * zoom, 20 * zoom, zoom);
          this._addBtnRects.push({
            dateKey,
            x: x + cellWidth - 24 * zoom,
            y: dateRowY + 4 * zoom,
            width: 20 * zoom,
            height: 20 * zoom,
          });
        }
      }

      // 3. 最后画多日跨度条（覆盖在背景上方，垂直堆叠）
      this._drawMonthSpans(ctx, weekSpans, weekDateKeys, spanStartY, cellWidth, zoom);
    }
  }

  private _drawMonthDayNames(
    ctx: CanvasRenderingContext2D,
    config: CalendarRenderConfig,
    cellWidth: number,
    zoom: number,
    topOffset: number,
  ): void {
    const allDayNames = config.firstDayOfWeek === 1
      ? ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
      : ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    const dayNames = config.showWeekend ? allDayNames : allDayNames.filter((_, i) => {
      const dayIdx = (config.firstDayOfWeek + i) % 7;
      return dayIdx !== 0 && dayIdx !== 6;
    });

    const colCount = dayNames.length;

    ctx.font = `${12 * zoom}px Arial, sans-serif`;
    ctx.fillStyle = '#646a73';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < colCount; i++) {
      const x = i * cellWidth + cellWidth / 2;
      ctx.fillText(dayNames[i], x, HEADER_HEIGHT * zoom + DAY_NAMES_HEIGHT * zoom / 2);
    }

    ctx.strokeStyle = '#e5e6eb';
    ctx.lineWidth = 1 * zoom;
    ctx.beginPath();
    ctx.moveTo(0, topOffset);
    ctx.lineTo(cellWidth * colCount, topOffset);
    ctx.stroke();
  }

  private _drawDateNumber(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, cellW: number, cellH: number,
    d: Date, isToday: boolean, isCurrentMonth: boolean,
    zoom: number,
  ): void {
    ctx.fillStyle = isToday ? '#f0f5ff' : isCurrentMonth ? '#fff' : '#fafbfc';
    ctx.fillRect(x, y, cellW, cellH);

    ctx.strokeStyle = '#f0f1f2';
    ctx.lineWidth = 0.5 * zoom;
    ctx.strokeRect(x, y, cellW, cellH);

    const dateNum = d.getDate();
    if (isToday) {
      const circleR = 12 * zoom;
      ctx.fillStyle = '#3370ff';
      ctx.beginPath();
      ctx.arc(x + cellW / 2, y + cellH / 2, circleR, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `bold ${12 * zoom}px Arial, sans-serif`;
      ctx.fillStyle = '#fff';
    } else {
      ctx.font = `${12 * zoom}px Arial, sans-serif`;
      ctx.fillStyle = isCurrentMonth ? '#1f2329' : '#c0c4cc';
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(dateNum), x + cellW / 2, y + cellH / 2);
  }

  private _drawMonthCard(
    ctx: CanvasRenderingContext2D,
    card: CalendarRenderCard,
    x: number, y: number, w: number, h: number,
    zoom: number,
  ): void {
    const colors = CALENDAR_COLORS[card.color] || CALENDAR_COLORS.blue;

    ctx.fillStyle = colors.bg;
    this._roundRect(ctx, x, y, w, h, BAR_RADIUS * zoom);
    ctx.fill();

    ctx.fillStyle = colors.border;
    ctx.fillRect(x, y, 3 * zoom, h);

    ctx.font = `${12 * zoom}px Arial, sans-serif`;
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const text = this._truncateText(ctx, card.title, w - 12 * zoom);
    ctx.fillText(text, x + 6 * zoom, y + h / 2);
  }

  private _drawMonthSpans(
    ctx: CanvasRenderingContext2D,
    spans: SpanLayout[],
    dateKeys: string[],
    startY: number,
    cellWidth: number,
    zoom: number,
  ): number {
    const SPAN_H = BAR_HEIGHT * zoom;
    const spanGap = CARD_GAP * zoom;
    let currentY = startY;
    let renderedCount = 0;

    for (const span of spans) {
      const startIdx = span.startCol - 1;
      if (startIdx < 0 || startIdx >= dateKeys.length) continue;

      const spanX = startIdx * cellWidth;
      const spanW = span.colSpan * cellWidth;
      const spanY = currentY;

      const colors = CALENDAR_COLORS[span.card.color] || CALENDAR_COLORS.blue;

      ctx.fillStyle = colors.bg;
      this._roundRect(ctx, spanX, spanY, spanW, SPAN_H, BAR_RADIUS * zoom);
      ctx.fill();

      ctx.fillStyle = colors.border;
      ctx.fillRect(spanX, spanY, 3 * zoom, SPAN_H);

      ctx.font = `${12 * zoom}px Arial, sans-serif`;
      ctx.fillStyle = colors.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const text = this._truncateText(ctx, span.card.title, spanW - 12 * zoom);
      ctx.fillText(text, spanX + 6 * zoom, spanY + SPAN_H / 2);

      this._spanRects.push({
        recordId: span.card.recordId,
        dateKey: dateKeys[span.startCol - 1] || '',
        x: spanX,
        y: spanY,
        width: spanW,
        height: SPAN_H,
      });

      currentY += SPAN_H + spanGap;
      renderedCount++;
    }

    // 返回渲染的总高度
    return renderedCount > 0 ? renderedCount * SPAN_H + (renderedCount - 1) * spanGap : 0;
  }

  private _drawAddBtn(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, size: number,
    zoom: number,
  ): void {
    ctx.fillStyle = '#3370ff';
    this._roundRect(ctx, x, y, size, size, 4 * zoom);
    ctx.fill();

    ctx.font = `bold ${14 * zoom}px Arial, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+', x + size / 2, y + size / 2);
  }

  // ==================== 周视图 ====================

  private _renderWeekView(
    ctx: CanvasRenderingContext2D,
    config: CalendarRenderConfig,
    dateMap: Map<string, CalendarRenderCard[]>,
    _spansPerWeek: SpanLayout[][],
    scrollTop: number,
    scrollLeft: number,
    viewportWidth: number,
    viewportHeight: number,
    zoom: number,
    hoveredCell: { dateKey: string; type: string } | null,
    expandedSlots: Set<string>,
  ): void {
    const currentDate = new Date(config.currentDate);
    const today = new Date();
    const weekStart = this._getWeekStart(currentDate, config.firstDayOfWeek);

    const allDates: Date[] = [];
    const allDateKeys: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000);
      allDates.push(d);
      allDateKeys.push(this._dateToKey(d));
    }

    const dates = config.showWeekend ? allDates : allDates.filter(d => d.getDay() !== 0 && d.getDay() !== 6);
    const dateKeys = dates.map(d => this._dateToKey(d));

    const dayCount = dates.length;
    const timeColW = TIME_COL_WIDTH * zoom;
    const dayW = (viewportWidth - timeColW) / dayCount;
    const hourH = PIXELS_PER_HOUR * zoom;
    const headerH = HEADER_HEIGHT * zoom;
    const allDayH = 28 * zoom;
    const allDayTop = headerH;

    // Get all spans for week/day view - flatten spansPerWeek
    const allSpans: SpanLayout[] = [];
    for (const weekSpans of _spansPerWeek) {
      allSpans.push(...weekSpans);
    }

    this._renderWeekDayCommon(
      ctx, config, dateMap, allSpans, dates, dateKeys, dayCount, dayCount,
      timeColW, dayW, hourH, headerH, allDayH, allDayTop,
      scrollTop, viewportWidth, viewportHeight, zoom,
      hoveredCell, expandedSlots,
    );
  }

  // ==================== 日视图 ====================

  private _renderDayView(
    ctx: CanvasRenderingContext2D,
    config: CalendarRenderConfig,
    dateMap: Map<string, CalendarRenderCard[]>,
    _spansPerWeek: SpanLayout[][],
    scrollTop: number,
    scrollLeft: number,
    viewportWidth: number,
    viewportHeight: number,
    zoom: number,
    hoveredCell: { dateKey: string; type: string } | null,
    expandedSlots: Set<string>,
  ): void {
    const currentDate = new Date(config.currentDate);

    const dates: Date[] = [currentDate];
    const dateKeys: string[] = [this._dateToKey(currentDate)];

    const dayCount = 1;
    const timeColW = TIME_COL_WIDTH * zoom;
    const dayW = viewportWidth - timeColW;
    const hourH = PIXELS_PER_HOUR * zoom;
    const headerH = HEADER_HEIGHT * zoom;
    const allDayH = 28 * zoom;
    const allDayTop = headerH;

    const allSpans: SpanLayout[] = [];
    for (const weekSpans of _spansPerWeek) {
      allSpans.push(...weekSpans);
    }

    this._renderWeekDayCommon(
      ctx, config, dateMap, allSpans, dates, dateKeys, dayCount, dayCount,
      timeColW, dayW, hourH, headerH, allDayH, allDayTop,
      scrollTop, viewportWidth, viewportHeight, zoom,
      hoveredCell, expandedSlots,
    );
  }

  // ==================== 周/日视图通用渲染 ====================

  private _renderWeekDayCommon(
    ctx: CanvasRenderingContext2D,
    config: CalendarRenderConfig,
    dateMap: Map<string, CalendarRenderCard[]>,
    spans: SpanLayout[],
    dates: Date[],
    dateKeys: string[],
    dayCount: number,
    colCount: number,
    timeColW: number,
    dayW: number,
    hourH: number,
    headerH: number,
    allDayH: number,
    allDayTop: number,
    scrollTop: number,
    viewportWidth: number,
    viewportHeight: number,
    zoom: number,
    hoveredCell: { dateKey: string; type: string } | null,
    expandedSlots: Set<string>,
  ): void {
    const today = new Date();

    // 时间列头
    ctx.fillStyle = '#fafbfc';
    ctx.fillRect(0, 0, timeColW, headerH);
    ctx.strokeStyle = '#e5e6eb';
    ctx.lineWidth = 1 * zoom;
    ctx.strokeRect(0, 0, timeColW, headerH);
    ctx.font = `${12 * zoom}px Arial, sans-serif`;
    ctx.fillStyle = '#8f959e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('时间', timeColW / 2, headerH / 2);

    // 日期头
    for (let i = 0; i < dayCount; i++) {
      const d = dates[i];
      const dateKey = dateKeys[i];
      const x = timeColW + i * dayW;
      const isToday = this._isSameDay(d, today);

      ctx.fillStyle = isToday ? '#f0f5ff' : '#fafbfc';
      ctx.fillRect(x, 0, dayW, headerH);
      ctx.strokeStyle = '#e5e6eb';
      ctx.lineWidth = 1 * zoom;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, headerH);
      ctx.stroke();

      const dayNames = config.firstDayOfWeek === 1
        ? ['日', '一', '二', '三', '四', '五', '六']
        : ['日', '一', '二', '三', '四', '五', '六'];
      const dayName = dayNames[d.getDay()];
      const headerLabel = isToday ? '今天' : `周${dayName}`;

      ctx.font = `${11 * zoom}px Arial, sans-serif`;
      ctx.fillStyle = '#8f959e';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`${d.getMonth() + 1}/${d.getDate()}`, x + dayW / 2, 4 * zoom);

      ctx.font = `${13 * zoom}px Arial, sans-serif`;
      ctx.fillStyle = isToday ? '#3370ff' : '#646a73';
      ctx.textBaseline = 'bottom';
      ctx.fillText(headerLabel, x + dayW / 2, headerH - 4 * zoom);
    }

    // 全天区
    const allDayY = allDayTop;
    const SPAN_HEIGHT = 18;

    // 计算可见的多日跨度条数量
    const visibleSpans = spans.filter(s => s.startCol >= 1 && s.startCol <= dayCount);
    const spanCount = visibleSpans.length;
    const spanTotalH = spanCount > 0 ? spanCount * (SPAN_HEIGHT + CARD_GAP) + 4 : 0;

    let maxAllDayCards = 0;
    for (let i = 0; i < dayCount; i++) {
      const dateKey = dateKeys[i];
      const allCards = dateMap.get(dateKey) || [];
      const allDayCards = allCards.filter(c => c.isAllDay && c.spanDays <= 1);
      const slotKey = `allday-${dateKey}`;
      const isExpanded = expandedSlots.has(slotKey);
      const visibleCount = isExpanded ? allDayCards.length : Math.min(allDayCards.length, 10);
      maxAllDayCards = Math.max(maxAllDayCards, visibleCount);
    }
    // 全天面板最少高度可以容纳10条记录
    const MIN_ALL_DAY_HEIGHT = 10 * (CARD_HEIGHT_COMPACT + CARD_GAP) + 8;
    const allDayCardH = Math.max(MIN_ALL_DAY_HEIGHT, maxAllDayCards * (CARD_HEIGHT_COMPACT + CARD_GAP) + 8);
    const dynamicAllDayH = Math.max(allDayH * zoom, (spanTotalH + allDayCardH) * zoom);

    ctx.fillStyle = '#fafbfc';
    ctx.fillRect(0, allDayY, timeColW, dynamicAllDayH);
    ctx.strokeStyle = '#e5e6eb';
    ctx.lineWidth = 2 * zoom;
    ctx.strokeRect(0, allDayY, timeColW, dynamicAllDayH);
    ctx.font = `${11 * zoom}px Arial, sans-serif`;
    ctx.fillStyle = '#8f959e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('全天', timeColW / 2, allDayY + dynamicAllDayH / 2);

    // 多日跨度条 - 先计算占用高度（不渲染）
    const spanStartY = allDayY + 2 * zoom;
    const visibleSpansForCount = spans.filter(s => s.startCol >= 1 && s.startCol <= dayCount);
    const spanRenderedH = visibleSpansForCount.length > 0
      ? visibleSpansForCount.length * (SPAN_HEIGHT * zoom) + (visibleSpansForCount.length - 1) * (CARD_GAP * zoom)
      : 0;

    // 单日全天卡片 - 渲染在多日跨度条下方
    const allDayCardStartY = spanStartY + (spanRenderedH > 0 ? spanRenderedH + 2 * zoom : 0);

    for (let i = 0; i < dayCount; i++) {
      const dateKey = dateKeys[i];
      const x = timeColW + i * dayW;
      const allCards = dateMap.get(dateKey) || [];
      const allDayCards = allCards.filter(c => {
        if (c.isAllDay && c.spanDays <= 1) return true;
        return false;
      });

      // 1. 先画单元格背景
      ctx.fillStyle = '#fffbe6';
      ctx.fillRect(x, allDayY, dayW, dynamicAllDayH);
      ctx.strokeStyle = '#f0f1f2';
      ctx.lineWidth = 0.5 * zoom;
      ctx.beginPath();
      ctx.moveTo(x, allDayY);
      ctx.lineTo(x, allDayY + dynamicAllDayH);
      ctx.stroke();

      // 2. 画单日全天卡片（在跨度条下方）
      const slotKey = `allday-${dateKey}`;
      const isExpanded = expandedSlots.has(slotKey);
      const maxVisible = isExpanded ? 999 : 10;
      const visibleCards = allDayCards.slice(0, maxVisible);
      const hasMore = allDayCards.length > 10;

      let cardY = allDayCardStartY;
      for (const card of visibleCards) {
        this._drawCompactCard(ctx, card, x + 2 * zoom, cardY, dayW - 4 * zoom, CARD_HEIGHT_COMPACT * zoom, zoom);
        this._cardRects.push({
          recordId: card.recordId,
          dateKey,
          x: x + 2 * zoom,
          y: cardY,
          width: dayW - 4 * zoom,
          height: CARD_HEIGHT_COMPACT * zoom,
        });
        cardY += CARD_HEIGHT_COMPACT * zoom + CARD_GAP * zoom;
      }

      if (hasMore) {
        const remainCount = allDayCards.length - 10;
        const label = `还有 ${remainCount} 条记录`;
        ctx.font = `${10 * zoom}px Arial, sans-serif`;
        const isHoveredMore = hoveredCell && hoveredCell.type === 'more-btn' && hoveredCell.dateKey === dateKey;
        ctx.fillStyle = isHoveredMore ? '#3370ff' : '#8f959e';
        ctx.textAlign = 'left';
        ctx.fillText(label, x + 4 * zoom, cardY + 7 * zoom);
        const labelW = ctx.measureText(label).width;
        this._moreBtnRects.push({ dateKey, x: x + 4 * zoom, y: cardY, width: labelW + 8 * zoom, height: 16 * zoom });
      }

      this._slotRects.push({ slotKey, x, y: allDayY, width: dayW, height: dynamicAllDayH });

      if (hoveredCell && hoveredCell.dateKey === dateKey && hoveredCell.type === 'allday') {
        this._drawAddBtn(ctx, x + dayW - 24 * zoom, allDayCardStartY + 2 * zoom, 20 * zoom, zoom);
      }
    }

    // 3. 最后画多日跨度条（覆盖在背景上方，垂直堆叠）
    this._drawWeekDaySpans(ctx, spans, dateKeys, spanStartY, timeColW, dayW, zoom);

    // 时间格线 + 小时标签
    const timeGridTop = allDayY + dynamicAllDayH;
    for (let h = 0; h < HOURS_IN_DAY; h++) {
      const y = timeGridTop + h * hourH;
      const label = h === 0 ? '' : `${String(h).padStart(2, '0')}:00`;

      ctx.fillStyle = '#fafbfc';
      ctx.fillRect(0, y, timeColW, hourH);
      ctx.strokeStyle = '#f0f1f2';
      ctx.lineWidth = 0.5 * zoom;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(viewportWidth, y);
      ctx.stroke();

      ctx.font = `${10 * zoom}px Arial, sans-serif`;
      ctx.fillStyle = '#8f959e';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, timeColW / 2, y + 2 * zoom);

      // 时间槽卡片
      for (let i = 0; i < dayCount; i++) {
        const dateKey = dateKeys[i];
        const x = timeColW + i * dayW;
        const allCards = dateMap.get(dateKey) || [];
        const hourCards = allCards.filter(c => {
          if (!c.startDate) return false;
          if (c.isAllDay) return false;
          if (c.isContinuation && c.spanDays > 1) return false;
          const startH = new Date(c.startDate).getHours();
          return startH === h;
        });

        const slotKey = `${dateKey}-${h}`;
        const isExpanded = expandedSlots.has(slotKey);
        const maxVisible = isExpanded ? 999 : 10;
        const visibleCards = hourCards.slice(0, maxVisible);

        ctx.fillStyle = '#fff';
        ctx.fillRect(x, y, dayW, hourH);
        ctx.strokeStyle = '#f0f1f2';
        ctx.lineWidth = 0.5 * zoom;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + hourH);
        ctx.stroke();

        let cardY = y + 1 * zoom;
        for (const card of visibleCards) {
          this._drawCompactCard(ctx, card, x + 2 * zoom, cardY, dayW - 4 * zoom, CARD_HEIGHT_COMPACT * zoom, zoom);
          this._cardRects.push({
            recordId: card.recordId,
            dateKey,
            x: x + 2 * zoom,
            y: cardY,
            width: dayW - 4 * zoom,
            height: CARD_HEIGHT_COMPACT * zoom,
          });
          cardY += CARD_HEIGHT_COMPACT * zoom + CARD_GAP * zoom;
        }

        const hourHasMore = hourCards.length > 10;
        if (hourHasMore) {
          const remainCount = hourCards.length - 10;
          const label = `还有 ${remainCount} 条记录`;
          ctx.font = `${10 * zoom}px Arial, sans-serif`;
          const isHoveredMore = hoveredCell && hoveredCell.type === 'more-btn' && hoveredCell.dateKey === dateKey;
          ctx.fillStyle = isHoveredMore ? '#3370ff' : '#8f959e';
          ctx.textAlign = 'left';
          ctx.fillText(label, x + 4 * zoom, cardY + 7 * zoom);
          const labelW = ctx.measureText(label).width;
          this._moreBtnRects.push({ dateKey, x: x + 4 * zoom, y: cardY, width: labelW + 8 * zoom, height: 16 * zoom });
        }

        this._slotRects.push({ slotKey, x, y, width: dayW, height: hourH });

        if (hoveredCell && (hoveredCell as any).dateKey === dateKey && hoveredCell.type === 'slot' && (hoveredCell as any).slotKey === slotKey) {
          this._drawAddBtn(ctx, x + dayW - 20 * zoom, y + 1 * zoom, 18 * zoom, zoom);
        }
      }
    }

    // 当前时间指示器
    const now = new Date();
    const currentDateKey = this._dateToKey(now);
    // 只在当前日期在可视范围内时绘制
    if (dateKeys.includes(currentDateKey)) {
      const nowH = now.getHours();
      const nowM = now.getMinutes();
      const nowY = timeGridTop + nowH * hourH + (nowM / 60) * hourH;

      ctx.strokeStyle = '#ea4335';
      ctx.lineWidth = 2 * zoom;
      ctx.beginPath();
      ctx.moveTo(timeColW, nowY);
      ctx.lineTo(viewportWidth, nowY);
      ctx.stroke();

      ctx.fillStyle = '#ea4335';
      ctx.beginPath();
      ctx.arc(timeColW - 4 * zoom, nowY, 4 * zoom, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private _drawCompactCard(
    ctx: CanvasRenderingContext2D,
    card: CalendarRenderCard,
    x: number, y: number, w: number, h: number,
    zoom: number,
  ): void {
    const colors = CALENDAR_COLORS[card.color] || CALENDAR_COLORS.blue;

    ctx.fillStyle = colors.bg;
    this._roundRect(ctx, x, y, w, h, 2 * zoom);
    ctx.fill();

    ctx.fillStyle = colors.border;
    ctx.fillRect(x, y, 2 * zoom, h);

    ctx.font = `${10 * zoom}px Arial, sans-serif`;
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const text = this._truncateText(ctx, card.title, w - 8 * zoom);
    ctx.fillText(text, x + 4 * zoom, y + h / 2);
  }

  private _drawWeekDaySpans(
    ctx: CanvasRenderingContext2D,
    spans: SpanLayout[],
    dateKeys: string[],
    startY: number,
    timeColW: number,
    dayW: number,
    zoom: number,
  ): number {
    const SPAN_H = 18 * zoom;
    const spanGap = CARD_GAP * zoom;
    let currentY = startY;
    let renderedCount = 0;

    for (const span of spans) {
      const startIdx = span.startCol - 1;
      if (startIdx < 0 || startIdx >= dateKeys.length) continue;

      const spanX = timeColW + startIdx * dayW;
      const spanW = span.colSpan * dayW;
      const spanY = currentY;

      const colors = CALENDAR_COLORS[span.card.color] || CALENDAR_COLORS.blue;

      ctx.fillStyle = colors.bg;
      this._roundRect(ctx, spanX, spanY, spanW, SPAN_H, BAR_RADIUS * zoom);
      ctx.fill();

      ctx.fillStyle = colors.border;
      ctx.fillRect(spanX, spanY, 3 * zoom, SPAN_H);

      ctx.font = `${10 * zoom}px Arial, sans-serif`;
      ctx.fillStyle = colors.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const text = this._truncateText(ctx, span.card.title, spanW - 12 * zoom);
      ctx.fillText(text, spanX + 6 * zoom, spanY + SPAN_H / 2);

      this._spanRects.push({
        recordId: span.card.recordId,
        dateKey: dateKeys[span.startCol - 1] || '',
        x: spanX,
        y: spanY,
        width: spanW,
        height: SPAN_H,
      });

      currentY += SPAN_H + spanGap;
      renderedCount++;
    }

    // 返回渲染的总高度
    return renderedCount > 0 ? renderedCount * SPAN_H + (renderedCount - 1) * spanGap : 0;
  }

  // ==================== 命中测试 ====================

  hitTest(clientX: number, clientY: number): HitTestResult {
    for (const r of this._spanRects) {
      if (clientX >= r.x && clientX <= r.x + r.width && clientY >= r.y && clientY <= r.y + r.height) {
        return { type: 'span', recordId: r.recordId, dateKey: r.dateKey };
      }
    }

    for (const r of this._cardRects) {
      if (clientX >= r.x && clientX <= r.x + r.width && clientY >= r.y && clientY <= r.y + r.height) {
        return { type: 'card', recordId: r.recordId, dateKey: r.dateKey };
      }
    }

    for (const r of this._addBtnRects) {
      if (clientX >= r.x && clientX <= r.x + r.width && clientY >= r.y && clientY <= r.y + r.height) {
        return { type: 'add-btn', dateKey: r.dateKey };
      }
    }

    for (const r of this._moreBtnRects) {
      if (clientX >= r.x && clientX <= r.x + r.width && clientY >= r.y && clientY <= r.y + r.height) {
        return { type: 'more-btn', dateKey: r.dateKey };
      }
    }

    for (const r of this._slotRects) {
      if (clientX >= r.x && clientX <= r.x + r.width && clientY >= r.y && clientY <= r.y + r.height) {
        return { type: 'slot', slotKey: r.slotKey };
      }
    }

    for (const r of this._cellRects) {
      if (clientX >= r.x && clientX <= r.x + r.width && clientY >= r.y && clientY <= r.y + r.height) {
        return { type: 'cell', dateKey: r.dateKey };
      }
    }

    return { type: null };
  }

  // ==================== 辅助方法 ====================

  private _clearRects(): void {
    this._monthCells = [];
    this._cardRects = [];
    this._spanRects = [];
    this._addBtnRects = [];
    this._moreBtnRects = [];
    this._slotRects = [];
    this._cellRects = [];
  }

  private _dateToKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private _isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
  }

  private _getWeekdayCol(date: Date, firstDayOfWeek: 0 | 1): number {
    const day = date.getDay();
    const offset = (day - firstDayOfWeek + 7) % 7;
    // If showing weekends, offset is the column. If not, need to skip weekends
    // For non-weekend, Sat(6) and Sun(0) are filtered out before this is called
    return offset;
  }

  private _getWeekStart(date: Date, firstDayOfWeek: 0 | 1): Date {
    const day = date.getDay();
    const diff = (day - firstDayOfWeek + 7) % 7;
    const result = new Date(date.getTime() - diff * 24 * 60 * 60 * 1000);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private _truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let displayText = text;
    while (displayText.length > 0 && ctx.measureText(displayText + '\u2026').width > maxWidth) {
      displayText = displayText.slice(0, -1);
    }
    return displayText + '\u2026';
  }

  private _roundRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}