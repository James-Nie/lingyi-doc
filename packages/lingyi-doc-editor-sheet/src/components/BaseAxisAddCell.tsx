import React from 'react';
import { Tooltip } from 'antd';
import { BASE_THEME } from '@lingyi-doc/core-sheet';

/** 多维表：嵌入表格网格的「+」添加单元格（列头末尾 / 行头底部） */
export const BaseAxisAddCell: React.FC<{
  width: number;
  height: number;
  title: string;
  onClick: () => void;
  /** 列头添加格：仅左侧与表头衔接，其余三边描边 */
  variant?: 'column' | 'row';
}> = ({ width, height, title, onClick, variant = 'column' }) => {
  const borderStyle: React.CSSProperties = variant === 'column'
    ? {
        borderTop: `1px solid ${BASE_THEME.addCellBorder}`,
        borderRight: `1px solid ${BASE_THEME.addCellBorder}`,
        borderBottom: `1px solid ${BASE_THEME.addCellBorder}`,
        borderLeft: 'none',
      }
    : {
        borderTop: `1px solid ${BASE_THEME.addCellBorder}`,
        borderBottom: `1px solid ${BASE_THEME.addCellBorder}`,
        borderLeft: `1px solid ${BASE_THEME.addCellBorder}`,
        borderRight: 'none',
      };

  return (
    <div
      style={{
        width,
        height,
        flexShrink: 0,
        background: BASE_THEME.addCellBg,
        boxSizing: 'border-box',
        ...borderStyle,
      }}
      data-sheet-keep-selection
    >
      <Tooltip title={title} placement="bottom">
        <button
          type="button"
          onClick={onClick}
          onMouseDown={e => e.stopPropagation()}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            background: 'transparent',
            color: BASE_THEME.addCellColor,
            cursor: 'pointer',
            fontSize: 18,
            fontWeight: 300,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
          onMouseEnter={e => { e.currentTarget.parentElement!.style.background = BASE_THEME.rowHoverBg; }}
          onMouseLeave={e => { e.currentTarget.parentElement!.style.background = BASE_THEME.addCellBg; }}
        >
          +
        </button>
      </Tooltip>
    </div>
  );
};

/** @deprecated 使用 BASE_THEME.addColumnWidth */
export const BASE_ADD_COLUMN_WIDTH = BASE_THEME.addColumnWidth;
