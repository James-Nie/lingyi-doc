import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ColumnDef, ColumnType } from '@lingyi-doc/core';

// ==================== 菜单项类型 ====================

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  dividerBefore?: boolean;
  action?: () => void;
}

const MENU_STYLE: React.CSSProperties = {
  position: 'fixed',
  background: '#ffffff',
  border: '1px solid #e8e8e8',
  borderRadius: 8,
  boxShadow: '0 6px 24px rgba(0, 0, 0, 0.12)',
  padding: '6px 0',
  minWidth: 240,
  maxWidth: 320,
  zIndex: 10000,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: 14,
  color: '#1f2329',
  userSelect: 'none',
};

const ITEM_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 14px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const DIVIDER_STYLE: React.CSSProperties = {
  height: 1,
  background: '#f0f0f0',
  margin: '6px 0',
};

const IconWrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{
    width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, color: '#646a73',
  }}>
    {children}
  </span>
);

const MenuIcon = {
  edit: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  info: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6" strokeLinecap="round" />
      <path d="M12 7h.01" strokeLinecap="round" />
    </svg>
  ),
  copy: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" strokeLinecap="round" />
    </svg>
  ),
  hide: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3l18 18" strokeLinecap="round" />
      <path d="M10.6 10.6A2 2 0 0 0 12 14a2 2 0 0 0 1.4-.6" strokeLinecap="round" />
      <path d="M9.9 5.1A10.7 10.7 0 0 1 12 5c5 0 9.3 3 11 7-1 2.2-2.8 4-5 5.1" strokeLinecap="round" />
      <path d="M6.1 6.1C3.5 7.7 1.8 10.2 1 12c1.7 4 6 7 11 7 1.1 0 2.1-.2 3.1-.5" strokeLinecap="round" />
    </svg>
  ),
  insertLeft: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 12H5" strokeLinecap="round" />
      <path d="M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  insertRight: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14" strokeLinecap="round" />
      <path d="M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  freeze: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 4v16" strokeLinecap="round" />
    </svg>
  ),
  sortAsc: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 19V5" strokeLinecap="round" />
      <path d="M8 9l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 17h2" strokeLinecap="round" />
      <path d="M11 17h6" strokeLinecap="round" />
    </svg>
  ),
  sortDesc: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14" strokeLinecap="round" />
      <path d="M8 15l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 7h2" strokeLinecap="round" />
      <path d="M11 7h6" strokeLinecap="round" />
    </svg>
  ),
  group: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16" strokeLinecap="round" />
      <path d="M4 12h10" strokeLinecap="round" />
      <path d="M4 18h14" strokeLinecap="round" />
    </svg>
  ),
  filter: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 5h16l-6.5 7.5V18l-3 2v-5.5L4 5z" strokeLinejoin="round" />
    </svg>
  ),
  gallery: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  calendar: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" strokeLinecap="round" />
    </svg>
  ),
  kanban: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="4" width="5" height="16" rx="1" />
      <rect x="11" y="4" width="5" height="10" rx="1" />
      <rect x="18" y="4" width="2" height="13" rx="1" />
    </svg>
  ),
  delete: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" strokeLinecap="round" />
      <path d="M8 6V4h8v2" strokeLinecap="round" />
      <path d="M6 6l1 14h10l1-14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

const SORT_LABELS: Record<ColumnType, { asc: string; desc: string }> = {
  text: { asc: '按 A 到 Z 排序', desc: '按 Z 到 A 排序' },
  number: { asc: '按 0 到 9 排序', desc: '按 9 到 0 排序' },
  currency: { asc: '按 0 到 9 排序', desc: '按 9 到 0 排序' },
  percent: { asc: '按 0 到 9 排序', desc: '按 9 到 0 排序' },
  rating: { asc: '按 0 到 5 排序', desc: '按 5 到 0 排序' },
  progress: { asc: '按 0 到 100 排序', desc: '按 100 到 0 排序' },
  date: { asc: '按从早到晚排序', desc: '按从晚到早排序' },
  datetime: { asc: '按从早到晚排序', desc: '按从晚到早排序' },
  boolean: { asc: '按未选到已选排序', desc: '按已选到未选排序' },
  select: { asc: '按 A 到 Z 排序', desc: '按 Z 到 A 排序' },
  multiSelect: { asc: '按 A 到 Z 排序', desc: '按 Z 到 A 排序' },
  user: { asc: '按 A 到 Z 排序', desc: '按 Z 到 A 排序' },
  link: { asc: '按 A 到 Z 排序', desc: '按 Z 到 A 排序' },
  email: { asc: '按 A 到 Z 排序', desc: '按 Z 到 A 排序' },
  phone: { asc: '按 A 到 Z 排序', desc: '按 Z 到 A 排序' },
  formula: { asc: '按 A 到 Z 排序', desc: '按 Z 到 A 排序' },
  autoNumber: { asc: '按 0 到 9 排序', desc: '按 9 到 0 排序' },
  attachment: { asc: '按 A 到 Z 排序', desc: '按 Z 到 A 排序' },
};

const VIEW_ACTIONS: Partial<Record<ColumnType, { suffix: string; viewType: string; icon: React.ReactNode }>> = {
  date: { suffix: '创建日历', viewType: 'calendar', icon: MenuIcon.calendar },
  datetime: { suffix: '创建日历', viewType: 'calendar', icon: MenuIcon.calendar },
  select: { suffix: '创建看板', viewType: 'kanban', icon: MenuIcon.kanban },
  attachment: { suffix: '创建画册', viewType: 'gallery', icon: MenuIcon.gallery },
};

// ==================== 菜单组件 ====================

export interface ColumnHeaderMenuProps {
  visible: boolean;
  x: number;
  y: number;
  columnDef: ColumnDef;
  colIndex: number;
  isLocked?: boolean;
  frozenCols?: number;
  activeSort?: { colIndex: number; order: 'asc' | 'desc' } | null;
  activeGroup?: string | null;
  onClose: () => void;
  onEditField?: (colIndex: number) => void;
  onEditDescription?: (colIndex: number) => void;
  onCopyField?: (colIndex: number) => void;
  onHideField?: (colIndex: number) => void;
  onInsertColumn?: (colIndex: number, direction: 'left' | 'right') => void;
  onFreezeColumn?: (colIndex: number) => void;
  onSort?: (colIndex: number, order: 'asc' | 'desc') => void;
  onGroupByField?: (fieldId: string) => void;
  onFilterByField?: (fieldId: string) => void;
  onCreateView?: (fieldId: string, viewType: string) => void;
  onDeleteField?: (colIndex: number) => void;
}

const MenuItemRow: React.FC<{
  item: MenuItem;
  onClick: () => void;
}> = ({ item, onClick }) => {
  const [hovered, setHovered] = useState(false);
  const disabled = !!item.disabled;

  return (
    <div
      style={{
        ...ITEM_STYLE,
        color: disabled ? '#c9cdd4' : '#1f2329',
        cursor: disabled ? 'default' : 'pointer',
        background: hovered && !disabled ? '#f5f6f7' : 'transparent',
        pointerEvents: disabled ? 'none' : 'auto',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={e => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
    >
      <IconWrap>{item.icon}</IconWrap>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
    </div>
  );
};

export const ColumnHeaderMenu: React.FC<ColumnHeaderMenuProps> = ({
  visible,
  x,
  y,
  columnDef,
  colIndex,
  isLocked = false,
  frozenCols = 0,
  activeSort,
  activeGroup,
  onClose,
  onEditField,
  onEditDescription,
  onCopyField,
  onHideField,
  onInsertColumn,
  onFreezeColumn,
  onSort,
  onGroupByField,
  onFilterByField,
  onCreateView,
  onDeleteField,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const isFrozen = frozenCols > colIndex;
  const fieldName = columnDef.name;

  const closeAnd = useCallback((fn?: () => void) => {
    fn?.();
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!visible) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [visible, onClose]);

  const menuItems = useMemo((): MenuItem[] => {
    const type = columnDef.type;
    const sortLabels = SORT_LABELS[type] || SORT_LABELS.text;
    const isGrouped = activeGroup === columnDef.id;
    const items: MenuItem[] = [];

    items.push({
      id: 'edit-field',
      label: '修改字段/列',
      icon: MenuIcon.edit,
      action: () => closeAnd(() => onEditField?.(colIndex)),
    });
    items.push({
      id: 'edit-desc',
      label: '编辑字段/列描述',
      icon: MenuIcon.info,
      action: () => closeAnd(() => onEditDescription?.(colIndex)),
    });
    items.push({
      id: 'copy-field',
      label: '复制字段/列',
      icon: MenuIcon.copy,
      disabled: isLocked,
      action: () => closeAnd(() => onCopyField?.(colIndex)),
    });
    items.push({
      id: 'hide-field',
      label: '隐藏字段',
      icon: MenuIcon.hide,
      disabled: isLocked,
      action: () => closeAnd(() => onHideField?.(colIndex)),
    });

    items.push({
      id: 'insert-left',
      label: '向左插入字段/列',
      icon: MenuIcon.insertLeft,
      dividerBefore: true,
      action: () => closeAnd(() => onInsertColumn?.(colIndex, 'left')),
    });
    items.push({
      id: 'insert-right',
      label: '向右插入字段/列',
      icon: MenuIcon.insertRight,
      action: () => closeAnd(() => onInsertColumn?.(colIndex, 'right')),
    });
    items.push({
      id: 'freeze',
      label: isFrozen ? '取消冻结' : '冻结至此字段/列',
      icon: MenuIcon.freeze,
      action: () => closeAnd(() => onFreezeColumn?.(colIndex)),
    });

    items.push({
      id: 'sort-asc',
      label: sortLabels.asc,
      icon: MenuIcon.sortAsc,
      dividerBefore: true,
      action: () => closeAnd(() => onSort?.(colIndex, 'asc')),
    });
    items.push({
      id: 'sort-desc',
      label: sortLabels.desc,
      icon: MenuIcon.sortDesc,
      action: () => closeAnd(() => onSort?.(colIndex, 'desc')),
    });

    items.push({
      id: 'group-by',
      label: isGrouped ? `取消按 ${fieldName} 分组` : `按 ${fieldName} 分组`,
      icon: MenuIcon.group,
      dividerBefore: true,
      action: () => closeAnd(() => onGroupByField?.(columnDef.id)),
    });
    items.push({
      id: 'filter-by',
      label: `按 ${fieldName} 筛选`,
      icon: MenuIcon.filter,
      action: () => closeAnd(() => onFilterByField?.(columnDef.id)),
    });

    const viewAction = VIEW_ACTIONS[type];
    if (viewAction) {
      items.push({
        id: 'create-view',
        label: `按 ${fieldName} ${viewAction.suffix}`,
        icon: viewAction.icon,
        action: () => closeAnd(() => onCreateView?.(columnDef.id, viewAction.viewType)),
      });
    }

    items.push({
      id: 'delete-field',
      label: '删除字段/列',
      icon: MenuIcon.delete,
      dividerBefore: true,
      disabled: isLocked,
      action: () => closeAnd(() => onDeleteField?.(colIndex)),
    });

    return items;
  }, [
    columnDef, colIndex, isLocked, isFrozen, fieldName, activeGroup, activeSort,
    closeAnd, onEditField, onEditDescription, onCopyField, onHideField,
    onInsertColumn, onFreezeColumn, onSort, onGroupByField, onFilterByField,
    onCreateView, onDeleteField,
  ]);

  const adjustedStyle = useMemo<React.CSSProperties>(() => {
    const menuW = 260;
    const menuH = 420;
    const margin = 8;
    const adjX = x + menuW > window.innerWidth ? x - menuW : x;
    const adjY = y + menuH > window.innerHeight ? y - menuH : y;
    return {
      ...MENU_STYLE,
      left: Math.max(margin, adjX),
      top: Math.max(margin, adjY),
    };
  }, [x, y]);

  if (!visible) return null;

  return createPortal(
    <div ref={menuRef} data-sheet-keep-selection style={adjustedStyle} onContextMenu={e => e.preventDefault()}>
      {menuItems.map(item => (
        <React.Fragment key={item.id}>
          {item.dividerBefore && <div style={DIVIDER_STYLE} />}
          <MenuItemRow item={item} onClick={() => item.action?.()} />
        </React.Fragment>
      ))}
    </div>,
    document.body,
  );
};

// ==================== 描述编辑器内联组件 ====================

interface DescriptionEditorProps {
  visible: boolean;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  rect: { x: number; y: number; width: number };
}

export const DescriptionEditor: React.FC<DescriptionEditorProps> = ({
  visible,
  value,
  onChange,
  onCommit,
  onCancel,
  rect,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [visible]);

  if (!visible) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        zIndex: 9998,
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => onCommit()}
        onKeyDown={e => {
          if (e.key === 'Enter') onCommit();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="添加字段描述"
        style={{
          width: '100%',
          padding: '6px 10px',
          border: '1px solid #3370ff',
          borderRadius: 6,
          fontSize: 13,
          color: '#1f2329',
          background: '#fff',
          outline: 'none',
          boxShadow: '0 2px 8px rgba(51, 112, 255, 0.15)',
        }}
      />
    </div>,
    document.body,
  );
};
