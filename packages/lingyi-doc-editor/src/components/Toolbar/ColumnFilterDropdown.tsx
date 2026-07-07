import React, { useCallback, useState } from 'react';
import type { FreeTable } from '@lingyi-doc/core';
import { getFilteredColumnIndices, resolveFilterTargetColumns } from '@lingyi-doc/core';
import { useSheetStore } from '../../store/sheetStore';
import { ToolbarPopover } from './ToolbarPopover';

interface ColumnFilterDropdownProps {
  table: FreeTable;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
}

const menuItemStyle: React.CSSProperties = {
  display: 'block',
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

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...menuItemStyle,
        ...(hover ? menuItemHoverStyle : null),
        ...(danger ? { color: '#d93025' } : null),
      }}
    >
      {children}
    </button>
  );
}

function colIndexToLabel(col: number): string {
  let label = '';
  let n = col;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

export const ColumnFilterDropdown: React.FC<ColumnFilterDropdownProps> = ({
  table,
  open,
  onOpenChange,
  trigger,
}) => {
  const setStatusText = useSheetStore(s => s.setStatusText);
  const filterEnabled = table.isColumnFilterEnabled();
  const activeCount = getFilteredColumnIndices(table.sheet.columnFilters ?? []).length;

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const handleEnableFilter = useCallback(() => {
    const store = useSheetStore.getState();
    const targetCols = resolveFilterTargetColumns(
      store.selectionRange,
      store.axisDiscreteCols,
      table.sheet.rowCount,
    );
    if (targetCols.length === 0) {
      setStatusText('请先选中列');
      close();
      return;
    }
    table.enableColumnFiltersForCols(targetCols);
    store.requestColumnFilterPanel(targetCols[0]);
    if (targetCols.length === 1) {
      setStatusText(`已开启筛选：列 ${colIndexToLabel(targetCols[0])}`);
    } else {
      setStatusText(`已开启筛选：${targetCols.length} 列（${colIndexToLabel(targetCols[0])}–${colIndexToLabel(targetCols[targetCols.length - 1])}）`);
    }
    close();
  }, [table, setStatusText, close]);

  const handleDisableFilter = useCallback(() => {
    table.disableColumnFilters();
    setStatusText('已取消筛选');
    close();
  }, [table, setStatusText, close]);

  const handleNewView = useCallback(() => {
    setStatusText('新建视图以筛选（功能开发中）');
    close();
  }, [setStatusText, close]);

  const handleIntro = useCallback(() => {
    setStatusText(
      filterEnabled
        ? '筛选已开启：点击列头筛选图标设置条件；顶部「取消筛选」可关闭全部筛选'
        : '选中列后点击「筛选」，仅所选列头显示筛选图标',
    );
    close();
  }, [filterEnabled, setStatusText, close]);

  return (
    <ToolbarPopover
      open={open}
      onClose={close}
      width={240}
      trigger={trigger}
    >
      <div style={{ padding: '4px 0' }}>
        {!filterEnabled ? (
          <>
            <MenuItem onClick={handleEnableFilter}>筛选</MenuItem>
            <MenuItem onClick={handleNewView}>新建视图以筛选</MenuItem>
            <MenuItem onClick={handleIntro}>功能介绍</MenuItem>
          </>
        ) : (
          <>
            <MenuItem onClick={handleDisableFilter} danger>
              取消筛选
              {activeCount > 0 ? `（${activeCount} 列有条件）` : ''}
            </MenuItem>
            <MenuItem onClick={handleNewView}>新建视图以筛选</MenuItem>
            <MenuItem onClick={handleIntro}>功能介绍</MenuItem>
          </>
        )}
      </div>
    </ToolbarPopover>
  );
};
