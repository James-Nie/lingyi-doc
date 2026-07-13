import type { BaseFormFieldItem, BaseView, ColumnDef, ColumnType, FilterCondition, GroupRule, BaseSheetModel, SortRule } from '@lingyi-doc/core';
import { getFieldTypeMeta } from './fieldTypeMeta';
import { getRatingConfig, getRatingColumnWidth, isGroupableColumn } from '@lingyi-doc/core';
import { useSheetStore } from '../../store/sheetStore';

export function getActiveBaseView(sheet: BaseSheetModel): BaseView | null {
  if (!sheet.views?.length) return null;
  const id = sheet.activeViewId || sheet.views[0].viewId;
  return sheet.views.find(v => v.viewId === id) || sheet.views[0];
}

/** 确保多维表存在可用的 grid 视图（分组/排序等视图配置依赖） */
export function ensureActiveBaseView(sheet: BaseSheetModel): BaseView {
  let view = getActiveBaseView(sheet);
  if (view) return view;
  if (!sheet.views) sheet.views = [];
  view = {
    viewId: `view_grid_${Date.now()}`,
    viewName: '表格',
    viewType: 'grid',
    config: {},
  };
  sheet.views.push(view);
  sheet.activeViewId = view.viewId;
  return view;
}

export function createFormViewFromSheet(sheet: BaseSheetModel): BaseView {
  const fields = sheet.columnDefs.filter(c => !c.hidden);
  const formFieldItems: BaseFormFieldItem[] = fields.map((col, i) => ({
    fieldId: col.id,
    question: col.name,
    description: '',
    required: col.required ?? i === 0,
    conditionalVisible: false,
  }));

  return {
    viewId: `view_form_${Date.now()}`,
    viewName: '表单',
    viewType: 'form',
    config: {
      formTitle: '表单',
      formDescription: '',
      formFields: formFieldItems.map(f => f.fieldId),
      formFieldItems,
      formExcludedFieldIds: [],
    },
  };
}

export function ensureFormView(sheet: BaseSheetModel): BaseView {
  const existing = sheet.views?.find(v => v.viewType === 'form');
  if (existing) {
    syncFormFieldItems(existing, sheet.columnDefs);
    return existing;
  }
  const formView = createFormViewFromSheet(sheet);
  if (!sheet.views) sheet.views = [];
  sheet.views.push(formView);
  return formView;
}

/** 同步表单字段与表格列：移除已删列；新增列仅自动补入未被用户移出表单的字段 */
export function syncFormFieldItems(view: BaseView, columnDefs: ColumnDef[]): void {
  if (view.viewType !== 'form') return;
  const visibleCols = columnDefs.filter(c => !c.hidden);
  const existing = view.config.formFieldItems || [];
  const existingIds = new Set(existing.map(f => f.fieldId));
  const excludedIds = new Set(view.config.formExcludedFieldIds || []);
  const next: BaseFormFieldItem[] = [];

  for (const item of existing) {
    const col = columnDefs.find(c => c.id === item.fieldId);
    if (col && !col.hidden) {
      next.push({
        ...item,
        question: item.question || col.name,
      });
    }
  }

  for (const col of visibleCols) {
    if (!existingIds.has(col.id) && !excludedIds.has(col.id)) {
      next.push({
        fieldId: col.id,
        question: col.name,
        description: '',
        required: false,
        conditionalVisible: false,
      });
    }
  }

  view.config.formFieldItems = next;
  view.config.formFields = next.map(f => f.fieldId);
  view.config.formExcludedFieldIds = [...excludedIds].filter(id => columnDefs.some(c => c.id === id));
}

export function updateBaseViewGroupRules(view: BaseView, rules: GroupRule[]): void {
  view.group = rules.length > 0 ? rules : undefined;
}

export function updateBaseViewFilter(view: BaseView, filter: FilterCondition[]): void {
  view.filter = filter.length > 0 ? filter : undefined;
}

export function updateBaseViewSort(view: BaseView, sort: SortRule[]): void {
  view.sort = sort.length > 0 ? sort : undefined;
}

export function updateCollapsedGroupKeys(view: BaseView, keys: string[]): void {
  view.config = {
    ...view.config,
    collapsedGroupKeys: keys.length > 0 ? keys : undefined,
  };
}

export function expandGroupPathKeys(collapsedKeys: string[], groupPathKey: string): string[] {
  const keys = new Set(collapsedKeys);
  const parts = groupPathKey.split('|');
  for (let i = 1; i <= parts.length; i++) {
    keys.delete(parts.slice(0, i).join('|'));
  }
  return Array.from(keys);
}

export function toggleGroupByField(view: BaseView, fieldId: string, columnDefs?: ColumnDef[]): GroupRule[] {
  if (columnDefs) {
    const colDef = columnDefs.find(c => c.id === fieldId);
    if (colDef && !isGroupableColumn(colDef)) {
      return view.group ?? [];
    }
  }
  const existing = view.group ?? [];
  const idx = existing.findIndex(r => r.fieldId === fieldId);
  if (idx >= 0) {
    const next = existing.filter((_, i) => i !== idx);
    updateBaseViewGroupRules(view, next);
    return next;
  }
  const next = [...existing, { fieldId, order: 'asc' as const }];
  updateBaseViewGroupRules(view, next);
  return next;
}

export function isFieldGrouped(view: BaseView | null, fieldId: string): boolean {
  return !!view?.group?.some(r => r.fieldId === fieldId);
}

/** 根据 sheet.activeViewId 同步编辑器视图状态（加载文档 / 切换工作表后调用） */
export function applySheetStoreFromBaseView(sheet: BaseSheetModel): void {
  const view = getActiveBaseView(sheet);
  if (view?.viewType === 'form') {
    useSheetStore.getState().setCurrentView('form');
    useSheetStore.getState().setFormEditorTab('edit');
    return;
  }
  useSheetStore.getState().setCurrentView(view?.viewType ?? 'grid');
}

export function activateBaseView(sheet: BaseSheetModel, viewId: string): BaseView | null {
  const view = sheet.views?.find(v => v.viewId === viewId);
  if (!view) return null;
  sheet.activeViewId = viewId;
  if (view.viewType === 'form') {
    syncFormFieldItems(view, sheet.columnDefs);
  }
  return view;
}

export function getFormFieldItems(view: BaseView | null): BaseFormFieldItem[] {
  return view?.config.formFieldItems || [];
}

export function updateFormViewConfig(
  view: BaseView,
  patch: Partial<BaseView['config']>,
): void {
  view.config = { ...view.config, ...patch };
}

export function updateFormFieldItem(
  view: BaseView,
  fieldId: string,
  patch: Partial<BaseFormFieldItem>,
): void {
  const items = getFormFieldItems(view);
  const idx = items.findIndex(f => f.fieldId === fieldId);
  if (idx < 0) return;
  const next = items.map((item, i) => (i === idx ? { ...item, ...patch } : item));
  view.config.formFieldItems = next;
  view.config.formFields = next.map(f => f.fieldId);
}

export function reorderFormFieldItems(view: BaseView, fromIndex: number, toIndex: number): void {
  const items = [...getFormFieldItems(view)];
  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) return;
  const [moved] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, moved);
  view.config.formFieldItems = items;
  view.config.formFields = items.map(f => f.fieldId);
}

/** 仅从表单视图移除字段，不删除表格列 */
export function removeFormFieldItem(view: BaseView, fieldId: string): void {
  const items = getFormFieldItems(view).filter(f => f.fieldId !== fieldId);
  view.config.formFieldItems = items;
  view.config.formFields = items.map(f => f.fieldId);
  const excluded = new Set(view.config.formExcludedFieldIds || []);
  excluded.add(fieldId);
  view.config.formExcludedFieldIds = [...excluded];
}

export function addAllFieldsToForm(view: BaseView, columnDefs: ColumnDef[]): void {
  view.config.formExcludedFieldIds = [];
  syncFormFieldItems(view, columnDefs);
}

export function removeAllFieldsFromForm(view: BaseView, columnDefs: ColumnDef[]): void {
  view.config.formFieldItems = [];
  view.config.formFields = [];
  view.config.formExcludedFieldIds = columnDefs.filter(c => !c.hidden).map(c => c.id);
}

export function addFieldToForm(view: BaseView, columnDef: ColumnDef): void {
  const items = getFormFieldItems(view);
  if (items.some(f => f.fieldId === columnDef.id)) return;
  const next = [...items, {
    fieldId: columnDef.id,
    question: columnDef.name,
    description: '',
    required: false,
    conditionalVisible: false,
  }];
  view.config.formFieldItems = next;
  view.config.formFields = next.map(f => f.fieldId);
  view.config.formExcludedFieldIds = (view.config.formExcludedFieldIds || []).filter(id => id !== columnDef.id);
}

/** 字段从表格删除后，同步清理表单配置 */
export function purgeFormField(view: BaseView, fieldId: string): void {
  const items = getFormFieldItems(view).filter(f => f.fieldId !== fieldId);
  view.config.formFieldItems = items;
  view.config.formFields = items.map(f => f.fieldId);
  view.config.formExcludedFieldIds = (view.config.formExcludedFieldIds || []).filter(id => id !== fieldId);
}

const DEFAULT_SELECT_OPTIONS = [
  { id: 'opt_1', name: '选项1', color: '#3370FF' },
  { id: 'opt_2', name: '选项2', color: '#FF8800' },
];

function getDefaultColumnWidth(type: ColumnType): number {
  switch (type) {
    case 'boolean': return 70;
    case 'autoNumber': return 80;
    case 'date':
    case 'datetime': return 110;
    case 'rating': return 90;
    case 'progress': return 110;
    default: return 160;
  }
}

/** 在表格中创建默认字段定义 */
export function createDefaultColumnDef(type: ColumnType, colIndex: number): ColumnDef {
  const meta = getFieldTypeMeta(type);
  const field: ColumnDef = {
    id: `col_${Date.now()}_${colIndex}`,
    name: meta.name,
    type,
    width: getDefaultColumnWidth(type),
  };
  if (type === 'select' || type === 'multiSelect') {
    field.options = DEFAULT_SELECT_OPTIONS.map(o => ({ ...o }));
  }
  if (type === 'rating') {
    field.ratingIcon = 'star';
    field.ratingMin = 1;
    field.ratingMax = 5;
    field.width = getRatingColumnWidth(getRatingConfig(field));
  }
  return field;
}

/** 获取未加入表单的字段（含移出表单的字段），按表格列顺序 */
export function getOptionalFormFields(view: BaseView, columnDefs: ColumnDef[]): ColumnDef[] {
  const inFormIds = new Set(getFormFieldItems(view).map(f => f.fieldId));
  return columnDefs.filter(c => !c.hidden && !inFormIds.has(c.id));
}
