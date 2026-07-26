import type { ColumnDef, ColumnType, FilterCondition } from '@lingyi-doc/core-types';

export type FilterOperatorOption = {
  value: FilterCondition['operator'];
  label: string;
};

const TEXT_OPS: FilterOperatorOption[] = [
  { value: 'eq', label: '等于' },
  { value: 'ne', label: '不等于' },
  { value: 'contains', label: '包含' },
  { value: 'startsWith', label: '开头是' },
  { value: 'endsWith', label: '结尾是' },
  { value: 'empty', label: '为空' },
  { value: 'notEmpty', label: '不为空' },
];

const NUMBER_OPS: FilterOperatorOption[] = [
  { value: 'eq', label: '等于' },
  { value: 'ne', label: '不等于' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '小于等于' },
  { value: 'empty', label: '为空' },
  { value: 'notEmpty', label: '不为空' },
];

const DATE_OPS: FilterOperatorOption[] = [
  { value: 'eq', label: '等于' },
  { value: 'gt', label: '晚于' },
  { value: 'lt', label: '早于' },
  { value: 'empty', label: '为空' },
  { value: 'notEmpty', label: '不为空' },
];

const SELECT_OPS: FilterOperatorOption[] = [
  { value: 'eq', label: '等于' },
  { value: 'ne', label: '不等于' },
  { value: 'empty', label: '为空' },
  { value: 'notEmpty', label: '不为空' },
];

const MULTI_SELECT_OPS: FilterOperatorOption[] = [
  { value: 'contains', label: '包含' },
  { value: 'empty', label: '为空' },
  { value: 'notEmpty', label: '不为空' },
];

const BOOLEAN_OPS: FilterOperatorOption[] = [
  { value: 'eq', label: '等于' },
  { value: 'empty', label: '为空' },
  { value: 'notEmpty', label: '不为空' },
];

const EMPTY_ONLY_OPS: FilterOperatorOption[] = [
  { value: 'empty', label: '为空' },
  { value: 'notEmpty', label: '不为空' },
];

/** 按字段类型返回筛选运算符 */
export function getFilterOperatorsForType(type: ColumnType | undefined): FilterOperatorOption[] {
  switch (type) {
    case 'number':
    case 'currency':
    case 'percent':
    case 'rating':
    case 'progress':
      return NUMBER_OPS;
    case 'date':
    case 'datetime':
    case 'createdTime':
    case 'updatedTime':
      return DATE_OPS;
    case 'select':
      return SELECT_OPS;
    case 'multiSelect':
      return MULTI_SELECT_OPS;
    case 'boolean':
      return BOOLEAN_OPS;
    case 'attachment':
      return EMPTY_ONLY_OPS;
    case 'text':
    case 'multilineText':
    case 'email':
    case 'phone':
    case 'link':
    case 'user':
    case 'createdBy':
    case 'updatedBy':
    case 'formula':
    case 'autoNumber':
    default:
      return TEXT_OPS;
  }
}

export function defaultFilterOperatorForField(field?: ColumnDef): FilterCondition['operator'] {
  return getFilterOperatorsForType(field?.type)[0].value;
}

export function isValueLessFilterOperator(operator: FilterCondition['operator']): boolean {
  return operator === 'empty' || operator === 'notEmpty';
}

export function normalizeFilterCondition(
  cond: FilterCondition,
  field?: ColumnDef,
): FilterCondition {
  const ops = getFilterOperatorsForType(field?.type);
  const operator = ops.some(o => o.value === cond.operator)
    ? cond.operator
    : defaultFilterOperatorForField(field);
  if (isValueLessFilterOperator(operator)) {
    return { fieldId: cond.fieldId, operator };
  }
  return { ...cond, operator };
}
