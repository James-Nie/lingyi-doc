import React, { useMemo } from 'react';
import { Tooltip } from 'antd';
import type { Dayjs } from 'dayjs';
import {
  CalendarCardData,
  CALENDAR_COLORS,
  getWeekDates,
  getCellRecords,
  formatDateKey,
} from './calendarUtils';

interface CalendarWeekViewProps {
  currentDate: Dayjs;
  dateMap: Map<string, CalendarCardData[]>;
  maxCards: number;
  onCardClick: (card: CalendarCardData) => void;
  onCreateRecord: (date: Dayjs) => void;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#fff',
  },
  header: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    borderBottom: '1px solid #f0f1f2',
    background: '#fafbfc',
  },
  headerCell: {
    padding: '8px 12px',
    textAlign: 'center' as const,
    fontSize: 13,
    color: '#646a73',
    fontWeight: 500,
    borderRight: '1px solid #f0f1f2',
  },
  headerCellToday: {
    padding: '8px 12px',
    textAlign: 'center' as const,
    fontSize: 13,
    color: '#3370ff',
    fontWeight: 600,
    borderRight: '1px solid #f0f1f2',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    flex: 1,
  },
  cell: {
    borderRight: '1px solid #f0f1f2',
    borderBottom: '1px solid #f0f1f2',
    padding: 4,
    minHeight: 120,
    cursor: 'pointer',
  },
  cellToday: {
    borderRight: '1px solid #f0f1f2',
    borderBottom: '1px solid #3370ff',
    padding: 4,
    minHeight: 120,
    cursor: 'pointer',
    background: '#f0f5ff',
  },
  cellHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '2px 4px 4px',
  },
  dateText: {
    fontSize: 12,
    color: '#8f959e',
  },
  addButton: {
    width: 18,
    height: 18,
    border: 'none',
    background: 'transparent',
    borderRadius: 3,
    cursor: 'pointer',
    color: '#8f959e',
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '0 2px',
  },
  card: {
    padding: '2px 6px',
    borderRadius: 3,
    fontSize: 11,
    lineHeight: '16px',
    cursor: 'pointer',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  moreText: {
    padding: '2px 6px',
    fontSize: 11,
    color: '#8f959e',
    cursor: 'pointer',
  },
};

export const CalendarWeekView: React.FC<CalendarWeekViewProps> = ({
  currentDate,
  dateMap,
  maxCards,
  onCardClick,
  onCreateRecord,
}) => {
  const weekDates = useMemo(() => getWeekDates(currentDate), [currentDate]);
  const today = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  const weekDayNames = ['一', '二', '三', '四', '五', '六', '日'];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        {weekDates.map((date, index) => {
          const dateStr = formatDateKey(date);
          const isToday = dateStr === today;
          return (
            <div key={index} style={isToday ? styles.headerCellToday : styles.headerCell}>
              周{weekDayNames[index]} {date.date()}
            </div>
          );
        })}
      </div>

      <div style={styles.grid}>
        {weekDates.map((date, index) => {
          const { records, showMore, totalCount } = getCellRecords(dateMap, date, maxCards);
          const dateStr = formatDateKey(date);
          const isToday = dateStr === today;

          return (
            <div
              key={index}
              style={isToday ? styles.cellToday : styles.cell}
              onClick={() => onCreateRecord(date)}
            >
              <div style={styles.cellHeader}>
                <span style={styles.dateText}>{date.format('M月D日')}</span>
                <Tooltip title="添加记录" placement="top">
                  <button
                    style={styles.addButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateRecord(date);
                    }}
                  >
                    +
                  </button>
                </Tooltip>
              </div>

              <div style={styles.cardsContainer}>
                {records.map((card, idx) => {
                  const colors = CALENDAR_COLORS[card.color as keyof typeof CALENDAR_COLORS] || CALENDAR_COLORS.blue;
                  return (
                    <div
                      key={`${card.recordId}-${idx}`}
                      style={{
                        ...styles.card,
                        background: colors.bg,
                        borderLeft: `3px solid ${colors.border}`,
                        color: colors.text,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCardClick(card);
                      }}
                    >
                      {card.title}
                    </div>
                  );
                })}
                {showMore && (
                  <div
                    style={styles.moreText}
                    onClick={(e) => e.stopPropagation()}
                  >
                    +{totalCount - maxCards} 更多
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};