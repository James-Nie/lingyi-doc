import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Tooltip } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import {
  CalendarCardData,
  CALENDAR_COLORS,
  CalendarColorKey,
  formatDateKey,
  getMonthGridDates,
  getWeekDates,
  isAllDayEvent,
  getEventsByHour,
  isContinuationOnly,
  buildWeekSpanLayout,
  SpanLayout,
} from './calendarUtils';

const PIXELS_PER_HOUR = 48;
const HEADER_HEIGHT = 40;
const TIME_COL_WIDTH = 60;

interface CalendarGridProps {
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

const CARD_HEIGHT = 22;
const CARD_HEIGHT_COMPACT = 16;

const SpanBar: React.FC<{
  card: CalendarCardData;
  startCol: number;
  colSpan: number;
  onClick: (e: React.MouseEvent) => void;
  isContinuation: boolean;
}> = ({ card, startCol, colSpan, onClick, isContinuation }) => {
  const colors = CALENDAR_COLORS[card.color as CalendarColorKey] || CALENDAR_COLORS.blue;
  return (
    <Tooltip title={card.title} placement="top">
      <div
        style={{
          gridColumn: `${startCol + 1} / span ${colSpan}`,
          background: colors.bg,
          borderLeft: `3px solid ${colors.border}`,
          borderRadius: 3,
          fontSize: 12,
          lineHeight: `${CARD_HEIGHT - 4}px`,
          height: CARD_HEIGHT,
          padding: '0 6px',
          cursor: 'pointer',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginBottom: 1,
          boxSizing: 'border-box',
          zIndex: 5,
          opacity: isContinuation ? 0.85 : 1,
        }}
      >
        {card.title}
      </div>
    </Tooltip>
  );
};

const Card: React.FC<{
  card: CalendarCardData;
  onClick: (e: React.MouseEvent) => void;
  compact?: boolean;
  showTime?: boolean;
}> = ({ card, onClick, compact, showTime }) => {
  const colors = CALENDAR_COLORS[card.color as CalendarColorKey] || CALENDAR_COLORS.blue;
  const timeStr = showTime && card.startDate && !isAllDayEvent(card)
    ? card.startDate.format('HH:mm') + (card.endDate && !card.endDate.isSame(card.startDate, 'day') ? '' : card.endDate ? `-${card.endDate.format('HH:mm')}` : '')
    : null;
  const h = compact ? CARD_HEIGHT_COMPACT : CARD_HEIGHT;
  const ls = h - 4;

  const tooltipTitle = timeStr ? `${timeStr} ${card.title}` : card.title;
  return (
    <Tooltip title={tooltipTitle} placement="top">
      <div
        style={{
          padding: compact ? '0 4px' : '0 6px',
          borderRadius: 3,
          fontSize: compact ? 10 : 12,
          lineHeight: `${ls}px`,
          height: h,
          boxSizing: 'border-box',
          background: colors.bg,
          borderLeft: `3px solid ${colors.border}`,
          color: colors.text,
          cursor: 'pointer',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginBottom: 1,
        }}
        onClick={onClick}
      >
        {timeStr ? `${timeStr} ${card.title}` : card.title}
      </div>
    </Tooltip>
  );
};

interface DayHeader {
  name: string;
  date: Dayjs;
  isToday: boolean;
  key: string;
}

function getDayHeaders(dates: Dayjs[], today: string, weekStart: 0 | 1): DayHeader[] {
  const dayNames = weekStart === 0
    ? ['日', '一', '二', '三', '四', '五', '六']
    : ['一', '二', '三', '四', '五', '六', '日'];
  return dates.map((d, i) => ({
    name: dayNames[i],
    date: d,
    isToday: formatDateKey(d) === today,
    key: formatDateKey(d),
  }));
}

function getVisibleDates(allDates: Dayjs[], showWeekend: boolean): Dayjs[] {
  if (showWeekend) return allDates;
  return allDates.filter(d => {
    const day = d.day();
    return day !== 0 && day !== 6;
  });
}

function groupTimedEventsByDate(dateMap: Map<string, CalendarCardData[]>, dateKeys: string[]): Map<string, CalendarCardData[]> {
  const result = new Map<string, CalendarCardData[]>();
  for (const key of dateKeys) {
    const allCards = dateMap.get(key) || [];
    const timed = allCards.filter(c => c.startDate && !isAllDayEvent(c) && !isContinuationOnly(c));
    if (timed.length > 0) result.set(key, timed);
  }
  return result;
}

function groupAllDayEventsByDate(dateMap: Map<string, CalendarCardData[]>, dateKeys: string[]): Map<string, CalendarCardData[]> {
  const result = new Map<string, CalendarCardData[]>();
  for (const key of dateKeys) {
    const allCards = dateMap.get(key) || [];
    const allDay = allCards.filter(c => {
      if (!c.startDate) return true;
      if (!isAllDayEvent(c)) return false;
      if (c.isContinuation) return false;
      if (c.spanDays > 1) return false;
      return true;
    });
    if (allDay.length > 0) result.set(key, allDay);
  }
  return result;
}

const DAY_NUMBER_ROW_HEIGHT = 28;

const MonthGrid: React.FC<CalendarGridProps> = ({
  currentDate, dateMap, maxCards, showWeekend, weekStart, onCardClick, onCreateRecord, onShowMore,
}) => {
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const today = dayjs().format('YYYY-MM-DD');

  const allDates = useMemo(() => getMonthGridDates(currentDate, weekStart), [currentDate, weekStart]);
  const visibleDates = useMemo(() => getVisibleDates(allDates, showWeekend), [allDates, showWeekend]);
  const dayHeaders = useMemo(() => getDayHeaders(visibleDates.slice(0, showWeekend ? 7 : 5), today, weekStart), [visibleDates, today, showWeekend, weekStart]);
  const colCount = showWeekend ? 7 : 5;

  const weeks: Dayjs[][] = useMemo(() => {
    const result: Dayjs[][] = [];
    for (let i = 0; i < visibleDates.length; i += colCount) {
      result.push(visibleDates.slice(i, i + colCount));
    }
    return result;
  }, [visibleDates, colCount]);

  const toggleExpand = useCallback((key: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const allWeekSpans = useMemo(
    () => weeks.map(week => buildWeekSpanLayout(week, dateMap)),
    [weeks, dateMap],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: '#fff' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${colCount}, 1fr)`,
        borderBottom: '1px solid #e5e6eb',
        background: '#fafbfc',
      }}>
        {dayHeaders.map(h => (
          <div key={h.key} style={{
            padding: '8px 12px',
            textAlign: 'center',
            fontSize: 13,
            color: h.isToday ? '#3370ff' : '#646a73',
            fontWeight: h.isToday ? 600 : 500,
            borderRight: '1px solid #f0f1f2',
          }}>
            {`周${h.name}`}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {weeks.map((week, wi) => {
          const weekSpans = allWeekSpans[wi];

          return (
            <div key={wi} style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${colCount}, 1fr)`,
              gridTemplateRows: `${DAY_NUMBER_ROW_HEIGHT}px 1fr`,
              flex: 1,
              minHeight: 100,
            }}>
              {week.map((date) => {
                const dateKey = formatDateKey(date);
                const isCurrentMonth = date.month() === currentDate.month();
                const isToday = dateKey === today;
                return (
                  <div key={`dn-${dateKey}`} style={{
                    gridRow: 1,
                    gridColumn: week.indexOf(date) + 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRight: '1px solid #f0f1f2',
                    borderBottom: '1px solid #e5e6eb',
                    background: isToday ? '#f0f5ff' : (isCurrentMonth ? '#fff' : '#fafbfc'),
                  }}>
                    <span style={{
                      fontSize: 12,
                      fontWeight: isToday ? 700 : 400,
                      width: 24,
                      height: 24,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50%',
                      background: isToday ? '#3370ff' : 'transparent',
                      color: isToday ? '#fff' : (isCurrentMonth ? '#1f2329' : '#c0c4cc'),
                    }}>
                      {date.date()}
                    </span>
                  </div>
                );
              })}

              <div style={{
                gridRow: 2,
                gridColumn: `1 / ${colCount + 1}`,
                display: 'grid',
                gridTemplateColumns: `repeat(${colCount}, 1fr)`,
                position: 'relative',
              }}>
                {week.map((date) => {
                  const dateKey = formatDateKey(date);
                  const isCurrentMonth = date.month() === currentDate.month();
                  const isToday = dateKey === today;
                  const allCards = dateMap.get(dateKey) || [];
                  const startCards = allCards.filter(c => c.spanDays <= 1);
                  const effectiveMax = expandedDates.has(dateKey) ? 999 : maxCards;
                  const visibleStartCards = startCards.slice(0, effectiveMax);
                  const hasMore = startCards.length > effectiveMax;

                  return (
                    <div
                      key={`ct-${dateKey}`}
                      onClick={() => onCreateRecord(date)}
                      onMouseEnter={() => setHoveredDate(dateKey)}
                      onMouseLeave={() => setHoveredDate(null)}
                      style={{
                        position: 'relative',
                        borderRight: '1px solid #f0f1f2',
                        borderBottom: '1px solid #f0f1f2',
                        padding: '2px 4px',
                        cursor: 'pointer',
                        background: isToday ? '#f0f5ff' : (isCurrentMonth ? '#fff' : '#fafbfc'),
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                      }}
                    >
                      {hoveredDate === dateKey && (
                        <Tooltip title="添加记录" placement="top">
                          <div
                            onClick={(e) => { e.stopPropagation(); onCreateRecord(date); }}
                            style={{
                              position: 'absolute',
                              top: 2,
                              right: 2,
                              width: 20,
                              height: 20,
                              borderRadius: 4,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: '#3370ff',
                              color: '#fff',
                              fontSize: 14,
                              fontWeight: 700,
                              cursor: 'pointer',
                              zIndex: 10,
                              lineHeight: '20px',
                            }}
                          >
                            +
                          </div>
                        </Tooltip>
                      )}
                      {visibleStartCards.map((card, idx) => (
                        <Card
                          key={`${card.recordId}-${idx}`}
                          card={card}
                          onClick={(e) => { e.stopPropagation(); onCardClick(card); }}
                          showTime
                        />
                      ))}
                      {hasMore && (
                        <div
                          onClick={(e) => { e.stopPropagation(); toggleExpand(dateKey); }}
                          style={{
                            fontSize: 11,
                            color: '#8f959e',
                            padding: '1px 6px',
                            cursor: 'pointer',
                            lineHeight: '16px',
                            flexShrink: 0,
                          }}
                        >
                          {expandedDates.has(dateKey) ? '收起' : `+${startCards.length - maxCards} 更多`}
                        </div>
                      )}
                    </div>
                  );
                })}

                {weekSpans.map((span, idx) => {
                  const spanCard = span.card;
                  return (
                    <SpanBar
                      key={`span-${spanCard.recordId}-${idx}`}
                      card={spanCard}
                      startCol={span.startCol}
                      colSpan={span.colSpan}
                      isContinuation={span.isContinuation}
                      onClick={(e) => { e.stopPropagation(); onCardClick(spanCard); }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SLOT_MAX_CARDS = 10;

const WeekDayGrid: React.FC<CalendarGridProps> = ({
  viewType, currentDate, dateMap, showWeekend, weekStart, onCardClick, onCreateRecord,
}) => {
  const today = dayjs().format('YYYY-MM-DD');
  const [now, setNow] = useState(dayjs());
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set());

  useEffect(() => {
    const timer = setInterval(() => setNow(dayjs()), 60000);
    return () => clearInterval(timer);
  }, []);

  const allWeekDates = useMemo(
    () => getWeekDates(currentDate, weekStart),
    [currentDate, weekStart],
  );
  const visibleDates = useMemo(
    () => viewType === 'day' ? [currentDate] : getVisibleDates(allWeekDates, showWeekend),
    [viewType, currentDate, allWeekDates, showWeekend],
  );
  const dayHeaders = useMemo(
    () => getDayHeaders(visibleDates, today, weekStart),
    [visibleDates, today, weekStart],
  );
  const dayCount = visibleDates.length;
  const colCount = dayCount;
  const timeCol = TIME_COL_WIDTH;

  const dateKeysStr = visibleDates.map(d => formatDateKey(d)).join(',');
  const dateKeys = useMemo(() => dateKeysStr ? dateKeysStr.split(',') : [], [dateKeysStr]);
  const allDayMap = useMemo(() => groupAllDayEventsByDate(dateMap, dateKeys), [dateMap, dateKeys]);
  const timedMap = useMemo(() => groupTimedEventsByDate(dateMap, dateKeys), [dateMap, dateKeys]);

  const allDaySpans = useMemo(() => {
    const allDayDateMap = new Map(dateMap);
    for (const [key, cards] of allDayDateMap) {
      allDayDateMap.set(key, cards.filter(c => {
        if (c.spanDays <= 1) return false;
        if (!c.startDate) return false;
        return isAllDayEvent(c);
      }));
    }
    return buildWeekSpanLayout(visibleDates, allDayDateMap);
  }, [dateMap, visibleDates]);

  const toggleSlot = useCallback((slotKey: string) => {
    setExpandedSlots(prev => {
      const next = new Set(prev);
      if (next.has(slotKey)) next.delete(slotKey);
      else next.add(slotKey);
      return next;
    });
  }, []);

  const hours = Array.from({ length: 24 }, (_, i) => i);

  const nowHour = now.hour();
  const nowMin = now.minute();
  const nowRow = 3 + nowHour;
  const nowOffset = (nowMin / 60) * PIXELS_PER_HOUR;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `${timeCol}px repeat(${colCount}, 1fr)`,
      gridTemplateRows: `${HEADER_HEIGHT}px auto repeat(24, ${PIXELS_PER_HOUR}px)`,
      flex: 1,
      background: '#fff',
      position: 'relative',
    }}>
      {/* Time axis header */}
      <div style={{
        gridColumn: 1, gridRow: 1,
        borderBottom: '1px solid #e5e6eb',
        background: '#fafbfc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        color: '#8f959e',
      }}>
        时间
      </div>

      {/* Day headers */}
      {dayHeaders.map((h, i) => (
        <div
          key={h.key}
          style={{
            gridColumn: i + 2, gridRow: 1,
            borderBottom: '1px solid #e5e6eb',
            borderLeft: '1px solid #f0f1f2',
            background: h.isToday ? '#f0f5ff' : '#fafbfc',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px 0',
          }}
        >
          <span style={{ fontSize: 11, color: '#8f959e', lineHeight: '14px' }}>
            {h.date.format('M/D')}
          </span>
          <span style={{
            fontSize: 13,
            fontWeight: h.isToday ? 700 : 500,
            color: h.isToday ? '#3370ff' : '#646a73',
            lineHeight: '16px',
          }}>
            {h.isToday ? '今天' : `周${h.name}`}
          </span>
        </div>
      ))}

      {/* All-day row */}
      <div style={{
        gridColumn: 1, gridRow: 2,
        borderBottom: '2px solid #e5e6eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        color: '#8f959e',
        background: '#fafbfc',
      }}>
        全天
      </div>

      <div style={{
        gridColumn: `2 / ${colCount + 2}`, gridRow: 2,
        display: 'grid',
        gridTemplateColumns: `repeat(${colCount}, 1fr)`,
        position: 'relative',
        borderBottom: '2px solid #e5e6eb',
      }}>
        {dayHeaders.map((h, i) => {
          const dayCards = allDayMap.get(h.key) || [];
          const slotKey = `allday-${h.key}`;
          const isExpanded = expandedSlots.has(slotKey);
          const maxVisible = isExpanded ? 999 : SLOT_MAX_CARDS;
          const visibleCards = dayCards.slice(0, maxVisible);
          const hasMore = dayCards.length > SLOT_MAX_CARDS;
          return (
            <div
              key={h.key}
              onMouseEnter={() => setHoveredSlot(slotKey)}
              onMouseLeave={() => setHoveredSlot(null)}
              style={{
                position: 'relative',
                borderLeft: '1px solid #f0f1f2',
                padding: '2px 4px',
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                background: '#fffbe6',
                minHeight: 28,
              }}
            >
              {hoveredSlot === slotKey && (
                <Tooltip title="添加记录" placement="top">
                  <div
                    onClick={(e) => { e.stopPropagation(); onCreateRecord(h.date); }}
                    style={{
                      position: 'absolute', top: 2, right: 2,
                      width: 20, height: 20, borderRadius: 4,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: '#3370ff', color: '#fff', fontSize: 14,
                      fontWeight: 700, cursor: 'pointer', zIndex: 10, lineHeight: '20px',
                    }}
                  >
                    +
                  </div>
                </Tooltip>
              )}
              {visibleCards.map((card, idx) => (
                <Card
                  key={`${card.recordId}-${idx}`}
                  card={card}
                  onClick={(e) => { e.stopPropagation(); onCardClick(card); }}
                  compact
                />
              ))}
              {hasMore && (
                <div
                  onClick={(e) => { e.stopPropagation(); toggleSlot(slotKey); }}
                  style={{
                    fontSize: 11, color: '#8f959e', padding: '1px 6px',
                    cursor: 'pointer', lineHeight: '16px',
                  }}
                >
                  {isExpanded ? '收起' : `+${dayCards.length - SLOT_MAX_CARDS} 更多`}
                </div>
              )}
              {dayCards.length === 0 && (
                <div style={{ width: '100%', height: 24 }} />
              )}
            </div>
          );
        })}

        {allDaySpans.map((span, idx) => {
          const spanCard = span.card;
          return (
            <SpanBar
              key={`allday-span-${spanCard.recordId}-${idx}`}
              card={spanCard}
              startCol={span.startCol}
              colSpan={span.colSpan}
              isContinuation={span.isContinuation}
              onClick={(e) => { e.stopPropagation(); onCardClick(spanCard); }}
            />
          );
        })}
      </div>

      {/* Hour rows */}
      {hours.map(hour => (
        <React.Fragment key={hour}>
          {/* Time label */}
          <div style={{
            gridColumn: 1, gridRow: hour + 3,
            borderTop: '1px solid #f0f1f2',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: 2,
            fontSize: 10,
            color: '#8f959e',
            background: '#fafbfc',
          }}>
            {hour === 0 ? '' : `${String(hour).padStart(2, '0')}:00`}
          </div>

          {/* Day columns for this hour */}
          {dayHeaders.map((h, i) => {
            const hourCards = timedMap.get(h.key)
              ? getEventsByHour(timedMap.get(h.key)!, hour)
              : [];
            const slotKey = `${h.key}-${hour}`;
            const isExpanded = expandedSlots.has(slotKey);
            const maxVisible = isExpanded ? 999 : SLOT_MAX_CARDS;
            const visibleCards = hourCards.slice(0, maxVisible);
            const hasMore = hourCards.length > SLOT_MAX_CARDS;
            return (
              <div
                key={slotKey}
                onClick={() => onCreateRecord(h.date.hour(hour).startOf('hour'))}
                onMouseEnter={() => setHoveredSlot(slotKey)}
                onMouseLeave={() => setHoveredSlot(null)}
                style={{
                  position: 'relative',
                  gridColumn: i + 2, gridRow: hour + 3,
                  borderTop: '1px solid #f0f1f2',
                  borderLeft: '1px solid #f0f1f2',
                  padding: '1px 2px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5px',
                }}
              >
                {hoveredSlot === slotKey && (
                  <Tooltip title="添加记录" placement="top">
                    <div
                      onClick={(e) => { e.stopPropagation(); onCreateRecord(h.date.hour(hour).startOf('hour')); }}
                      style={{
                        position: 'absolute', top: 1, right: 1,
                        width: 18, height: 18, borderRadius: 3,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: '#3370ff', color: '#fff', fontSize: 12,
                        fontWeight: 700, cursor: 'pointer', zIndex: 10, lineHeight: '18px',
                      }}
                    >
                      +
                    </div>
                  </Tooltip>
                )}
                {visibleCards.map((card, idx) => {
                  let spanRows = 1;
                  if (card.endDate && card.endDate.isSame(card.startDate, 'day')) {
                    const durHours = card.endDate.diff(card.startDate, 'hour', true);
                    spanRows = Math.max(Math.ceil(durHours), 1);
                  }
                  return (
                    <div
                      key={`${card.recordId}-${idx}`}
                      style={{
                        gridRow: `auto / span ${spanRows}`,
                      }}
                    >
                      <Card
                        card={card}
                        onClick={(e) => { e.stopPropagation(); onCardClick(card); }}
                        compact
                      />
                    </div>
                  );
                })}
                {hasMore && (
                  <div
                    onClick={(e) => { e.stopPropagation(); toggleSlot(slotKey); }}
                    style={{
                      fontSize: 10, color: '#8f959e', padding: '0 4px',
                      cursor: 'pointer', lineHeight: '14px',
                    }}
                  >
                    {isExpanded ? '收起' : `+${hourCards.length - SLOT_MAX_CARDS} 更多`}
                  </div>
                )}
              </div>
            );
          })}
        </React.Fragment>
      ))}

      {/* Current time indicator */}
      {nowHour >= 0 && nowHour < 24 && (
        <div style={{
          gridColumn: `1 / ${colCount + 2}`,
          gridRow: `${nowRow} / ${nowRow + 1}`,
          borderTop: '2px solid #ea4335',
          position: 'relative',
          zIndex: 20,
          pointerEvents: 'none',
          marginTop: nowOffset,
        }}>
          <div style={{
            position: 'absolute',
            left: -4,
            top: -5,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#ea4335',
          }} />
        </div>
      )}
    </div>
  );
};

export const CalendarGrid: React.FC<CalendarGridProps> = (props) => {
  if (!props.viewType || props.viewType === 'month') {
    return <MonthGrid {...props} />;
  }
  return <WeekDayGrid {...props} maxCards={SLOT_MAX_CARDS} />;
};

export default CalendarGrid;
