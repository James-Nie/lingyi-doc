import type { BaseFormFieldItem, BaseView, BaseViewType, ColumnDef, ColumnType, FilterCondition, GroupRule, BaseSheetModel, SortRule } from '@lingyi-doc/core-types';
import { applySystemColumnDefaults, getRatingConfig, getRatingColumnWidth, isGroupableColumn, isSystemColumnType } from '@lingyi-doc/core-sheet';
import { getFieldTypeMeta } from './fieldTypeMeta';
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
  const fields = sheet.columnDefs.filter(c => !c.hidden && !isSystemColumnType(c.type));
  const formFieldItems: BaseFormFieldItem[] = fields.map((col, i) => ({
    fieldId: col.id,
    // 空问题表示跟随表格字段名，避免重命名后表单标题不同步
    question: '',
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

/** 同步表单字段与表格列：移除已删/隐藏/系统列；新增列自动补入（用户移出表单的除外） */
export function syncFormFieldItems(view: BaseView, columnDefs: ColumnDef[]): void {
  if (view.viewType !== 'form') return;
  const visibleCols = columnDefs.filter(c => !c.hidden && !isSystemColumnType(c.type));
  const visibleById = new Map(visibleCols.map(c => [c.id, c]));
  const existing = view.config.formFieldItems || [];
  const existingIds = new Set(existing.map(f => f.fieldId));
  const excludedIds = new Set(view.config.formExcludedFieldIds || []);
  const next: BaseFormFieldItem[] = [];

  for (const item of existing) {
    const col = columnDefs.find(c => c.id === item.fieldId);
    // 系统字段永不出现在表单中
    if (col && isSystemColumnType(col.type)) continue;
    const visible = visibleById.get(item.fieldId);
    if (!visible) continue;
    // 问题为空或仍等于字段名 → 跟随表格字段名；自定义文案保留
    const followsFieldName = !item.question || item.question === visible.name;
    next.push({
      ...item,
      question: followsFieldName ? '' : item.question,
    });
  }

  for (const col of visibleCols) {
    if (!existingIds.has(col.id) && !excludedIds.has(col.id)) {
      next.push({
        fieldId: col.id,
        question: '',
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

/** 表格字段变更后，同步所有表单视图 */
export function syncAllFormViews(sheet: BaseSheetModel): void {
  if (!sheet.views?.length) return;
  for (const view of sheet.views) {
    if (view.viewType === 'form') {
      syncFormFieldItems(view, sheet.columnDefs);
    }
  }
}

/**
 * 表格字段重命名时同步表单问题：仍跟随旧字段名的条目改为跟随新名。
 */
export function syncFormFieldRename(
  sheet: BaseSheetModel,
  fieldId: string,
  oldName: string,
  newName: string,
): void {
  if (!oldName || oldName === newName || !sheet.views?.length) return;
  for (const view of sheet.views) {
    if (view.viewType !== 'form') continue;
    const items = view.config.formFieldItems;
    if (!items?.length) continue;
    let changed = false;
    const next = items.map(item => {
      if (item.fieldId !== fieldId) return item;
      if (!item.question || item.question === oldName) {
        changed = true;
        return { ...item, question: '' };
      }
      return item;
    });
    if (changed) {
      view.config.formFieldItems = next;
      view.config.formFields = next.map(f => f.fieldId);
    }
  }
}

export function updateBaseViewGroupRules(view: BaseView, rules: GroupRule[]): void {
  view.group = rules.length > 0 ? rules : undefined;
}

export function updateBaseViewFilter(view: BaseView, filter: FilterCondition[]): void {
  view.filter = filter.length > 0 ? filter : undefined;
  if (!view.filter) {
    view.filterConjunction = undefined;
  }
}

export function updateBaseViewFilterConjunction(view: BaseView, conjunction: 'and' | 'or'): void {
  view.filterConjunction = conjunction === 'or' ? 'or' : undefined;
}

export function updateBaseViewSort(view: BaseView, sort: SortRule[]): void {
  view.sort = sort.length > 0 ? sort : undefined;
}

/** 创建表格视图 */
export function createGridView(sheet: BaseSheetModel, name?: string): BaseView {
  const count = (sheet.views || []).filter(v => v.viewType === 'grid').length;
  return {
    viewId: `view_grid_${Date.now()}`,
    viewName: name || (count > 0 ? `表格 ${count + 1}` : '表格'),
    viewType: 'grid',
    config: {},
  };
}

/** 按类型新建并激活视图（form 复用已有表单视图逻辑） */
export function createAndActivateBaseView(
  sheet: BaseSheetModel,
  viewType: BaseViewType,
): BaseView {
  if (!sheet.views) sheet.views = [];

  let view: BaseView;
  if (viewType === 'form') {
    view = ensureFormView(sheet);
  } else if (viewType === 'kanban') {
    view = createKanbanView(sheet);
    sheet.views.push(view);
  } else if (viewType === 'grid') {
    view = createGridView(sheet);
    sheet.views.push(view);
  } else {
    view = {
      viewId: `view_${viewType}_${Date.now()}`,
      viewName: viewType,
      viewType,
      config: {},
    };
    sheet.views.push(view);
  }

  sheet.activeViewId = view.viewId;
  if (view.viewType === 'kanban') {
    ensureKanbanGroupField(view, sheet.columnDefs);
  }
  return view;
}

export function renameBaseView(sheet: BaseSheetModel, viewId: string, name: string): boolean {
  const view = sheet.views?.find(v => v.viewId === viewId);
  if (!view) return false;
  view.viewName = name.trim() || view.viewName;
  return true;
}

export function duplicateBaseView(sheet: BaseSheetModel, viewId: string): BaseView | null {
  const source = sheet.views?.find(v => v.viewId === viewId);
  if (!source) return null;
  if (!sheet.views) sheet.views = [];
  const copy: BaseView = {
    viewId: `view_${source.viewType}_${Date.now()}`,
    viewName: `${source.viewName || source.viewType} 副本`,
    viewType: source.viewType,
    config: JSON.parse(JSON.stringify(source.config || {})),
    filter: source.filter ? JSON.parse(JSON.stringify(source.filter)) : undefined,
    filterConjunction: source.filterConjunction,
    sort: source.sort ? JSON.parse(JSON.stringify(source.sort)) : undefined,
    group: source.group ? JSON.parse(JSON.stringify(source.group)) : undefined,
    hiddenFields: source.hiddenFields ? [...source.hiddenFields] : undefined,
    frozenCols: source.frozenCols,
  };
  sheet.views.push(copy);
  sheet.activeViewId = copy.viewId;
  return copy;
}

export function deleteBaseView(sheet: BaseSheetModel, viewId: string): BaseView | null {
  if (!sheet.views?.length || sheet.views.length <= 1) return null;
  const idx = sheet.views.findIndex(v => v.viewId === viewId);
  if (idx < 0) return null;
  sheet.views.splice(idx, 1);
  const next = sheet.views[Math.min(idx, sheet.views.length - 1)];
  sheet.activeViewId = next.viewId;
  return next;
}

/** 选择看板默认分组字段：优先 select/multiSelect，否则第一个可分组字段 */
export function pickDefaultKanbanGroupFieldId(columnDefs: ColumnDef[]): string | undefined {
  const groupable = columnDefs.filter(c => !c.hidden && isGroupableColumn(c));
  const selectLike = groupable.find(c => c.type === 'select' || c.type === 'multiSelect');
  return (selectLike || groupable[0])?.id;
}

/** 创建看板视图（写入默认分组字段） */
export function createKanbanView(sheet: BaseSheetModel, groupFieldId?: string): BaseView {
  const fieldId = groupFieldId || pickDefaultKanbanGroupFieldId(sheet.columnDefs);
  const fieldName = fieldId
    ? (sheet.columnDefs.find(c => c.id === fieldId)?.name || '')
    : '';
  return {
    viewId: `view_kanban_${Date.now()}`,
    viewName: fieldName ? `${fieldName} + 看板` : '看板',
    viewType: 'kanban',
    config: fieldId ? { kanbanGroupFieldId: fieldId } : {},
  };
}

export function ensureKanbanGroupField(view: BaseView, columnDefs: ColumnDef[]): void {
  if (view.viewType !== 'kanban') return;
  const current = view.config.kanbanGroupFieldId;
  if (current && columnDefs.some(c => c.id === current && isGroupableColumn(c))) return;
  const next = pickDefaultKanbanGroupFieldId(columnDefs);
  if (next) {
    view.config = { ...view.config, kanbanGroupFieldId: next };
  }
}

export function updateKanbanViewConfig(
  view: BaseView,
  patch: Partial<BaseView['config']>,
): void {
  view.config = { ...view.config, ...patch };
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

/**
 * 打开文档 / 切换工作表时同步视图 UI。
 * 默认进入表格；表单（如问卷）保留；看板等选中不恢复（视图状态仅会话内有效）。
 */
export function applySheetStoreFromBaseView(sheet: BaseSheetModel): void {
  const view = getActiveBaseView(sheet);
  if (view?.viewType === 'form') {
    useSheetStore.getState().setCurrentView('form');
    useSheetStore.getState().setFormEditorTab('edit');
    return;
  }
  const grid = sheet.views?.find(v => v.viewType === 'grid');
  if (grid) {
    sheet.activeViewId = grid.viewId;
  }
  useSheetStore.getState().setCurrentView('grid');
}

export function activateBaseView(sheet: BaseSheetModel, viewId: string): BaseView | null {
  const view = sheet.views?.find(v => v.viewId === viewId);
  if (!view) return null;
  sheet.activeViewId = viewId;
  if (view.viewType === 'form') {
    syncFormFieldItems(view, sheet.columnDefs);
  }
  if (view.viewType === 'kanban') {
    ensureKanbanGroupField(view, sheet.columnDefs);
  }
  return view;
}

export function getFormFieldItems(view: BaseView | null): BaseFormFieldItem[] {
  return view?.config.formFieldItems || [];
}

/** 表单展示用字段列表（永久排除创建人/更新人/创建时间/更新时间） */
export function getVisibleFormFieldItems(
  view: BaseView | null,
  columnDefs: ColumnDef[],
): BaseFormFieldItem[] {
  const byId = new Map(columnDefs.map(c => [c.id, c]));
  return getFormFieldItems(view).filter(item => {
    const col = byId.get(item.fieldId);
    return col && !isSystemColumnType(col.type);
  });
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
  view.config.formExcludedFieldIds = columnDefs
    .filter(c => !c.hidden && !isSystemColumnType(c.type))
    .map(c => c.id);
}

export function addFieldToForm(view: BaseView, columnDef: ColumnDef): void {
  if (isSystemColumnType(columnDef.type)) return;
  const items = getFormFieldItems(view);
  if (items.some(f => f.fieldId === columnDef.id)) return;
  const next = [...items, {
    fieldId: columnDef.id,
    question: '',
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
    case 'createdTime':
    case 'updatedTime': return 150;
    case 'createdBy':
    case 'updatedBy': return 120;
    case 'rating': return 90;
    case 'progress': return 110;
    case 'multilineText': return 220;
    default: return 160;
  }
}

/** 在表格中创建默认字段定义 */
export function createDefaultColumnDef(type: ColumnType, colIndex: number): ColumnDef {
  const meta = getFieldTypeMeta(type);
  let field: ColumnDef = {
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
  if (type === 'currency') {
    field.currencySymbol = '¥';
    field.currencySymbolAlign = 'default';
    field.currencyPrecision = 2;
  }
  field = applySystemColumnDefaults(field);
  return field;
}

/** 获取未加入表单的字段（含移出表单的字段），按表格列顺序；系统字段不出现 */
export function getOptionalFormFields(view: BaseView, columnDefs: ColumnDef[]): ColumnDef[] {
  const inFormIds = new Set(getVisibleFormFieldItems(view, columnDefs).map(f => f.fieldId));
  return columnDefs.filter(c => !c.hidden && !isSystemColumnType(c.type) && !inFormIds.has(c.id));
}
