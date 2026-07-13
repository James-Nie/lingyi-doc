import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { BaseViewType } from '@lingyi-doc/core/types';
import type { SheetInfo } from '@lingyi-doc/core/model';
import { isBaseSheet } from '@lingyi-doc/core';
import {
  SheetContainer,
  SheetTabs,
  Toolbar,
  BaseToolbar,
  FormulaBar,
  StatusBar,
  useSheetStore,
  BASE_THEME,
  BaseViewSidebar,
  FormViewEditor,
  ensureFormView,
  activateBaseView,
  getActiveBaseView,
} from '@lingyi-doc/editor';
import { workbookFromContent } from '../templateContentUtils';

export interface TemplateContentEditorHandle {
  getContentJson: () => unknown;
}

interface Props {
  docType: 'freeform' | 'base';
  contentJson: unknown | null;
  previewMode?: boolean;
}

export const TemplateSheetContentEditor = forwardRef<TemplateContentEditorHandle, Props>(
  function TemplateSheetContentEditor({ docType, contentJson, previewMode = false }, ref) {
    const workbookRef = useRef<ReturnType<typeof workbookFromContent>>(
      workbookFromContent(contentJson, docType),
    );
    const [workbook, setWorkbook] = useState(workbookRef.current);
    const [activeSheetId, setActiveSheetId] = useState(workbook.activeSheetId);
    const [selectedCount, setSelectedCount] = useState(0);
    const [, bump] = useState(0);
    const forceUpdate = useCallback(() => bump(v => v + 1), []);
    const currentView = useSheetStore((s: { currentView: BaseViewType }) => s.currentView);

    useImperativeHandle(ref, () => ({
      getContentJson: () => workbookRef.current.toJSON(),
    }));

    useEffect(() => {
      useSheetStore.getState().setEditingCell(null);
      useSheetStore.getState().setFormulaBarText('');
      useSheetStore.getState().setSelection(null, null);
    }, []);

    useEffect(() => {
      const wb = workbookRef.current;
      const unsubs: Array<() => void> = [wb.onChange(forceUpdate)];
      for (const sheet of wb.sheets) {
        unsubs.push(sheet.table.onChange(forceUpdate));
      }
      return () => unsubs.forEach(fn => fn());
    }, [activeSheetId, forceUpdate, workbook.sheets.length]);

    const activeTable = workbook.activeSheet;
    const isBase = activeTable ? isBaseSheet(activeTable.sheet) : false;
    const sheetInfos = useMemo(
      () => workbook.sheets.map((s: SheetInfo) => ({ id: s.id, name: s.name, type: s.type })),
      [workbook, activeSheetId],
    );

    useEffect(() => {
      if (!activeTable || !isBase) return;
      const view = getActiveBaseView(activeTable.sheet);
      if (view) useSheetStore.getState().setCurrentView(view.viewType);
    }, [activeTable, activeSheetId, isBase]);

    const handleSwitchSheet = useCallback((sheetId: string) => {
      workbookRef.current.switchSheet(sheetId);
      setActiveSheetId(sheetId);
      setWorkbook(workbookRef.current);
      useSheetStore.getState().setEditingCell(null);
      useSheetStore.getState().setFormulaBarText('');
    }, []);

    const handleAddSheet = useCallback(() => {
      const wb = workbookRef.current;
      const id = wb.addSheet(`Sheet${wb.sheets.length + 1}`, docType === 'base' ? 'base' : 'freeform');
      handleSwitchSheet(id);
    }, [docType, handleSwitchSheet]);

    const handleRenameSheet = useCallback((sheetId: string, name: string) => {
      workbookRef.current.renameSheet(sheetId, name);
      forceUpdate();
    }, [forceUpdate]);

    const handleDeleteSheet = useCallback((sheetId: string) => {
      workbookRef.current.removeSheet(sheetId);
      setActiveSheetId(workbookRef.current.activeSheetId);
      setWorkbook(workbookRef.current);
      forceUpdate();
    }, [forceUpdate]);

    const handleSelectView = useCallback((viewId: string) => {
      if (!activeTable) return;
      const view = activateBaseView(activeTable.sheet, viewId);
      if (view) {
        useSheetStore.getState().setCurrentView(view.viewType);
        activeTable.notifyChange(null);
        forceUpdate();
      }
    }, [activeTable, forceUpdate]);

    const handleGenerateForm = useCallback(() => {
      if (!activeTable) return;
      const formView = ensureFormView(activeTable.sheet);
      activateBaseView(activeTable.sheet, formView.viewId);
      useSheetStore.getState().setCurrentView('form');
      activeTable.notifyChange(null);
      forceUpdate();
    }, [activeTable, forceUpdate]);

    const handleToggleFieldVisibility = useCallback((fieldId: string, visible: boolean) => {
      if (!activeTable) return;
      const field = activeTable.sheet.columnDefs.find((c: { id: string }) => c.id === fieldId);
      if (field) {
        field.hidden = !visible;
        activeTable.applyColumnVisibility();
        activeTable.notifyChange(null);
        forceUpdate();
      }
    }, [activeTable, forceUpdate]);

    const handleDeleteField = useCallback((fieldId: string) => {
      if (!activeTable) return;
      const idx = activeTable.sheet.columnDefs.findIndex((c: { id: string }) => c.id === fieldId);
      if (idx > 0) {
        activeTable.deleteColumns(idx, 1);
        activeTable.syncColumnLayout();
        activeTable.notifyChange(null);
        forceUpdate();
      }
    }, [activeTable, forceUpdate]);

    const handleConfirmField = useCallback((_fieldId: string | null) => {
      activeTable?.notifyChange(null);
      forceUpdate();
    }, [activeTable, forceUpdate]);

    const handleReorderFields = useCallback((fromIndex: number, toIndex: number) => {
      activeTable?.moveColumns(fromIndex, toIndex);
      activeTable?.syncColumnLayout();
      forceUpdate();
    }, [activeTable, forceUpdate]);

    const handleAddRecord = useCallback(() => {
      if (!activeTable) return;
      activeTable.insertRow(activeTable.rowCount);
      forceUpdate();
    }, [activeTable, forceUpdate]);

    const activeFormView = isBase && currentView === 'form'
      ? activeTable?.sheet.views?.find((v: { viewId: string; viewType: string }) => v.viewId === activeTable.sheet.activeViewId && v.viewType === 'form')
        ?? activeTable?.sheet.views?.find((v: { viewType: string }) => v.viewType === 'form')
        ?? null
      : null;

    if (!activeTable) {
      return <div style={{ padding: 48, textAlign: 'center', color: '#8f959e' }}>无法加载表格</div>;
    }

    return (
      <div style={{
        height: 'calc(100vh - 220px)',
        minHeight: 480,
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        overflow: 'hidden',
        background: isBase ? BASE_THEME.pageBg : '#fff',
      }}
      >
        {!previewMode && !isBase && <Toolbar table={activeTable} onInsertChart={() => {}} />}
        {!previewMode && isBase && currentView !== 'form' && (
          <BaseToolbar
            table={activeTable}
            onToggleFieldVisibility={handleToggleFieldVisibility}
            onReorderFields={handleReorderFields}
            onConfirmField={handleConfirmField}
            onDeleteField={handleDeleteField}
            onAddRecord={handleAddRecord}
            onGenerateForm={handleGenerateForm}
            recordCount={activeTable.rowCount}
            selectedCount={selectedCount}
          />
        )}
        {!previewMode && !isBase && <FormulaBar />}

        <div style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          display: 'flex',
          background: isBase ? BASE_THEME.pageBg : '#fff',
          padding: isBase ? 12 : 0,
        }}
        >
          {isBase ? (
            <div style={{
              display: 'flex',
              height: '100%',
              flex: 1,
              background: BASE_THEME.cardBg,
              border: `1px solid ${BASE_THEME.cardBorder}`,
              borderRadius: BASE_THEME.cardRadius,
              overflow: 'hidden',
            }}
            >
              <BaseViewSidebar
                views={activeTable.sheet.views || []}
                activeViewId={activeTable.sheet.activeViewId}
                onSelectView={handleSelectView}
              />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                {currentView === 'form' && activeFormView && !previewMode ? (
                  <FormViewEditor
                    table={activeTable}
                    formView={activeFormView}
                    onChange={forceUpdate}
                    onDeleteField={handleDeleteField}
                  />
                ) : (
                  <SheetContainer
                    key={activeSheetId}
                    table={activeTable}
                    previewMode={previewMode}
                    selectedChartId={null}
                    onSelectChart={() => {}}
                    onOpenFieldConfig={() => {}}
                    onToggleFieldVisibility={handleToggleFieldVisibility}
                    onDeleteField={handleDeleteField}
                  />
                )}
              </div>
            </div>
          ) : (
            <SheetContainer
              key={activeSheetId}
              table={activeTable}
              previewMode={previewMode}
              selectedChartId={null}
              onSelectChart={() => {}}
              onOpenFieldConfig={() => {}}
              onToggleFieldVisibility={handleToggleFieldVisibility}
              onDeleteField={handleDeleteField}
            />
          )}
        </div>

        <SheetTabs
          sheets={sheetInfos}
          activeId={activeSheetId}
          onSwitch={handleSwitchSheet}
          onAdd={previewMode ? () => {} : handleAddSheet}
          onRename={previewMode ? () => {} : handleRenameSheet}
          onDelete={previewMode ? () => {} : handleDeleteSheet}
        />
        <StatusBar table={activeTable} />
      </div>
    );
  },
);
