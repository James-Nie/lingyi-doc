import React, { useMemo } from 'react';
import { DatePicker, Tooltip } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { ColumnDef, FormDisplayCondition } from '@lingyi-doc/core-types';
import { BASE_THEME, getSelectTagColors } from '@lingyi-doc/core-sheet';
import { FieldTypeIcon } from './FieldTypeIcon';
import {
  createDefaultDisplayCondition,
  getOperatorLabel,
  getOperatorsForFieldType,
  isValueLessOperator,
  type FormConditionOperator,
} from './formConditionalUtils';
import { FormDropdown } from './FormDropdown';

interface FormConditionalEditorProps {
  conditions: FormDisplayCondition[];
  precedingFields: ColumnDef[];
  onChange: (conditions: FormDisplayCondition[]) => void;
}

function updateCondition(
  conditions: FormDisplayCondition[],
  id: string,
  patch: Partial<FormDisplayCondition>,
): FormDisplayCondition[] {
  return conditions.map(c => (c.id === id ? { ...c, ...patch } : c));
}

function ConditionValueEditor({
  field,
  operator,
  value,
  onChange,
}: {
  field: ColumnDef;
  operator: FormConditionOperator;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (isValueLessOperator(operator)) {
    return (
      <div style={{
        minHeight: 32,
        padding: '5px 10px',
        borderRadius: 6,
        border: `1px solid ${BASE_THEME.gridColor}`,
        background: '#F5F6F7',
        fontSize: 13,
        color: BASE_THEME.secondaryTextColor,
        display: 'flex',
        alignItems: 'center',
      }}>
        无需填写
      </div>
    );
  }

  if (field.type === 'date' || field.type === 'datetime') {
    const dateValue = typeof value === 'string' && value
      ? dayjs(value)
      : typeof value === 'number'
        ? dayjs(value)
        : null;
    return (
      <DatePicker
        value={dateValue?.isValid() ? dateValue : null}
        format={field.type === 'datetime' ? 'YYYY-MM-DD HH:mm' : 'YYYY/MM/DD'}
        placeholder="yyyy/mm/dd"
        showTime={field.type === 'datetime'}
        onChange={(next: Dayjs | null) => onChange(next ? next.valueOf() : '')}
        style={{ width: '100%', minHeight: 32 }}
        getPopupContainer={() => document.body}
      />
    );
  }

  if (field.type === 'select' && field.options?.length) {
    const strValue = String(value ?? '');
    return (
      <FormDropdown
        value={strValue}
        options={field.options.map(opt => {
          const colors = getSelectTagColors(opt.color || '#646A73');
          return {
            value: opt.id,
            searchText: opt.name,
            label: (
              <span style={{
                display: 'inline-flex',
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: 12,
                background: colors.bg,
                color: colors.text,
              }}>
                {opt.name}
              </span>
            ),
          };
        })}
        placeholder="选择选项"
        onChange={v => onChange(v)}
        renderValue={selected => {
          if (!selected) return <span style={{ color: BASE_THEME.secondaryTextColor }}>选择选项</span>;
          const opt = field.options?.find(o => o.id === selected.value);
          if (!opt) return selected.label;
          const colors = getSelectTagColors(opt.color || '#646A73');
          return (
            <span style={{
              display: 'inline-flex',
              padding: '2px 8px',
              borderRadius: 999,
              fontSize: 12,
              background: colors.bg,
              color: colors.text,
            }}>
              {opt.name}
            </span>
          );
        }}
      />
    );
  }

  if (field.type === 'boolean') {
    const strValue = value === true || value === 'true' ? 'true' : value === false || value === 'false' ? 'false' : '';
    return (
      <FormDropdown
        value={strValue}
        options={[
          { value: 'true', label: '是', searchText: '是' },
          { value: 'false', label: '否', searchText: '否' },
        ]}
        placeholder="选择"
        onChange={v => onChange(v === 'true')}
      />
    );
  }

  const inputType = ['number', 'currency', 'percent', 'progress', 'rating'].includes(field.type)
    ? 'number'
    : 'text';

  return (
    <input
      type={inputType}
      value={value == null ? '' : String(value)}
      placeholder="输入值"
      onChange={e => onChange(e.target.value)}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      style={{
        width: '100%',
        minHeight: 32,
        padding: '5px 10px',
        borderRadius: 6,
        border: `1px solid ${BASE_THEME.gridColor}`,
        fontSize: 13,
        color: BASE_THEME.cellTextColor,
        outline: 'none',
        boxSizing: 'border-box',
      }}
    />
  );
}

export const FormConditionalEditor: React.FC<FormConditionalEditorProps> = ({
  conditions,
  precedingFields,
  onChange,
}) => {
  const fieldOptions = useMemo(
    () => precedingFields.map(field => ({
        value: field.id,
        searchText: field.name,
        label: (
          <>
            <FieldTypeIcon type={field.type} size={16} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{field.name}</span>
          </>
        ),
      })),
    [precedingFields],
  );

  if (!precedingFields.length) {
    return (
      <div style={{ marginTop: 12, fontSize: 13, color: BASE_THEME.secondaryTextColor }}>
        当前字段之前暂无其他字段，无法设置展示条件
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
      <div style={{ fontSize: 13, color: BASE_THEME.secondaryTextColor, marginBottom: 10 }}>
        设置展示条件
      </div>

      {conditions.map(cond => {
        const field = precedingFields.find(f => f.id === cond.fieldId) ?? precedingFields[0];
        const operators = getOperatorsForFieldType(field.type);
        const operatorOptions = operators.map(op => ({
          value: op.value,
          label: op.label,
          searchText: op.label,
        }));

        return (
          <div key={cond.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1.1, minWidth: 0 }}>
              <FormDropdown
                value={field.id}
                options={fieldOptions}
                searchable
                searchPlaceholder="搜索字段"
                onChange={fieldId => {
                  const nextField = precedingFields.find(f => f.id === fieldId) ?? precedingFields[0];
                  const nextOps = getOperatorsForFieldType(nextField.type);
                  onChange(updateCondition(conditions, cond.id, {
                    fieldId,
                    operator: nextOps[0]?.value ?? 'eq',
                    value: '',
                  }));
                }}
                renderValue={selected => {
                  if (!selected) return null;
                  const col = precedingFields.find(f => f.id === selected.value);
                  if (!col) return selected.label;
                  return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <FieldTypeIcon type={col.type} size={16} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.name}</span>
                    </span>
                  );
                }}
              />
            </div>
            <div style={{ flex: 0.9, minWidth: 0 }}>
              <FormDropdown
                value={cond.operator}
                options={operatorOptions}
                onChange={operator => {
                  onChange(updateCondition(conditions, cond.id, {
                    operator,
                    value: isValueLessOperator(operator) ? undefined : '',
                  }));
                }}
                renderValue={() => getOperatorLabel(field.type, cond.operator)}
              />
            </div>
            <div style={{ flex: 1.1, minWidth: 0 }}>
              <ConditionValueEditor
                field={field}
                operator={cond.operator}
                value={cond.value}
                onChange={value => onChange(updateCondition(conditions, cond.id, { value }))}
              />
            </div>
            {conditions.length > 1 && (
              <Tooltip title="删除条件">
                <button
                  type="button"
                  onClick={() => onChange(conditions.filter(c => c.id !== cond.id))}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#86909c',
                    cursor: 'pointer',
                    fontSize: 16,
                    padding: '4px 2px',
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </Tooltip>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => onChange([...conditions, createDefaultDisplayCondition(precedingFields[0])])}
        style={{
          border: 'none',
          background: 'transparent',
          color: BASE_THEME.primaryColor,
          cursor: 'pointer',
          fontSize: 13,
          padding: '4px 0',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        + 添加条件
      </button>
    </div>
  );
};
