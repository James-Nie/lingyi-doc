import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FreeTable } from '@lingyi-doc/core';
import { getCellText } from '@lingyi-doc/core';

export interface BaseRecordContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  rowIndex: number;
  colIndex: number;
  table: FreeTable;
  onClose: () => void;
  onInsertRowsAbove: (rowIndex: number, count: number) => void;
  onInsertRowsBelow: (rowIndex: number, count: number) => void;
  onViewDetail: (rowIndex: number) => void;
  onViewHistory: (rowIndex: number) => void;
  onAddChildRecord: (rowIndex: number) => void;
  onAddComment: (rowIndex: number) => void;
  onFilterByCell: (rowIndex: number, colIndex: number) => void;
  onDeleteRecord: (rowIndex: number) => void;
}

const menuStyle: React.CSSProperties = {
  position: 'fixed',
  background: '#ffffff',
  border: '1px solid #e8e8e8',
  borderRadius: 8,
  boxShadow: '0 6px 24px rgba(0, 0, 0, 0.12)',
  padding: '6px 0',
  minWidth: 240,
  maxWidth: 300,
  zIndex: 10000,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: 14,
  color: '#1f2329',
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 14px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: '#f0f0f0',
  margin: '6px 0',
};

function truncateText(text: string, max = 8): string {
  const trimmed = text.trim();
  if (!trimmed) return '空值';
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
}

const Icon: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#646a73' }}>
    {children}
  </span>
);

const InsertRowItem: React.FC<{
  direction: 'above' | 'below';
  onSubmit: (count: number) => void;
}> = ({ direction, onSubmit }) => {
  const [count, setCount] = useState(1);

  return (
    <div
      style={itemStyle}
      onMouseEnter={e => { e.currentTarget.style.background = '#f5f6f7'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      onClick={() => onSubmit(count)}
    >
      <Icon>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {direction === 'above' ? (
            <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      </Icon>
      <span>{direction === 'above' ? '向上插入' : '向下插入'}</span>
      <input
        type="number"
        min={1}
        max={100}
        value={count}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onChange={e => setCount(Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)))}
        style={{
          width: 36,
          height: 24,
          border: '1px solid #dee0e3',
          borderRadius: 4,
          textAlign: 'center',
          fontSize: 13,
          outline: 'none',
        }}
      />
      <span>行</span>
    </div>
  );
};

const MenuItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}> = ({ icon, label, danger, onClick }) => (
  <div
    style={{ ...itemStyle, color: danger ? '#f54a45' : '#1f2329' }}
    onMouseEnter={e => { e.currentTarget.style.background = danger ? '#fff1f0' : '#f5f6f7'; }}
    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    onClick={onClick}
  >
    <Icon>{icon}</Icon>
    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
  </div>
);

export const BaseRecordContextMenu: React.FC<BaseRecordContextMenuProps> = ({
  visible, x, y, rowIndex, colIndex, table, onClose,
  onInsertRowsAbove, onInsertRowsBelow, onViewDetail, onViewHistory,
  onAddChildRecord, onAddComment, onFilterByCell, onDeleteRecord,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  const filterLabel = useMemo(() => {
    const colDef = table.sheet.columnDefs[colIndex];
    const cell = table.getCell(rowIndex, colIndex);
    const text = cell ? getCellText(cell.value) : '';
    return `按 ${truncateText(text || colDef?.name || '')} 筛选`;
  }, [table, rowIndex, colIndex]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [visible, onClose]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [visible, onClose]);

  const adjustedStyle = useMemo<React.CSSProperties>(() => {
    const menuH = 360;
    const menuW = 260;
    const adjX = x + menuW > window.innerWidth ? x - menuW : x;
    const adjY = y + menuH > window.innerHeight ? y - menuH : y;
    return { ...menuStyle, left: Math.max(8, adjX), top: Math.max(8, adjY) };
  }, [x, y]);

  if (!visible) return null;

  const run = (fn: () => void) => {
    fn();
    onClose();
  };

  return createPortal(
    <div ref={menuRef} data-sheet-keep-selection style={adjustedStyle} onClick={e => e.stopPropagation()}>
      <InsertRowItem direction="above" onSubmit={count => run(() => onInsertRowsAbove(rowIndex, count))} />
      <InsertRowItem direction="below" onSubmit={count => run(() => onInsertRowsBelow(rowIndex, count))} />

      <MenuItem
        icon={(
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
          </svg>
        )}
        label="查看详情"
        onClick={() => run(() => onViewDetail(rowIndex))}
      />
      <MenuItem
        icon={(
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4" />
            <path d="M12 12v6" />
            <path d="M9 18h6" />
            <path d="M8 12h8" />
          </svg>
        )}
        label="添加子记录"
        onClick={() => run(() => onAddChildRecord(rowIndex))}
      />
      <MenuItem
        icon={(
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" strokeLinecap="round" />
          </svg>
        )}
        label="查看记录历史"
        onClick={() => run(() => onViewHistory(rowIndex))}
      />
      <MenuItem
        icon={(
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
          </svg>
        )}
        label="添加评论"
        onClick={() => run(() => onAddComment(rowIndex))}
      />
      <MenuItem
        icon={(
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4h16v4H4zM7 12h10M9 16h6" strokeLinecap="round" />
          </svg>
        )}
        label={filterLabel}
        onClick={() => run(() => onFilterByCell(rowIndex, colIndex))}
      />

      <div style={dividerStyle} />

      <MenuItem
        icon={(
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        label="删除记录"
        danger
        onClick={() => run(() => onDeleteRecord(rowIndex))}
      />
    </div>,
    document.body,
  );
};
