import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { message } from 'antd';
import dayjs from 'dayjs';
import {
  Workbook,
  getRatingConfig,
  getRatingColumnWidth,
  applySystemColumnDefaults,
  isSystemColumnType,
  isBaseSheet,
  prepareGroupedRecordIndices,
  type DocumentApiResponse,
} from '@lingyi-doc/core';
import type { SheetType } from '@lingyi-doc/core';
import {
  Toolbar, BaseToolbar, FieldConfigPanel, StatusBar, SheetTabs, useSheetStore, BASE_THEME,
  ensureFormView, activateBaseView, getActiveBaseView, ensureActiveBaseView,
  syncAllFormViews, syncFormFieldRename,
  updateFormViewConfig, updateBaseViewGroupRules, updateBaseViewFilter, updateBaseViewFilterConjunction, updateBaseViewSort,
  updateKanbanViewConfig, ensureKanbanGroupField, createAndActivateBaseView,
  renameBaseView, duplicateBaseView, deleteBaseView,
  FreeformSheetEditor, BaseSheetEditor, DocCommentPanel,
} from '@lingyi-doc/editor-pro';
import type { FormSharePanelContext } from '@lingyi-doc/editor-pro';
import { CalendarConfigPanel, GanttConfigPanel, formatCalendarTitle } from '@lingyi-doc/editor-sheet';
import type { FieldOption, TableOption } from '@lingyi-doc/editor-sheet';
import { FormSharePanel } from '../components/share/FormSharePanel';
import type { GroupRule, FilterCondition, SortRule, BaseViewType } from '@lingyi-doc/core';
import { ChartInsertDialog, ChartEditor } from '@lingyi-doc/editor-pro';
import { WorkflowViewContainer } from '../components/baseWorkflow/WorkflowViewContainer';
import { DocumentBar } from '../components/DocumentBar';
import { CollabStatusBar } from '../components/CollabStatusBar';
import {
  DocumentHistoryPanelSlot,
  DocumentHistoryToolbarSlot,
} from '../components/history/DocumentHistoryChrome';
import { useDashboardController } from '../hooks/useDashboardController';
import { useWorkbookSession } from '../hooks/useWorkbookSession';
import { appPath } from '../utils/appPaths';
import type { EditorAccessProps } from '../types/editorAccess';

export const EditorPage: React.FC<{ docId?: string; prefetched?: DocumentApiResponse; embedded?: boolean } & EditorAccessProps> = ({
  docId: docIdProp,
  prefetched,
  embedded,
  readOnly = false,
  canEdit = true,
  effectiveViewMode = 'edit',
  onTogglePreview,
  breadcrumbItems,
}) => {
  const { docId: routeDocId } = useParams<{ docId: string }>();
  const docId = docIdProp ?? routeDocId;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const deepLinkSheetId = searchParams.get('sheetId');
  const deepLinkViewId = searchParams.get('viewId');
  const deepLinkRecordId = searchParams.get('recordId');
  const deepLinkPreferGrid = searchParams.get('view') === 'grid';
  const workbookRef = useRef<Workbook>();

  const {
    activeDashboardId,
    setActiveDashboardId,
    setDashboardRevision,
    ensureDashboardsLoaded,
    resetDashboardSession,
    handleRenameDashboard,
    handleDeleteDashboard,
    handlePrefetchDashboards,
    handleSelectDashboard,
    handleCreateDashboard,
    handleDashboardChange,
  } = useDashboardController({ docId, workbookRef });

  const session = useWorkbookSession({
    docId,
    navigate,
    prefetched,
    readOnly,
    canEdit,
    workbookRef,
    deepLinkSheetId,
    deepLinkViewId,
    deepLinkRecordId,
    deepLinkPreferGrid,
    resetDashboardSession: resetDashboardSession,
    ensureDashboardsLoaded: ensureDashboardsLoaded,
    setActiveDashboardId,
    setDashboardRevision,
  });

  const {
    workbook,
    activeTable,
    isBase,
    docTitle,
    loading,
    exporting,
    saveStatus,
    activeSheetId,
    sheetMetaList,
    lastModified,
    history,
    markDirty,
    collabUsers,
    collabState,
    activeCellEditors,
    commentsEnabled,
    canComment,
    commentCtrl,
    activeSheetCommentThreads,
    handleSelectSheetComment,
    handleAddSheetComment,
    handleDownloadAs,
    handlePrint,
    handleTitleChange,
    handleSwitchSheet,
    handleAddSheet,
    handleRenameSheet,
    handleDeleteSheet,
    handleInsertChart,
  } = session;

  const [fieldConfigVisible, setFieldConfigVisible] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [showChartDialog, setShowChartDialog] = useState(false);
  const [selectedChartId, setSelectedChartId] = useState<string | null>(null);
  const [viewListTick, setViewListTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const sel = useSheetStore.getState().selectionRange;
      setSelectedCount(sel
        ? (sel.end.row - sel.start.row + 1) * (sel.end.col - sel.start.col + 1)
        : 0);
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const currentView = useSheetStore(s => s.currentView);
  // sheetInfos 优先用 meta 列表（含未加载 sheet），渐进加载回退到 workbook.sheets
  const sheetInfos = (sheetMetaList.length > 0
    ? sheetMetaList
    : (workbook?.sheets.map(s => ({ id: s.id, name: s.name, type: s.type })) || [])) as Array<{
      id: string;
      name: string;
      type: SheetType;
    }>;

  useEffect(() => {
    if (!activeTable || !isBaseSheet(activeTable.sheet)) return;
    const view = getActiveBaseView(activeTable.sheet);
    if (view) useSheetStore.getState().setCurrentView(view.viewType);
  }, [activeTable, activeSheetId, isBase]);

  const handleGenerateForm = useCallback(() => {
    if (!activeTable || !isBaseSheet(activeTable.sheet)) return;
    const formView = ensureFormView(activeTable.sheet);
    activateBaseView(activeTable.sheet, formView.viewId);
    useSheetStore.getState().setCurrentView('form');
    useSheetStore.getState().setFormEditorTab('edit');
    activeTable.notifyChange(null);
    markDirty();
    useSheetStore.getState().setStatusText('已创建表单视图');
  }, [activeTable, markDirty]);

  const [calendarDataVersion, setCalendarDataVersion] = useState(0);
  const bumpCalendarDataVersion = useCallback(() => {
    setCalendarDataVersion(v => v + 1);
  }, []);

  const [ganttDataVersion, setGanttDataVersion] = useState(0);
  const bumpGanttDataVersion = useCallback(() => {
    setGanttDataVersion(v => v + 1);
  }, []);

  const handleSelectView = useCallback((viewId: string) => {
    if (!activeTable || !isBaseSheet(activeTable.sheet)) return;
    const view = activateBaseView(activeTable.sheet, viewId);
    if (view) {
      workbook?.switchDashboard(undefined);
      setActiveDashboardId(null);
      useSheetStore.getState().setCurrentView(view.viewType);
      // 切离表格 Canvas 时不要 notifyChange，避免卸载过程中残留 rAF 访问已 destroy 的 LayerManager
      if (view.viewType === 'grid') {
        activeTable.notifyChange(null);
      } else if (view.viewType === 'calendar') {
        bumpCalendarDataVersion();
      } else if (view.viewType === 'gantt') {
        bumpGanttDataVersion();
      }
      // 视图选中状态仅会话内有效，不落库
      setViewListTick(v => v + 1);
    }
  }, [activeTable, workbook, bumpCalendarDataVersion, bumpGanttDataVersion]);

  const handleCreateView = useCallback((viewType: BaseViewType) => {
    if (!activeTable || !isBaseSheet(activeTable.sheet)) return;

    // workflow 由 WorkflowEditorContainer 内部创建并绑定，不通过 createAndActivateBaseView
    if (viewType === 'workflow') {
      const sheet = activeTable.sheet;
      const newView = {
        viewId: `view_workflow_${Date.now()}`,
        viewName: '工作流',
        viewType: 'workflow' as const,
        config: { workflowId: 'new' },
      };
      sheet.views = [...(sheet.views || []), newView];
      sheet.activeViewId = newView.viewId;
      workbook?.switchDashboard(undefined);
      setActiveDashboardId(null);
      useSheetStore.getState().setCurrentView('workflow');
      setViewListTick(v => v + 1);
      markDirty();
      return;
    }

    const view = createAndActivateBaseView(activeTable.sheet, viewType);
    workbook?.switchDashboard(undefined);
    setActiveDashboardId(null);
    useSheetStore.getState().setCurrentView(view.viewType);
    if (view.viewType === 'form') {
      useSheetStore.getState().setFormEditorTab('edit');
    }
    if (view.viewType === 'grid') {
      activeTable.notifyChange(null);
    }
    setViewListTick(v => v + 1);
    markDirty();
    useSheetStore.getState().setStatusText(`已创建${view.viewName}`);
  }, [activeTable, workbook, markDirty]);

  const handleRenameView = useCallback((viewId: string, name: string) => {
    if (!activeTable || !isBaseSheet(activeTable.sheet)) return;
    if (!renameBaseView(activeTable.sheet, viewId, name)) return;
    activeTable.notifyChange(null);
    setViewListTick(v => v + 1);
    markDirty();
    useSheetStore.getState().setStatusText('已重命名视图');
  }, [activeTable, markDirty]);

  const handleDuplicateView = useCallback((viewId: string) => {
    if (!activeTable || !isBaseSheet(activeTable.sheet)) return;
    const view = duplicateBaseView(activeTable.sheet, viewId);
    if (!view) return;
    workbook?.switchDashboard(undefined);
    setActiveDashboardId(null);
    useSheetStore.getState().setCurrentView(view.viewType);
    if (view.viewType === 'grid') {
      activeTable.notifyChange(null);
    }
    setViewListTick(v => v + 1);
    markDirty();
    useSheetStore.getState().setStatusText(`已创建副本「${view.viewName}」`);
  }, [activeTable, workbook, markDirty]);

  const handleDeleteView = useCallback((viewId: string) => {
    if (!activeTable || !isBaseSheet(activeTable.sheet)) return;
    const next = deleteBaseView(activeTable.sheet, viewId);
    if (!next) {
      message.warning('至少保留一个视图');
      return;
    }
    workbook?.switchDashboard(undefined);
    setActiveDashboardId(null);
    useSheetStore.getState().setCurrentView(next.viewType);
    if (next.viewType === 'grid') {
      activeTable.notifyChange(null);
    }
    setViewListTick(v => v + 1);
    markDirty();
    useSheetStore.getState().setStatusText('已删除视图');
  }, [activeTable, workbook, markDirty]);

  /** 工作流保存/恢复后，将 workflowId 持久化到工作流视图配置，切换视图后仍能恢复 */
  const handleWorkflowBoundToView = useCallback((id: string) => {
    if (!activeTable || !isBaseSheet(activeTable.sheet)) return;
    const view = getActiveBaseView(activeTable.sheet);
    if (view?.viewType !== 'workflow' || !id) return;
    if (view.config.workflowId === id) return;
    view.config.workflowId = id;
    activeTable.notifyChange(null);
    setViewListTick(v => v + 1);
    markDirty();
  }, [activeTable, markDirty]);

  const handleFormViewChange = useCallback(() => {
    markDirty();
  }, [markDirty]);

  const handleKanbanViewChange = useCallback(() => {
    markDirty();
  }, [markDirty]);

  const [kanbanConfigTick, setKanbanConfigTick] = useState(0);
  const bumpKanbanConfig = useCallback(() => {
    setKanbanConfigTick(v => v + 1);
    markDirty();
  }, [markDirty]);

  const [calendarConfigTick, setCalendarConfigTick] = useState(0);
  const bumpCalendarConfig = useCallback(() => {
    setCalendarConfigTick(v => v + 1);
    markDirty();
  }, [markDirty]);

  const activeFormView = (() => {
    if (!isBase || !activeTable || !isBaseSheet(activeTable.sheet)) return null;
    const sheet = activeTable.sheet;
    return sheet.views?.find(v => v.viewId === sheet.activeViewId && v.viewType === 'form')
      ?? sheet.views?.find(v => v.viewType === 'form')
      ?? null;
  })();

  const activeKanbanView = (() => {
    void kanbanConfigTick;
    if (!isBase || !activeTable || !isBaseSheet(activeTable.sheet)) return null;
    const sheet = activeTable.sheet;
    const view = sheet.views?.find(v => v.viewId === sheet.activeViewId && v.viewType === 'kanban')
      ?? null;
    if (view) ensureKanbanGroupField(view, sheet.columnDefs);
    return view;
  })();

  const activeCalendarView = (() => {
    void calendarConfigTick;
    if (!isBase || !activeTable || !isBaseSheet(activeTable.sheet)) return null;
    const sheet = activeTable.sheet;
    return sheet.views?.find(v => v.viewId === sheet.activeViewId && v.viewType === 'calendar')
      ?? null;
  })();

  const handleCalendarViewChange = useCallback(() => {
    if (!activeCalendarView || !activeTable) return;
    activeTable.notifyChange(null);
    bumpCalendarConfig();
    bumpCalendarDataVersion();
  }, [activeCalendarView, activeTable, bumpCalendarConfig, bumpCalendarDataVersion]);

  const [calendarViewType, setCalendarViewType] = useState<'month' | 'week' | 'day'>('month');
  const [calendarTitle, setCalendarTitle] = useState('');
  const [calendarNoDateCount, setCalendarNoDateCount] = useState(0);
  const [calendarNoDateOpen, setCalendarNoDateOpen] = useState(false);
  const [calendarConfigOpen, setCalendarConfigOpen] = useState(false);
  const [calendarCurrentDate, setCalendarCurrentDate] = useState(dayjs());

  const handleCalendarNavigate = useCallback((direction: 'prev' | 'next' | 'today') => {
    const offset = direction === 'next' ? 1 : direction === 'prev' ? -1 : 0;
    if (direction === 'today') {
      setCalendarCurrentDate(dayjs());
    } else {
      const unit = calendarViewType === 'month' ? 'month' : calendarViewType === 'week' ? 'week' : 'day';
      setCalendarCurrentDate(prev => prev.add(offset, unit));
    }
  }, [calendarViewType]);

  const handleCalendarViewTypeChange = useCallback((type: 'month' | 'week' | 'day') => {
    setCalendarViewType(type);
    if (activeCalendarView) {
      updateKanbanViewConfig(activeCalendarView, { calendarViewType: type });
      activeTable?.notifyChange(null);
      bumpCalendarConfig();
    }
  }, [activeCalendarView, activeTable, bumpCalendarConfig]);

  const handleOpenNoDate = useCallback(() => {
    setCalendarNoDateOpen(true);
  }, []);

  const handleCloseNoDate = useCallback(() => {
    setCalendarNoDateOpen(false);
  }, []);

  const handleCalendarConfigClick = useCallback(() => {
    setCalendarConfigOpen(true);
  }, []);

  const handleCalendarConfigClose = useCallback(() => {
    setCalendarConfigOpen(false);
  }, []);

  const handleCalendarConfigChange = useCallback((config: Partial<import('@lingyi-doc/core').BaseViewConfig>) => {
    if (!activeCalendarView || !activeTable) return;
    updateKanbanViewConfig(activeCalendarView, config);
    activeTable.notifyChange(null);
    bumpCalendarConfig();
    bumpCalendarDataVersion();
  }, [activeCalendarView, activeTable, bumpCalendarConfig, bumpCalendarDataVersion]);

  const handleCalendarNoDateCountChange = useCallback((count: number) => {
    setCalendarNoDateCount(count);
  }, []);

  const [ganttConfigTick, setGanttConfigTick] = useState(0);
  const bumpGanttConfig = useCallback(() => {
    setGanttConfigTick(v => v + 1);
    markDirty();
  }, [markDirty]);

  const activeGanttView = (() => {
    void ganttConfigTick;
    if (!isBase || !activeTable || !isBaseSheet(activeTable.sheet)) return null;
    const sheet = activeTable.sheet;
    return sheet.views?.find(v => v.viewId === sheet.activeViewId && v.viewType === 'gantt')
      ?? null;
  })();

  const handleGanttViewChange = useCallback(() => {
    if (!activeGanttView || !activeTable) return;
    activeTable.notifyChange(null);
    bumpGanttConfig();
    bumpGanttDataVersion();
  }, [activeGanttView, activeTable, bumpGanttConfig, bumpGanttDataVersion]);

  const [ganttViewType, setGanttViewType] = useState<'week' | 'month' | 'quarter'>('week');
  const [ganttConfigOpen, setGanttConfigOpen] = useState(false);
  const [ganttCurrentDate, setGanttCurrentDate] = useState(dayjs());

  const handleGanttNavigate = useCallback((direction: 'prev' | 'next' | 'today') => {
    const offset = direction === 'next' ? 1 : direction === 'prev' ? -1 : 0;
    if (direction === 'today') {
      setGanttCurrentDate(dayjs());
    } else {
      // 周视图按周切换，月/季视图按月切换
      const unit = ganttViewType === 'week' ? 'week' : 'month';
      setGanttCurrentDate(prev => prev.add(offset, unit));
    }
  }, [ganttViewType]);

  const handleGanttViewTypeChange = useCallback((type: 'week' | 'month' | 'quarter') => {
    setGanttViewType(type);
    if (activeGanttView) {
      updateKanbanViewConfig(activeGanttView, { ganttTimeUnit: type });
      activeTable?.notifyChange(null);
      bumpGanttConfig();
    }
  }, [activeGanttView, activeTable, bumpGanttConfig]);

  const handleGanttConfigClick = useCallback(() => {
    setGanttConfigOpen(true);
  }, []);

  const handleGanttConfigClose = useCallback(() => {
    setGanttConfigOpen(false);
  }, []);

  const handleGanttConfigChange = useCallback((config: Partial<import('@lingyi-doc/core').BaseViewConfig>) => {
    if (!activeGanttView || !activeTable) return;
    updateKanbanViewConfig(activeGanttView, config);
    activeTable.notifyChange(null);
    bumpGanttConfig();
    bumpGanttDataVersion();
  }, [activeGanttView, activeTable, bumpGanttConfig, bumpGanttDataVersion]);

  const handleKanbanGroupFieldChange = useCallback((fieldId: string) => {
    if (!activeKanbanView || !activeTable) return;
    updateKanbanViewConfig(activeKanbanView, { kanbanGroupFieldId: fieldId });
    activeTable.notifyChange(null);
    bumpKanbanConfig();
    useSheetStore.getState().setStatusText('已更新分组依据');
  }, [activeKanbanView, activeTable, bumpKanbanConfig]);

  const handleKanbanCardFieldsChange = useCallback((fieldIds: string[]) => {
    if (!activeKanbanView || !activeTable) return;
    updateKanbanViewConfig(activeKanbanView, { kanbanCardFields: fieldIds });
    activeTable.notifyChange(null);
    bumpKanbanConfig();
  }, [activeKanbanView, activeTable, bumpKanbanConfig]);

  const handleKanbanShowFieldNamesChange = useCallback((show: boolean) => {
    if (!activeKanbanView || !activeTable) return;
    updateKanbanViewConfig(activeKanbanView, { kanbanShowFieldNames: show });
    activeTable.notifyChange(null);
    bumpKanbanConfig();
  }, [activeKanbanView, activeTable, bumpKanbanConfig]);

  const handleKanbanCoverFieldIdChange = useCallback((fieldId: string | null) => {
    if (!activeKanbanView || !activeTable) return;
    updateKanbanViewConfig(activeKanbanView, { kanbanCoverFieldId: fieldId });
    activeTable.notifyChange(null);
    bumpKanbanConfig();
  }, [activeKanbanView, activeTable, bumpKanbanConfig]);

  const renderFormSharePanel = useCallback((ctx: FormSharePanelContext) => {
    if (!docId || !activeFormView || readOnly) return null;
    return (
      <FormSharePanel
        docId={docId}
        sheetId={activeSheetId}
        formView={activeFormView}
        anchorRef={ctx.anchorRef}
        open={ctx.open}
        onClose={ctx.onClose}
        onConfigChange={(patch) => {
          updateFormViewConfig(activeFormView, patch);
          handleFormViewChange();
        }}
        onToast={msg => useSheetStore.getState().setStatusText(msg)}
      />
    );
  }, [docId, activeSheetId, activeFormView, readOnly, handleFormViewChange]);

  const handleConfirmField = useCallback((fieldId: string | null, fieldData: Partial<import('@lingyi-doc/core').ColumnDef>) => {
    if (!activeTable || !isBaseSheet(activeTable.sheet)) return;
    const sheet = activeTable.sheet;
    if (fieldId) {
      const idx = sheet.columnDefs.findIndex(c => c.id === fieldId);
      if (idx >= 0) {
        const existing = sheet.columnDefs[idx];
        const oldName = existing.name;
        let updated = { ...existing, ...fieldData } as import('@lingyi-doc/core').ColumnDef;
        updated = applySystemColumnDefaults(updated);
        sheet.columnDefs[idx] = updated;
        if (updated.type === 'rating') {
          const width = getRatingColumnWidth(getRatingConfig(updated));
          updated.width = width;
          activeTable.setColumnWidth(idx, width);
        }
        if (fieldData.name !== undefined && fieldData.name !== oldName) {
          syncFormFieldRename(sheet, fieldId, oldName, updated.name);
        }
        if (isSystemColumnType(updated.type)) {
          activeTable.backfillSystemFieldColumn(idx);
        }
        syncAllFormViews(sheet);
        useSheetStore.getState().setStatusText('字段已更新');
      }
    } else {
      const colIndex = sheet.columnDefs.length;
      activeTable.insertColumns(colIndex, 1);
      let newField: import('@lingyi-doc/core').ColumnDef = {
        id: `col_${Date.now()}_${colIndex}`,
        name: fieldData.name || '新字段',
        type: fieldData.type || 'text',
        width: fieldData.type === 'boolean' ? 70
          : fieldData.type === 'autoNumber' ? 80
          : fieldData.type === 'date' ? 110
          : fieldData.type === 'createdTime' || fieldData.type === 'updatedTime' ? 150
          : fieldData.type === 'createdBy' || fieldData.type === 'updatedBy' ? 120
          : fieldData.type === 'rating' ? 90
          : fieldData.type === 'progress' ? 110
          : 160,
        ...fieldData,
      };
      if (newField.type === 'rating') {
        newField.width = getRatingColumnWidth(getRatingConfig(newField));
      }
      newField = applySystemColumnDefaults(newField);
      sheet.columnDefs.push(newField);
      activeTable.setColumnWidth(colIndex, newField.width || 160);
      if (isSystemColumnType(newField.type)) {
        activeTable.backfillSystemFieldColumn(colIndex);
      }
      syncAllFormViews(sheet);
      useSheetStore.getState().setStatusText(`已添加字段「${newField.name}」`);
    }
    activeTable.syncColumnLayout();
    activeTable.notifyChange(null);
  }, [activeTable]);

  const handleToggleFieldVisibility = useCallback((fieldId: string, visible: boolean) => {
    if (!activeTable || !isBaseSheet(activeTable.sheet)) return;
    const field = activeTable.sheet.columnDefs.find(c => c.id === fieldId);
    if (field) {
      field.hidden = !visible;
      activeTable.applyColumnVisibility();
      syncAllFormViews(activeTable.sheet);
      activeTable.notifyChange(null);
      useSheetStore.getState().setStatusText(`${visible ? '显示' : '隐藏'}字段「${field.name}」`);
    }
  }, [activeTable]);

  const handleReorderFields = useCallback((fromIndex: number, toIndex: number) => {
    if (!activeTable) return;
    activeTable.moveColumns(fromIndex, toIndex);
    activeTable.syncColumnLayout();
    useSheetStore.getState().setStatusText('字段顺序已调整');
  }, [activeTable]);

  const handleDeleteField = useCallback((fieldId: string) => {
    if (!activeTable || !isBaseSheet(activeTable.sheet)) return;
    const idx = activeTable.sheet.columnDefs.findIndex(c => c.id === fieldId);
    if (idx > 0) {
      activeTable.deleteColumns(idx, 1);
      activeTable.syncColumnLayout();
      syncAllFormViews(activeTable.sheet);
      activeTable.notifyChange(null);
    }
  }, [activeTable]);

  const handleFieldConfigConfirm = useCallback((fieldData: Partial<import('@lingyi-doc/core').ColumnDef>) => {
    handleConfirmField(editingFieldId, fieldData);
    setFieldConfigVisible(false);
  }, [handleConfirmField, editingFieldId]);

  const handleAddRecord = useCallback(() => {
    if (!activeTable || !isBaseSheet(activeTable.sheet)) return;
    const rowCount = activeTable.rowCount;
    activeTable.insertRows(rowCount, 1);
    const autoNumCol = activeTable.sheet.columnDefs.findIndex(c => c.type === 'autoNumber');
    if (autoNumCol >= 0) {
      activeTable.setCellValue(rowCount, autoNumCol, { type: 'text', text: String(rowCount) });
    }
    useSheetStore.getState().setStatusText('已添加记录');
  }, [activeTable]);

  const activeBaseView = isBase && activeTable && isBaseSheet(activeTable.sheet)
    ? ensureActiveBaseView(activeTable.sheet)
    : null;
  const groupRules = activeBaseView?.group ?? [];
  const filterConditions = activeBaseView?.filter ?? [];
  const filterConjunction = activeBaseView?.filterConjunction ?? 'and';
  const sortRules = activeBaseView?.sort ?? [];

  const filteredRecordCount = useMemo(() => {
    if (!activeTable || !isBaseSheet(activeTable.sheet)) return activeTable?.rowCount ?? 0;
    if (!filterConditions.length) return activeTable.rowCount;
    const sheet = activeTable.sheet;
    return prepareGroupedRecordIndices({
      rowCount: sheet.rowCount,
      filter: filterConditions,
      filterConjunction,
      columnDefs: sheet.columnDefs,
      getFieldValue: (row, fieldId) => {
        const colIndex = sheet.columnDefs.findIndex(c => c.id === fieldId);
        return colIndex >= 0 ? activeTable.getCell(row, colIndex)?.value : undefined;
      },
    }).length;
  }, [activeTable, filterConditions, filterConjunction]);

  const handleGroupRulesChange = useCallback((rules: GroupRule[]) => {
    if (!activeTable || !isBaseSheet(activeTable.sheet)) return;
    const view = ensureActiveBaseView(activeTable.sheet);
    updateBaseViewGroupRules(view, rules);
    activeTable.notifyChange(null);
    setViewListTick(v => v + 1);
    markDirty();
    useSheetStore.getState().setStatusText(
      rules.length > 0 ? `已设置 ${rules.length} 级分组` : '已取消分组',
    );
  }, [activeTable, markDirty]);

  const handleFilterChange = useCallback((conditions: FilterCondition[]) => {
    if (!activeTable || !isBaseSheet(activeTable.sheet)) return;
    const view = ensureActiveBaseView(activeTable.sheet);
    updateBaseViewFilter(view, conditions);
    activeTable.notifyChange(null);
    setViewListTick(v => v + 1);
    markDirty();
  }, [activeTable, markDirty]);

  const handleFilterConjunctionChange = useCallback((conjunction: 'and' | 'or') => {
    if (!activeTable || !isBaseSheet(activeTable.sheet)) return;
    const view = ensureActiveBaseView(activeTable.sheet);
    updateBaseViewFilterConjunction(view, conjunction);
    activeTable.notifyChange(null);
    setViewListTick(v => v + 1);
    markDirty();
  }, [activeTable, markDirty]);

  const handleSortChange = useCallback((rules: SortRule[]) => {
    if (!activeTable || !isBaseSheet(activeTable.sheet)) return;
    const view = ensureActiveBaseView(activeTable.sheet);
    updateBaseViewSort(view, rules);
    activeTable.notifyChange(null);
    setViewListTick(v => v + 1);
    markDirty();
    useSheetStore.getState().setStatusText(
      rules.length > 0 ? `已设置 ${rules.length} 条排序` : '已清除排序',
    );
  }, [activeTable, markDirty]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#666' }}>
        正在加载文档...
      </div>
    );
  }

  if (!workbook || !activeTable) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, color: '#666' }}>
        <span>文档数据异常，无法打开</span>
        <button
          type="button"
          onClick={() => navigate(appPath.home, { replace: true })}
          style={{ padding: '6px 16px', border: '1px solid #dee0e3', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
        >
          返回主页
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: isBase ? BASE_THEME.pageBg : '#fff' }}>
      {(!embedded || breadcrumbItems) && (
        <DocumentBar
          docId={docId || null}
          title={docTitle}
          saveStatus={saveStatus}
          onTitleChange={handleTitleChange}
          lastModified={lastModified}
          docType={isBase ? 'base' : 'freeform'}
          exporting={exporting}
          onDownloadAs={!isBase ? handleDownloadAs : undefined}
          onPrint={handlePrint}
          canEdit={canEdit}
          effectiveViewMode={effectiveViewMode}
          onTogglePreview={onTogglePreview}
          breadcrumbItems={breadcrumbItems}
          onOpenHistory={() => { void history.openHistory(); }}
        />
      )}
      <DocumentHistoryToolbarSlot
        historyOpen={history.historyOpen}
        selectedIndex={history.selectedHistoryIndex}
        items={history.historyItems}
        canRestore={canEdit && !readOnly}
        restoring={history.historyRestoring}
        previewLoading={history.historyPreviewLoading}
        onRestore={() => { void history.restoreHistoryVersion(); }}
        onPrev={history.goPrevHistory}
        onNext={history.goNextHistory}
        onClose={() => { void history.closeHistory(); }}
      />

      {!readOnly && !history.historyOpen && !isBase && (
        <Toolbar
          table={activeTable}
          onInsertChart={() => setShowChartDialog(true)}
          commentsEnabled={commentsEnabled}
          commentPanelOpen={commentCtrl.showCommentPanel}
          onToggleCommentPanel={() => commentCtrl.setShowCommentPanel(v => !v)}
        />
      )}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        background: isBase ? BASE_THEME.pageBg : '#fff',
        padding: isBase ? '8px 12px 12px' : 0,
      }}>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {isBase ? (
            <BaseSheetEditor
              table={activeTable}
              previewMode={readOnly || history.historyOpen}
              selectedChartId={selectedChartId}
              onSelectChart={setSelectedChartId}
              onOpenFieldConfig={fieldId => { setEditingFieldId(fieldId || null); setFieldConfigVisible(true); }}
              onToggleFieldVisibility={handleToggleFieldVisibility}
              onDeleteField={handleDeleteField}
              containerKey={`${docId}-${activeSheetId}`}
              currentView={currentView}
              activeFormView={activeFormView}
              activeKanbanView={activeKanbanView}
              activeCalendarView={activeCalendarView}
              activeGanttView={activeGanttView}
              onSelectView={handleSelectView}
              onCreateView={handleCreateView}
              onRenameView={handleRenameView}
              onDuplicateView={handleDuplicateView}
              onDeleteView={handleDeleteView}
              onFormViewChange={handleFormViewChange}
              onKanbanViewChange={handleKanbanViewChange}
              onCalendarViewChange={handleCalendarViewChange}
              onGanttViewChange={handleGanttViewChange}
              calendarDataVersion={calendarDataVersion}
              calendarCurrentDate={calendarCurrentDate}
              onCalendarCurrentDateChange={setCalendarCurrentDate}
              calendarViewType={calendarViewType}
              onCalendarViewTypeChangeExternal={handleCalendarViewTypeChange}
              calendarNoDateDrawerOpen={calendarNoDateOpen}
              onCalendarNoDateDrawerOpenChange={setCalendarNoDateOpen}
              onCalendarNoDateCountChange={handleCalendarNoDateCountChange}
              ganttDataVersion={ganttDataVersion}
              ganttCurrentDate={ganttCurrentDate}
              onGanttCurrentDateChange={setGanttCurrentDate}
              ganttViewType={ganttViewType}
              onGanttViewTypeChangeExternal={handleGanttViewTypeChange}
              readOnly={readOnly || history.historyOpen}
              renderFormSharePanel={history.historyOpen ? undefined : renderFormSharePanel}
              commentsEnabled={commentsEnabled && canComment && !history.historyOpen}
              onAddSheetComment={handleAddSheetComment}
              sheetCommentThreads={activeSheetCommentThreads}
              selectedCommentId={commentCtrl.selectedCommentId}
              onSelectComment={handleSelectSheetComment}
              dashboards={workbook.dashboards}
              activeDashboardId={activeDashboardId}
              onSelectDashboard={handleSelectDashboard}
              onCreateDashboard={handleCreateDashboard}
              onPrefetchDashboards={handlePrefetchDashboards}
              onRenameDashboard={handleRenameDashboard}
              onDeleteDashboard={handleDeleteDashboard}
              onDashboardChange={handleDashboardChange}
              renderWorkflowView={currentView === 'workflow' ? () => {
                const wfView = activeTable && isBaseSheet(activeTable.sheet) ? getActiveBaseView(activeTable.sheet) : null;
                const wfFieldOptions: FieldOption[] = activeTable && isBaseSheet(activeTable.sheet)
                  ? activeTable.sheet.columnDefs.filter(c => !c.hidden && !isSystemColumnType(c.type)).map(c => ({ id: c.id, name: c.name, type: c.type }))
                  : [];
                const wfTableOptions: TableOption[] = workbook?.sheets.map(s => ({ id: s.id, name: s.name })) ?? [];
                return (
                  <WorkflowViewContainer
                    tableId={activeSheetId}
                    docId={docId ?? activeSheetId}
                    readOnly={readOnly || history.historyOpen}
                    workflowId={wfView?.viewType === 'workflow' ? wfView.config.workflowId : undefined}
                    onWorkflowCreated={handleWorkflowBoundToView}
                    fieldOptions={wfFieldOptions}
                    tableOptions={wfTableOptions}
                  />
                );
              } : undefined}
              toolbar={
                !readOnly && !history.historyOpen && currentView !== 'form' && currentView !== 'workflow' && !activeDashboardId ? (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <BaseToolbar
                      table={activeTable}
                      variant={currentView === 'kanban' ? 'kanban' : currentView === 'calendar' ? 'calendar' : currentView === 'gantt' ? 'gantt' : 'grid'}
                      onToggleFieldVisibility={handleToggleFieldVisibility}
                      onReorderFields={handleReorderFields}
                      onConfirmField={handleConfirmField}
                      onDeleteField={handleDeleteField}
                      onAddRecord={handleAddRecord}
                      onGenerateForm={handleGenerateForm}
                      recordCount={activeTable.rowCount}
                      filteredRecordCount={filterConditions.length > 0 ? filteredRecordCount : undefined}
                      selectedCount={selectedCount}
                      groupRules={groupRules}
                      onGroupRulesChange={handleGroupRulesChange}
                      filterConditions={filterConditions}
                      onFilterChange={handleFilterChange}
                      filterConjunction={filterConjunction}
                      onFilterConjunctionChange={handleFilterConjunctionChange}
                      sortRules={sortRules}
                      onSortChange={handleSortChange}
                      kanbanGroupFieldId={activeKanbanView?.config.kanbanGroupFieldId}
                      onKanbanGroupFieldChange={handleKanbanGroupFieldChange}
                      kanbanCardFields={activeKanbanView?.config.kanbanCardFields}
                      onKanbanCardFieldsChange={handleKanbanCardFieldsChange}
                      kanbanShowFieldNames={activeKanbanView?.config.kanbanShowFieldNames === true}
                      onKanbanShowFieldNamesChange={handleKanbanShowFieldNamesChange}
                      kanbanCoverFieldId={activeKanbanView?.config.kanbanCoverFieldId ?? null}
                      onKanbanCoverFieldIdChange={handleKanbanCoverFieldIdChange}
                      commentsEnabled={commentsEnabled && canComment && !history.historyOpen}
                      commentPanelOpen={commentCtrl.showCommentPanel}
                      onToggleCommentPanel={() => commentCtrl.setShowCommentPanel(v => !v)}
                      calendarTitle={calendarTitle || formatCalendarTitle(calendarCurrentDate, calendarViewType)}
                      calendarViewType={calendarViewType}
                      onCalendarViewTypeChange={handleCalendarViewTypeChange}
                      onCalendarNavigate={handleCalendarNavigate}
                      noDateCount={calendarNoDateCount}
                      onOpenNoDate={handleOpenNoDate}
                      calendarConfigContent={
                        activeCalendarView && isBaseSheet(activeTable.sheet) ? (
                          <CalendarConfigPanel
                            config={activeCalendarView.config}
                            columns={activeTable.sheet.columnDefs}
                            onConfigChange={handleCalendarConfigChange}
                          />
                        ) : undefined
                      }
                      ganttTitle={ganttCurrentDate.format('YYYY年MM月')}
                      ganttViewType={ganttViewType}
                      onGanttViewTypeChange={handleGanttViewTypeChange}
                      onGanttNavigate={handleGanttNavigate}
                      ganttConfigContent={
                        activeGanttView && isBaseSheet(activeTable.sheet) ? (
                          <GanttConfigPanel
                            config={activeGanttView.config}
                            columns={activeTable.sheet.columnDefs}
                            onConfigChange={handleGanttConfigChange}
                          />
                        ) : undefined
                      }
                    />
                  </div>
                ) : null
              }
            />
          ) : (
            <FreeformSheetEditor
              table={activeTable}
              previewMode={readOnly || history.historyOpen}
              selectedChartId={selectedChartId}
              onSelectChart={setSelectedChartId}
              onOpenFieldConfig={fieldId => { setEditingFieldId(fieldId || null); setFieldConfigVisible(true); }}
              onToggleFieldVisibility={handleToggleFieldVisibility}
              onDeleteField={handleDeleteField}
              containerKey={`${docId}-${activeSheetId}`}
              showFormulaBar={!readOnly && !history.historyOpen}
              commentsEnabled={commentsEnabled && canComment && !history.historyOpen}
              onAddSheetComment={handleAddSheetComment}
              sheetCommentThreads={activeSheetCommentThreads}
              selectedCommentId={commentCtrl.selectedCommentId}
              onSelectComment={handleSelectSheetComment}
            />
          )}
        </div>

        {commentsEnabled && commentCtrl.showCommentPanel && !history.historyOpen && (
          <DocCommentPanel
            threads={commentCtrl.commentThreads}
            selectedId={commentCtrl.selectedCommentId}
            onSelect={handleSelectSheetComment}
            onClose={() => commentCtrl.setShowCommentPanel(false)}
            onResolve={commentCtrl.handleCommentResolve}
            onReply={commentCtrl.handleCommentReply}
            onEditReply={commentCtrl.handleCommentEdit}
            onDeleteReply={commentCtrl.handleCommentDelete}
            onLikeReply={commentCtrl.handleCommentLike}
            canComment={canComment}
            currentAuthorId={commentCtrl.commentAuthor.authorId}
            currentAuthorName={commentCtrl.commentAuthor.authorName}
            currentAuthorAvatar={commentCtrl.commentAuthor.authorAvatar}
          />
        )}
        {docId && (
          <DocumentHistoryPanelSlot
            docId={docId}
            historyOpen={history.historyOpen}
            selectedVersion={history.selectedHistoryVersion}
            onSelectVersion={(version) => { void history.previewHistoryVersion(version); }}
            onVersionsChange={history.handleHistoryVersionsChange}
            onClose={() => { void history.closeHistory(); }}
          />
        )}
      </div>

      <SheetTabs
        sheets={sheetInfos}
        activeId={activeSheetId}
        onSwitch={handleSwitchSheet}
        onAdd={readOnly || history.historyOpen ? () => {} : handleAddSheet}
        onRename={readOnly || history.historyOpen ? () => {} : handleRenameSheet}
        onDelete={readOnly || history.historyOpen ? () => {} : handleDeleteSheet}
      />
      {!readOnly && !history.historyOpen && <StatusBar table={activeTable} />}
      {!readOnly && !history.historyOpen && (
        <CollabStatusBar
          collabState={collabState}
          collabUsers={collabUsers}
          activeEditors={activeCellEditors}
        />
      )}

      {!readOnly && !history.historyOpen && isBase && isBaseSheet(activeTable.sheet) && (
        <FieldConfigPanel
          visible={fieldConfigVisible}
          field={editingFieldId ? activeTable.sheet.columnDefs.find(c => c.id === editingFieldId) || null : null}
          allFields={activeTable.sheet.columnDefs}
          onClose={() => setFieldConfigVisible(false)}
          onConfirm={handleFieldConfigConfirm}
        />
      )}

      {!readOnly && !history.historyOpen && (
        <>
          <ChartInsertDialog visible={showChartDialog} onClose={() => setShowChartDialog(false)} onInsert={handleInsertChart} />
          <ChartEditor
            chart={selectedChartId ? activeTable.getChart(selectedChartId) || null : null}
            table={activeTable}
            onClose={() => setSelectedChartId(null)}
            onUpdate={(id, updates) => activeTable.updateChart(id, updates)}
          />
        </>
      )}
    </div>
  );
};
