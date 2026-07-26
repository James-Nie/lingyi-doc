import type { BaseFormFieldItem, ColumnDef, ColumnType, FilterCondition, FormDisplayCondition } from '@lingyi-doc/core-types';

export type FormConditionOperator = FilterCondition['operator'];

export interface FormConditionOperatorOption {
  value: FormConditionOperator;
  label: string;
}

const DATE_OPERATORS: FormConditionOperatorOption[] = [
  { value: 'eq', label: '等于' },
  { value: 'gt', label: '晚于' },
  { value: 'lt', label: '早于' },
  { value: 'empty', label: '为空' },
  { value: 'notEmpty', label: '不为空' },
];

const TEXT_OPERATORS: FormConditionOperatorOption[] = [
  { value: 'eq', label: '等于' },
  { value: 'contains', label: '包含' },
  { value: 'empty', label: '为空' },
  { value: 'notEmpty', label: '不为空' },
];

const NUMBER_OPERATORS: FormConditionOperatorOption[] = [
  { value: 'eq', label: '等于' },
  { value: 'gt', label: '大于' },
  { value: 'lt', label: '小于' },
  { value: 'empty', label: '为空' },
  { value: 'notEmpty', label: '不为空' },
];

const SELECT_OPERATORS: FormConditionOperatorOption[] = [
  { value: 'eq', label: '等于' },
  { value: 'empty', label: '为空' },
  { value: 'notEmpty', label: '不为空' },
];

const DEFAULT_OPERATORS: FormConditionOperatorOption[] = [
  { value: 'eq', label: '等于' },
  { value: 'empty', label: '为空' },
  { value: 'notEmpty', label: '不为空' },
];

export function getOperatorsForFieldType(type: ColumnType): FormConditionOperatorOption[] {
  switch (type) {
    case 'date':
    case 'datetime':
      return DATE_OPERATORS;
    case 'text':
    case 'multilineText':
    case 'email':
    case 'phone':
    case 'link':
      return TEXT_OPERATORS;
    case 'number':
    case 'currency':
    case 'percent':
    case 'progress':
    case 'rating':
      return NUMBER_OPERATORS;
    case 'select':
      return SELECT_OPERATORS;
    case 'multiSelect':
      return [
        { value: 'contains', label: '包含' },
        { value: 'empty', label: '为空' },
        { value: 'notEmpty', label: '不为空' },
      ];
    case 'boolean':
      return [
        { value: 'eq', label: '等于' },
        { value: 'empty', label: '为空' },
        { value: 'notEmpty', label: '不为空' },
      ];
    default:
      return DEFAULT_OPERATORS;
  }
}

export function isValueLessOperator(operator: FormConditionOperator): boolean {
  return operator === 'empty' || operator === 'notEmpty';
}

export function createDefaultDisplayCondition(field: ColumnDef): FormDisplayCondition {
  const operators = getOperatorsForFieldType(field.type);
  return {
    id: `cond_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    fieldId: field.id,
    operator: operators[0]?.value ?? 'eq',
    value: '',
  };
}

/** 当前字段之前的表单字段（按表单顺序） */
export function getPrecedingFormFields(
  formItems: BaseFormFieldItem[],
  columnDefs: ColumnDef[],
  currentFieldId: string,
): ColumnDef[] {
  const result: ColumnDef[] = [];
  for (const item of formItems) {
    if (item.fieldId === currentFieldId) break;
    const col = columnDefs.find(c => c.id === item.fieldId);
    if (col) result.push(col);
  }
  return result;
}

export function normalizeDisplayConditions(
  conditions: FormDisplayCondition[] | undefined,
  precedingFields: ColumnDef[],
): FormDisplayCondition[] {
  if (!precedingFields.length) return [];
  const validIds = new Set(precedingFields.map(f => f.id));
  const fallback = precedingFields[0];
  const source = conditions?.length ? conditions : [createDefaultDisplayCondition(fallback)];

  return source.map(cond => {
    const fieldId = validIds.has(cond.fieldId) ? cond.fieldId : fallback.id;
    const field = precedingFields.find(f => f.id === fieldId) ?? fallback;
    const operators = getOperatorsForFieldType(field.type);
    const operator = operators.some(o => o.value === cond.operator)
      ? cond.operator
      : operators[0].value;
    return {
      ...cond,
      fieldId,
      operator,
      value: isValueLessOperator(operator) ? undefined : cond.value,
    };
  });
}

export function getOperatorLabel(
  type: ColumnType,
  operator: FormConditionOperator,
): string {
  return getOperatorsForFieldType(type).find(o => o.value === operator)?.label ?? operator;
}
