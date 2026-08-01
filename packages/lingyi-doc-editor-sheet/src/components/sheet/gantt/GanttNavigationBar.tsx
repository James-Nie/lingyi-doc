import React from 'react';
import { Button, Space, Typography } from 'antd';
import { BASE_THEME, type GanttHeaderViewType } from '@lingyi-doc/core-sheet';
import type { GanttViewType } from './ganttUtils';

interface GanttNavigationBarProps {
  title: string;
  viewType: GanttViewType;
  onViewTypeChange: (type: GanttViewType) => void;
  headerViewType: GanttHeaderViewType;
  onHeaderViewTypeChange: (type: GanttHeaderViewType) => void;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
}

export const GanttNavigationBar: React.FC<GanttNavigationBarProps> = ({
  title,
  viewType,
  onViewTypeChange,
  headerViewType,
  onHeaderViewTypeChange,
  onNavigate,
}) => {
  const headerButtonStyle = (type: GanttHeaderViewType): React.CSSProperties => ({
    background: headerViewType === type ? BASE_THEME.primaryColor : 'transparent',
    color: headerViewType === type ? '#fff' : BASE_THEME.headerTextColor,
  });

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
        <Button type="text" size="small" onClick={() => onNavigate('prev')} style={{ padding: '0 4px', minWidth: 24 }}>
          «
        </Button>
        <Typography.Text strong style={{ fontSize: 14, color: BASE_THEME.headerTextColor }}>
          {title}
        </Typography.Text>
        <Button type="text" size="small" onClick={() => onNavigate('next')} style={{ padding: '0 4px', minWidth: 24 }}>
          »
        </Button>
      </Space>

      <Space size={12} align="center">
        <Space.Compact size="small">
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
              background: viewType === 'month' ? BASE_THEME.primaryColor : 'transparent',
              color: viewType === 'month' ? '#fff' : BASE_THEME.headerTextColor,
            }}
            onClick={() => onViewTypeChange('month')}
          >
            月
          </Button>
          <Button
            style={{
              background: viewType === 'quarter' ? BASE_THEME.primaryColor : 'transparent',
              color: viewType === 'quarter' ? '#fff' : BASE_THEME.headerTextColor,
            }}
            onClick={() => onViewTypeChange('quarter')}
          >
            季
          </Button>
        </Space.Compact>
      </Space>
    </div>
  );
};

export default GanttNavigationBar;
