import React, { useMemo } from 'react';
import type { Dayjs } from 'dayjs';
import {
  CalendarCardData,
  CALENDAR_COLORS,
  getCellRecords,
  formatDateKey,
} from './calendarUtils';

interface CalendarDayViewProps {
  currentDate: Dayjs;
  dateMap: Map<string, CalendarCardData[]>;
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
    padding: '16px',
    borderBottom: '1px solid #f0f1f2',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  dateNumber: {
    fontSize: 32,
    fontWeight: 700,
    color: '#1f2329',
  },
  dateDetails: {
    display: 'flex',
    flexDirection: 'column',
  },
  dateMonth: {
    fontSize: 14,
    color: '#646a73',
  },
  dateWeekday: {
    fontSize: 13,
    color: '#8f959e',
  },
  addButton: {
    padding: '6px 14px',
    background: '#3370ff',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
  },
  content: {
    flex: 1,
    padding: 16,
    overflow: 'auto',
  },
  recordsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  recordItem: {
    padding: 12,
    borderRadius: 6,
    border: '1px solid #f0f1f2',
    cursor: 'pointer',
    transition: 'box-shadow 0.15s ease',
  },
  recordItemHover: {
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  recordHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  recordTitle: {
    fontSize: 14,
    fontWeight: 500,
    color: '#1f2329',
  },
  recordTime: {
    fontSize: 12,
    color: '#8f959e',
    marginLeft: 'auto',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
    color: '#8f959e',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 14,
  },
};

export const CalendarDayView: React.FC<CalendarDayViewProps> = ({
  currentDate,
  dateMap,
  onCardClick,
  onCreateRecord,
}) => {
  const dateKey = formatDateKey(currentDate);
  const { records } = useMemo(() => getCellRecords(dateMap, currentDate, 999), [dateMap, currentDate]);

  const getWeekdayName = (date: Dayjs) => {
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return weekdays[date.day()];
  };

  const getTimeRange = (card: CalendarCardData) => {
    if (!card.startDate) return '';
    const startStr = card.startDate.format('HH:mm');
    if (card.endDate && !card.endDate.isSame(card.startDate, 'day')) {
      return startStr;
    }
    if (card.endDate && card.endDate.isSame(card.startDate, 'day')) {
      const endStr = card.endDate.format('HH:mm');
      return `${startStr} - ${endStr}`;
    }
    return startStr;
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.dateInfo}>
          <span style={styles.dateNumber}>{currentDate.date()}</span>
          <div style={styles.dateDetails}>
            <span style={styles.dateMonth}>{currentDate.format('YYYY年M月')}</span>
            <span style={styles.dateWeekday}>{getWeekdayName(currentDate)}</span>
          </div>
        </div>
        <button
          style={styles.addButton}
          onClick={() => onCreateRecord(currentDate)}
        >
          + 添加记录
        </button>
      </div>

      <div style={styles.content}>
        {records.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>📅</div>
            <div style={styles.emptyText}>今天没有安排的记录</div>
          </div>
        ) : (
          <div style={styles.recordsList}>
            {records.map((card, idx) => {
              const colors = CALENDAR_COLORS[card.color as keyof typeof CALENDAR_COLORS] || CALENDAR_COLORS.blue;
              return (
                <div
                  key={`${card.recordId}-${idx}`}
                  style={{
                    ...styles.recordItem,
                    borderLeft: `4px solid ${colors.border}`,
                    background: colors.bg,
                  }}
                  onClick={() => onCardClick(card)}
                >
                  <div style={styles.recordHeader}>
                    <div
                      style={{
                        ...styles.colorDot,
                        background: colors.border,
                      }}
                    />
                    <span style={{ ...styles.recordTitle, color: colors.text }}>
                      {card.title}
                    </span>
                    <span style={styles.recordTime}>{getTimeRange(card)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};