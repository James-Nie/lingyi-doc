import React, { useState } from 'react';
import { Dropdown, Button, message } from 'antd';
import type { MenuProps } from 'antd';
import {
  ExportOutlined,
  RobotOutlined,
  MoreOutlined,
  HolderOutlined,
  SettingOutlined,
  EditOutlined,
  CopyOutlined,
  DeleteOutlined,
  PictureOutlined,
  DashboardOutlined,
  RightOutlined,
} from '@ant-design/icons';
import {
  WIDGET_CARD_RADIUS,
  WIDGET_SELECT_BORDER,
  cornerBracketStyle,
} from '../styles';

export interface WidgetShellProps {
  title?: string;
  selected?: boolean;
  readOnly?: boolean;
  /** 指标卡等自带标题时可隐藏外壳标题文字，但仍保留操作栏 */
  hideTitleText?: boolean;
  contentBackground?: string;
  /** 标题文字颜色 */
  titleColor?: string;
  /** 自定义边框色（未选中时）；空则用默认灰边 */
  borderColor?: string;
  /** 自定义边框粗细（px）；未指定则用默认 1 */
  borderWidth?: number;
  onSelect?: () => void;
  onRename?: () => void;
  onCopy?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  dragHandleClassName?: string;
  children: React.ReactNode;
}

export const WidgetShell: React.FC<WidgetShellProps> = ({
  title,
  selected,
  readOnly,
  hideTitleText,
  contentBackground,
  titleColor,
  borderColor,
  borderWidth,
  onSelect,
  onRename,
  onCopy,
  onDelete,
  onEdit,
  dragHandleClassName = 'dashboard-widget-drag-handle',
  children,
}) => {
  const [hovered, setHovered] = useState(false);

  const idleBorder = (() => {
    const width = borderWidth != null && borderWidth >= 0 ? borderWidth : 1;
    if (!width) return 'none';
    const color = borderColor && borderColor !== 'default' ? borderColor : '#f0f0f0';
    return `${width}px solid ${color}`;
  })();

  const menuItems: MenuProps['items'] = [
    { key: 'edit', icon: <SettingOutlined />, label: '编辑图表', onClick: () => onEdit?.() },
    { key: 'rename', icon: <EditOutlined />, label: '重命名', onClick: () => onRename?.() },
    { key: 'copy', icon: <CopyOutlined />, label: '复制', onClick: () => onCopy?.() },
    {
      key: 'copyTo',
      icon: <CopyOutlined />,
      label: (
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 24, width: '100%' }}>
          复制到 <RightOutlined style={{ fontSize: 10, color: '#bfbfbf' }} />
        </span>
      ),
      children: [
        {
          key: 'copyToCurrent',
          label: '当前仪表盘',
          onClick: () => onCopy?.(),
        },
        {
          key: 'copyToOther',
          label: '其他仪表盘',
          disabled: true,
        },
      ],
    },
    { type: 'divider' },
    {
      key: 'addToCenter',
      icon: <DashboardOutlined />,
      label: '添加到数据看板中心',
      onClick: () => message.info('数据看板中心将在后续版本提供'),
    },
    { type: 'divider' },
    {
      key: 'copyImage',
      icon: <PictureOutlined />,
      label: '复制为图片',
      onClick: () => message.info('复制为图片将在后续版本提供'),
    },
    {
      key: 'exportImage',
      icon: <PictureOutlined />,
      label: '导出为图片',
      onClick: () => message.info('导出为图片将在后续版本提供'),
    },
    { type: 'divider' },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: '删除',
      danger: true,
      onClick: () => onDelete?.(),
    },
  ];

  const showActions = !readOnly && (selected || hovered);

  return (
    <div
      onClick={() => onSelect?.()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: '100%',
        background: contentBackground || '#fff',
        borderRadius: WIDGET_CARD_RADIUS,
        border: selected ? WIDGET_SELECT_BORDER : idleBorder,
        boxShadow: selected
          ? 'none'
          : '0 1px 4px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
        // 选中时露出四角 L，非选中仍裁切内容
        overflow: selected ? 'visible' : 'hidden',
        position: 'relative',
        boxSizing: 'border-box',
      }}
    >
      {selected && !readOnly && (
        <>
          <div style={cornerBracketStyle('tl')} />
          <div style={cornerBracketStyle('tr')} />
          <div style={cornerBracketStyle('bl')} />
          <div style={cornerBracketStyle('br')} />
        </>
      )}
      {showActions && (
        <div
          className={dragHandleClassName}
          title="拖动移动卡片"
          style={{
            position: 'absolute',
            top: -2,
            left: '50%',
            transform: 'translateX(-50%)',
            color: '#8c8c8c',
            cursor: 'grab',
            zIndex: 6,
            fontSize: 14,
            lineHeight: 1,
            padding: '2px 8px',
            background: contentBackground || '#fff',
            borderRadius: 4,
          }}
        >
          <HolderOutlined />
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: hideTitleText ? '8px 12px 0' : '12px 12px 4px',
          minHeight: hideTitleText ? 28 : 40,
          flexShrink: 0,
          borderRadius: `${WIDGET_CARD_RADIUS}px ${WIDGET_CARD_RADIUS}px 0 0`,
          overflow: 'hidden',
        }}
      >
        <div
          className={readOnly ? undefined : dragHandleClassName}
          title={readOnly ? undefined : '拖动名称移动卡片'}
          style={{
            fontWeight: 600,
            fontSize: 14,
            color: titleColor || '#262626',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            paddingRight: 8,
            cursor: readOnly ? 'default' : 'grab',
            userSelect: 'none',
            opacity: hideTitleText ? 0 : 1,
            height: hideTitleText ? 20 : 'auto',
            minHeight: hideTitleText ? 20 : undefined,
          }}
        >
          {title || '未命名'}
        </div>
        {showActions && (
          <div
            style={{ display: 'flex', gap: 4, flexShrink: 0 }}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
            className="dashboard-widget-no-drag"
          >
            <Button
              size="small"
              icon={<RobotOutlined />}
              onClick={() => message.info('AI 能力将在后续版本提供')}
            />
            <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
              <Button size="small" icon={<MoreOutlined />} />
            </Dropdown>
          </div>
        )}
      </div>

      <div
        className="dashboard-interactive-body"
        style={{
          flex: 1,
          minHeight: 0,
          padding: hideTitleText ? '0 8px 8px' : '4px 8px 8px',
          position: 'relative',
          borderRadius: `0 0 ${WIDGET_CARD_RADIUS}px ${WIDGET_CARD_RADIUS}px`,
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
};
