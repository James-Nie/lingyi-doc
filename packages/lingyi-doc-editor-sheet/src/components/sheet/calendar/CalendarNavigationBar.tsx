import React from 'react';
import { Button, Space, Typography } from 'antd';
import { BASE_THEME } from '@lingyi-doc/core-sheet';

interface CalendarNavigationBarProps {
  title: string;
  viewType: 'month' | 'week' | 'day';
  onViewTypeChange: (type: 'month' | 'week' | 'day') => void;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
}

export const CalendarNavigationBar: React.FC<CalendarNavigationBarProps> = ({
  title,
  viewType,
  onViewTypeChange,
  onNavigate,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 12px',
        background: '#fff',
        borderBottom: '1px solid #e5e6eb',
        flexShrink: 0,
      }}
    >
      <Space size={4} align="center">
        <Typography.Text strong style={{ fontSize: 14, color: BASE_THEME.headerTextColor }}>
          {title}
        </Typography.Text>
        <Button type="text" size="small" onClick={() => onNavigate('prev')} style={{ padding: '0 4px', minWidth: 24 }}>
          ‹
        </Button>
        <Button type="text" size="small" onClick={() => onNavigate('today')} style={{ padding: '0 8px' }}>
          今天
        </Button>
        <Button type="text" size="small" onClick={() => onNavigate('next')} style={{ padding: '0 4px', minWidth: 24 }}>
          ›
        </Button>
      </Space>

      <Space.Compact size="small">
        <Button
          style={{
            background: viewType === 'month' ? BASE_THEME.primaryColor : 'transparent',
            color: viewType === 'month' ? '#fff' : BASE_THEME.headerTextColor,
          }}
          onClick={() => onViewTypeChange('month')}
        >
          月
        </Button>
        <Button
          style={{
            background: viewType === 'week' ? BASE_THEME.primaryColor : 'transparent',
            color: viewType === 'week' ? '#fff' : BASE_THEME.headerTextColor,
          }}
          onClick={() => onViewTypeChange('week')}
        >
          周
        </Button>
        <Button
          style={{
            background: viewType === 'day' ? BASE_THEME.primaryColor : 'transparent',
            color: viewType === 'day' ? '#fff' : BASE_THEME.headerTextColor,
          }}
          onClick={() => onViewTypeChange('day')}
        >
          日
        </Button>
      </Space.Compact>
    </div>
  );
};

export default CalendarNavigationBar;
