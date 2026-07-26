import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button, Input, Menu } from 'antd';
import { DeleteOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import type { ColumnDef } from '@lingyi-doc/core-types';
import { FieldConfigPanel } from './FieldConfigPanel';

interface FieldManagePopoverProps {
  columnDefs: ColumnDef[];
  onToggleFieldVisibility: (fieldId: string, visible: boolean) => void;
  onReorderFields: (fromIndex: number, toIndex: number) => void;
  onConfirmField: (fieldId: string | null, fieldData: Partial<ColumnDef>) => void;
  onDeleteField: (fieldId: string) => void;
  onEditingChange?: (editing: boolean) => void;
}

const FIELD_TYPE_ICONS: Record<string, string> = {
  text: 'A≡', number: '123', select: '◉', multiSelect: '☑', date: '📅',
  datetime: '📅', boolean: '☐', user: '👤', attachment: '📎',
  link: '🔗', email: '@', phone: '📞', formula: 'ƒ', autoNumber: '#',
  rating: '★', progress: '▓', currency: '¥', percent: '%',
  createdBy: '👤+', updatedBy: '👤✎', createdTime: '📅+', updatedTime: '📅✎',
};

const LIST_WIDTH = 260;
const EDITOR_WIDTH = 420;
const PANEL_HEIGHT = 480;
const ROW_MENU_WIDTH = 120;

interface FieldRowMenuState {
  fieldId: string;
  isTitle: boolean;
  x: number;
  y: number;
}

const FieldRowContextMenu: React.FC<{
  menu: FieldRowMenuState;
  onEdit: (fieldId: string) => void;
  onDelete: (fieldId: string) => void;
  onClose: () => void;
}> = ({ menu, onEdit, onDelete, onClose }) => {
  const items: MenuProps['items'] = [
    {
      key: 'edit',
      icon: <EditOutlined />,
      label: '编辑',
      onClick: () => { onEdit(menu.fieldId); onClose(); },
    },
  ];
  if (!menu.isTitle) {
    items.push({
      key: 'delete',
      icon: <DeleteOutlined />,
      label: '删除',
      danger: true,
      onClick: () => { onDelete(menu.fieldId); onClose(); },
    });
  }

  return createPortal(
    <>
      <div
        data-sheet-keep-selection
        style={{ position: 'fixed', inset: 0, zIndex: 400 }}
        onMouseDown={e => e.stopPropagation()}
        onClick={onClose}
      />
      <div
        data-sheet-keep-selection
        style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 401 }}
        onClick={e => e.stopPropagation()}
      >
        <Menu
          items={items}
          style={{
            borderRadius: 8,
            border: '1px solid #e8e8e8',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            minWidth: ROW_MENU_WIDTH,
          }}
        />
      </div>
    </>,
    document.body,
  );
};

export const FieldManagePopover: React.FC<FieldManagePopoverProps> = ({
  columnDefs, onToggleFieldVisibility, onReorderFields,
  onConfirmField, onDeleteField, onEditingChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editingNewField, setEditingNewField] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [showMenuFieldId, setShowMenuFieldId] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<FieldRowMenuState | null>(null);
  const [hoverFieldId, setHoverFieldId] = useState<string | null>(null);

  const isEditing = editingNewField || editingFieldId !== null;

  useEffect(() => {
    onEditingChange?.(isEditing);
  }, [isEditing, onEditingChange]);

  const filteredFields = columnDefs.filter(f =>
    !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const editingField = editingNewField
    ? null
    : columnDefs.find(c => c.id === editingFieldId) || null;

  const closeEditor = useCallback(() => {
    setEditingFieldId(null);
    setEditingNewField(false);
  }, []);

  const handleEditField = useCallback((fieldId: string) => {
    setEditingFieldId(fieldId);
    setEditingNewField(false);
    setShowMenuFieldId(null);
    setRowMenu(null);
  }, []);

  const handleAddField = useCallback(() => {
    setEditingFieldId(null);
    setEditingNewField(true);
  }, []);

  const handleConfirm = useCallback((fieldData: Partial<ColumnDef>) => {
    onConfirmField(editingNewField ? null : editingFieldId, fieldData);
    closeEditor();
  }, [editingNewField, editingFieldId, onConfirmField, closeEditor]);

  const handleDragStart = useCallback((index: number) => setDraggingIndex(index), []);
  const handleDragEnd = useCallback(() => setDraggingIndex(null), []);

  const handleDrop = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggingIndex === null || draggingIndex === index) return;
    onReorderFields(draggingIndex, index);
    setDraggingIndex(null);
  }, [draggingIndex, onReorderFields]);

  const openRowMenu = useCallback((fieldId: string, isTitle: boolean, anchor: HTMLElement) => {
    if (showMenuFieldId === fieldId) {
      setShowMenuFieldId(null);
      setRowMenu(null);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    setShowMenuFieldId(fieldId);
    setRowMenu({
      fieldId,
      isTitle,
      x: rect.right + 4,
      y: rect.top - 4,
    });
  }, [showMenuFieldId]);

  const closeRowMenu = useCallback(() => {
    setShowMenuFieldId(null);
    setRowMenu(null);
  }, []);

  const handleDeleteField = useCallback((fieldId: string) => {
    onDeleteField(fieldId);
    closeRowMenu();
    closeEditor();
  }, [onDeleteField, closeRowMenu, closeEditor]);

  return (
    <div style={{ position: 'relative', width: LIST_WIDTH, height: PANEL_HEIGHT }}>
      <div style={{
        width: LIST_WIDTH,
        height: PANEL_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '10px 12px', flexShrink: 0 }}>
          <Input
            data-sheet-keep-selection
            allowClear
            size="small"
            placeholder="搜索"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '2px 6px', minHeight: 0 }}>
          {filteredFields.map((field) => {
            const realIndex = columnDefs.findIndex(c => c.id === field.id);
            const isTitle = realIndex === 0;
            const isHidden = field.hidden;
            const isHovered = hoverFieldId === field.id;
            const isEditingThis = !editingNewField && editingFieldId === field.id;
            const isDragging = draggingIndex === realIndex;
            const showActions = isHovered || showMenuFieldId === field.id || isEditingThis;

            return (
              <div
                key={field.id}
                draggable={!isTitle}
                onDragStart={() => handleDragStart(realIndex)}
                onDragOver={e => e.preventDefault()}
                onDrop={e => handleDrop(e, realIndex)}
                onDragEnd={handleDragEnd}
                onMouseEnter={() => setHoverFieldId(field.id)}
                onMouseLeave={() => setHoverFieldId(null)}
                style={{
                  display: 'flex', alignItems: 'center',
                  padding: '8px 6px', marginBottom: 1, borderRadius: 6,
                  cursor: 'default',
                  background: isHovered || isEditingThis ? '#f5f5f5' : isDragging ? '#f0f0f0' : 'transparent',
                  opacity: isDragging ? 0.7 : 1,
                  minWidth: 0,
                }}
              >
                {isTitle ? (
                  <span style={{ width: 20, marginRight: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} title="标题字段">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2">
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                  </span>
                ) : (
                  <span style={{ width: 20, marginRight: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'grab', color: '#ccc' }} title="拖动排序">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="7" cy="6" r="1.5" /><circle cx="12" cy="6" r="1.5" /><circle cx="17" cy="6" r="1.5" />
                      <circle cx="7" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="17" cy="12" r="1.5" />
                      <circle cx="7" cy="18" r="1.5" /><circle cx="12" cy="18" r="1.5" /><circle cx="17" cy="18" r="1.5" />
                    </svg>
                  </span>
                )}
                <span style={{ fontSize: 13, color: '#666', marginRight: 8, width: 26, textAlign: 'center', flexShrink: 0 }}>
                  {FIELD_TYPE_ICONS[field.type] || '?'}
                </span>
                <span style={{
                  flex: 1, minWidth: 0, fontSize: 13, color: isHidden ? '#bbb' : '#333',
                  textDecoration: isHidden ? 'line-through' : 'none',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {field.name}
                </span>
                {showActions && !isTitle && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onToggleFieldVisibility(field.id, !!isHidden); }}
                    style={{
                      border: 'none', background: 'none', cursor: 'pointer',
                      padding: '2px 4px', display: 'flex', alignItems: 'center', flexShrink: 0,
                    }}
                    title={isHidden ? '显示字段' : '隐藏字段'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isHidden ? '#ccc' : '#666'} strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                )}
                {showActions && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      openRowMenu(field.id, isTitle, e.currentTarget);
                    }}
                    style={{
                      border: 'none',
                      background: showMenuFieldId === field.id ? '#e8e8e8' : 'none',
                      cursor: 'pointer',
                      padding: '2px 6px',
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      color: '#666',
                      flexShrink: 0,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ padding: '8px 12px', borderTop: '1px solid #f0f0f0', flexShrink: 0 }}>
          <button
            type="button"
            onClick={handleAddField}
            style={{
              width: '100%', padding: '8px 12px',
              border: 'none', borderRadius: 6,
              background: editingNewField ? '#f0f4ff' : 'transparent',
              cursor: 'pointer', fontSize: 13,
              color: '#333',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
            新增字段
          </button>
        </div>
      </div>

      {isEditing && (
        <div
          style={{
            position: 'absolute',
            left: LIST_WIDTH + 8,
            top: 0,
            width: EDITOR_WIDTH,
            height: PANEL_HEIGHT,
            background: '#fff',
            border: '1px solid #e8e8e8',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            zIndex: 400,
            overflow: 'visible',
          }}
        >
          <FieldConfigPanel
            key={editingNewField ? 'new-field' : editingFieldId || 'none'}
            embedded
            visible
            field={editingField}
            allFields={columnDefs}
            onClose={closeEditor}
            onConfirm={handleConfirm}
          />
        </div>
      )}

      {rowMenu && (
        <FieldRowContextMenu
          menu={rowMenu}
          onEdit={handleEditField}
          onDelete={handleDeleteField}
          onClose={closeRowMenu}
        />
      )}
    </div>
  );
};
