import React, { useCallback, useMemo, useState } from 'react';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import type { CellRange } from '@lingyi-doc/core-types';
import { findDropdownValidationOverlapping } from '@lingyi-doc/core-sheet';
import { useSheetStore } from '../../store/sheetStore';
import { ToolbarPopover } from './ToolbarPopover';
import {
  DropdownListConfigModal,
  validationToDropdownConfig,
  type DropdownListConfig,
} from '../DropdownListConfigModal';

interface InsertDropdownProps {
  table: FreeTable;
  onInsertChart?: () => void;
}

const ACTIVE_COLOR = '#1a73e8';
const ICON_COLOR = '#444';
const LABEL_COLOR = '#666';

const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  padding: '8px 14px',
  border: 'none',
  background: 'none',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: 13,
  color: '#1f2329',
  lineHeight: 1.4,
};

const menuItemHoverStyle: React.CSSProperties = {
  background: '#f5f6f7',
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  margin: '4px 0',
  background: '#ebebeb',
};

function MenuDivider() {
  return <div style={dividerStyle} role="separator" />;
}

function MenuItem({
  icon,
  label,
  disabled,
  submenu,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  disabled?: boolean;
  submenu?: React.ReactNode;
  onClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const [subOpen, setSubOpen] = useState(false);

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => {
        setHover(true);
        if (submenu) setSubOpen(true);
      }}
      onMouseLeave={() => {
        setHover(false);
        if (submenu) setSubOpen(false);
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={disabled ? undefined : onClick}
        style={{
          ...menuItemStyle,
          ...(hover && !disabled ? menuItemHoverStyle : null),
          ...(disabled ? { opacity: 0.4, cursor: 'default' } : null),
        }}
      >
        {icon != null ? (
          <span style={{ flexShrink: 0, display: 'flex', width: 18, height: 18, color: ICON_COLOR, justifyContent: 'center' }}>
            {icon}
          </span>
        ) : (
          <span style={{ width: 18, flexShrink: 0 }} />
        )}
        <span style={{ flex: 1 }}>{label}</span>
        {submenu && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.35, flexShrink: 0 }}>
            <path d="M9 6l6 6-6 6" />
          </svg>
        )}
      </button>
      {submenu && subOpen && (
        <div
          data-sheet-keep-selection
          style={{
            position: 'absolute',
            top: -4,
            left: 'calc(100% - 4px)',
            minWidth: 140,
            background: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            padding: '4px 0',
            zIndex: 10002,
          }}
        >
          {submenu}
        </div>
      )}
    </div>
  );
}

function IconCheckbox() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  );
}

function IconDropdown() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M6 8h12M6 12h12M6 16h8" />
      <path d="M16 6l3 3-3 3" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  );
}

function IconAlarm() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="13" r="7" />
      <path d="M12 10v4l2 2M5 4L3 2M19 4l2-2" />
    </svg>
  );
}

function IconImage() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <path d="M4 16l5-4 4 3 3-2 4 3" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="5" y="12" width="3" height="7" fill="currentColor" stroke="none" opacity="0.5" />
      <rect x="10" y="8" width="3" height="11" fill="currentColor" stroke="none" opacity="0.7" />
      <rect x="15" y="5" width="3" height="14" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconSparkline() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 16l4-6 4 4 4-8 4 6" />
    </svg>
  );
}

function IconPivot() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="4" width="7" height="7" />
      <rect x="13" y="4" width="7" height="7" />
      <rect x="4" y="13" width="7" height="7" />
      <path d="M13 16h7M16 13v7" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 13a4 4 0 0 0 5.7.3l2-2a4 4 0 0 0-5.7-5.7l-1.2 1.2" />
      <path d="M14 11a4 4 0 0 0-5.7-.3l-2 2a4 4 0 0 0 5.7 5.7l1.2-1.2" />
    </svg>
  );
}

function IconAttachment() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M8 12l7-7a3 3 0 1 1 4 4l-8 8a5 5 0 0 1-7-7l9-9" />
    </svg>
  );
}

function IconNote() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M6 4h12v14H9l-3 3V4z" />
      <path d="M9 9h6M9 12h4" />
    </svg>
  );
}

export const InsertDropdown: React.FC<InsertDropdownProps> = ({ table, onInsertChart }) => {
  const [open, setOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const activeCell = useSheetStore(s => s.activeCell);
  const selectionRange = useSheetStore(s => s.selectionRange);
  const setStatusText = useSheetStore(s => s.setStatusText);

  const close = useCallback(() => setOpen(false), []);

  const targetRange = useMemo<CellRange | null>(() => {
    if (selectionRange) return selectionRange;
    if (!activeCell) return null;
    return {
      sheetId: table.sheetId,
      start: activeCell,
      end: activeCell,
    };
  }, [selectionRange, activeCell, table.sheetId]);

  const initialDropdownConfig = useMemo(() => {
    if (!targetRange) return null;
    const existing = findDropdownValidationOverlapping(table.sheet.validations, targetRange);
    return validationToDropdownConfig(existing);
  }, [targetRange, table.sheet.validations, configModalOpen]);

  const guardCell = useCallback((): boolean => {
    if (!activeCell) {
      setStatusText('请先选中单元格');
      return false;
    }
    return true;
  }, [activeCell, setStatusText]);

  const stub = useCallback((name: string) => {
    setStatusText(`${name}功能开发中`);
    close();
  }, [setStatusText, close]);

  const insertDateOptions = useCallback(() => {
    if (!guardCell() || !targetRange) return;
    table.setDateValidation(targetRange, { includeTime: true, allowReminder: false });
    setStatusText('已插入日期选项');
    close();
  }, [guardCell, targetRange, table, setStatusText, close]);

  const insertDateReminder = useCallback(() => {
    if (!guardCell() || !targetRange) return;
    table.setDateValidation(targetRange, { includeTime: true, allowReminder: true });
    setStatusText('已插入日期提醒');
    close();
  }, [guardCell, targetRange, table, setStatusText, close]);

  const insertCheckbox = useCallback(() => {
    if (!guardCell()) return;
    const { row, col } = activeCell!;
    table.setCellValue(row, col, { type: 'boolean', value: false });
    setStatusText('已插入复选框');
    close();
  }, [guardCell, activeCell, table, setStatusText, close]);

  const insertChart = useCallback(() => {
    close();
    if (onInsertChart) {
      onInsertChart();
      return;
    }
    stub('图表');
  }, [close, onInsertChart, stub]);

  const openDropdownConfig = useCallback(() => {
    if (!guardCell()) return;
    close();
    setConfigModalOpen(true);
  }, [guardCell, close]);

  const handleDropdownConfirm = useCallback((range: CellRange, config: DropdownListConfig) => {
    table.setDropdownValidation(range, config);
    setConfigModalOpen(false);
    setStatusText('已插入下拉列表');
  }, [table, setStatusText]);

  const handleDropdownRemove = useCallback((range: CellRange) => {
    table.removeDropdownValidation(range);
    setConfigModalOpen(false);
    setStatusText('已移除下拉列表');
  }, [table, setStatusText]);

  const trigger = (
    <button
      type="button"
      data-sheet-keep-selection
      onClick={() => setOpen(v => !v)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        padding: '2px 4px',
        minWidth: 36,
        cursor: 'pointer',
        borderRadius: 4,
        border: open ? `1px solid ${ACTIVE_COLOR}` : '1px solid transparent',
        background: open ? '#e8f4ff' : 'transparent',
        flexShrink: 0,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 1, height: 22, color: open ? ACTIVE_COLOR : ICON_COLOR }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v8M8 12h8" />
        </svg>
        <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.5 }}>
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </span>
      <span style={{ fontSize: 10, color: open ? ACTIVE_COLOR : LABEL_COLOR, lineHeight: 1.1, userSelect: 'none' }}>
        插入
      </span>
    </button>
  );

  const imageSubmenu = (
    <>
      <MenuItem label="上传图片" onClick={() => stub('上传图片')} />
      <MenuItem label="图片链接" onClick={() => stub('图片链接')} />
    </>
  );

  return (
    <>
      <ToolbarPopover open={open} onClose={close} width={200} minWidth={200} overflowVisible trigger={trigger}>
        <div style={{ padding: '4px 0' }}>
          <MenuItem icon={<IconCheckbox />} label="复选框" onClick={insertCheckbox} />
          <MenuItem icon={<IconDropdown />} label="下拉列表" onClick={openDropdownConfig} />
          <MenuItem icon={<IconCalendar />} label="日期选项" onClick={insertDateOptions} />
          <MenuItem icon={<IconAlarm />} label="日期提醒" onClick={insertDateReminder} />

          <MenuDivider />

          <MenuItem icon={<IconImage />} label="图片" submenu={imageSubmenu} />
          <MenuItem icon={<IconChart />} label="图表" onClick={insertChart} />
          <MenuItem icon={<IconSparkline />} label="迷你图" onClick={() => stub('迷你图')} />
          <MenuItem icon={<IconPivot />} label="数据透视表" onClick={() => stub('数据透视表')} />

          <MenuDivider />

          <MenuItem icon={<IconLink />} label="链接" onClick={() => stub('链接')} />
          <MenuItem icon={<IconAttachment />} label="附件" onClick={() => stub('附件')} />

          <MenuDivider />

          <MenuItem icon={<IconNote />} label="备注" onClick={() => stub('备注')} />
        </div>
      </ToolbarPopover>
      <DropdownListConfigModal
        open={configModalOpen}
        targetRange={targetRange}
        initialConfig={initialDropdownConfig}
        onClose={() => setConfigModalOpen(false)}
        onConfirm={handleDropdownConfirm}
        onRemove={handleDropdownRemove}
      />
    </>
  );
};
