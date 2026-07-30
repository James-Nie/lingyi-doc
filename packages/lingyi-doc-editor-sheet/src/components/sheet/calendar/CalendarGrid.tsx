import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import {
  CalendarCardData,
  CALENDAR_COLORS,
  CalendarColorKey,
  formatDateKey,
  getMonthGridDates,
  getWeekDates,
  getCellRecords,
  isAllDayEvent,
  getEventsByHour,
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

  return (
    <div
      style={{
        padding: compact ? '1px 4px' : '2px 6px',
        borderRadius: 3,
        fontSize: compact ? 10 : 12,
        lineHeight: compact ? '14px' : '18px',
        background: colors.bg,
        borderLeft: `3px solid ${colors.border}`,
        color: colors.text,
        cursor: 'pointer',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        marginBottom: 1,
        transition: 'opacity 0.15s',
      }}
      onClick={onClick}
      title={timeStr ? `${timeStr} ${card.title}` : card.title}
    >
      {timeStr ? `${timeStr} ${card.title}` : card.title}
    </div>
  );
};

function getDayHeaders(dates: Dayjs[], today: string, weekStart: 0 | 1): { name: string; date: Dayjs; isToday: boolean; key: string }[] {
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
    const timed = allCards.filter(c => c.startDate && !isAllDayEvent(c));
    if (timed.length > 0) result.set(key, timed);
  }
  return result;
}

function groupAllDayEventsByDate(dateMap: Map<string, CalendarCardData[]>, dateKeys: string[]): Map<string, CalendarCardData[]> {
  const result = new Map<string, CalendarCardData[]>();
  for (const key of dateKeys) {
    const allCards = dateMap.get(key) || [];
    const allDay = allCards.filter(c => !c.startDate || isAllDayEvent(c));
    if (allDay.length > 0) result.set(key, allDay);
  }
  return result;
}

const MonthGrid: React.FC<CalendarGridProps> = ({
  currentDate, dateMap, maxCards, showWeekend, weekStart, onCardClick, onCreateRecord, onShowMore,
}) => {
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
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
            {h.date.format('ddd') === '周日' || h.date.format('ddd') === '周六'
              ? `周${h.name}`
              : `周${h.name}`
            }
          </div>
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${colCount}, 1fr)`,
            flex: 1,
            minHeight: 100,
          }}>
            {week.map((date) => {
              const dateKey = formatDateKey(date);
              const isCurrentMonth = date.month() === currentDate.month();
              const isToday = dateKey === today;
              const effectiveMax = expandedDates.has(dateKey) ? 999 : maxCards;
              const { records: cellRecords, showMore, totalCount } = getCellRecords(dateMap, date, effectiveMax);

              return (
                <div
                  key={dateKey}
                  onClick={() => onCreateRecord(date)}
                  style={{
                    borderRight: '1px solid #f0f1f2',
                    borderBottom: '1px solid #f0f1f2',
                    padding: 4,
                    cursor: 'pointer',
                    background: isToday ? '#f0f5ff' : isCurrentMonth ? '#fff' : '#fafbfc',
                    minHeight: 80,
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '1px 2px',
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

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '0 2px' }}>
                    {cellRecords.map((card, idx) => (
                      <Card
                        key={`${card.recordId}-${idx}`}
                        card={card}
                        onClick={(e) => { e.stopPropagation(); onCardClick(card); }}
                        showTime
                      />
                    ))}
                    {showMore && (
                      <div
                        onClick={(e) => { e.stopPropagation(); toggleExpand(dateKey); }}
                        style={{
                          fontSize: 11,
                          color: '#8f959e',
                          padding: '1px 6px',
                          cursor: 'pointer',
                          lineHeight: '16px',
                        }}
                      >
                        {expandedDates.has(dateKey) ? '收起' : `+${totalCount - maxCards} 更多`}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

const WeekDayGrid: React.FC<CalendarGridProps> = ({
  viewType, currentDate, dateMap, showWeekend, weekStart, onCardClick, onCreateRecord,
}) => {
  const today = dayjs().format('YYYY-MM-DD');
  const [now, setNow] = useState(dayjs());

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

  const dateKeys = visibleDates.map(d => formatDateKey(d));
  const allDayMap = useMemo(() => groupAllDayEventsByDate(dateMap, dateKeys), [dateMap, ...dateKeys]);
  const timedMap = useMemo(() => groupTimedEventsByDate(dateMap, dateKeys), [dateMap, ...dateKeys]);

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

      {dayHeaders.map((h, i) => {
        const dayCards = allDayMap.get(h.key) || [];
        return (
          <div
            key={h.key}
            style={{
              gridColumn: i + 2, gridRow: 2,
              borderBottom: '2px solid #e5e6eb',
              borderLeft: '1px solid #f0f1f2',
              padding: '2px 4px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 1,
              alignContent: 'flex-start',
              background: '#fffbe6',
            }}
          >
            {dayCards.map((card, idx) => (
              <Card
                key={`${card.recordId}-${idx}`}
                card={card}
                onClick={(e) => { e.stopPropagation(); onCardClick(card); }}
                compact
              />
            ))}
            {dayCards.length === 0 && (
              <div
                onClick={() => onCreateRecord(h.date)}
                style={{
                  width: '100%', height: 28, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#c0c4cc', fontSize: 20,
                }}
                title="添加记录"
              >
                +
              </div>
            )}
          </div>
        );
      })}

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
            return (
              <div
                key={`${h.key}-${hour}`}
                onClick={() => onCreateRecord(h.date.hour(hour).startOf('hour'))}
                style={{
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
                {hourCards.map((card, idx) => {
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
  return <WeekDayGrid {...props} />;
};

export default CalendarGrid;
