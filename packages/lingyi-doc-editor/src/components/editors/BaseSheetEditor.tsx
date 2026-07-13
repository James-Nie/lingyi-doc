import React from 'react';
import { BASE_THEME, isBaseSheet } from '@lingyi-doc/core';
import { BaseViewSidebar } from '../base/BaseViewSidebar';
import { FormViewEditor } from '../base/FormViewEditor';
import { SheetContainer } from '../SheetContainer';
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
  onSelectView,
  onFormViewChange,
  readOnly = false,
  renderFormSharePanel,
  onAddSheetComment,
  commentsEnabled = false,
  sheetCommentThreads,
  selectedCommentId,
}) => {
  if (!isBaseSheet(table.sheet)) {
    return null;
  }

  const sheet = table.sheet;

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      flex: 1,
      background: BASE_THEME.cardBg,
      border: `1px solid ${BASE_THEME.cardBorder}`,
      borderRadius: BASE_THEME.cardRadius,
      overflow: 'hidden',
    }}>
      <BaseViewSidebar
        views={sheet.views || []}
        activeViewId={sheet.activeViewId}
        onSelectView={onSelectView}
      />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {currentView === 'form' && activeFormView ? (
          <FormViewEditor
            table={table}
            formView={activeFormView}
            onChange={onFormViewChange}
            onDeleteField={onDeleteField}
            readOnly={readOnly}
            renderFormSharePanel={renderFormSharePanel}
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
          />
        )}
      </div>
    </div>
  );
};
