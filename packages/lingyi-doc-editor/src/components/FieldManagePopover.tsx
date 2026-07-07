import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ColumnDef } from '@lingyi-doc/core';
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
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });

  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let x = menu.x;
    let y = menu.y;
    if (x + rect.width > window.innerWidth - 8) {
      x = Math.max(8, window.innerWidth - rect.width - 8);
    }
    if (y + rect.height > window.innerHeight - 8) {
      y = Math.max(8, menu.y - rect.height - 4);
    }
    setPos({ x, y });
  }, [menu.x, menu.y]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const itemStyle: React.CSSProperties = {
    padding: '8px 12px',
    width: '100%',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: 13,
    textAlign: 'left',
    color: '#333',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    borderRadius: 4,
  };

  return createPortal(
    <>
      <div
        data-sheet-keep-selection
        style={{ position: 'fixed', inset: 0, zIndex: 400 }}
        onMouseDown={e => e.stopPropagation()}
        onClick={onClose}
      />
      <div
        ref={menuRef}
        data-sheet-keep-selection
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          zIndex: 401,
          background: '#fff',
          border: '1px solid #e8e8e8',
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          padding: 4,
          minWidth: ROW_MENU_WIDTH,
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => { onEdit(menu.fieldId); onClose(); }}
          style={itemStyle}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f5f5f5'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          编辑
        </button>
        {!menu.isTitle && (
          <button
            type="button"
            onClick={() => { onDelete(menu.fieldId); onClose(); }}
            style={itemStyle}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f5f5f5'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            删除
          </button>
        )}
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
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              data-sheet-keep-selection
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索"
              style={{
                width: '100%', padding: '7px 8px 7px 30px',
                border: '1px solid #e8e8e8', borderRadius: 6,
                fontSize: 13, outline: 'none', boxSizing: 'border-box',
                background: '#fafafa',
              }}
            />
            <svg
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="16.5" y1="16.5" x2="21" y2="21" />
            </svg>
          </div>
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
                <span style={{ fontSize: 13, color: '#666', marginRight: 8, width: 20, textAlign: 'center', flexShrink: 0 }}>
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
