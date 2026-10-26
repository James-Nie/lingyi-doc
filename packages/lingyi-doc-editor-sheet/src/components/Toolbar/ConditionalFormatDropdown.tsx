import React, { useCallback, useMemo, useState } from 'react';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import { useSheetStore } from '../../store/sheetStore';
import { ToolbarPopover } from './ToolbarPopover';

interface ConditionalFormatDropdownProps {
  table: FreeTable;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
}

const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  padding: '10px 16px',
  border: 'none',
  background: 'none',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: 13,
  color: '#1f2329',
};

const menuItemHoverStyle: React.CSSProperties = {
  background: '#f5f6f7',
};

const sectionLabelStyle: React.CSSProperties = {
  padding: '8px 16px 4px',
  fontSize: 11,
  fontWeight: 600,
  color: '#86909c',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

function MenuItem({
  icon,
  label,
  subtitle,
  disabled,
  danger,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  subtitle?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...menuItemStyle,
        ...(hover && !disabled ? menuItemHoverStyle : null),
        ...(disabled ? { opacity: 0.4, cursor: 'default' } : null),
        ...(danger ? { color: '#d93025' } : null),
      }}
    >
      {icon && <span style={{ flexShrink: 0, display: 'flex', color: '#444' }}>{icon}</span>}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span>{label}</span>
        {subtitle && <span style={{ fontSize: 11, color: '#86909c' }}>{subtitle}</span>}
      </span>
    </button>
  );
}

function PreviewBar() {
  // DataBar 预览：一个简单的渐变色条
  return (
    <svg width="80" height="16" viewBox="0 0 80 16" style={{ flexShrink: 0 }}>
      <rect x="0" y="2" width="20" height="12" rx="2" fill="#e8f5e9" />
      <rect x="20" y="2" width="20" height="12" rx="2" fill="#a5d6a7" />
      <rect x="40" y="2" width="20" height="12" rx="2" fill="#66bb6a" />
      <rect x="60" y="2" width="20" height="12" rx="2" fill="#2e7d32" />
    </svg>
  );
}

function PreviewColorScale() {
  return (
    <svg width="80" height="16" viewBox="0 0 80 16" style={{ flexShrink: 0 }}>
      <rect x="0" y="2" width="20" height="12" rx="2" fill="#ffebee" />
      <rect x="20" y="2" width="20" height="12" rx="2" fill="#ffcdd2" />
      <rect x="40" y="2" width="20" height="12" rx="2" fill="#fff9c4" />
      <rect x="60" y="2" width="20" height="12" rx="2" fill="#c8e6c9" />
    </svg>
  );
}

function PreviewIconSets() {
  return (
    <svg width="80" height="16" viewBox="0 0 80 16" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="8" r="6" fill="#4caf50" />
      <circle cx="32" cy="8" r="6" fill="#ffeb3b" stroke="#f57f17" strokeWidth="1" />
      <path d="M54 2 L60 14 L48 14 Z" fill="#f44336" />
    </svg>
  );
}

export const ConditionalFormatDropdown: React.FC<ConditionalFormatDropdownProps> = ({
  table,
  open,
  onOpenChange,
  trigger,
}) => {
  const activeCell = useSheetStore(s => s.activeCell);
  const selectionRange = useSheetStore(s => s.selectionRange);
  const setStatusText = useSheetStore(s => s.setStatusText);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const handlePlaceholder = useCallback((action: string) => {
    setStatusText(`条件格式「${action}」功能开发中`);
    close();
  }, [setStatusText, close]);

  const handleClearRules = useCallback(() => {
    // TODO: 实现清除选中区域的条件格式
    setStatusText('已清除条件格式（开发中）');
    close();
  }, [setStatusText, close]);

  // 显示当前选中区域信息
  const selectionInfo = useMemo(() => {
    if (selectionRange) {
      const rows = selectionRange.end.row - selectionRange.start.row + 1;
      const cols = selectionRange.end.col - selectionRange.start.col + 1;
      if (rows === 1 && cols === 1) {
        const colLetter = String.fromCharCode(65 + selectionRange.start.col);
        return `当前单元格：${colLetter}${selectionRange.start.row + 1}`;
      }
      return `当前选中：${rows} × ${cols} 区域`;
    }
    if (activeCell) {
      const colLetter = String.fromCharCode(65 + activeCell.col);
      return `当前单元格：${colLetter}${activeCell.row + 1}`;
    }
    return '未选中';
  }, [selectionRange, activeCell]);

  return (
    <ToolbarPopover open={open} onClose={close} width={300} trigger={trigger}>
      <div style={{ padding: '4px 0' }}>
        {/* 选中区域提示 */}
        <div style={{
          padding: '8px 16px',
          borderBottom: '1px solid #e5e6eb',
          fontSize: 12,
          color: '#86909c',
          background: '#fafbfc',
        }}>
          {selectionInfo}
        </div>

        {/* 规则类型预设 */}
        <div style={sectionLabelStyle}>数据条（Data Bars）</div>
        <MenuItem
          icon={<PreviewBar />}
          label="蓝色渐变"
          subtitle="根据数值大小显示渐变条"
          disabled
          onClick={() => handlePlaceholder('蓝色渐变数据条')}
        />
        <MenuItem
          icon={<PreviewBar />}
          label="绿色渐变"
          disabled
          onClick={() => handlePlaceholder('绿色渐变数据条')}
        />

        <div style={sectionLabelStyle}>色阶（Color Scales）</div>
        <MenuItem
          icon={<PreviewColorScale />}
          label="红-黄-绿"
          subtitle="高值绿色，低值红色"
          disabled
          onClick={() => handlePlaceholder('红-黄-绿色阶')}
        />

        <div style={sectionLabelStyle}>图标集（Icon Sets）</div>
        <MenuItem
          icon={<PreviewIconSets />}
          label="三向箭头"
          disabled
          onClick={() => handlePlaceholder('三向箭头图标集')}
        />

        {/* 自定义规则 */}
        <div style={{ height: 6 }} />
        <div style={{
          height: 1,
          background: '#e5e6eb',
          margin: '4px 12px',
        }} />
        <div style={{ height: 4 }} />

        <MenuItem
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 5v14M5 12h14" />
            </svg>
          }
          label="新建规则..."
          subtitle="设置单元格值 / 公式条件"
          onClick={() => handlePlaceholder('新建规则')}
        />
        <MenuItem
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 6h16M4 12h16M4 18h10" />
            </svg>
          }
          label="管理所有规则..."
          onClick={() => handlePlaceholder('管理规则')}
        />
        <MenuItem
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
          }
          label="清除选中区域规则"
          danger
          onClick={handleClearRules}
        />
      </div>
    </ToolbarPopover>
  );
};
