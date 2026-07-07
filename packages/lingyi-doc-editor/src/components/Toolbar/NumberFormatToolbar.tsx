import React from 'react';
import { NumberFormatDropdown } from './NumberFormatDropdown';
import { ToolbarTooltip } from './Tooltip';

const ICON_COLOR = '#444';
const ACTIVE_COLOR = '#1a73e8';

const iconBtnStyle = (active?: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 22,
  border: 'none',
  borderRadius: 3,
  background: 'transparent',
  color: active ? ACTIVE_COLOR : ICON_COLOR,
  cursor: 'pointer',
  fontSize: 13,
  padding: 0,
  flex: 1,
});

function FormatIconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <ToolbarTooltip label={title}>
      <button type="button" style={iconBtnStyle()} onClick={onClick}>
        {children}
      </button>
    </ToolbarTooltip>
  );
}

function DecimalIncreaseIcon() {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, lineHeight: 1 }}>
      <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: -0.3 }}>.00</span>
      <svg width="14" height="5" viewBox="0 0 14 5" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M1 2.5h9M7.5 0.5l3 2-3 2" />
      </svg>
    </span>
  );
}

function DecimalDecreaseIcon() {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, lineHeight: 1 }}>
      <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: -0.3 }}>.0</span>
      <svg width="14" height="5" viewBox="0 0 14 5" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M13 2.5H4M6.5 0.5l-3 2 3 2" />
      </svg>
    </span>
  );
}

interface NumberFormatToolbarProps {
  value: string;
  onChange: (format: string) => void;
  onAdjustDecimals: (delta: number) => void;
}

export const NumberFormatToolbar: React.FC<NumberFormatToolbarProps> = ({
  value,
  onChange,
  onAdjustDecimals,
}) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: 2,
      padding: '0 2px',
      flexShrink: 0,
      minWidth: 96,
    }}
  >
    <ToolbarTooltip label="数字格式" style={{ width: '100%', display: 'flex' }}>
      <NumberFormatDropdown value={value} onChange={onChange} compact />
    </ToolbarTooltip>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0 }}>
      <FormatIconBtn title="货币" onClick={() => onChange('cny')}>
        <span style={{ fontSize: 14, fontWeight: 500 }}>¥</span>
      </FormatIconBtn>
      <FormatIconBtn title="百分比" onClick={() => onChange('percent')}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>%</span>
      </FormatIconBtn>
      <FormatIconBtn title="增加小数位数" onClick={() => onAdjustDecimals(1)}>
        <DecimalIncreaseIcon />
      </FormatIconBtn>
      <FormatIconBtn title="减少小数位数" onClick={() => onAdjustDecimals(-1)}>
        <DecimalDecreaseIcon />
      </FormatIconBtn>
    </div>
  </div>
);
