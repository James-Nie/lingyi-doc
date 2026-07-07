import React, { useState, useCallback } from 'react';
import type { ColumnDef } from '@lingyi-doc/core';

interface BaseSidebarProps {
  columnDefs: ColumnDef[];
  visible: boolean;
  onToggleFieldVisibility: (fieldId: string, visible: boolean) => void;
  onReorderFields: (fromIndex: number, toIndex: number) => void;
  onEditField: (fieldId: string) => void;
  onDeleteField: (fieldId: string) => void;
  onAddField: () => void;
  onClose: () => void;
  selectedFieldId?: string | null;
}

const FIELD_TYPE_ICONS: Record<string, string> = {
  text: 'T', number: '123', select: '◉', multiSelect: '☑', date: '📅',
  datetime: '📅', boolean: '☐', user: '👤', group: '👥', attachment: '📎',
  link: '🔗', email: '@', phone: '📞', formula: 'ƒ', autoNumber: '#',
  rating: '★', progress: '▓', currency: '¥', percent: '%', location: '📍',
  barcode: '||', flow: '➡', lookup: '↗', hyperlink: '🔗',
};

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: '文本', number: '数字', select: '单选', multiSelect: '多选', date: '日期',
  datetime: '日期时间', boolean: '复选框', user: '人员', group: '群组', attachment: '附件',
  link: '链接', email: '邮箱', phone: '电话', formula: '公式', autoNumber: '自动编号',
  rating: '评分', progress: '进度', currency: '货币', percent: '百分比', location: '地理位置',
  barcode: '条码', flow: '流程', lookup: '查找引用', hyperlink: '超链接',
};

export const BaseSidebar: React.FC<BaseSidebarProps> = ({
  columnDefs, visible, onToggleFieldVisibility, onReorderFields,
  onEditField, onDeleteField, onAddField, onClose, selectedFieldId,
}) => {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [hoverFieldId, setHoverFieldId] = useState<string | null>(null);
  const [showMenuFieldId, setShowMenuFieldId] = useState<string | null>(null);

  const handleDragStart = useCallback((index: number) => {
    setDraggingIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggingIndex === null || draggingIndex === index) return;
  }, [draggingIndex]);

  const handleDrop = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggingIndex === null || draggingIndex === index) return;
    onReorderFields(draggingIndex, index);
    setDraggingIndex(null);
  }, [draggingIndex, onReorderFields]);

  const handleDragEnd = useCallback(() => {
    setDraggingIndex(null);
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        width: 280,
        minWidth: 280,
        maxWidth: 280,
        borderRight: '1px solid #e8e8e8',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 10,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #e8e8e8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>字段管理</span>
        <button
          onClick={onClose}
          style={{
            border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 16, color: '#999', padding: '2px 6px',
          }}
        >
          ✕
        </button>
      </div>

      {/* Field List */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        {columnDefs.map((field, index) => {
          const isTitle = index === 0;
          const isHidden = field.hidden;
          const isSelected = selectedFieldId === field.id;
          const isHovered = hoverFieldId === field.id;
          const isDragging = draggingIndex === index;
          const typeIcon = FIELD_TYPE_ICONS[field.type] || '?';
          const typeLabel = FIELD_TYPE_LABELS[field.type] || field.type;

          const rowBg = isSelected
            ? '#e8f0fe'
            : isDragging
            ? '#f0f0f0'
            : isHovered
            ? '#f5f5f5'
            : 'transparent';

          return (
            <div
              key={field.id}
              draggable={!isTitle}
              onDragStart={() => handleDragStart(index)}
              onDragOver={e => handleDragOver(e, index)}
              onDrop={e => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onMouseEnter={() => setHoverFieldId(field.id)}
              onMouseLeave={() => setHoverFieldId(null)}
              onClick={() => onEditField(field.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 12px',
                margin: '0 8px',
                borderRadius: 4,
                cursor: 'pointer',
                background: rowBg,
                border: isDragging ? '1px dashed #1a73e8' : '1px solid transparent',
                opacity: isDragging ? 0.7 : 1,
                transition: 'background 0.15s',
              }}
            >
              {/* Drag Handle or Title Lock */}
              {!isTitle ? (
                <span
                  style={{
                    fontSize: 10, color: '#ccc', marginRight: 6,
                    cursor: 'grab', userSelect: 'none',
                  }}
                >
                  ⋮⋮
                </span>
              ) : (
                <span
                  style={{
                    fontSize: 10, color: '#1a73e8', marginRight: 6,
                  }}
                  title="标题字段"
                >
                  🔒
                </span>
              )}

              {/* Type Icon */}
              <span
                style={{
                  fontSize: 12, color: '#666', marginRight: 8,
                  width: 20, textAlign: 'center', flexShrink: 0,
                }}
                title={typeLabel}
              >
                {typeIcon}
              </span>

              {/* Field Name */}
              <span
                style={{
                  flex: 1, fontSize: 13, color: isHidden ? '#999' : '#333',
                  textDecoration: isHidden ? 'line-through' : 'none',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {field.name}
              </span>

              {/* Visibility Toggle */}
              <button
                onClick={e => {
                  e.stopPropagation();
                  onToggleFieldVisibility(field.id, !isHidden);
                }}
                style={{
                  border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 14, color: isHidden ? '#ccc' : '#666',
                  padding: '2px 6px', marginRight: 2,
                }}
                title={isHidden ? '显示字段' : '隐藏字段'}
              >
                {isHidden ? '🙈' : '👁'}
              </button>

              {/* More Menu */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    setShowMenuFieldId(showMenuFieldId === field.id ? null : field.id);
                  }}
                  style={{
                    border: 'none', background: 'none', cursor: 'pointer',
                    fontSize: 14, color: '#999', padding: '2px 6px',
                  }}
                  title="更多操作"
                >
                  ⋯
                </button>
                {showMenuFieldId === field.id && (
                  <div
                    style={{
                      position: 'absolute', top: 28, right: 0, zIndex: 100,
                      background: '#fff', border: '1px solid #e0e0e0',
                      borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                      padding: 4, minWidth: 140,
                    }}
                  >
                    <button
                      onClick={() => { onEditField(field.id); setShowMenuFieldId(null); }}
                      style={{
                        padding: '6px 10px', width: '100%', border: 'none',
                        background: 'none', cursor: 'pointer', fontSize: 12,
                        textAlign: 'left', color: '#333',
                      }}
                    >
                      ✏ 重命名
                    </button>
                    <button
                      onClick={() => { onEditField(field.id); setShowMenuFieldId(null); }}
                      style={{
                        padding: '6px 10px', width: '100%', border: 'none',
                        background: 'none', cursor: 'pointer', fontSize: 12,
                        textAlign: 'left', color: '#333',
                      }}
                    >
                      🔧 修改字段类型
                    </button>
                    {!isTitle && (
                      <button
                        onClick={() => { onDeleteField(field.id); setShowMenuFieldId(null); }}
                        style={{
                          padding: '6px 10px', width: '100%', border: 'none',
                          background: 'none', cursor: 'pointer', fontSize: 12,
                          textAlign: 'left', color: '#d32f2f',
                        }}
                      >
                        🗑 删除字段
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Field Button */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid #e8e8e8',
        }}
      >
        <button
          onClick={onAddField}
          style={{
            width: '100%', padding: '8px 12px',
            border: '1px dashed #ccc', borderRadius: 4,
            background: '#fafafa', cursor: 'pointer',
            fontSize: 13, color: '#666',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = '#1a73e8';
            (e.currentTarget as HTMLElement).style.color = '#1a73e8';
            (e.currentTarget as HTMLElement).style.background = '#e8f0fe';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = '#ccc';
            (e.currentTarget as HTMLElement).style.color = '#666';
            (e.currentTarget as HTMLElement).style.background = '#fafafa';
          }}
        >
          <span>+</span> 新增字段
        </button>
      </div>

      {/* Click outside to close menu */}
      {showMenuFieldId && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}
          onClick={() => setShowMenuFieldId(null)}
        />
      )}
    </div>
  );
};
