import { useCallback, useState, type MutableRefObject } from 'react';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import type { BaseViewType, BaseSheetModel, ColumnDef, RecordRow } from '@lingyi-doc/core-types';
import { isGroupableColumn } from '@lingyi-doc/core-sheet';
import {
  ensureActiveBaseView,
  syncAllFormViews,
  toggleGroupByField,
  updateBaseViewFilter,
  updateBaseViewSort,
} from '../../base/formViewUtils';
import { useSheetStore } from '../../../store/sheetStore';

export interface UseBaseColumnMenuOptions {
  enabled: boolean;
  table: FreeTable;
  sheet: BaseSheetModel;
  columnDefs: ColumnDef[];
  sheetRows: RecordRow[];
  dirtyTrackerRef: MutableRefObject<{ markFullRedraw: () => void }>;
  scheduleRender: () => void;
  onOpenFieldConfig?: (fieldId?: string | null) => void;
  onToggleFieldVisibility?: (fieldId: string, visible: boolean) => void;
  onDeleteField?: (fieldId: string) => void;
}

export function useBaseColumnMenu({
  enabled,
  table,
  sheet,
  columnDefs,
  sheetRows,
  dirtyTrackerRef,
  scheduleRender,
  onOpenFieldConfig,
  onToggleFieldVisibility,
  onDeleteField,
}: UseBaseColumnMenuOptions) {
  const [activeSort, setActiveSort] = useState<{ colIndex: number; order: 'asc' | 'desc' } | null>(null);

  const handleEditField = useCallback((colIndex: number) => {
    if (!enabled) return;
    const fieldId = columnDefs[colIndex]?.id;
    if (fieldId) onOpenFieldConfig?.(fieldId);
  }, [enabled, columnDefs, onOpenFieldConfig]);

  const handleEditDescription = useCallback((colIndex: number) => {
    if (!enabled) return;
    const fieldId = columnDefs[colIndex]?.id;
    if (fieldId) onOpenFieldConfig?.(fieldId);
  }, [enabled, columnDefs, onOpenFieldConfig]);

  const handleCopyField = useCallback((colIndex: number) => {
    if (!enabled) return;
    const sourceDef = columnDefs[colIndex];
    if (!sourceDef) return;
    const newField: ColumnDef = {
      ...sourceDef,
      id: `col_${Date.now()}_${colIndex}`,
      name: `${sourceDef.name} 副本`,
    };
    columnDefs.splice(colIndex + 1, 0, newField);
    table.insertColumns(colIndex + 1, 1);
    table.setColumnWidth(colIndex + 1, newField.width || 160);
    syncAllFormViews(sheet);
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    useSheetStore.getState().setStatusText(`已复制字段「${sourceDef.name}」`);
  }, [columnDefs, table, sheet, dirtyTrackerRef, scheduleRender]);

  const handleHideField = useCallback((colIndex: number) => {
    if (!enabled) return;
    const fieldId = columnDefs[colIndex]?.id;
    if (fieldId) {
      onToggleFieldVisibility?.(fieldId, false);
      dirtyTrackerRef.current.markFullRedraw();
      scheduleRender();
    }
  }, [columnDefs, onToggleFieldVisibility, dirtyTrackerRef, scheduleRender]);

  const handleInsertColumn = useCallback((colIndex: number, direction: 'left' | 'right') => {
    if (!enabled) return;
    const insertIndex = direction === 'left' ? colIndex : colIndex + 1;
    table.insertColumns(insertIndex, 1);
    table.setColumnWidth(insertIndex, 160);
    const newField: ColumnDef = {
      id: `col_${Date.now()}_${insertIndex}`,
      name: '新字段',
      type: 'text',
      width: 160,
    };
    columnDefs.splice(insertIndex, 0, newField);
    syncAllFormViews(sheet);
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    useSheetStore.getState().setStatusText('已插入新字段');
  }, [columnDefs, table, sheet, dirtyTrackerRef, scheduleRender]);

  const handleFreezeColumn = useCallback((colIndex: number) => {
    if (!enabled) return;
    const currentFrozen = sheet.freezeState?.frozenCols || 0;
    const isFrozen = currentFrozen > colIndex;
    if (isFrozen) {
      sheet.freezeState = { ...sheet.freezeState, frozenCols: 0 };
    } else {
      sheet.freezeState = { ...sheet.freezeState, frozenCols: colIndex + 1 };
    }
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    useSheetStore.getState().setStatusText(isFrozen ? '已取消冻结' : `已冻结至「${columnDefs[colIndex]?.name || ''}」`);
  }, [sheet, columnDefs, dirtyTrackerRef, scheduleRender]);

  const handleSort = useCallback((colIndex: number, order: 'asc' | 'desc') => {
    if (!enabled) return;
    const fieldId = columnDefs[colIndex]?.id;
    if (!fieldId) return;
    setActiveSort({ colIndex, order });
    const view = ensureActiveBaseView(sheet);
    const existing = view.sort ?? [];
    const next = existing.some(r => r.fieldId === fieldId)
      ? existing.map(r => (r.fieldId === fieldId ? { ...r, order } : r))
      : [...existing, { fieldId, order }];
    updateBaseViewSort(view, next);
    table.notifyChange(null);
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    useSheetStore.getState().setStatusText(`已按「${columnDefs[colIndex]?.name}」${order === 'asc' ? '升序' : '降序'}排序`);
  }, [columnDefs, sheet, table, dirtyTrackerRef, scheduleRender, enabled]);

  const handleGroupByField = useCallback((fieldId: string) => {
    if (!enabled) return;
    const colDef = columnDefs.find(c => c.id === fieldId);
    if (colDef && !isGroupableColumn(colDef)) {
      useSheetStore.getState().setStatusText('该字段类型不支持分组');
      return;
    }
    const view = ensureActiveBaseView(sheet);
    const next = toggleGroupByField(view, fieldId, columnDefs);
    table.notifyChange(null);
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    const fieldName = columnDefs.find(c => c.id === fieldId)?.name || '';
    useSheetStore.getState().setStatusText(
      next.some(r => r.fieldId === fieldId)
        ? `已按「${fieldName}」分组`
        : `已取消按「${fieldName}」分组`,
    );
  }, [columnDefs, sheet, table, dirtyTrackerRef, scheduleRender, enabled]);

  const handleFilterByField = useCallback((fieldId: string) => {
    if (!enabled) return;
    const fieldName = columnDefs.find(c => c.id === fieldId)?.name || '';
    const view = ensureActiveBaseView(sheet);
    const existing = view.filter ?? [];
    const already = existing.some(c => c.fieldId === fieldId);
    if (!already) {
      const colDef = columnDefs.find(c => c.id === fieldId);
      const type = colDef?.type ?? 'text';
      const operator = (type === 'attachment')
        ? 'notEmpty' as const
        : (type === 'multiSelect' || type === 'text' || type === 'multilineText' || type === 'email' || type === 'phone' || type === 'link' || type === 'user')
          ? 'contains' as const
          : 'eq' as const;
      updateBaseViewFilter(view, [...existing, { fieldId, operator, value: '' }]);
      table.notifyChange(null);
      dirtyTrackerRef.current.markFullRedraw();
      scheduleRender();
      useSheetStore.getState().setStatusText(`已添加筛选：${fieldName}`);
    } else {
      useSheetStore.getState().setStatusText(`字段「${fieldName}」已在筛选条件中`);
    }
  }, [columnDefs, sheet, table, dirtyTrackerRef, scheduleRender, enabled]);

  const handleCreateView = useCallback((fieldId: string, viewType: string) => {
    if (!enabled) return;
    const fieldName = columnDefs.find(c => c.id === fieldId)?.name || '';
    const viewName = `${fieldName} + ${viewType === 'calendar' ? '日历' : '看板'}`;
    const config = viewType === 'kanban'
      ? { kanbanGroupFieldId: fieldId }
      : viewType === 'calendar'
        ? { calendarDateFieldId: fieldId }
        : {};
    const newView = {
      viewId: `view_${Date.now()}`,
      viewName,
      viewType: viewType as BaseViewType,
      config,
    };
    if (!sheet.views) sheet.views = [];
    sheet.views.push(newView);
    sheet.activeViewId = newView.viewId;
    useSheetStore.getState().setCurrentView(viewType as BaseViewType);
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    useSheetStore.getState().setStatusText(`已创建视图「${viewName}」`);
  }, [columnDefs, sheet, dirtyTrackerRef, scheduleRender]);

  const handleDeleteField = useCallback((colIndex: number) => {
    if (!enabled) return;
    const fieldId = columnDefs[colIndex]?.id;
    if (!fieldId) return;
    onDeleteField?.(fieldId);
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [columnDefs, onDeleteField, dirtyTrackerRef, scheduleRender]);

  return {
    activeSort,
    handleEditField,
    handleEditDescription,
    handleCopyField,
    handleHideField,
    handleInsertColumn,
    handleFreezeColumn,
    handleSort,
    handleGroupByField,
    handleFilterByField,
    handleCreateView,
    handleDeleteField,
  };
}
