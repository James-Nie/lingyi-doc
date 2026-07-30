import React, { useCallback, useMemo, useState } from 'react';
import { BASE_THEME } from '@lingyi-doc/core-sheet';
import { isBaseSheet, type RecordRow } from '@lingyi-doc/core-types';
import type { DashboardModel, BaseSheetModel, CellValue } from '@lingyi-doc/core-types';
import { BaseViewSidebar } from '../base/BaseViewSidebar';
import { FormViewEditor } from '../base/FormViewEditor';
import { KanbanView } from '../base/kanban';
import { SheetContainer } from '../SheetContainer';
import { CalendarContainer } from '../sheet/calendar/CalendarContainer';
import { RecordDetailDrawer } from '../RecordDetailDrawer';
import type { RecordDrawerTab } from '../RecordDetailDrawer';
import { DashboardEditor } from '../../dashboard';
import type { BaseSheetEditorProps } from './types';

export const BaseSheetEditor: React.FC<BaseSheetEditorProps> = ({
  table,
  previewMode,
  selectedChartId,
  onSelectChart,
  onOpenFieldConfig,
  onToggleFieldVisibility,
  onDeleteField,
  containerKey,
  currentView,
  activeFormView,
  activeKanbanView,
  activeCalendarView,
  onSelectView,
  onCreateView,
  onRenameView,
  onDuplicateView,
  onDeleteView,
  onFormViewChange,
  onKanbanViewChange,
  onCalendarViewChange,
  calendarDataVersion,
  calendarCurrentDate,
  onCalendarCurrentDateChange,
  calendarViewType,
  onCalendarViewTypeChangeExternal,
  calendarNoDateDrawerOpen,
  onCalendarNoDateDrawerOpenChange,
  onCalendarNoDateCountChange,
  toolbar,
  readOnly = false,
  renderFormSharePanel,
  onAddSheetComment,
  commentsEnabled = false,
  sheetCommentThreads,
  selectedCommentId,
  onSelectComment,
  dashboards = [],
  activeDashboardId,
  onSelectDashboard,
  onCreateDashboard,
  onPrefetchDashboards,
  onRenameDashboard,
  onDeleteDashboard,
  onDashboardChange,
}) => {
  if (!isBaseSheet(table.sheet)) {
    return null;
  }

  const sheet = table.sheet as BaseSheetModel;
  const activeDashboard = activeDashboardId
    ? dashboards.find(d => d.id === activeDashboardId) ?? null
    : null;

  const showViewToolbar = Boolean(toolbar) && !activeDashboard && currentView !== 'form';

  const fieldIdToColIndex = useMemo(() => {
    const map = new Map<string, number>();
    sheet.columnDefs.forEach((col, index) => {
      map.set(col.id, index);
    });
    return map;
  }, [sheet.columnDefs]);

  const recordIdToRowIndex = useCallback((recordId: string): number => {
    if (!sheet.rows) return -1;
    return sheet.rows.findIndex(r => r._id === recordId);
  }, [sheet]);

  const handleRecordUpdate = useCallback((recordId: string, updates: Partial<RecordRow>) => {
    const rowIndex = recordIdToRowIndex(recordId);
    if (rowIndex < 0) return;
    sheet.columnDefs.forEach(col => {
      const val = updates[col.id];
      if (val !== undefined) {
        const colIndex = fieldIdToColIndex.get(col.id);
        if (colIndex !== undefined) {
          const cellValue: CellValue = { type: 'text', text: String(val) };
          table.setCellValue(rowIndex, colIndex, cellValue);
        }
      }
    });
    onCalendarViewChange?.();
  }, [table, sheet, recordIdToRowIndex, fieldIdToColIndex, onCalendarViewChange]);

  const handleRecordCreate = useCallback((data: Partial<RecordRow>) => {
    const newRow = sheet.rowCount;
    table.insertRows(newRow, 1);
    sheet.columnDefs.forEach(col => {
      const val = data[col.id];
      if (val !== undefined) {
        const colIndex = fieldIdToColIndex.get(col.id);
        if (colIndex !== undefined) {
          const cellValue: CellValue = { type: 'text', text: String(val) };
          table.setCellValue(newRow, colIndex, cellValue);
        }
      }
    });
    onCalendarViewChange?.();
  }, [table, sheet, fieldIdToColIndex, onCalendarViewChange]);

  const handleRecordDelete = useCallback((recordId: string) => {
    const rowIndex = recordIdToRowIndex(recordId);
    if (rowIndex < 0) return;
    table.deleteRows(rowIndex, 1);
    onCalendarViewChange?.();
  }, [table, recordIdToRowIndex, onCalendarViewChange]);

  const [detailRowIndex, setDetailRowIndex] = useState<number | null>(null);
  const [detailDrawerTab] = useState<RecordDrawerTab>('detail');

  const handleCardClick = useCallback((recordId: string) => {
    const rowIndex = recordIdToRowIndex(recordId);
    if (rowIndex < 0) return;
    setDetailRowIndex(rowIndex);
  }, [recordIdToRowIndex]);

  const calendarTable = useMemo(() => ({ sheet }), [sheet]);

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      flex: 1,
      minHeight: 0,
      position: 'relative',
      background: BASE_THEME.cardBg,
      border: `1px solid ${BASE_THEME.cardBorder}`,
      borderRadius: BASE_THEME.cardRadius,
      overflow: 'hidden',
    }}>
      {/* 左侧：视图切换 */}
      <BaseViewSidebar
        views={sheet.views || []}
        activeViewId={sheet.activeViewId}
        onSelectView={onSelectView}
        onCreateView={readOnly ? undefined : onCreateView}
        onRenameView={readOnly ? undefined : onRenameView}
        onDuplicateView={readOnly ? undefined : onDuplicateView}
        onDeleteView={readOnly ? undefined : onDeleteView}
        dashboards={dashboards}
        activeDashboardId={activeDashboardId}
        onSelectDashboard={onSelectDashboard}
        onCreateDashboard={readOnly ? undefined : onCreateDashboard}
        onPrefetchDashboards={onPrefetchDashboards}
        onRenameDashboard={readOnly ? undefined : onRenameDashboard}
        onDeleteDashboard={readOnly ? undefined : onDeleteDashboard}
        readOnly={readOnly}
      />

      {/* 右侧：工具栏 + 视图内容 */}
      <div style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: BASE_THEME.cardBg,
      }}>
        {showViewToolbar && (
          <div style={{ flexShrink: 0 }}>
            {toolbar}
          </div>
        )}

        <div style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {activeDashboard && onDashboardChange ? (
            <DashboardEditor
              key={activeDashboard.id}
              dashboard={activeDashboard}
              table={table}
              readOnly={readOnly || previewMode}
              onChange={(next: DashboardModel) => onDashboardChange(next)}
            />
          ) : currentView === 'form' && activeFormView ? (
            <FormViewEditor
              table={table}
              formView={activeFormView}
              onChange={onFormViewChange}
              onDeleteField={onDeleteField}
              readOnly={readOnly}
              renderFormSharePanel={renderFormSharePanel}
            />
          ) : currentView === 'kanban' && activeKanbanView ? (
            <KanbanView
              table={table}
              kanbanView={activeKanbanView}
              onChange={onKanbanViewChange || onFormViewChange}
              readOnly={readOnly || previewMode}
            />
          ) : currentView === 'calendar' && activeCalendarView ? (
            <CalendarContainer
              table={calendarTable}
              view={activeCalendarView}
              dataVersion={calendarDataVersion}
              onRecordCreate={handleRecordCreate}
              onCardClick={handleCardClick}
              currentDate={calendarCurrentDate}
              onCurrentDateChange={onCalendarCurrentDateChange}
              viewType={calendarViewType}
              onViewTypeChange={onCalendarViewTypeChangeExternal}
              noDateDrawerOpen={calendarNoDateDrawerOpen}
              onNoDateDrawerOpenChange={onCalendarNoDateDrawerOpenChange}
              onNoDateCountChange={onCalendarNoDateCountChange}
            />
          ) : (
            <SheetContainer
              key={containerKey}
              table={table}
              previewMode={previewMode}
              selectedChartId={selectedChartId}
              onSelectChart={onSelectChart}
              onOpenFieldConfig={onOpenFieldConfig}
              onToggleFieldVisibility={onToggleFieldVisibility}
              onDeleteField={onDeleteField}
              onAddSheetComment={onAddSheetComment}
              commentsEnabled={commentsEnabled}
              sheetCommentThreads={sheetCommentThreads}
              selectedCommentId={selectedCommentId}
              onSelectComment={onSelectComment}
            />
          )}
        </div>
      </div>

      <RecordDetailDrawer
        visible={detailRowIndex !== null}
        rowIndex={detailRowIndex}
        table={table}
        initialTab={detailDrawerTab}
        onClose={() => setDetailRowIndex(null)}
        onNavigate={(rowIndex) => setDetailRowIndex(rowIndex)}
      />
    </div>
  );
};