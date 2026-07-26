import React, { useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Input, Menu } from 'antd';
import type { MenuProps } from 'antd';
import {
  CalendarOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
  FilterOutlined,
  GroupOutlined,
  InfoCircleOutlined,
  LockOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  TableOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import type { ColumnDef, ColumnType } from '@lingyi-doc/core-types';
import { isGroupableColumn } from '@lingyi-doc/core-sheet';
import { BASE_SHEET_CONTEXT_MENU_Z_INDEX } from './base/baseAntdConfig';

const SORT_LABELS: Record<ColumnType, { asc: string; desc: string }> = {
  text: { asc: '按 A 到 Z 排序', desc: '按 Z 到 A 排序' },
  multilineText: { asc: '按 A 到 Z 排序', desc: '按 Z 到 A 排序' },
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
  createdBy: { asc: '按 A 到 Z 排序', desc: '按 Z 到 A 排序' },
  updatedBy: { asc: '按 A 到 Z 排序', desc: '按 Z 到 A 排序' },
  createdTime: { asc: '按从早到晚排序', desc: '按从晚到早排序' },
  updatedTime: { asc: '按从早到晚排序', desc: '按从晚到早排序' },
};

const VIEW_ACTIONS: Partial<Record<ColumnType, { suffix: string; viewType: string; icon: React.ReactNode }>> = {
  date: { suffix: '创建日历', viewType: 'calendar', icon: <CalendarOutlined /> },
  datetime: { suffix: '创建日历', viewType: 'calendar', icon: <CalendarOutlined /> },
  select: { suffix: '创建看板', viewType: 'kanban', icon: <AppstoreOutlined /> },
  attachment: { suffix: '创建画册', viewType: 'gallery', icon: <TableOutlined /> },
};

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

export const ColumnHeaderMenu: React.FC<ColumnHeaderMenuProps> = ({
  visible,
  x,
  y,
  columnDef,
  colIndex,
  isLocked = false,
  frozenCols = 0,
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
  const isFrozen = frozenCols > colIndex;
  const fieldName = columnDef.name;

  const closeAnd = useCallback((fn?: () => void) => {
    fn?.();
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

  const menuItems = useMemo((): MenuProps['items'] => {
    const type = columnDef.type;
    const sortLabels = SORT_LABELS[type] || SORT_LABELS.text;
    const isGrouped = activeGroup === columnDef.id;
    const items: NonNullable<MenuProps['items']> = [
      { key: 'edit-field', icon: <EditOutlined />, label: '修改字段/列', onClick: () => closeAnd(() => onEditField?.(colIndex)) },
      { key: 'edit-desc', icon: <InfoCircleOutlined />, label: '编辑字段/列描述', onClick: () => closeAnd(() => onEditDescription?.(colIndex)) },
      { key: 'copy-field', icon: <CopyOutlined />, label: '复制字段/列', disabled: isLocked, onClick: () => closeAnd(() => onCopyField?.(colIndex)) },
      { key: 'hide-field', icon: <EyeInvisibleOutlined />, label: '隐藏字段', disabled: isLocked, onClick: () => closeAnd(() => onHideField?.(colIndex)) },
      { type: 'divider' },
      { key: 'insert-left', label: '向左插入字段/列', onClick: () => closeAnd(() => onInsertColumn?.(colIndex, 'left')) },
      { key: 'insert-right', label: '向右插入字段/列', onClick: () => closeAnd(() => onInsertColumn?.(colIndex, 'right')) },
      { key: 'freeze', icon: <LockOutlined />, label: isFrozen ? '取消冻结' : '冻结至此字段/列', onClick: () => closeAnd(() => onFreezeColumn?.(colIndex)) },
      { type: 'divider' },
      { key: 'sort-asc', icon: <SortAscendingOutlined />, label: sortLabels.asc, onClick: () => closeAnd(() => onSort?.(colIndex, 'asc')) },
      { key: 'sort-desc', icon: <SortDescendingOutlined />, label: sortLabels.desc, onClick: () => closeAnd(() => onSort?.(colIndex, 'desc')) },
    ];

    if (isGroupableColumn(columnDef)) {
      items.push(
        { type: 'divider' },
        {
          key: 'group-by',
          icon: <GroupOutlined />,
          label: isGrouped ? `取消按 ${fieldName} 分组` : `按 ${fieldName} 分组`,
          onClick: () => closeAnd(() => onGroupByField?.(columnDef.id)),
        },
      );
    }

    items.push({
      key: 'filter-by',
      icon: <FilterOutlined />,
      label: `按 ${fieldName} 筛选`,
      onClick: () => closeAnd(() => onFilterByField?.(columnDef.id)),
    });

    const viewAction = VIEW_ACTIONS[type];
    if (viewAction) {
      items.push({
        key: 'create-view',
        icon: viewAction.icon,
        label: `按 ${fieldName} ${viewAction.suffix}`,
        onClick: () => closeAnd(() => onCreateView?.(columnDef.id, viewAction.viewType)),
      });
    }

    items.push(
      { type: 'divider' },
      {
        key: 'delete-field',
        icon: <DeleteOutlined />,
        label: '删除字段/列',
        disabled: isLocked,
        danger: true,
        onClick: () => closeAnd(() => onDeleteField?.(colIndex)),
      },
    );

    return items;
  }, [
    columnDef, colIndex, isLocked, isFrozen, fieldName, activeGroup,
    closeAnd, onEditField, onEditDescription, onCopyField, onHideField,
    onInsertColumn, onFreezeColumn, onSort, onGroupByField, onFilterByField,
    onCreateView, onDeleteField,
  ]);

  const position = useMemo(() => {
    const menuW = 260;
    const menuH = 420;
    const margin = 8;
    const adjX = x + menuW > window.innerWidth ? x - menuW : x;
    const adjY = y + menuH > window.innerHeight ? y - menuH : y;
    return { left: Math.max(margin, adjX), top: Math.max(margin, adjY) };
  }, [x, y]);

  if (!visible) return null;

  return createPortal(
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: BASE_SHEET_CONTEXT_MENU_Z_INDEX - 1 }}
        onMouseDown={onClose}
      />
      <div
        data-sheet-keep-selection
        style={{
          position: 'fixed',
          left: position.left,
          top: position.top,
          zIndex: BASE_SHEET_CONTEXT_MENU_Z_INDEX,
        }}
        onContextMenu={e => e.preventDefault()}
      >
        <Menu
          items={menuItems}
          style={{
            borderRadius: 8,
            border: '1px solid #e8e8e8',
            boxShadow: '0 6px 24px rgba(0, 0, 0, 0.12)',
            minWidth: 240,
          }}
        />
      </div>
    </>,
    document.body,
  );
};

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
  if (!visible) return null;

  return createPortal(
    <div style={{ position: 'fixed', left: rect.x, top: rect.y, width: rect.width, zIndex: 9998 }}>
      <Input
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => onCommit()}
        onKeyDown={e => {
          if (e.key === 'Enter') onCommit();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="添加字段描述"
      />
    </div>,
    document.body,
  );
};
