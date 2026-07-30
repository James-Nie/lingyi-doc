import React from 'react';
import { Empty } from 'antd';
import { CalendarCardData, CALENDAR_COLORS } from './calendarUtils';

interface CalendarNoDateSectionProps {
  records: CalendarCardData[];
  onCardClick: (card: CalendarCardData) => void;
}

const styles: Record<string, React.CSSProperties> = {
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '4px 0',
  },
  card: {
    padding: '10px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    transition: 'box-shadow 0.15s',
  },
  cardTitle: {
    fontSize: 13,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 0',
  },
};

export const CalendarNoDateSection: React.FC<CalendarNoDateSectionProps> = ({
  records,
  onCardClick,
}) => {
  if (records.length === 0) {
    return (
      <div style={styles.empty}>
        <Empty description="暂无无日期记录" />
      </div>
    );
  }

  return (
    <div style={styles.list}>
      {records.map((card, idx) => {
        const colors = CALENDAR_COLORS[card.color as keyof typeof CALENDAR_COLORS] || CALENDAR_COLORS.blue;
        return (
          <div
            key={`${card.recordId}-${idx}`}
            style={{
              ...styles.card,
              background: colors.bg,
              borderLeft: `3px solid ${colors.border}`,
            }}
            onClick={() => onCardClick(card)}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
            }}
          >
            <span style={{ ...styles.cardTitle, color: colors.text }}>
              {card.title}
            </span>
          </div>
        );
      })}
    </div>
  );
};