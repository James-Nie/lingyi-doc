import React from 'react';
import { BASE_THEME } from '@lingyi-doc/core-sheet';
import { isBaseSheet } from '@lingyi-doc/core-types';
import type { DashboardModel } from '@lingyi-doc/core-types';
import { BaseViewSidebar } from '../base/BaseViewSidebar';
import { FormViewEditor } from '../base/FormViewEditor';
import { KanbanView } from '../base/kanban';
import { SheetContainer } from '../SheetContainer';
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
  onSelectView,
  onCreateView,
  onRenameView,
  onDuplicateView,
  onDeleteView,
  onFormViewChange,
  onKanbanViewChange,
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

  const sheet = table.sheet;
  const activeDashboard = activeDashboardId
    ? dashboards.find(d => d.id === activeDashboardId) ?? null
    : null;

  const showViewToolbar = Boolean(toolbar) && !activeDashboard && currentView !== 'form';

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      flex: 1,
      minHeight: 0,
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
    </div>
  );
};
