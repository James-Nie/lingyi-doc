import React, { useState } from 'react';
import type { BaseFormFieldItem, CellValue, ColumnDef } from '@lingyi-doc/core';
import { RATING_ICON_DEFS, BASE_THEME, getRatingConfig } from '@lingyi-doc/core';
import { RatingInput } from '../editors/RatingInput';
import { getFieldTypeMeta } from './fieldTypeMeta';
import { FieldTypeIcon } from './FieldTypeIcon';
import { FormConditionalEditor } from './FormConditionalEditor';
import { FormRecordFieldFill } from './FormRecordFieldFill';
import { createDefaultDisplayCondition, normalizeDisplayConditions } from './formConditionalUtils';

const OPTION_COLORS = ['#3370FF', '#FF8800', '#00BCD4', '#9C27B0', '#4CAF50', '#607D8B'];

interface FormFieldCardProps {
  item: BaseFormFieldItem;
  columnDef: ColumnDef;
  precedingFields?: ColumnDef[];
  expanded: boolean;
  mode: 'edit' | 'fill';
  fillValue?: CellValue;
  fillResetKey?: number;
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
    return <div style={{ ...baseInput, color: BASE_THEME.secondaryTextColor }}>填写者回答区</div>;
}

export const FormFieldCard: React.FC<FormFieldCardProps> = ({
  item, columnDef, precedingFields = [], expanded, mode, fillValue, fillResetKey, isLocked, isDragging,
  onExpand, onUpdate, onUpdateColumnDef, onRemove, onDeleteField, onFillChange, dragHandleProps,
}) => {
  const meta = getFieldTypeMeta(columnDef.type);
  const questionInputValue = item.question ?? columnDef.name;
  const questionDisplay = item.question || columnDef.name;
  const selectOptions = columnDef.options || [];
  const [rowHovered, setRowHovered] = useState(false);

  const handleAddOption = () => {
    const newOption = {
      id: `opt_${Date.now()}_${selectOptions.length}`,
      name: `选项${selectOptions.length + 1}`,
      color: OPTION_COLORS[selectOptions.length % OPTION_COLORS.length],
    };
    onUpdateColumnDef?.({ options: [...selectOptions, newOption] });
  };

  const handleUpdateOptionName = (index: number, name: string) => {
    onUpdateColumnDef?.({
      options: selectOptions.map((opt, i) => (i === index ? { ...opt, name } : opt)),
    });
  };

  const handleRemoveOption = (index: number) => {
    onUpdateColumnDef?.({
      options: selectOptions.filter((_, i) => i !== index),
    });
  };

  const handleCycleOptionColor = (index: number) => {
    const currentIdx = OPTION_COLORS.indexOf(selectOptions[index]?.color || '');
    const nextIdx = (currentIdx + 1) % OPTION_COLORS.length;
    onUpdateColumnDef?.({
      options: selectOptions.map((opt, i) => (
        i === index ? { ...opt, color: OPTION_COLORS[nextIdx] } : opt
      )),
    });
  };

  if (mode === 'fill') {
    return (
      <FormRecordFieldFill
        label={questionDisplay}
        description={item.description}
        required={item.required}
        columnDef={columnDef}
        value={fillValue ?? { type: 'empty' }}
        resetKey={`${columnDef.id}-${columnDef.ratingIcon ?? 'star'}-${fillResetKey ?? 0}`}
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
          <button type="button" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent',
            cursor: 'pointer', fontSize: 13, color: BASE_THEME.headerTextColor, padding: '2px 4px',
          }}>
            <FieldTypeIcon type={columnDef.type} size={16} /><span>{meta.name}</span>
            {isLocked && <span title="锁定字段">🔒</span>}
            <span style={{ color: '#bbb', fontSize: 10 }}>▾</span>
          </button>
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
        <div style={{ padding: '16px 20px', background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
            <label style={{ width: 72, textAlign: 'right', fontSize: 13, color: BASE_THEME.headerTextColor, flexShrink: 0 }}>
              表单问题{item.required && <span style={{ color: '#F54A45' }}>*</span>}
            </label>
            <input
              value={questionInputValue}
              onChange={e => onUpdate({ question: e.target.value })}
              style={{
                flex: 1, border: `1px solid ${BASE_THEME.primaryColor}`, borderRadius: 6,
                padding: '8px 12px', fontSize: 14, outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
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
          {(columnDef.type === 'select' || columnDef.type === 'multiSelect') && (
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <label style={{ width: 72, textAlign: 'right', fontSize: 13, color: BASE_THEME.headerTextColor, flexShrink: 0, paddingTop: 6 }}>选项内容</label>
              <div style={{ flex: 1 }}>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); handleAddOption(); }}
                  style={{ border: 'none', background: 'none', color: BASE_THEME.primaryColor, cursor: 'pointer', fontSize: 13, padding: 0, marginBottom: 8 }}
                >
                  + 添加选项
                </button>
                {selectOptions.map((opt, i) => (
                  <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ color: '#ccc', cursor: 'grab' }}>⋮⋮</span>
                    <button
                      type="button"
                      title="点击切换颜色"
                      onClick={e => { e.stopPropagation(); handleCycleOptionColor(i); }}
                      style={{
                        width: 20, height: 20, borderRadius: '50%', background: opt.color || OPTION_COLORS[i % OPTION_COLORS.length],
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff',
                        border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0,
                      }}
                    >
                      ▾
                    </button>
                    <input
                      value={opt.name}
                      onChange={e => handleUpdateOptionName(i, e.target.value)}
                      onClick={e => e.stopPropagation()}
                      onMouseDown={e => e.stopPropagation()}
                      style={{
                        flex: 1, border: `1px solid ${BASE_THEME.gridColor}`, borderRadius: 6,
                        padding: '6px 10px', fontSize: 13, background: '#fff', outline: 'none',
                      }}
                    />
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); handleRemoveOption(i); }}
                      style={{ border: 'none', background: 'none', color: '#bbb', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 4px' }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {columnDef.type === 'rating' && (
            <>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                <label style={{ width: 72, textAlign: 'right', fontSize: 13, color: BASE_THEME.headerTextColor, flexShrink: 0, paddingTop: 6 }}>图形</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {RATING_ICON_DEFS.slice(0, 8).map(ri => (
                    <button
                      key={ri.key}
                      type="button"
                      title={ri.label}
                      onClick={e => {
                        e.stopPropagation();
                        onUpdateColumnDef?.({ ratingIcon: ri.key });
                      }}
                      style={{
                        width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 6, cursor: 'pointer', background: '#fff',
                        border: (columnDef.ratingIcon || 'star') === ri.key
                          ? `2px solid ${BASE_THEME.primaryColor}`
                          : `1px solid ${BASE_THEME.gridColor}`,
                        fontSize: 18, padding: 0,
                      }}
                    >
                      {ri.char}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <label style={{ width: 72, textAlign: 'right', fontSize: 13, color: BASE_THEME.headerTextColor, flexShrink: 0 }}>分值</label>
                <span style={{ fontSize: 13, color: BASE_THEME.cellTextColor }}>{columnDef.ratingMin ?? 1} ~ {columnDef.ratingMax ?? 5}</span>
              </div>
            </>
          )}
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
        {isLocked && <span style={{ fontSize: 12 }} title="锁定">🔒</span>}
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
