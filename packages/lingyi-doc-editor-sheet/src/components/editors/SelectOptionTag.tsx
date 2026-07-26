import React from 'react';
import type { SelectOption } from '@lingyi-doc/core-types';
import { getSelectTagColors } from '@lingyi-doc/core-sheet';

interface SelectOptionTagProps {
  option: SelectOption;
  onRemove?: (e: React.MouseEvent) => void;
  size?: 'sm' | 'md';
}

/** 单选/多选选项标签（pill 样式，与表格单元格一致） */
export const SelectOptionTag: React.FC<SelectOptionTagProps> = ({
  option,
  onRemove,
  size = 'md',
}) => {
  const colors = getSelectTagColors(option.color || '#646A73');
  const fontSize = size === 'sm' ? 12 : 13;
  const padding = size === 'sm' ? '2px 8px' : '3px 10px';
  const lineHeight = size === 'sm' ? '20px' : '22px';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding,
        borderRadius: 999,
        fontSize,
        lineHeight,
        background: colors.bg,
        color: colors.text,
        maxWidth: '100%',
        overflow: 'hidden',
        verticalAlign: 'middle',
      }}
    >
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {option.name}
      </span>
      {onRemove && (
        <span
          role="button"
          aria-label="删除"
          onClick={onRemove}
          onMouseDown={e => e.stopPropagation()}
          style={{
            cursor: 'pointer',
            color: colors.text,
            opacity: 0.55,
            fontSize: 14,
            lineHeight: 1,
            flexShrink: 0,
            marginLeft: 2,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.55'; }}
        >
          ×
        </span>
      )}
    </span>
  );
};

/** 下拉选项行：展示 pill 标签与选中勾 */
export function renderSelectOptionRowWithCheck(option: SelectOption, selected: boolean): React.ReactNode {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '2px 0' }}>
      <SelectOptionTag option={option} size="sm" />
      {selected && (
        <span style={{ color: '#3370FF', fontSize: 14, flexShrink: 0, marginLeft: 8 }}>✓</span>
      )}
    </div>
  );
}

/** 下拉选项行：仅展示 pill 标签 */
export function renderSelectOptionRow(option: SelectOption): React.ReactNode {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '2px 0' }}>
      <SelectOptionTag option={option} size="sm" />
    </div>
  );
}

/** 单元格内联编辑框容器 */
export function getSelectCellOverlayStyle(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): React.CSSProperties {
  return {
    position: 'fixed',
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    zIndex: 1000,
    background: '#fff',
    border: '2px solid #3370FF',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    padding: '2px 8px',
    gap: 4,
    overflow: 'hidden',
    borderRadius: 6,
  };
}

/** 下拉面板容器 */
export function getSelectDropdownStyle(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}, minWidth = 200): React.CSSProperties {
  return {
    position: 'fixed',
    left: rect.x,
    top: rect.y + rect.height,
    width: Math.max(rect.width, minWidth),
    zIndex: 1001,
    background: '#fff',
    border: '1px solid #dee0e3',
    borderRadius: 8,
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    overflow: 'hidden',
  };
}

/** 下拉箭头 */
export const SelectDropdownChevron: React.FC = () => (
  <span
    style={{
      marginLeft: 'auto',
      flexShrink: 0,
      color: '#86909C',
      fontSize: 11,
      lineHeight: 1,
      padding: '0 2px',
      userSelect: 'none',
    }}
  >
    ▾
  </span>
);
