import React from 'react';
import { FormulaBar } from '../FormulaBar';
import { SheetContainer } from '../SheetContainer';
import type { SheetEditorProps } from './types';

export interface FreeformSheetEditorProps extends SheetEditorProps {
  showFormulaBar?: boolean;
}

export const FreeformSheetEditor: React.FC<FreeformSheetEditorProps> = ({
  table,
  previewMode,
  selectedChartId,
  onSelectChart,
  onOpenFieldConfig,
  onToggleFieldVisibility,
  onDeleteField,
  containerKey,
  showFormulaBar = true,
  onAddSheetComment,
  commentsEnabled = false,
  sheetCommentThreads,
  selectedCommentId,
  onSelectComment,
}) => (
  <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', width: '100%' }}>
    {showFormulaBar && !previewMode && <FormulaBar />}
    <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
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
    </div>
  </div>
);
