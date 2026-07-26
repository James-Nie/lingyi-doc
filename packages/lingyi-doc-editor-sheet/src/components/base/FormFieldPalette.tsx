import React, { useState } from 'react';
import type { BaseView, ColumnDef, ColumnType } from '@lingyi-doc/core-types';
import { BASE_THEME, isSystemColumnType } from '@lingyi-doc/core-sheet';
import { PlusOutlined } from '@ant-design/icons';
import {
  FIELD_TYPE_CATEGORIES,
  FIELD_PALETTE_TYPES,
  getFieldTypeMeta,
} from './fieldTypeMeta';
import { FieldTypeIcon } from './FieldTypeIcon';
import { getOptionalFormFields } from './formViewUtils';

const PALETTE_WIDTH = 248;
const TYPE_BTN_BG = '#F5F6F7';
const TYPE_BTN_HOVER = '#EBEDF0';

interface FormFieldPaletteProps {
  view: BaseView;
  columnDefs: ColumnDef[];
  onAddField: (fieldId: string) => void;
  onAddAll: () => void;
  onRemoveAll: () => void;
  onCreateField: (type: ColumnType) => void;
}

const TypeGridButton: React.FC<{
  type: ColumnType;
  onClick: () => void;
}> = ({ type, onClick }) => {
  const meta = getFieldTypeMeta(type);
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        border: 'none',
        borderRadius: 6,
        background: hovered ? TYPE_BTN_HOVER : TYPE_BTN_BG,
        cursor: 'pointer',
        fontSize: 13,
        color: BASE_THEME.cellTextColor,
        textAlign: 'left',
        transition: 'background 0.15s',
        minWidth: 0,
      }}
    >
      <FieldTypeIcon type={type} size={16} color={BASE_THEME.headerIconColor} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {meta.name}
      </span>
    </button>
  );
};

const OptionalFieldRow: React.FC<{
  columnDef: ColumnDef;
  onAdd: () => void;
}> = ({ columnDef, onAdd }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        background: hovered ? BASE_THEME.rowHoverBg : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      <FieldTypeIcon type={columnDef.type} size={16} color={BASE_THEME.headerIconColor} />
      <span style={{
        flex: 1, minWidth: 0, fontSize: 13, color: BASE_THEME.cellTextColor,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {columnDef.name}
      </span>
      <button
        type="button"
        onClick={onAdd}
        title="加入表单"
        style={{
          width: 22, height: 22, flexShrink: 0,
          border: 'none', borderRadius: 4,
          background: hovered ? '#E8EAED' : 'transparent',
          color: BASE_THEME.secondaryTextColor,
          cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, padding: 0,
        }}
      >
        <PlusOutlined />
      </button>
    </div>
  );
};

export const FormFieldPalette: React.FC<FormFieldPaletteProps> = ({
  view, columnDefs, onAddField, onAddAll, onRemoveAll, onCreateField,
}) => {
  const optionalFields = getOptionalFormFields(view, columnDefs);

  return (
    <div style={{
      width: PALETTE_WIDTH, flexShrink: 0, borderRight: `1px solid ${BASE_THEME.gridColor}`,
      background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* 可选题目 */}
      <div style={{
        padding: '12px 14px 8px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: BASE_THEME.cellTextColor }}>可选题目</span>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onAddAll} style={{
            border: 'none', background: 'none', color: BASE_THEME.primaryColor,
            fontSize: 12, cursor: 'pointer', padding: 0,
          }}>
            全部添加
          </button>
          <button type="button" onClick={onRemoveAll} style={{
            border: 'none', background: 'none', color: BASE_THEME.secondaryTextColor,
            fontSize: 12, cursor: 'pointer', padding: 0,
          }}>
            全部移除
          </button>
        </div>
      </div>

      <div style={{ flexShrink: 0, maxHeight: 180, overflowY: 'auto' }}>
        {optionalFields.length === 0 ? (
          <div style={{
            padding: '12px 14px 16px', fontSize: 12,
            color: BASE_THEME.secondaryTextColor, textAlign: 'center',
          }}>
            暂无可用题目
          </div>
        ) : (
          optionalFields.map(col => (
            <OptionalFieldRow
              key={col.id}
              columnDef={col}
              onAdd={() => onAddField(col.id)}
            />
          ))
        )}
      </div>

      <div style={{ height: 1, background: BASE_THEME.gridColor, margin: '4px 14px 0', flexShrink: 0 }} />

      {/* 新增题目 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0 16px' }}>
        <div style={{
          padding: '0 14px 10px', fontSize: 13, fontWeight: 600,
          color: BASE_THEME.cellTextColor,
        }}>
          新增题目
        </div>

        {FIELD_TYPE_CATEGORIES.map(cat => {
          const types = FIELD_PALETTE_TYPES[cat.key].filter(t => !isSystemColumnType(t));
          if (types.length === 0) return null;
          return (
            <div key={cat.key} style={{ marginBottom: 14 }}>
              <div style={{
                padding: '0 14px 8px', fontSize: 12,
                color: BASE_THEME.secondaryTextColor,
              }}>
                {cat.label}
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                padding: '0 12px',
              }}>
                {types.map(type => (
                  <TypeGridButton
                    key={type}
                    type={type}
                    onClick={() => onCreateField(type)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
