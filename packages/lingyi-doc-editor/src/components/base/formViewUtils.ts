import type { BaseFormFieldItem, BaseView, ColumnDef, ColumnType, SheetModel } from '@lingyi-doc/core';
import { getFieldTypeMeta } from './fieldTypeMeta';
import { getRatingConfig, getRatingColumnWidth } from '@lingyi-doc/core';

export function getActiveBaseView(sheet: SheetModel): BaseView | null {
  if (!sheet.views?.length) return null;
  const id = sheet.activeViewId || sheet.views[0].viewId;
  return sheet.views.find(v => v.viewId === id) || sheet.views[0];
}

export function createFormViewFromSheet(sheet: SheetModel): BaseView {
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

export function ensureFormView(sheet: SheetModel): BaseView {
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

export function activateBaseView(sheet: SheetModel, viewId: string): BaseView | null {
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
