import React, { useCallback, useMemo, useState } from 'react';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import { applyFreezeAction, buildFreezeMenuItems, type FreezeMenuAction } from '@lingyi-doc/core-sheet';
import { useSheetStore } from '../../store/sheetStore';
import { ToolbarPopover } from './ToolbarPopover';

interface FreezeDropdownProps {
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

function FreezeIconRows() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <path d="M4 10h16" />
      <path d="M6 6l4 4M10 6l4 4M14 6l4 4" strokeWidth="1" opacity="0.45" />
    </svg>
  );
}

function FreezeIconCols() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <path d="M10 4v16" />
      <path d="M6 6l4 4M6 10l4 4M6 14l4 4" strokeWidth="1" opacity="0.45" />
    </svg>
  );
}

function FreezeIconBoth() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <path d="M4 10h16M10 4v16" />
      <path d="M6 6l3 3M6 10l3 3M6 14l3 3" strokeWidth="1" opacity="0.45" />
    </svg>
  );
}

function iconForAction(action: FreezeMenuAction) {
  if (action === 'rows') return <FreezeIconRows />;
  if (action === 'cols') return <FreezeIconCols />;
  if (action === 'both') return <FreezeIconBoth />;
  return null;
}

function MenuItem({
  icon,
  label,
  disabled,
  danger,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
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
      <span>{label}</span>
    </button>
  );
}

export const FreezeDropdown: React.FC<FreezeDropdownProps> = ({
  table,
  open,
  onOpenChange,
  trigger,
}) => {
  const activeCell = useSheetStore(s => s.activeCell);
  const setStatusText = useSheetStore(s => s.setStatusText);
  const [, setTick] = useState(0);

  React.useEffect(() => table.onChange(() => setTick(v => v + 1)), [table]);

  const cell = activeCell ?? { row: 0, col: 0 };
  const freeze = table.sheet.freezeState ?? { frozenRows: 0, frozenCols: 0 };

  const menuItems = useMemo(
    () => buildFreezeMenuItems(cell, table.sheet.rowCount, table.sheet.colCount, freeze),
    [cell.row, cell.col, table.sheet.rowCount, table.sheet.colCount, freeze.frozenRows, freeze.frozenCols],
  );

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const handleAction = useCallback((action: FreezeMenuAction) => {
    const next = applyFreezeAction(action, cell);
    table.setFreeze(next.frozenRows, next.frozenCols);
    if (action === 'clear') {
      setStatusText('已取消冻结');
    } else {
      setStatusText('已冻结');
    }
    close();
  }, [cell, table, setStatusText, close]);

  return (
    <ToolbarPopover open={open} onClose={close} width={280} trigger={trigger}>
      <div style={{ padding: '4px 0' }}>
        {menuItems.map(item => (
          <MenuItem
            key={item.key}
            icon={iconForAction(item.key)}
            label={item.label}
            disabled={item.disabled}
            danger={item.danger}
            onClick={() => handleAction(item.key)}
          />
        ))}
      </div>
    </ToolbarPopover>
  );
};
