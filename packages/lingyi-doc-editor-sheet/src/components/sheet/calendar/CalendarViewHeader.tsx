import React from 'react';
import { Badge } from 'antd';

interface CalendarViewHeaderProps {
  title: string;
  viewType: 'month' | 'week' | 'day';
  onViewTypeChange: (type: 'month' | 'week' | 'day') => void;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onConfigClick: () => void;
  noDateCount: number;
  onOpenNoDate: () => void;
}

const styles = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: '#fff',
    borderBottom: '1px solid #f0f1f2',
  } as React.CSSProperties,
  leftSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  } as React.CSSProperties,
  title: {
    fontSize: 16,
    fontWeight: 600,
    color: '#1f2329',
  } as React.CSSProperties,
  navButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  } as React.CSSProperties,
  navButton: {
    width: 28,
    height: 28,
    border: 'none',
    background: 'transparent',
    borderRadius: 4,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#646a73',
    fontSize: 14,
  } as React.CSSProperties,
  todayButton: {
    height: 28,
    padding: '0 12px',
    border: '1px solid #e4e6eb',
    background: '#fff',
    borderRadius: 4,
    cursor: 'pointer',
    color: '#1f2329',
    fontSize: 13,
  } as React.CSSProperties,
  rightSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  } as React.CSSProperties,
  viewSwitcher: {
    display: 'flex',
    background: '#f2f3f5',
    borderRadius: 6,
    padding: 2,
  } as React.CSSProperties,
  viewButton: {
    padding: '4px 12px',
    border: 'none',
    background: 'transparent',
    borderRadius: 4,
    cursor: 'pointer',
    color: '#646a73',
    fontSize: 13,
  } as React.CSSProperties,
  viewButtonActive: {
    padding: '4px 12px',
    border: 'none',
    background: '#fff',
    borderRadius: 4,
    cursor: 'pointer',
    color: '#1f2329',
    fontSize: 13,
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  } as React.CSSProperties,
  actionButton: {
    height: 28,
    padding: '0 10px',
    border: '1px solid #e4e6eb',
    background: '#fff',
    borderRadius: 4,
    cursor: 'pointer',
    color: '#646a73',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  } as React.CSSProperties,
  noDateButton: {
    height: 28,
    padding: '0 10px',
    border: '1px solid #e4e6eb',
    background: '#fff',
    borderRadius: 4,
    cursor: 'pointer',
    color: '#646a73',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    position: 'relative' as const,
  },
};

export const CalendarViewHeader: React.FC<CalendarViewHeaderProps> = ({
  title,
  viewType,
  onViewTypeChange,
  onNavigate,
  onConfigClick,
  noDateCount,
  onOpenNoDate,
}) => {
  return (
    <div style={styles.header}>
      <div style={styles.leftSection}>
        <span style={styles.title}>{title}</span>
        <div style={styles.navButtons}>
          <button style={styles.navButton} onClick={() => onNavigate('prev')}>
            ←
          </button>
          <button style={styles.todayButton} onClick={() => onNavigate('today')}>
            今天
          </button>
          <button style={styles.navButton} onClick={() => onNavigate('next')}>
            →
          </button>
        </div>
      </div>

      <div style={styles.rightSection}>
        <Badge count={noDateCount} offset={[-2, 2]}>
          <button
            style={styles.noDateButton}
            onClick={onOpenNoDate}
            title="无日期的记录"
          >
            <span>📋</span>
            <span>无日期</span>
          </button>
        </Badge>

        <button style={styles.actionButton} onClick={onConfigClick}>
          <span>⚙️</span>
          <span>日历配置</span>
        </button>

        <div style={styles.viewSwitcher}>
          <button
            style={viewType === 'month' ? styles.viewButtonActive : styles.viewButton}
            onClick={() => onViewTypeChange('month')}
          >
            月
          </button>
          <button
            style={viewType === 'week' ? styles.viewButtonActive : styles.viewButton}
            onClick={() => onViewTypeChange('week')}
          >
            周
          </button>
          <button
            style={viewType === 'day' ? styles.viewButtonActive : styles.viewButton}
            onClick={() => onViewTypeChange('day')}
          >
            日
          </button>
        </div>
      </div>
    </div>
  );
};