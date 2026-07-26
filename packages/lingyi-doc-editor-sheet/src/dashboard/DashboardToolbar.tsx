import React from 'react';
import { Button, Space, Tooltip } from 'antd';
import {
  PlusOutlined,
  FilterOutlined,
  BgColorsOutlined,
  InfoCircleOutlined,
  RobotOutlined,
  ClockCircleOutlined,
  ExpandOutlined,
  ShareAltOutlined,
  MoreOutlined,
} from '@ant-design/icons';

interface DashboardToolbarProps {
  readOnly?: boolean;
  onAddChart: () => void;
  statsHint?: string;
}

export const DashboardToolbar: React.FC<DashboardToolbarProps> = ({
  readOnly,
  onAddChart,
  statsHint = '基于全部数据统计',
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 16px',
      borderBottom: '1px solid #f0f0f0',
      background: '#fff',
      flexShrink: 0,
    }}
  >
    <Space size={8}>
      {!readOnly && (
        <Button type="primary" icon={<PlusOutlined />} onClick={onAddChart}>
          添加图表
        </Button>
      )}
      <Button icon={<FilterOutlined />} disabled>
        筛选
      </Button>
      <Button icon={<BgColorsOutlined />} disabled>
        外观
      </Button>
      <span style={{ color: '#8c8c8c', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <InfoCircleOutlined />
        {statsHint}
      </span>
    </Space>
    <Space size={8}>
      <Tooltip title="后续版本提供">
        <Button icon={<RobotOutlined />} disabled>AI 解读</Button>
      </Tooltip>
      <Tooltip title="后续版本提供">
        <Button icon={<ClockCircleOutlined />} disabled>定时推送</Button>
      </Tooltip>
      <Button
        icon={<ExpandOutlined />}
        onClick={() => {
          const el = document.documentElement;
          if (!document.fullscreenElement) el.requestFullscreen?.();
          else document.exitFullscreen?.();
        }}
      >
        全屏
      </Button>
      <Tooltip title="后续版本提供">
        <Button icon={<ShareAltOutlined />} disabled>分享仪表盘</Button>
      </Tooltip>
      <Button icon={<MoreOutlined />} disabled />
    </Space>
  </div>
);
