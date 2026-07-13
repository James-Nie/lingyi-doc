// ============================================================
// ContextMenu — 单元格右键菜单（含多级子菜单）
// ============================================================

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { FreeTable, CellRange } from '@lingyi-doc/core';
import { getCellText, computeRowAutoHeight, DEFAULT_ROW_HEIGHT, DEFAULT_COLUMN_WIDTH, colToName } from '@lingyi-doc/core';
import { useSheetStore } from '../store/sheetStore';
import {
  getColumnSelectionBounds,
  getRowSelectionBounds,
  isFullColumnSelection,
  isFullRowSelection,
  resolveSelectedColumnIndices,
  resolveSelectedRowIndices,
} from '../utils/axisSelection';

// ─── Types ──────────────────────────────────────────────────

export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  dividerAfter?: boolean;
  /** If true, show right arrow indicating submenu */
  hasSubmenu?: boolean;
  /** Submenu items */
  children?: SubMenuItem[];
  /** 右侧角标（如 New） */
  badge?: string;
  /** 主菜单内联数字输入 */
  hasInlineInput?: boolean;
  inputDefault?: number;
  inputUnit?: string;
  inputMin?: number;
  inputMax?: number;
  action?: (value?: number) => void;
}

export interface SubMenuItem {
  id: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  dividerBefore?: boolean;
  /** 行内数量输入（插入行/列） */
  hasInput?: boolean;
  inputDefault?: number;
  inputUnit?: string;
  /** 右侧角标（如 New） */
  badge?: string;
  action?: (inputValue?: number) => void;
}

// ─── Platform Detection ────────────────────────────────────

const isMac = typeof navigator !== 'undefined' ? /Mac|iPhone|iPad|iPod/i.test(navigator.platform) : false;
const modKey = isMac ? '⌘' : 'Ctrl';

// ─── Icons (inline SVG) ────────────────────────────────────

const ICONS: Record<string, string> = {
  copy: 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z',
  copyImage: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5-7l-3 3.72L9 13l-3 4h12l-4-5z',
  cut: 'M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3z',
  paste: 'M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z',
  pasteSpecial: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v7H7zm4-3h2v10h-2zm4 6h2v4h-2z',
  insert: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  delete: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  clear: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  cellInfo: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
  numberFormat: 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-5 14H4v-4h11v4zm0-5H4V9h11v4zm5 5h-4V9h4v9z',
  selectPaste: 'M14.5 11.5L11 15l-2-2.5L6 17h8l-2.5-3.5zM19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z',
  arrowRight: 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  arrowDown: 'M12 5v14M5 12l7 7 7-7',
  arrowLeft: 'M19 12H5M12 19l-7-7 7-7',
  insertRight: 'M5 12h14M12 5l7 7-7 7',
  shiftRight: 'M8 6h8v12H8V6zm-2 4v4H4V10h2zm14 0v4h2v-4h-2z',
  shiftDown: 'M6 8h12v8H6V8zm4-2V4h4v2H10zm0 14v2h4v-2h-4z',
  formula: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
  transpose: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM12 7v2h2V7h-2zm-3 0v2h2V7H9zm6 0v2h2V7h-2zm-3 3v2h2v-2h-2zm-3 0v2h2v-2H9zm6 0v2h2v-2h-2z',
  link: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
  sort: 'M4 8h12M7 5l-3 3 3 3M4 16h12M17 13l3 3-3 3',
  merge: 'M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm12 3h3v4h-4',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h1zm2 0h6V7a3 3 0 0 0-6 0v3z',
  comment: 'M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z',
  rowHeight: 'M4 8h16M4 16h16M12 4v16',
  columnWidth: 'M8 4v16M16 4v16M12 8h8M12 16H4',
  group: 'M4 6h6v6H4V6zm10 0h6v6h-6V6zM4 16h6v4H4v-4zm10 0h6v4h-6v-4z',
};

const STROKE_ICONS = new Set(['arrowUp', 'arrowDown', 'arrowLeft', 'insertRight', 'sort', 'merge', 'lock', 'comment', 'validation', 'rowHeight', 'columnWidth', 'group']);

function SvgIcon({ name, size = 16, stroke }: { name: string; size?: number; stroke?: boolean }) {
  const path = ICONS[name];
  if (!path) return <span style={{ width: size, display: 'inline-block' }} />;
  const useStroke = stroke ?? STROKE_ICONS.has(name);
  if (useStroke) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
        <path d={path} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d={path} />
    </svg>
  );
}

// ─── ContextMenu Props ──────────────────────────────────────

export interface ContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  table: FreeTable;
  onClose: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  /** 复制选区为图片（普通表格） */
  onCopyAsImage?: () => void | Promise<void>;
  /** 右键是否落在当前选区内（不重置选区） */
  clickInSelection?: boolean;
  /** 多维表已勾选的行 */
  checkedRows?: number[];
  /** 是否为多维表 */
  isBaseSheet?: boolean;
  /** 请求删除指定行（弹出确认框） */
  onRequestDeleteRows?: (rows: number[]) => void;
  /** 是否启用评论 */
  commentsEnabled?: boolean;
  /** 添加单元格评论 */
  onAddComment?: (rowIndex: number, colIndex: number) => void;
}

// ─── Styles ─────────────────────────────────────────────────

const menuStyle: React.CSSProperties = {
  position: 'fixed',
  background: '#ffffff',
  border: '1px solid #e0e0e0',
  borderRadius: 8,
  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
  padding: '4px 0',
  minWidth: 220,
  maxWidth: 280,
  zIndex: 10000,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: 13,
  color: '#333',
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '7px 12px',
  cursor: 'pointer',
  gap: 10,
  whiteSpace: 'nowrap',
  transition: 'background 0.1s',
  background: 'transparent',
  borderRadius: 0,
  margin: '0 4px',
};

const itemHoverStyle: React.CSSProperties = {
  ...itemStyle,
  background: '#f5f6f7',
  borderRadius: 6,
};

const itemDisabledStyle: React.CSSProperties = {
  ...itemStyle,
  color: '#bbb',
  cursor: 'default',
  pointerEvents: 'none',
};

const shortcutStyle: React.CSSProperties = {
  marginLeft: 'auto',
  color: '#999',
  fontSize: 12,
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: '#eee',
  margin: '4px 0',
};

const submenuArrowStyle: React.CSSProperties = {
  marginLeft: 'auto',
  display: 'flex',
  alignItems: 'center',
  color: '#999',
};

// ─── Submenu: 行/列插入（内联数量输入） ─────────────────────

const submenuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontSize: 13,
  color: '#1f2329',
  background: 'transparent',
  borderRadius: 0,
  margin: '0 4px',
  transition: 'background 0.1s',
};

const submenuItemHoverStyle: React.CSSProperties = {
  ...submenuItemStyle,
  background: '#f5f6f7',
  borderRadius: 6,
};

const countInputStyle: React.CSSProperties = {
  width: 36,
  height: 24,
  border: '1px solid #dee0e3',
  borderRadius: 4,
  textAlign: 'center',
  fontSize: 13,
  outline: 'none',
  flexShrink: 0,
};

const InsertCountRow: React.FC<{
  item: SubMenuItem;
  onClose: () => void;
}> = ({ item, onClose }) => {
  const [count, setCount] = useState(item.inputDefault ?? 1);

  const commit = () => {
    if (item.disabled) return;
    const value = Math.max(1, Math.min(100, parseInt(String(count), 10) || 1));
    item.action?.(value);
    onClose();
  };

  return (
    <div
      style={item.disabled ? { ...submenuItemStyle, color: '#bbb', cursor: 'default', pointerEvents: 'none' } : submenuItemStyle}
      onMouseEnter={e => { if (!item.disabled) Object.assign(e.currentTarget.style, submenuItemHoverStyle); }}
      onMouseLeave={e => { Object.assign(e.currentTarget.style, submenuItemStyle); }}
      onClick={commit}
    >
      {item.icon && (
        <span style={{ width: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#646a73', flexShrink: 0 }}>
          <SvgIcon name={item.icon} size={14} stroke={STROKE_ICONS.has(item.icon)} />
        </span>
      )}
      <span style={{ flex: 1 }}>{item.label}</span>
      <input
        type="number"
        min={1}
        max={100}
        value={count}
        disabled={item.disabled}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onChange={e => setCount(Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)))}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            commit();
          }
        }}
        style={countInputStyle}
      />
      <span style={{ color: '#646a73', fontSize: 13, flexShrink: 0 }}>{item.inputUnit}</span>
    </div>
  );
};

const MenuInlineInputRow: React.FC<{
  item: MenuItem;
  onClose: () => void;
}> = ({ item, onClose }) => {
  const [value, setValue] = useState(item.inputDefault ?? 1);
  const min = item.inputMin ?? 1;
  const max = item.inputMax ?? 500;

  const commit = () => {
    if (item.disabled) return;
    const n = Math.max(min, Math.min(max, parseInt(String(value), 10) || min));
    item.action?.(n);
    onClose();
  };

  return (
    <div
      style={item.disabled ? itemDisabledStyle : itemStyle}
      onMouseEnter={e => { if (!item.disabled) Object.assign(e.currentTarget.style, itemHoverStyle); }}
      onMouseLeave={e => { Object.assign(e.currentTarget.style, item.disabled ? itemDisabledStyle : itemStyle); }}
      onClick={commit}
    >
      {item.icon && (
        <SvgIcon name={item.icon} size={14} stroke={STROKE_ICONS.has(item.icon)} />
      )}
      <span style={{ flex: 1 }}>{item.label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={item.disabled}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onChange={e => setValue(Math.max(min, Math.min(max, parseInt(e.target.value, 10) || min)))}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            commit();
          }
        }}
        style={{ ...countInputStyle, width: item.inputUnit === '像素' ? 48 : 36 }}
      />
      {item.inputUnit && (
        <span style={{ color: '#646a73', fontSize: 13, flexShrink: 0 }}>{item.inputUnit}</span>
      )}
    </div>
  );
};

// ─── Submenu Popup ──────────────────────────────────────────

const SubmenuPopup: React.FC<{
  items: SubMenuItem[];
  parentRect: DOMRect;
  onClose: () => void;
}> = ({ items, parentRect, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);

  const popupStyle = useMemo<React.CSSProperties>(() => {
    const left = parentRect.right + 2;
    const top = parentRect.top - 4;
    const menuWidth = 280;
    const adjustedLeft = left + menuWidth > window.innerWidth ? parentRect.left - menuWidth - 2 : left;
    const estimatedHeight = items.reduce((h, item) => h + (item.dividerBefore ? 13 : 0) + 40, 8);
    return {
      position: 'fixed',
      left: adjustedLeft,
      top: Math.min(top, window.innerHeight - estimatedHeight - 12),
      ...menuStyle,
      minWidth: menuWidth,
      maxWidth: 320,
      padding: '6px 0',
      zIndex: 10001,
    };
  }, [parentRect, items]);

  return (
    <div ref={ref} style={popupStyle} data-sheet-keep-selection onClick={e => e.stopPropagation()}>
      {items.map(item => (
        <React.Fragment key={item.id}>
          {item.dividerBefore && <div style={dividerStyle} />}
          {item.hasInput ? (
            <InsertCountRow item={item} onClose={onClose} />
          ) : (
            <div
              style={item.disabled ? itemDisabledStyle : submenuItemStyle}
              onClick={() => {
                if (item.disabled) return;
                item.action?.();
                onClose();
              }}
              onMouseEnter={e => {
                if (!item.disabled) Object.assign(e.currentTarget.style, submenuItemHoverStyle);
              }}
              onMouseLeave={e => {
                Object.assign(e.currentTarget.style, item.disabled ? itemDisabledStyle : submenuItemStyle);
              }}
            >
              {item.icon && (
                <span style={{ width: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#646a73', flexShrink: 0 }}>
                  <SvgIcon name={item.icon} size={14} />
                </span>
              )}
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// ─── Main ContextMenu ───────────────────────────────────────

export const ContextMenu: React.FC<ContextMenuProps> = ({
  visible, x, y, table, onClose,
  onCopy, onCut, onPaste,
  onCopyAsImage,
  clickInSelection = false,
  checkedRows = [],
  isBaseSheet = false,
  onRequestDeleteRows,
  commentsEnabled = false,
  onAddComment,
}) => {
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const [submenuAnchor, setSubmenuAnchor] = useState<DOMRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read from store at open time
  const store = useSheetStore.getState();
  const activeCell = store.activeCell;
  const selectionRange = store.selectionRange;
  const discreteSelections = useSheetStore(s => s.discreteSelections);
  const axisDiscreteRows = useSheetStore(s => s.axisDiscreteRows);
  const axisDiscreteCols = useSheetStore(s => s.axisDiscreteCols);
  const colCount = table.sheet.colCount;
  const rowCount = table.sheet.rowCount;

  // Close on outside click
  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [visible, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [visible, onClose]);

  const hasSelection = !!selectionRange || discreteSelections.length > 1;
  const isMultiCellSelection = hasSelection && (
    selectionRange!.start.row !== selectionRange!.end.row ||
    selectionRange!.start.col !== selectionRange!.end.col
  );
  const showSelectionMenu = clickInSelection && hasSelection;
  const fullRowSel = isFullRowSelection(selectionRange, colCount, axisDiscreteRows);
  const fullColSel = isFullColumnSelection(selectionRange, rowCount, axisDiscreteCols);
  const isRowSelectionMenu = showSelectionMenu && fullRowSel && !fullColSel;
  const isColumnSelectionMenu = showSelectionMenu && fullColSel && !fullRowSel;
  const selectedRowIndices = useMemo(
    () => resolveSelectedRowIndices(axisDiscreteRows, selectionRange, colCount),
    [axisDiscreteRows, selectionRange, colCount],
  );
  const selectedColumnIndices = useMemo(
    () => resolveSelectedColumnIndices(axisDiscreteCols, selectionRange, rowCount),
    [axisDiscreteCols, selectionRange, rowCount],
  );
  const rowBounds = useMemo(() => getRowSelectionBounds(selectedRowIndices), [selectedRowIndices]);
  const colBounds = useMemo(() => getColumnSelectionBounds(selectedColumnIndices), [selectedColumnIndices]);
  const isSingleRow = rowBounds.start === rowBounds.end && rowBounds.count > 0;
  const isSingleCol = colBounds.start === colBounds.end && colBounds.count > 0;
  const rowLabelStart = rowBounds.start + 1;
  const rowLabelEnd = rowBounds.end + 1;
  const colLabelStart = colToName(colBounds.start);
  const colLabelEnd = colToName(colBounds.end);
  const defaultRowHeight = useMemo(() => {
    const refRow = activeCell?.row ?? rowBounds.start;
    return Math.round(table.sheet.rowHeights.get(refRow) ?? DEFAULT_ROW_HEIGHT);
  }, [activeCell, rowBounds.start, table.sheet.rowHeights]);
  const defaultColumnWidth = useMemo(() => {
    const refCol = activeCell?.col ?? colBounds.start;
    return Math.round(table.sheet.columnWidths.get(refCol) ?? DEFAULT_COLUMN_WIDTH);
  }, [activeCell, colBounds.start, table.sheet.columnWidths]);

  const isSingleCell = hasSelection && selectionRange!.start.row === selectionRange!.end.row &&
    selectionRange!.start.col === selectionRange!.end.col;

  const getSelectionRows = () => rowBounds.count || 1;

  const getSelectionCols = () => {
    if (!selectionRange) return 1;
    return selectionRange.end.col - selectionRange.start.col + 1;
  };

  // Actions
  const handleCopyAsImage = useCallback(() => {
    onClose();
    if (!onCopyAsImage) {
      useSheetStore.getState().setStatusText('复制为图片（功能开发中）');
      return;
    }
    void Promise.resolve(onCopyAsImage()).catch((err: unknown) => {
      useSheetStore.getState().setStatusText(
        err instanceof Error ? err.message : '复制为图片失败',
      );
    });
  }, [onClose, onCopyAsImage]);

  const handlePasteSpecial = useCallback((mode: string) => {
    onClose();
    useSheetStore.getState().setStatusText(`选择性粘贴：${mode}`);
  }, [onClose]);

  // ── Insert Actions ──
  const handleInsertRowsAbove = useCallback((count: number) => {
    const index = isRowSelectionMenu ? rowBounds.start : (activeCell?.row ?? 0);
    table.insertRows(index, count);
    useSheetStore.getState().setStatusText(`已向上插入 ${count} 行`);
    onClose();
  }, [table, activeCell, onClose, isRowSelectionMenu, rowBounds.start]);

  const handleInsertRowsBelow = useCallback((count: number) => {
    const index = isRowSelectionMenu ? rowBounds.end + 1 : ((activeCell?.row ?? 0) + 1);
    table.insertRows(index, count);
    useSheetStore.getState().setStatusText(`已向下插入 ${count} 行`);
    onClose();
  }, [table, activeCell, onClose, isRowSelectionMenu, rowBounds.end]);

  const handleInsertColsLeft = useCallback((count: number) => {
    const index = isColumnSelectionMenu ? colBounds.start : (activeCell?.col ?? 0);
    table.insertColumns(index, count);
    useSheetStore.getState().setStatusText(`已向左插入 ${count} 列`);
    onClose();
  }, [table, activeCell, onClose, isColumnSelectionMenu, colBounds.start]);

  const handleInsertColsRight = useCallback((count: number) => {
    const index = isColumnSelectionMenu ? colBounds.end + 1 : ((activeCell?.col ?? 0) + 1);
    table.insertColumns(index, count);
    useSheetStore.getState().setStatusText(`已向右插入 ${count} 列`);
    onClose();
  }, [table, activeCell, onClose, isColumnSelectionMenu, colBounds.end]);

  const handleInsertCellRight = useCallback(() => {
    if (!activeCell) return;
    table.insertCellShiftRight(activeCell.row, activeCell.col);
    useSheetStore.getState().setStatusText('已插入单元格，现有单元格右移');
    onClose();
  }, [table, activeCell, onClose]);

  const handleInsertCellDown = useCallback(() => {
    if (!activeCell) return;
    table.insertCellShiftDown(activeCell.row, activeCell.col);
    useSheetStore.getState().setStatusText('已插入单元格，现有单元格下移');
    onClose();
  }, [table, activeCell, onClose]);

  // ── Delete Actions ──
  const handleDeleteRow = useCallback(() => {
    if (isBaseSheet && onRequestDeleteRows) {
      if (checkedRows.length > 0) {
        onRequestDeleteRows(checkedRows);
        onClose();
        return;
      }
    }
    const rows = [...selectedRowIndices].sort((a, b) => a - b);
    if (rows.length === 0) return;
    table.runBatch(() => {
      for (let i = rows.length - 1; i >= 0; i--) {
        table.deleteRows(rows[i], 1);
      }
    }, 'deleteRows');
    useSheetStore.getState().setStatusText(
      rows.length > 1 ? `已删除 ${rows.length} 行` : '已删除 1 行',
    );
    onClose();
  }, [table, onClose, isBaseSheet, checkedRows, onRequestDeleteRows, selectedRowIndices]);

  const handleHideRows = useCallback(() => {
    table.runBatch(() => {
      for (const r of selectedRowIndices) {
        table.setRowHeight(r, 0);
      }
    }, 'hideRows');
    useSheetStore.getState().setStatusText(
      selectedRowIndices.length > 1 ? `已隐藏 ${selectedRowIndices.length} 行` : '已隐藏行',
    );
    onClose();
  }, [table, selectedRowIndices, onClose]);

  const handleSetRowHeight = useCallback((height: number) => {
    table.runBatch(() => {
      for (const r of selectedRowIndices) {
        table.setRowHeight(r, height);
      }
    }, 'setRowHeight');
    useSheetStore.getState().setStatusText(`已将行高设为 ${height} 像素`);
    onClose();
  }, [table, selectedRowIndices, onClose]);

  const handleAutoFitRows = useCallback(() => {
    table.runBatch(() => {
      for (const r of selectedRowIndices) {
        const height = computeRowAutoHeight(table, r, table.sheet.columnWidths);
        table.setRowHeight(r, height);
      }
    }, 'autoFitRowHeight');
    useSheetStore.getState().setStatusText('已自动调整行高');
    onClose();
  }, [table, selectedRowIndices, onClose]);

  const handleDeleteCol = useCallback(() => {
    const cols = [...selectedColumnIndices].sort((a, b) => a - b);
    if (cols.length === 0) return;
    table.runBatch(() => {
      for (let i = cols.length - 1; i >= 0; i--) {
        table.deleteColumns(cols[i], 1);
      }
    }, 'deleteColumns');
    useSheetStore.getState().setStatusText(
      cols.length > 1 ? `已删除 ${cols.length} 列` : '已删除 1 列',
    );
    onClose();
  }, [table, selectedColumnIndices, onClose]);

  const handleHideCols = useCallback(() => {
    table.runBatch(() => {
      for (const c of selectedColumnIndices) {
        table.setColumnWidth(c, 0);
      }
    }, 'hideColumns');
    useSheetStore.getState().setStatusText(
      selectedColumnIndices.length > 1 ? `已隐藏 ${selectedColumnIndices.length} 列` : '已隐藏列',
    );
    onClose();
  }, [table, selectedColumnIndices, onClose]);

  const handleSetColumnWidth = useCallback((width: number) => {
    table.runBatch(() => {
      for (const c of selectedColumnIndices) {
        table.setColumnWidth(c, width);
      }
    }, 'setColumnWidth');
    useSheetStore.getState().setStatusText(`已将列宽设为 ${width} 像素`);
    onClose();
  }, [table, selectedColumnIndices, onClose]);

  const handleAutoFitCols = useCallback(() => {
    table.runBatch(() => {
      for (const c of selectedColumnIndices) {
        table.autoFitColumnWidth(c);
      }
    }, 'autoFitColumnWidth');
    useSheetStore.getState().setStatusText('已自动调整列宽');
    onClose();
  }, [table, selectedColumnIndices, onClose]);

  const handleDeleteCellUp = useCallback(() => {
    if (!activeCell) return;
    table.deleteCellShiftUp(activeCell.row, activeCell.col);
    useSheetStore.getState().setStatusText('已删除单元格，下方单元格上移');
    onClose();
  }, [table, activeCell, onClose]);

  const handleDeleteCellLeft = useCallback(() => {
    if (!activeCell) return;
    table.deleteCellShiftLeft(activeCell.row, activeCell.col);
    useSheetStore.getState().setStatusText('已删除单元格，右侧单元格左移');
    onClose();
  }, [table, activeCell, onClose]);

  // ── Clear Actions ──
  const handleClearContent = useCallback(() => {
    if (!selectionRange) return;
    table.clearRangeContent(selectionRange);
    useSheetStore.getState().setFormulaBarText('');
    useSheetStore.getState().setStatusText('已清除内容');
    onClose();
  }, [table, selectionRange, onClose]);

  const handleClearFormat = useCallback(() => {
    if (!selectionRange) return;
    const startRow = Math.min(selectionRange.start.row, selectionRange.end.row);
    const endRow = Math.max(selectionRange.start.row, selectionRange.end.row);
    const startCol = Math.min(selectionRange.start.col, selectionRange.end.col);
    const endCol = Math.max(selectionRange.start.col, selectionRange.end.col);
    table.runBatch(() => {
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          table.clearCellFormat(r, c);
        }
      }
    }, 'clearFormat');
    useSheetStore.getState().setStatusText('已清除格式');
    onClose();
  }, [table, selectionRange, onClose]);

  const handleClearAll = useCallback(() => {
    if (!selectionRange) return;
    const startRow = Math.min(selectionRange.start.row, selectionRange.end.row);
    const endRow = Math.max(selectionRange.start.row, selectionRange.end.row);
    const startCol = Math.min(selectionRange.start.col, selectionRange.end.col);
    const endCol = Math.max(selectionRange.start.col, selectionRange.end.col);
    table.runBatch(() => {
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          table.clearCellAll(r, c);
        }
      }
    }, 'clearAll');
    useSheetStore.getState().setFormulaBarText('');
    useSheetStore.getState().setStatusText('已清除全部');
    onClose();
  }, [table, selectionRange, onClose]);

  // ── Cell Info ──
  const handleCellInfo = useCallback(() => {
    if (!activeCell) return;
    const cell = table.getCell(activeCell.row, activeCell.col);
    const info = cell
      ? `坐标: (${activeCell.row},${activeCell.col})\n类型: ${cell.value.type}\n值: ${getCellText(cell.value)}`
      : `坐标: (${activeCell.row},${activeCell.col})\n空单元格`;
    alert(info);
    onClose();
  }, [table, activeCell, onClose]);

  const handleMergeCells = useCallback(() => {
    if (!selectionRange) return;
    try {
      table.mergeCells(selectionRange);
      useSheetStore.getState().setStatusText('已合并单元格');
    } catch (err) {
      useSheetStore.getState().setStatusText(err instanceof Error ? err.message : '无法合并单元格');
    }
    onClose();
  }, [table, selectionRange, onClose]);

  const handleSort = useCallback((order: 'asc' | 'desc') => {
    if (!activeCell) return;
    table.sortByColumn(activeCell.col, order);
    useSheetStore.getState().setStatusText(order === 'asc' ? '已按升序排序' : '已按降序排序');
    onClose();
  }, [table, activeCell, onClose]);

  const handleStub = useCallback((label: string) => {
    useSheetStore.getState().setStatusText(`${label}（功能开发中）`);
    onClose();
  }, [onClose]);

  const handleAddComment = useCallback(() => {
    if (!activeCell || !onAddComment) return;
    onAddComment(activeCell.row, activeCell.col);
    onClose();
  }, [activeCell, onAddComment, onClose]);

  const commentMenuItem: MenuItem | null = commentsEnabled && onAddComment
    ? {
      id: 'addComment',
      label: '添加评论',
      icon: 'comment',
      disabled: !activeCell,
      action: handleAddComment,
    }
    : null;

  // Build menu items
  const menuItems = useMemo<MenuItem[]>(() => {
    if (!showSelectionMenu) {
      return [
        {
          id: 'paste', label: '粘贴', icon: 'paste', shortcut: `${modKey}+V`,
          action: () => { onPaste(); onClose(); },
        },
        {
          id: 'cellInfo', label: '查看单元格详情', icon: 'cellInfo',
          disabled: !activeCell, action: handleCellInfo,
        },
        ...(commentMenuItem ? [commentMenuItem] : []),
      ];
    }

    const clipboardItems: MenuItem[] = [
      {
        id: 'copy', label: '复制', icon: 'copy', shortcut: `${modKey}+C`,
        disabled: !hasSelection, action: () => { onCopy(); onClose(); },
      },
      {
        id: 'copyImage', label: '复制为图片', icon: 'copyImage',
        disabled: !hasSelection, action: handleCopyAsImage,
      },
      {
        id: 'cut', label: '剪切', icon: 'cut', shortcut: `${modKey}+X`,
        disabled: !hasSelection, action: () => { onCut(); onClose(); },
      },
      {
        id: 'paste', label: '粘贴', icon: 'paste', shortcut: `${modKey}+V`,
        disabled: !hasSelection, action: () => { onPaste(); onClose(); },
      },
      {
        id: 'pasteSpecial', label: '选择性粘贴', icon: 'pasteSpecial',
        disabled: !hasSelection, dividerAfter: true, hasSubmenu: true,
        children: [
          { id: 'pasteAll', label: '粘贴全部', action: () => { onPaste(); } },
          { id: 'pasteValues', label: '仅粘贴数值', action: () => handlePasteSpecial('仅粘贴数值') },
          { id: 'pasteFormats', label: '仅粘贴格式', action: () => handlePasteSpecial('仅粘贴格式') },
          { id: 'pasteFormulas', label: '仅粘贴公式', action: () => handlePasteSpecial('仅粘贴公式') },
          { id: 'pasteTranspose', label: '转置粘贴', action: () => handlePasteSpecial('转置粘贴') },
        ],
      },
    ];

    if (isRowSelectionMenu) {
      const insertDefault = rowBounds.count || 1;
      const deleteLabel = isSingleRow ? '删除行' : `删除第 ${rowLabelStart} - ${rowLabelEnd} 行`;
      const hideLabel = isSingleRow ? '隐藏行' : `隐藏第 ${rowLabelStart} - ${rowLabelEnd} 行`;
      return [
        ...clipboardItems,
        {
          id: 'insertRowsAbove',
          label: '向上插入',
          icon: 'arrowUp',
          hasInlineInput: true,
          inputDefault: insertDefault,
          inputUnit: '行',
          inputMin: 1,
          inputMax: 100,
          action: v => handleInsertRowsAbove(v || 1),
        },
        {
          id: 'insertRowsBelow',
          label: '向下插入',
          icon: 'arrowDown',
          hasInlineInput: true,
          inputDefault: insertDefault,
          inputUnit: '行',
          inputMin: 1,
          inputMax: 100,
          action: v => handleInsertRowsBelow(v || 1),
        },
        {
          id: 'setRowHeight',
          label: '行高设为',
          icon: 'rowHeight',
          hasInlineInput: true,
          inputDefault: defaultRowHeight,
          inputUnit: '像素',
          inputMin: 10,
          inputMax: 500,
          action: v => handleSetRowHeight(v || defaultRowHeight),
        },
        {
          id: 'autoFitRowHeight',
          label: '行高自适应',
          dividerAfter: true,
          action: handleAutoFitRows,
        },
        {
          id: 'deleteRows',
          label: deleteLabel,
          action: handleDeleteRow,
        },
        {
          id: 'hideRows',
          label: hideLabel,
          action: handleHideRows,
        },
        {
          id: 'clear', label: '清除', icon: 'clear', hasSubmenu: true, dividerAfter: true,
          children: [
            { id: 'clearContent', label: '清除内容', action: handleClearContent },
            { id: 'clearFormat', label: '清除格式', action: handleClearFormat },
            { id: 'clearAll', label: '清除全部', action: handleClearAll },
          ],
        },
        {
          id: 'cellInfo', label: '查看单元格详情', icon: 'cellInfo',
          disabled: !activeCell, action: handleCellInfo,
        },
        {
          id: 'numberFormat', label: '设置单元格数字格式', icon: 'numberFormat',
          disabled: !hasSelection, dividerAfter: true,
          action: () => {
            onClose();
            useSheetStore.getState().setStatusText('已打开数字格式面板');
          },
        },
        {
          id: 'copyLink', label: '复制选区链接', icon: 'link', dividerAfter: true,
          action: () => {
            onClose();
            useSheetStore.getState().setStatusText('已复制选区链接');
          },
        },
        {
          id: 'mergeCells', label: '合并单元格', icon: 'merge',
          disabled: !isMultiCellSelection,
          action: handleMergeCells,
        },
        {
          id: 'protection', label: '设置保护范围', icon: 'lock', hasSubmenu: true,
          children: [
            { id: 'protectRange', label: '保护选区', action: () => handleStub('设置保护范围') },
            { id: 'unprotectRange', label: '取消保护', action: () => handleStub('取消保护') },
          ],
        },
        {
          id: 'group', label: '分组', icon: 'group', hasSubmenu: true, dividerAfter: true,
          children: [
            { id: 'groupRows', label: '分组行', action: () => handleStub('分组行') },
            { id: 'ungroupRows', label: '取消分组', action: () => handleStub('取消分组') },
          ],
        },
        {
          id: 'dataValidation', label: '数据验证', icon: 'validation',
          action: () => handleStub('数据验证'),
        },
        {
          id: 'removeDuplicates', label: '删除重复项',
          action: () => handleStub('删除重复项'),
        },
      ];
    }

    if (isColumnSelectionMenu) {
      const insertDefault = colBounds.count || 1;
      const deleteLabel = isSingleCol ? '删除列' : `删除第 ${colLabelStart} - ${colLabelEnd} 列`;
      const hideLabel = isSingleCol ? '隐藏列' : `隐藏第 ${colLabelStart} - ${colLabelEnd} 列`;
      return [
        ...clipboardItems,
        {
          id: 'insertColsLeft',
          label: '向左插入',
          icon: 'arrowLeft',
          hasInlineInput: true,
          inputDefault: insertDefault,
          inputUnit: '列',
          inputMin: 1,
          inputMax: 100,
          action: v => handleInsertColsLeft(v || 1),
        },
        {
          id: 'insertColsRight',
          label: '向右插入',
          icon: 'insertRight',
          hasInlineInput: true,
          inputDefault: insertDefault,
          inputUnit: '列',
          inputMin: 1,
          inputMax: 100,
          action: v => handleInsertColsRight(v || 1),
        },
        {
          id: 'setColumnWidth',
          label: '列宽设为',
          icon: 'columnWidth',
          hasInlineInput: true,
          inputDefault: defaultColumnWidth,
          inputUnit: '像素',
          inputMin: 10,
          inputMax: 500,
          action: v => handleSetColumnWidth(v || defaultColumnWidth),
        },
        {
          id: 'autoFitColumnWidth',
          label: '列宽自适应',
          dividerAfter: true,
          action: handleAutoFitCols,
        },
        {
          id: 'deleteCols',
          label: deleteLabel,
          action: handleDeleteCol,
        },
        {
          id: 'hideCols',
          label: hideLabel,
          action: handleHideCols,
        },
        {
          id: 'clear', label: '清除', icon: 'clear', hasSubmenu: true, dividerAfter: true,
          children: [
            { id: 'clearContent', label: '清除内容', action: handleClearContent },
            { id: 'clearFormat', label: '清除格式', action: handleClearFormat },
            { id: 'clearAll', label: '清除全部', action: handleClearAll },
          ],
        },
        {
          id: 'cellInfo', label: '查看单元格详情', icon: 'cellInfo',
          disabled: !activeCell, action: handleCellInfo,
        },
        {
          id: 'numberFormat', label: '设置单元格数字格式', icon: 'numberFormat',
          disabled: !hasSelection, dividerAfter: true,
          action: () => {
            onClose();
            useSheetStore.getState().setStatusText('已打开数字格式面板');
          },
        },
        {
          id: 'sort', label: '排序', icon: 'sort', hasSubmenu: true, dividerAfter: true,
          children: [
            { id: 'sortAsc', label: '升序', action: () => handleSort('asc') },
            { id: 'sortDesc', label: '降序', action: () => handleSort('desc') },
          ],
        },
        {
          id: 'copyLink', label: '复制选区链接', icon: 'link', dividerAfter: true,
          action: () => {
            onClose();
            useSheetStore.getState().setStatusText('已复制选区链接');
          },
        },
        {
          id: 'mergeCells', label: '合并单元格', icon: 'merge',
          disabled: !isMultiCellSelection,
          action: handleMergeCells,
        },
        {
          id: 'protection', label: '设置保护范围', icon: 'lock', hasSubmenu: true,
          children: [
            { id: 'protectRange', label: '保护选区', action: () => handleStub('设置保护范围') },
            { id: 'unprotectRange', label: '取消保护', action: () => handleStub('取消保护') },
          ],
        },
        {
          id: 'group', label: '分组', icon: 'group', hasSubmenu: true, dividerAfter: true,
          children: [
            { id: 'groupCols', label: '分组列', action: () => handleStub('分组列') },
            { id: 'ungroupCols', label: '取消分组', action: () => handleStub('取消分组') },
          ],
        },
        {
          id: 'dataValidation', label: '数据验证', icon: 'validation',
          action: () => handleStub('数据验证'),
        },
        {
          id: 'removeDuplicates', label: '删除重复项',
          action: () => handleStub('删除重复项'),
        },
      ];
    }

    return [
    ...clipboardItems,
    // ── Insert ──
    {
      id: 'insert', label: '插入', icon: 'insert',
      disabled: !hasSelection, hasSubmenu: true,
      children: [
        {
          id: 'insertRowsAbove',
          label: '向上插入',
          icon: 'arrowUp',
          hasInput: true,
          inputDefault: 1,
          inputUnit: '行',
          action: v => handleInsertRowsAbove(v || 1),
        },
        {
          id: 'insertRowsBelow',
          label: '向下插入',
          icon: 'arrowDown',
          hasInput: true,
          inputDefault: 1,
          inputUnit: '行',
          action: v => handleInsertRowsBelow(v || 1),
        },
        {
          id: 'insertColsLeft',
          label: '向左插入',
          icon: 'arrowLeft',
          hasInput: true,
          inputDefault: 1,
          inputUnit: '列',
          action: v => handleInsertColsLeft(v || 1),
        },
        {
          id: 'insertColsRight',
          label: '向右插入',
          icon: 'insertRight',
          hasInput: true,
          inputDefault: 1,
          inputUnit: '列',
          action: v => handleInsertColsRight(v || 1),
        },
        {
          id: 'insertCellRight',
          label: '插入单元格，现有单元格右移',
          icon: 'shiftRight',
          dividerBefore: true,
          disabled: !isSingleCell,
          action: handleInsertCellRight,
        },
        {
          id: 'insertCellDown',
          label: '插入单元格，现有单元格下移',
          icon: 'shiftDown',
          disabled: !isSingleCell,
          action: handleInsertCellDown,
        },
      ],
    },
    // ── Delete ──
    {
      id: 'delete', label: '删除', icon: 'delete',
      disabled: !hasSelection && !(isBaseSheet && checkedRows.length > 0), hasSubmenu: true,
      children: [
        {
          id: 'deleteRow',
          label: isBaseSheet && checkedRows.length > 0
            ? `删除 ${checkedRows.length} 行记录`
            : getSelectionRows() > 1 ? `删除 ${getSelectionRows()} 行` : '删除行',
          action: () => { handleDeleteRow(); },
        },
        {
          id: 'deleteCol',
          label: getSelectionCols() > 1 ? `删除 ${getSelectionCols()} 列` : '删除列',
          action: () => { handleDeleteCol(); },
        },
        {
          id: 'deleteCellUp',
          label: '删除单元格，下方单元格上移',
          dividerBefore: true,
          disabled: !isSingleCell,
          action: handleDeleteCellUp,
        },
        {
          id: 'deleteCellLeft',
          label: '删除单元格，右侧单元格左移',
          disabled: !isSingleCell,
          action: handleDeleteCellLeft,
        },
      ],
    },
    // ── Clear ──
    {
      id: 'clear', label: '清除', icon: 'clear',
      disabled: !hasSelection, dividerAfter: true, hasSubmenu: true,
      children: [
        { id: 'clearContent', label: '清除内容', action: handleClearContent },
        { id: 'clearFormat', label: '清除格式', action: handleClearFormat },
        { id: 'clearAll', label: '清除全部', action: handleClearAll },
      ],
    },
    // ── Cell Properties ──
    {
      id: 'cellInfo', label: '查看单元格详情', icon: 'cellInfo',
      disabled: !activeCell, action: handleCellInfo,
    },
    ...(commentMenuItem ? [{ ...commentMenuItem, dividerAfter: true }] : []),
    {
      id: 'numberFormat', label: '设置单元格数字格式', icon: 'numberFormat',
      disabled: !hasSelection, dividerAfter: true,
      action: () => {
        onClose();
        useSheetStore.getState().setStatusText('已打开数字格式面板');
      },
    },
    {
      id: 'sort', label: '排序', icon: 'sort',
      disabled: !hasSelection, hasSubmenu: true,
      children: [
        { id: 'sortAsc', label: '升序', action: () => handleSort('asc') },
        { id: 'sortDesc', label: '降序', action: () => handleSort('desc') },
      ],
    },
    {
      id: 'copyLink', label: '复制选区链接', icon: 'link',
      disabled: !hasSelection, dividerAfter: true,
      action: () => {
        onClose();
        useSheetStore.getState().setStatusText('已复制选区链接');
      },
    },
    {
      id: 'mergeCells', label: '合并单元格', icon: 'merge',
      disabled: !isMultiCellSelection,
      action: handleMergeCells,
    },
    {
      id: 'protection', label: '设置保护范围', icon: 'lock', hasSubmenu: true,
      children: [
        { id: 'protectRange', label: '保护选区', action: () => handleStub('设置保护范围') },
        { id: 'unprotectRange', label: '取消保护', action: () => handleStub('取消保护') },
      ],
    },
    {
      id: 'addNote', label: '添加备注', icon: 'comment',
      shortcut: 'Shift+Fn+F2', badge: 'New', dividerAfter: true,
      action: () => handleStub('添加备注'),
    },
    {
      id: 'dataValidation', label: '数据验证', icon: 'validation',
      action: () => handleStub('数据验证'),
    },
    {
      id: 'removeDuplicates', label: '删除重复项',
      action: () => handleStub('删除重复项'),
    },
  ];
  }, [showSelectionMenu, isRowSelectionMenu, isColumnSelectionMenu, hasSelection, isSingleCell, isMultiCellSelection, isSingleRow, isSingleCol, rowLabelStart, rowLabelEnd, colLabelStart, colLabelEnd, rowBounds.count, colBounds.count, defaultRowHeight, defaultColumnWidth, activeCell, selectionRange, onClose, onCopy, onCut, onPaste,
    isBaseSheet, checkedRows,
    handleCopyAsImage, handlePasteSpecial, handleDeleteRow, handleDeleteCol,
    handleDeleteCellUp, handleDeleteCellLeft, handleClearContent, handleClearFormat,
    handleClearAll, handleCellInfo, handleInsertRowsAbove, handleInsertRowsBelow,
    handleInsertColsLeft, handleInsertColsRight, handleInsertCellRight, handleInsertCellDown,
    handleMergeCells, handleSort, handleStub, handleHideRows, handleSetRowHeight, handleAutoFitRows,
    handleHideCols, handleSetColumnWidth, handleAutoFitCols, commentMenuItem]);

  // Handle submenu hover
  const handleSubmenuEnter = useCallback((menuId: string, e: React.MouseEvent) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setActiveSubmenu(menuId);
    setSubmenuAnchor((e.currentTarget as HTMLElement).getBoundingClientRect());
  }, []);

  const handleSubmenuLeave = useCallback(() => {
    hoverTimeout.current = setTimeout(() => {
      setActiveSubmenu(null);
      setSubmenuAnchor(null);
    }, 200);
  }, []);

  // Adjust menu position to stay within viewport
  const adjustedStyle = useMemo<React.CSSProperties>(() => {
    const menuH = menuItems.length * 32 + 16;
    const adjX = x + 240 > window.innerWidth ? x - 240 : x;
    const adjY = y + menuH > window.innerHeight ? y - menuH : y;
    return { ...menuStyle, left: adjX, top: adjY };
  }, [x, y, menuItems.length]);

  if (!visible) return null;

  const currentSubmenu = menuItems.find(m => m.id === activeSubmenu);

  return createPortal(
    <div ref={containerRef} data-sheet-keep-selection>
      <div ref={menuRef} style={adjustedStyle} onClick={e => e.stopPropagation()}>
        {menuItems.map(item => (
          <React.Fragment key={item.id}>
            {item.hasInlineInput ? (
              <MenuInlineInputRow item={item} onClose={onClose} />
            ) : (
            <div
              style={item.disabled ? itemDisabledStyle : itemStyle}
              onClick={() => {
                if (!item.hasSubmenu) item.action?.();
              }}
              onMouseEnter={(e) => {
                if (!item.disabled) {
                  Object.assign((e.currentTarget as HTMLElement).style, itemHoverStyle);
                  if (item.hasSubmenu) handleSubmenuEnter(item.id, e);
                }
              }}
              onMouseLeave={(e) => {
                Object.assign((e.currentTarget as HTMLElement).style, item.disabled ? itemDisabledStyle : itemStyle);
                if (item.hasSubmenu) handleSubmenuLeave();
              }}
            >
              {item.icon && <SvgIcon name={item.icon} size={14} stroke={STROKE_ICONS.has(item.icon)} />}
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.shortcut && <span style={shortcutStyle}>{item.shortcut}</span>}
              {item.badge && (
                <span style={{
                  marginLeft: item.shortcut ? 6 : 'auto',
                  padding: '0 5px',
                  borderRadius: 3,
                  background: '#fce8e6',
                  color: '#d93025',
                  fontSize: 10,
                  fontWeight: 600,
                  lineHeight: '16px',
                }}>
                  {item.badge}
                </span>
              )}
              {item.hasSubmenu && (
                <span style={submenuArrowStyle}>
                  <SvgIcon name="arrowRight" size={14} />
                </span>
              )}
            </div>
            )}
            {item.dividerAfter && <div style={dividerStyle} />}
          </React.Fragment>
        ))}
      </div>

      {/* Submenu popup */}
      {activeSubmenu && currentSubmenu?.children && submenuAnchor && (
        <div
          onMouseEnter={() => {
            if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
          }}
          onMouseLeave={handleSubmenuLeave}
        >
          <SubmenuPopup
            items={currentSubmenu.children}
            parentRect={submenuAnchor}
            onClose={onClose}
          />
        </div>
      )}
    </div>,
    document.body,
  );
};

export default ContextMenu;
