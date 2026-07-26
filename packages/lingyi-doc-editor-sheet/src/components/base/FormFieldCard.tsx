import React, { useState } from 'react';
import type { BaseFormFieldItem, CellValue, ColumnDef } from '@lingyi-doc/core-types';
import { BASE_THEME, getRatingConfig } from '@lingyi-doc/core-sheet';
import { RatingInput } from '../editors/RatingInput';
import { FieldConfigPanel } from '../FieldConfigPanel';
import { getFieldTypeMeta } from './fieldTypeMeta';
import { FieldTypeIcon } from './FieldTypeIcon';
import { FormConditionalEditor } from './FormConditionalEditor';
import { FormRecordFieldFill } from './FormRecordFieldFill';
import { createDefaultDisplayCondition, normalizeDisplayConditions } from './formConditionalUtils';

interface FormFieldCardProps {
  item: BaseFormFieldItem;
  columnDef: ColumnDef;
  /** 用于字段重名校验 */
  allFields?: ColumnDef[];
  precedingFields?: ColumnDef[];
  expanded: boolean;
  mode: 'edit' | 'fill';
  fillValue?: CellValue;
  fillResetKey?: number;
  /** 填写态只读（查看历史提交） */
  fillReadOnly?: boolean;
  isLocked?: boolean;
  isDragging?: boolean;
  onExpand: () => void;
  onUpdate: (patch: Partial<BaseFormFieldItem>) => void;
  onUpdateColumnDef?: (patch: Partial<ColumnDef>) => void;
  onRemove: () => void;
  onDeleteField?: () => void;
  onFillChange?: (value: CellValue) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
}

const ToggleSwitch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({
  checked, onChange, disabled,
}) => (
  <label
    style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: disabled ? 'default' : 'pointer', gap: 6 }}
    onClick={e => e.stopPropagation()}
    onMouseDown={e => e.stopPropagation()}
  >
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={e => { e.stopPropagation(); onChange(e.target.checked); }}
      onClick={e => e.stopPropagation()}
      style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
    />
    <span style={{
      width: 36, height: 20, borderRadius: 10, background: checked ? BASE_THEME.primaryColor : '#C9CDD4',
      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
    }}>
      <span style={{
        position: 'absolute', top: 2, left: checked ? 18 : 2, width: 16, height: 16,
        borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
      }} />
    </span>
  </label>
);

const Tooltip: React.FC<{ text: string; children: React.ReactNode }> = ({ text, children }) => {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
          padding: '6px 10px', background: '#1f2329', color: '#fff', fontSize: 12,
          borderRadius: 6, whiteSpace: 'nowrap', zIndex: 20, pointerEvents: 'none',
        }}>
          {text}
          <span style={{
            position: 'absolute', top: '100%', left: '50%', marginLeft: -5,
            border: '5px solid transparent', borderTopColor: '#1f2329',
          }} />
        </span>
      )}
    </span>
  );
};

const FieldActions: React.FC<{
  item: BaseFormFieldItem;
  isLocked?: boolean;
  showRemoveLabel?: boolean;
  onUpdate: (patch: Partial<BaseFormFieldItem>) => void;
  onRemove: () => void;
  onDeleteField?: () => void;
}> = ({ item, isLocked, showRemoveLabel, onUpdate, onRemove, onDeleteField }) => (
  <div
    style={{ display: 'flex', alignItems: 'center', gap: 12 }}
    onClick={e => e.stopPropagation()}
    onMouseDown={e => e.stopPropagation()}
  >
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: BASE_THEME.headerTextColor }}>
      <ToggleSwitch checked={!!item.required} onChange={v => onUpdate({ required: v })} />
      必填
    </span>
    <Tooltip text="仅从表单视图移除，表格字段保留">
      <button type="button" onClick={onRemove} style={{
        border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13,
        color: BASE_THEME.headerTextColor, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 0',
      }}>
        <span style={{
          width: 18, height: 18, borderRadius: '50%', border: `1px solid ${BASE_THEME.gridColor}`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, lineHeight: 1, color: '#8f959e',
        }}>−</span>
        {showRemoveLabel && <span>移出表单</span>}
      </button>
    </Tooltip>
    <span style={{ width: 1, height: 16, background: BASE_THEME.gridColor, flexShrink: 0 }} />
    {isLocked ? (
      <Tooltip text="索引列不能被删除">
        <button type="button" disabled style={{
          border: 'none', background: 'transparent', cursor: 'not-allowed', color: '#dee0e3', fontSize: 16, padding: 2,
        }}>
          🗑
        </button>
      </Tooltip>
    ) : (
      <Tooltip text="删除字段（同时删除表格列）">
        <button type="button" onClick={onDeleteField} style={{
          border: 'none', background: 'transparent', cursor: 'pointer', color: '#8f959e', fontSize: 16, padding: 2,
        }}>
          🗑
        </button>
      </Tooltip>
    )}
  </div>
);

function renderEditPreview(columnDef: ColumnDef) {
  const baseInput: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${BASE_THEME.gridColor}`,
    borderRadius: 6,
    padding: '10px 12px',
    fontSize: 14,
    color: BASE_THEME.cellTextColor,
    background: '#fff',
    outline: 'none',
  };

  if (columnDef.type === 'attachment') {
    return (
      <div style={{
        ...baseInput,
        minHeight: 80,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderStyle: 'dashed',
        color: BASE_THEME.secondaryTextColor,
        background: '#FAFBFC',
      }}>
        填写者上传区
      </div>
    );
  }
  if (columnDef.type === 'select' || columnDef.type === 'multiSelect') {
    return (
      <div style={{ ...baseInput, color: BASE_THEME.secondaryTextColor, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>填写者回答区</span>
        <span style={{ color: '#bbb' }}>▾</span>
      </div>
    );
  }
  if (columnDef.type === 'rating') {
    const config = getRatingConfig(columnDef);
    return (
      <div style={{ padding: '4px 0' }}>
        <RatingInput config={config} value={0} itemSize={22} gap={8} readOnly />
      </div>
    );
  }
  if (columnDef.type === 'multilineText') {
    return (
      <div style={{
        ...baseInput,
        minHeight: 88,
        color: BASE_THEME.secondaryTextColor,
      }}>
        填写者回答区
      </div>
    );
  }
  return <div style={{ ...baseInput, color: BASE_THEME.secondaryTextColor }}>填写者回答区</div>;
}

export const FormFieldCard: React.FC<FormFieldCardProps> = ({
  item, columnDef, allFields = [], precedingFields = [], expanded, mode, fillValue, fillResetKey, fillReadOnly,
  isLocked, isDragging,
  onExpand, onUpdate, onUpdateColumnDef, onRemove, onDeleteField, onFillChange, dragHandleProps,
}) => {
  const meta = getFieldTypeMeta(columnDef.type);
  const questionDisplay = columnDef.name || item.question;
  const [rowHovered, setRowHovered] = useState(false);

  if (mode === 'fill') {
    return (
      <FormRecordFieldFill
        label={questionDisplay ?? ''}
        description={item.description}
        required={item.required}
        columnDef={columnDef}
        value={fillValue ?? { type: 'empty' }}
        resetKey={`${columnDef.id}-${columnDef.ratingIcon ?? 'star'}-${fillResetKey ?? 0}`}
        readOnly={fillReadOnly}
        onChange={v => onFillChange?.(v)}
      />
    );
  }

  if (expanded) {
    return (
      <div style={{
        marginBottom: 16, borderRadius: 8, border: `1px solid ${BASE_THEME.gridColor}`,
        background: '#F5F6F7', overflow: 'hidden',
        boxShadow: isDragging ? '0 4px 16px rgba(51, 112, 255, 0.18)' : undefined,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
          borderBottom: `1px solid ${BASE_THEME.gridColor}`, background: '#F5F6F7',
        }}>
          <span {...dragHandleProps} style={{ cursor: isDragging ? 'grabbing' : 'grab', color: '#bbb', fontSize: 14, userSelect: 'none' }} title="拖动排序">⋮⋮</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: BASE_THEME.headerTextColor, padding: '2px 4px',
          }}>
            <FieldTypeIcon type={columnDef.type} size={16} /><span>{meta.name}</span>
            {isLocked && <span title="锁定字段">🔒</span>}
          </span>
          <div style={{ marginLeft: 'auto' }}>
            <FieldActions
              item={item}
              isLocked={isLocked}
              showRemoveLabel
              onUpdate={onUpdate}
              onRemove={onRemove}
              onDeleteField={onDeleteField}
            />
          </div>
        </div>

        {/* 复用表格视图字段编辑框：标题=字段名，支持改类型/选项等 */}
        <div
          style={{ background: '#fff', height: 460, overflow: 'hidden' }}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
        >
          <FieldConfigPanel
            key={columnDef.id}
            embedded
            visible
            field={columnDef}
            allFields={allFields.length > 0 ? allFields : [columnDef]}
            onClose={onExpand}
            onConfirm={fieldData => {
              onUpdateColumnDef?.(fieldData);
              // 表单问题跟随表格字段名
              onUpdate({ question: '' });
              onExpand();
            }}
          />
        </div>

        <div style={{ padding: '12px 20px 16px', background: '#fff', borderTop: `1px solid ${BASE_THEME.gridColor}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
            <label style={{ width: 72, textAlign: 'right', fontSize: 13, color: BASE_THEME.headerTextColor, flexShrink: 0 }}>问题描述</label>
            <input
              value={item.description || ''}
              onChange={e => onUpdate({ description: e.target.value })}
              placeholder="请输入对该问题的说明"
              style={{
                flex: 1, border: `1px solid ${BASE_THEME.gridColor}`, borderRadius: 6,
                padding: '8px 12px', fontSize: 14, outline: 'none', color: BASE_THEME.cellTextColor,
              }}
            />
          </div>
          <div style={{ borderTop: `1px solid ${BASE_THEME.gridColor}`, paddingTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ToggleSwitch
                checked={!!item.conditionalVisible}
                onChange={v => {
                  if (v && precedingFields.length > 0) {
                    const nextConditions = item.displayConditions?.length
                      ? item.displayConditions
                      : [createDefaultDisplayCondition(precedingFields[0])];
                    onUpdate({ conditionalVisible: v, displayConditions: nextConditions });
                  } else {
                    onUpdate({ conditionalVisible: v });
                  }
                }}
              />
              <span style={{ fontSize: 13, color: BASE_THEME.secondaryTextColor }}>当满足条件时展示该问题</span>
            </div>
            {item.conditionalVisible && (
              <FormConditionalEditor
                conditions={normalizeDisplayConditions(item.displayConditions, precedingFields)}
                precedingFields={precedingFields}
                onChange={displayConditions => onUpdate({ displayConditions })}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onExpand}
      onMouseEnter={() => setRowHovered(true)}
      onMouseLeave={() => setRowHovered(false)}
      style={{
        marginBottom: 12,
        padding: '12px 14px',
        borderRadius: 8,
        border: isDragging ? `1px solid rgba(51, 112, 255, 0.45)` : '1px solid transparent',
        background: isDragging ? 'rgba(51, 112, 255, 0.08)' : 'transparent',
        boxShadow: isDragging ? '0 4px 16px rgba(51, 112, 255, 0.15)' : 'none',
        cursor: 'pointer',
        transition: 'background 0.15s, box-shadow 0.15s, border-color 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span
          {...dragHandleProps}
          onClick={e => e.stopPropagation()}
          style={{ cursor: isDragging ? 'grabbing' : 'grab', color: '#bbb', userSelect: 'none', fontSize: 14, letterSpacing: 1 }}
          title="拖动排序"
        >
          ⋮⋮
        </span>
        <span style={{ fontSize: 14, fontWeight: 500, color: BASE_THEME.cellTextColor }}>
          {item.required && <span style={{ color: '#F54A45', marginRight: 2 }}>*</span>}
          {questionDisplay}
        </span>
        {isLocked && <span style={{ fontSize: 16 }} title="锁定">🔒</span>}
        <div style={{ marginLeft: 'auto' }}>
          <FieldActions
            item={item}
            isLocked={isLocked}
            showRemoveLabel={rowHovered}
            onUpdate={onUpdate}
            onRemove={onRemove}
            onDeleteField={onDeleteField}
          />
        </div>
      </div>
      <div onClick={e => e.stopPropagation()}>{renderEditPreview(columnDef)}</div>
    </div>
  );
};
