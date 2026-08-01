import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import {
  CalendarRenderer,
  ViewportManager,
  type CalendarRenderCard,
  type CalendarRenderConfig,
  type CalendarColorKey,
  type SpanLayout,
} from '@lingyi-doc/core-sheet';
import {
  type CalendarCardData,
  buildWeekSpanLayout,
  getMonthGridDates,
  getWeekDates,
  isAllDayEvent,
} from './calendarUtils';

interface CalendarCanvasViewProps {
  viewType: 'month' | 'week' | 'day';
  currentDate: Dayjs;
  dateMap: Map<string, CalendarCardData[]>;
  maxCards: number;
  showWeekend: boolean;
  weekStart: 0 | 1;
  onCardClick: (card: CalendarCardData) => void;
  onCreateRecord: (date: Dayjs) => void;
  onShowMore: (date: Dayjs) => void;
}

const PIXELS_PER_HOUR = 60;

function toRenderCard(card: CalendarCardData): CalendarRenderCard {
  return {
    recordId: card.recordId,
    title: card.title,
    startDate: card.startDate ? card.startDate.toISOString() : null,
    endDate: card.endDate ? card.endDate.toISOString() : null,
    color: (card.color as CalendarColorKey) || 'blue',
    spanDays: card.spanDays,
    isContinuation: card.isContinuation,
    isAllDay: card.startDate ? isAllDayEvent(card) : true,
  };
}

function convertDateMap(dateMap: Map<string, CalendarCardData[]>): Map<string, CalendarRenderCard[]> {
  const result = new Map<string, CalendarRenderCard[]>();
  for (const [key, cards] of dateMap) {
    result.set(key, cards.map(toRenderCard));
  }
  return result;
}

function convertSpans(spans: ReturnType<typeof buildWeekSpanLayout>): SpanLayout[] {
  return spans.map(s => ({
    card: toRenderCard(s.card),
    startCol: s.startCol,
    colSpan: s.colSpan,
    isContinuation: s.isContinuation,
  }));
}

function getVisibleDates(allDates: Dayjs[], showWeekend: boolean): Dayjs[] {
  if (showWeekend) return allDates;
  return allDates.filter(d => {
    const day = d.day();
    return day !== 0 && day !== 6;
  });
}

export const CalendarCanvasView: React.FC<CalendarCanvasViewProps> = ({
  viewType,
  currentDate,
  dateMap,
  maxCards,
  showWeekend,
  weekStart,
  onCardClick,
  onCreateRecord,
  onShowMore,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<CalendarRenderer | null>(null);
  const renderFrameRef = useRef(0);

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);
  const [hoveredCell, setHoveredCell] = useState<{ dateKey: string; type: string; slotKey?: string } | null>(null);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set());

  const cardMapRef = useRef<Map<string, CalendarCardData>>(new Map());

  const viewportRef = useRef(new ViewportManager());

  useEffect(() => {
    rendererRef.current = new CalendarRenderer(viewportRef.current);
  }, []);

  const scheduleRender = useCallback(() => {
    if (renderFrameRef.current) return;
    renderFrameRef.current = requestAnimationFrame(() => {
      renderFrameRef.current = 0;
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (!canvas || !renderer) return;

      const dpr = window.devicePixelRatio || 1;
      const w = containerSize.width;
      const h = containerSize.height;

      if (w <= 0 || h <= 0) return;

      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
    });
  }, [containerSize]);

  const performRenderRef = useRef<() => void>(() => {});

  const renderConfig: CalendarRenderConfig = useMemo(() => ({
    currentDate: currentDate.toISOString(),
    showWeekend,
    firstDayOfWeek: weekStart,
    maxCardsPerCell: maxCards,
    cellMinHeight: 100,
  }), [currentDate, showWeekend, weekStart, maxCards]);

  const renderData = useMemo(() => {
    const converted = convertDateMap(dateMap);

    const cardMap = new Map<string, CalendarCardData>();
    for (const [, cards] of dateMap) {
      for (const card of cards) {
        cardMap.set(card.recordId, card);
      }
    }
    cardMapRef.current = cardMap;

    let spansPerWeek: SpanLayout[][] = [];
    if (viewType === 'month') {
      const allDates = getMonthGridDates(currentDate, weekStart);
      const visibleDates = getVisibleDates(allDates, showWeekend);
      const colCount = showWeekend ? 7 : 5;
      const weeks: Dayjs[][] = [];
      for (let i = 0; i < visibleDates.length; i += colCount) {
        weeks.push(visibleDates.slice(i, i + colCount));
      }
      spansPerWeek = weeks.map(week => convertSpans(buildWeekSpanLayout(week, dateMap)));
    } else if (viewType === 'week' || viewType === 'day') {
      const allWeekDates = getWeekDates(currentDate, weekStart);
      const visibleDates = viewType === 'day' ? [currentDate] : getVisibleDates(allWeekDates, showWeekend);
      const allDayDateMap = new Map(dateMap);
      for (const [key, cards] of allDayDateMap) {
        allDayDateMap.set(key, cards.filter(c => {
          if (c.spanDays <= 1) return false;
          if (!c.startDate) return false;
          return isAllDayEvent(c);
        }));
      }
      spansPerWeek = [convertSpans(buildWeekSpanLayout(visibleDates, allDayDateMap))];
    }

    return { converted, spansPerWeek };
  }, [dateMap, currentDate, viewType, weekStart, showWeekend]);

  performRenderRef.current = useCallback(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    const dpr = window.devicePixelRatio || 1;
    const w = containerSize.width;
    const h = containerSize.height;

    if (w <= 0 || h <= 0) return;

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    renderer.render(
      ctx,
      renderConfig,
      viewType,
      renderData.converted,
      renderData.spansPerWeek,
      scrollTop,
      0,
      w,
      h,
      hoveredCell as { dateKey: string; type: string } | null,
      expandedDates,
      expandedSlots,
    );
  }, [containerSize, renderConfig, viewType, renderData, scrollTop, hoveredCell, expandedDates, expandedSlots]);

  const doScheduleRender = useCallback(() => {
    if (renderFrameRef.current) return;
    renderFrameRef.current = requestAnimationFrame(() => {
      renderFrameRef.current = 0;
      performRenderRef.current();
    });
  }, []);

  // ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });
    observer.observe(el);
    setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  // Trigger render when state changes
  useEffect(() => {
    doScheduleRender();
  });

  // 60s timer for current time indicator
  useEffect(() => {
    if (viewType !== 'week' && viewType !== 'day') return;
    const timer = setInterval(() => doScheduleRender(), 60000);
    return () => clearInterval(timer);
  }, [viewType, doScheduleRender]);

  const getCanvasPoint = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      const pt = getCanvasPoint(e);
      const result = renderer.hitTest(pt.x, pt.y);
      if (result.type === 'card' || result.type === 'span') {
        setHoveredCell({ dateKey: result.dateKey || '', type: result.type });
      } else if (result.type === 'cell' || result.type === 'add-btn') {
        setHoveredCell({ dateKey: result.dateKey || '', type: 'cell' });
      } else if (result.type === 'more-btn') {
        setHoveredCell({ dateKey: result.dateKey || '', type: 'more-btn' });
      } else if (result.type === 'slot') {
        const slotKey = result.slotKey || '';
        const parts = slotKey.split('-');
        const dateKey = parts.slice(0, 3).join('-');
        setHoveredCell({ dateKey, type: 'slot', slotKey });
      } else {
        setHoveredCell(null);
      }
    },
    [getCanvasPoint],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredCell(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      const pt = getCanvasPoint(e);
      const result = renderer.hitTest(pt.x, pt.y);

      if (result.type === 'card' || result.type === 'span') {
        if (result.recordId) {
          const card = cardMapRef.current.get(result.recordId);
          if (card) onCardClick(card);
        }
      } else if (result.type === 'cell' || result.type === 'add-btn') {
        if (result.dateKey) {
          const d = dayjs(result.dateKey);
          if (d.isValid()) onCreateRecord(d);
        }
      } else if (result.type === 'more-btn') {
        if (result.dateKey) {
          onShowMore(dayjs(result.dateKey));
        }
      } else if (result.type === 'slot') {
        if (result.slotKey) {
          setExpandedSlots(prev => {
            const next = new Set(prev);
            if (next.has(result.slotKey!)) next.delete(result.slotKey!);
            else next.add(result.slotKey!);
            return next;
          });
        }
      }
    },
    [getCanvasPoint, onCardClick, onCreateRecord],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      if (viewType === 'month') return;
      e.preventDefault();
      const delta = e.deltaY;
      const totalContentH = 24 * PIXELS_PER_HOUR + 40 + 28;
      const maxScroll = Math.max(0, totalContentH - containerSize.height);
      setScrollTop(prev => Math.max(0, Math.min(maxScroll, prev + delta)));
    },
    [viewType, containerSize.height],
  );

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          cursor: 'pointer',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onWheel={handleWheel}
      />
    </div>
  );
};

export default CalendarCanvasView;