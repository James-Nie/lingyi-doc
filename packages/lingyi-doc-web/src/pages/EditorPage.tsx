import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Workbook,
  CHART_COLOR_PALETTES,
  ChartParser,
  getRatingConfig,
  getRatingColumnWidth,
  DocumentManager,
  SaveManager,
  XlsxIO,
  exportActiveSheetAsPng,
  type DocumentApiResponse,
} from '@lingyi-doc/core';
import type { ChartType, ChartVariant, ChartInstance } from '@lingyi-doc/core';
import { SheetContainer, Toolbar, BaseToolbar, FieldConfigPanel, FormulaBar, StatusBar, SheetTabs, useSheetStore, BASE_THEME, BaseViewSidebar, FormViewEditor, ensureFormView, activateBaseView, getActiveBaseView } from '@lingyi-doc/editor';
import { ChartInsertDialog, ChartEditor } from '@lingyi-doc/editor';
import { DocumentBar } from '../components/DocumentBar';
import { commitPendingSheetEdits } from '../utils/commitPendingEdits';
import { appPath } from '../utils/appPaths';
import type { EditorAccessProps } from '../types/editorAccess';
import type { DownloadFormat } from '../utils/downloadAs';

export const EditorPage: React.FC<{ docId?: string; prefetched?: DocumentApiResponse; embedded?: boolean } & EditorAccessProps> = ({
  docId: docIdProp,
  prefetched,
  embedded,
  readOnly = false,
  canEdit = true,
  effectiveViewMode = 'edit',
  onTogglePreview,
}) => {
  const { docId: routeDocId } = useParams<{ docId: string }>();
  const docId = docIdProp ?? routeDocId;
  const navigate = useNavigate();
  const workbookRef = useRef<Workbook>();

  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [docTitle, setDocTitle] = useState('未命名文档');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving' | 'error'>('saved');
  const [activeSheetId, setActiveSheetId] = useState('');

  const docTitleRef = useRef(docTitle);
  const saveManagerRef = useRef<SaveManager | null>(null);
  const titleDirtyByUserRef = useRef(false);

  useEffect(() => {
    docTitleRef.current = docTitle;
  }, [docTitle]);

  const [fieldConfigVisible, setFieldConfigVisible] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [showChartDialog, setShowChartDialog] = useState(false);
  const [selectedChartId, setSelectedChartId] = useState<string | null>(null);
  const [lastModified, setLastModified] = useState<number>(Date.now());

  const markDirty = useCallback(() => {
    if (readOnly) return;
    setDirty(true);
    saveManagerRef.current?.markDirty();
  }, [readOnly]);

  const attachWorkbookListeners = useCallback((wb: Workbook) => {
    workbookRef.current = wb;
  }, []);

  useEffect(() => {
    if (!workbook) return;
    const unsubs: Array<() => void> = [workbook.onChange(markDirty)];
    for (const sheet of workbook.sheets) {
      unsubs.push(sheet.table.onChange(markDirty));
    }
    return () => unsubs.forEach(unsub => unsub());
  }, [workbook, activeSheetId, workbook?.sheets.length, markDirty]);

  useEffect(() => {
    if (!docId) {
      navigate(appPath.home, { replace: true });
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const result = await DocumentManager.load(docId!, prefetched);
        if (cancelled) return;
        if (!result) {
          navigate(appPath.home, { replace: true });
          return;
        }
        attachWorkbookListeners(result.workbook);
        if (!result.workbook.activeSheet) {
          result.workbook.addSheet('Sheet1');
        }
        setWorkbook(result.workbook);
        setDocTitle(result.title);
        setLastModified(Date.now());
        setActiveSheetId(result.workbook.activeSheetId);
        setDirty(false);
        setSaveStatus('saved');
        titleDirtyByUserRef.current = false;

        if (!readOnly) {
          saveManagerRef.current?.dispose();
          const manager = new SaveManager({
            docId: docId!,
            docType: result.docType,
            debounceMs: 1500,
            getTitle: () => docTitleRef.current,
            getSnapshot: () => workbookRef.current!.toJSON() as Record<string, unknown>,
            onBeforeFlush: () => commitPendingSheetEdits(workbookRef.current, useSheetStore.getState()),
            saveFull: (title) => DocumentManager.save(docId!, title, workbookRef.current!),
            savePatch: (input) => DocumentManager.patch(docId!, input),
            onStatusChange: (status) => {
              setSaveStatus(status);
              if (status === 'saved') setDirty(false);
            },
            onSaved: () => setLastModified(Date.now()),
            onError: (err) => useSheetStore.getState().setStatusText(`保存失败: ${err.message}`),
          });
          manager.initialize(
            result.version,
            result.workbook.toJSON() as Record<string, unknown>,
            result.title,
          );
          saveManagerRef.current = manager;
        } else {
          saveManagerRef.current?.dispose();
          saveManagerRef.current = null;
        }
        useSheetStore.getState().setEditingCell(null);
        useSheetStore.getState().setFormulaBarText('');
        useSheetStore.getState().setSelection(null, null);
      } catch (err) {
        if (!cancelled) {
          useSheetStore.getState().setStatusText(`加载失败: ${(err as Error).message}`);
          navigate(appPath.home, { replace: true });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      saveManagerRef.current?.dispose();
    };
  }, [docId, navigate, attachWorkbookListeners, prefetched, readOnly]);

  useEffect(() => {
    const onLeave = () => { void saveManagerRef.current?.flush(true); };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, []);

  const activeTable = workbook?.activeSheet ?? null;
  const isBase = activeTable?.sheet.type === 'base';

  const handleDownloadAs = useCallback(async (format: DownloadFormat) => {
    if (!workbook || isBase) return;
    setExporting(true);
    try {
      if (format === 'xlsx' || format === 'csv') {
        await XlsxIO.exportWorkbook(workbook, format, docTitle);
        useSheetStore.getState().setStatusText(`已下载 ${format === 'xlsx' ? 'Excel' : 'CSV'} 文件`);
      } else if (format === 'png') {
        await exportActiveSheetAsPng(workbook, docTitle);
        useSheetStore.getState().setStatusText('已下载 PNG 图片');
      }
    } catch (err) {
      useSheetStore.getState().setStatusText(`下载失败: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  }, [workbook, docTitle, isBase]);

  const handleTitleChange = useCallback((t: string) => {
    if (readOnly) return;
    titleDirtyByUserRef.current = true;
    setDocTitle(t);
    saveManagerRef.current?.markTitleDirty();
  }, [readOnly]);

  useEffect(() => {
    const interval = setInterval(() => {
      const sel = useSheetStore.getState().selectionRange;
      setSelectedCount(sel
        ? (sel.end.row - sel.start.row + 1) * (sel.end.col - sel.start.col + 1)
        : 0);
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const handleSwitchSheet = useCallback((sheetId: string) => {
    workbook?.switchSheet(sheetId);
    setActiveSheetId(sheetId);
    useSheetStore.getState().setEditingCell(null);
    useSheetStore.getState().setFormulaBarText('');
    useSheetStore.getState().setSelection(null, null);
  }, [workbook]);

  const handleAddSheet = useCallback((type: 'freeform' | 'standard' | 'base') => {
    if (!workbook) return;
    const sheetName = type === 'base' ? '多维表格' : '普通表格';
    const newId = workbook.addSheet(sheetName, type === 'standard' ? 'freeform' : type);
    workbook.switchSheet(newId);
    setActiveSheetId(newId);
    useSheetStore.getState().setEditingCell(null);
    useSheetStore.getState().setFormulaBarText('');
    useSheetStore.getState().setSelection(null, null);
  }, [workbook]);

  const handleRenameSheet = useCallback((sheetId: string, name: string) => {
    workbook?.renameSheet(sheetId, name);
    setActiveSheetId(workbook?.activeSheetId || '');
  }, [workbook]);

  const handleDeleteSheet = useCallback((sheetId: string) => {
    if (!workbook || workbook.sheets.length <= 1) return;
    workbook.removeSheet(sheetId);
    setActiveSheetId(workbook.activeSheetId);
  }, [workbook]);

  const handleInsertChart = useCallback((type: ChartType, variant: ChartVariant) => {
    const table = workbook?.activeSheet;
    if (!table) return;
    const store = useSheetStore.getState();
    const sel = store.selectionRange;
    const active = store.activeCell;
    if (!sel || !active) {
      store.setStatusText('请先选中数据区域');
      return;
    }
    const rowCount = sel.end.row - sel.start.row + 1;
    const colCount = sel.end.col - sel.start.col + 1;
    const rangeStr = ChartParser.rangeToString(sel.start.row, sel.end.row, sel.start.col, sel.end.col);
    try {
      table.addChart({
        name: '图表',
        dataSource: { range: rangeStr, hasHeader: rowCount > 1, hasCategories: colCount > 1 },
        config: {
          type, variant,
          title: type === 'pie' ? '占比分析' : '数据对比',
          showLegend: true, showDataLabels: true, showBorder: true, showGridLines: true,
          colors: [...CHART_COLOR_PALETTES.default],
        },
        position: {
          anchorRow: sel.end.row + 2, anchorCol: 0,
          offsetX: 20, offsetY: 10, width: 420, height: 300,
        },
      });
      store.setStatusText('图表已插入');
    } catch (e: unknown) {
      store.setStatusText(`插入图表失败: ${(e as Error).message}`);
    }
  }, [workbook]);

  const currentView = useSheetStore(s => s.currentView);
  const sheetInfos = workbook?.sheets.map(s => ({ id: s.id, name: s.name, type: s.type })) || [];

  useEffect(() => {
    if (!activeTable || !isBase) return;
    const view = getActiveBaseView(activeTable.sheet);
    if (view) useSheetStore.getState().setCurrentView(view.viewType);
  }, [activeTable, activeSheetId, isBase]);

  const handleGenerateForm = useCallback(() => {
    if (!activeTable) return;
    const formView = ensureFormView(activeTable.sheet);
    activateBaseView(activeTable.sheet, formView.viewId);
    useSheetStore.getState().setCurrentView('form');
    useSheetStore.getState().setFormEditorTab('edit');
    activeTable.notifyChange(null);
    markDirty();
    useSheetStore.getState().setStatusText('已创建表单视图');
  }, [activeTable, markDirty]);

  const handleSelectView = useCallback((viewId: string) => {
    if (!activeTable) return;
    const view = activateBaseView(activeTable.sheet, viewId);
    if (view) {
      useSheetStore.getState().setCurrentView(view.viewType);
      activeTable.notifyChange(null);
      markDirty();
    }
  }, [activeTable, markDirty]);

  const handleFormViewChange = useCallback(() => {
    markDirty();
  }, [markDirty]);

  const activeFormView = isBase && currentView === 'form'
    ? activeTable?.sheet.views?.find(v => v.viewId === activeTable.sheet.activeViewId && v.viewType === 'form')
      ?? activeTable?.sheet.views?.find(v => v.viewType === 'form')
      ?? null
    : null;

  const handleConfirmField = useCallback((fieldId: string | null, fieldData: Partial<import('@lingyi-doc/core').ColumnDef>) => {
    if (!activeTable) return;
    if (fieldId) {
      const idx = activeTable.sheet.columnDefs.findIndex(c => c.id === fieldId);
      if (idx >= 0) {
        const existing = activeTable.sheet.columnDefs[idx];
        const updated = { ...existing, ...fieldData } as import('@lingyi-doc/core').ColumnDef;
        activeTable.sheet.columnDefs[idx] = updated;
        if (updated.type === 'rating') {
          const width = getRatingColumnWidth(getRatingConfig(updated));
          updated.width = width;
          activeTable.setColumnWidth(idx, width);
        }
        useSheetStore.getState().setStatusText('字段已更新');
      }
    } else {
      const colIndex = activeTable.sheet.columnDefs.length;
      activeTable.insertColumns(colIndex, 1);
      const newField: import('@lingyi-doc/core').ColumnDef = {
        id: `col_${Date.now()}_${colIndex}`,
        name: fieldData.name || '新字段',
        type: fieldData.type || 'text',
        width: fieldData.type === 'boolean' ? 70 : fieldData.type === 'autoNumber' ? 80 : fieldData.type === 'date' ? 110 : fieldData.type === 'rating' ? 90 : fieldData.type === 'progress' ? 110 : 160,
        ...fieldData,
      };
      if (newField.type === 'rating') {
        newField.width = getRatingColumnWidth(getRatingConfig(newField));
      }
      activeTable.sheet.columnDefs.push(newField);
      activeTable.setColumnWidth(colIndex, newField.width || 160);
      useSheetStore.getState().setStatusText(`已添加字段「${newField.name}」`);
    }
    activeTable.syncColumnLayout();
    activeTable.notifyChange(null);
  }, [activeTable]);

  const handleToggleFieldVisibility = useCallback((fieldId: string, visible: boolean) => {
    if (!activeTable) return;
    const field = activeTable.sheet.columnDefs.find(c => c.id === fieldId);
    if (field) {
      field.hidden = !visible;
      activeTable.applyColumnVisibility();
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
    if (!activeTable) return;
    const idx = activeTable.sheet.columnDefs.findIndex(c => c.id === fieldId);
    if (idx > 0) {
      activeTable.deleteColumns(idx, 1);
      activeTable.syncColumnLayout();
      activeTable.notifyChange(null);
    }
  }, [activeTable]);

  const handleFieldConfigConfirm = useCallback((fieldData: Partial<import('@lingyi-doc/core').ColumnDef>) => {
    handleConfirmField(editingFieldId, fieldData);
    setFieldConfigVisible(false);
  }, [handleConfirmField, editingFieldId]);

  const handleAddRecord = useCallback(() => {
    if (!activeTable) return;
    const rowCount = activeTable.rowCount;
    activeTable.insertRows(rowCount, 1);
    const autoNumCol = activeTable.sheet.columnDefs.findIndex(c => c.type === 'autoNumber');
    if (autoNumCol >= 0) {
      activeTable.setCellValue(rowCount, autoNumCol, { type: 'text', text: String(rowCount) });
    }
    useSheetStore.getState().setStatusText('已添加记录');
  }, [activeTable]);

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
      {!embedded && (
        <DocumentBar
          docId={docId || null}
          title={docTitle}
          saveStatus={saveStatus}
          onTitleChange={handleTitleChange}
          lastModified={lastModified}
          docType={isBase ? 'base' : 'freeform'}
          onDownloadAs={!isBase ? handleDownloadAs : undefined}
          canEdit={canEdit}
          effectiveViewMode={effectiveViewMode}
          onTogglePreview={onTogglePreview}
        />
      )}

      {!readOnly && !isBase && (
        <Toolbar table={activeTable} onInsertChart={() => setShowChartDialog(true)} />
      )}
      {!readOnly && isBase && currentView !== 'form' && (
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
      {!readOnly && !isBase && <FormulaBar />}

      <div style={{
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        background: isBase ? BASE_THEME.pageBg : '#fff',
        padding: isBase ? '12px 16px' : 0,
      }}>
        {isBase && (
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
              views={activeTable.sheet.views || []}
              activeViewId={activeTable.sheet.activeViewId}
              onSelectView={handleSelectView}
            />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              {currentView === 'form' && activeFormView ? (
                <FormViewEditor
                  table={activeTable}
                  formView={activeFormView}
                  onChange={handleFormViewChange}
                  onDeleteField={handleDeleteField}
                  readOnly={readOnly}
                />
              ) : (
                <SheetContainer
                  key={`${docId}-${activeSheetId}`}
                  table={activeTable}
                  previewMode={readOnly}
                  selectedChartId={selectedChartId}
                  onSelectChart={setSelectedChartId}
                  onOpenFieldConfig={fieldId => { setEditingFieldId(fieldId || null); setFieldConfigVisible(true); }}
                  onToggleFieldVisibility={handleToggleFieldVisibility}
                  onDeleteField={handleDeleteField}
                />
              )}
            </div>
          </div>
        )}
        {!isBase && (
          <SheetContainer
            key={`${docId}-${activeSheetId}`}
            table={activeTable}
            previewMode={readOnly}
            selectedChartId={selectedChartId}
            onSelectChart={setSelectedChartId}
            onOpenFieldConfig={fieldId => { setEditingFieldId(fieldId || null); setFieldConfigVisible(true); }}
            onToggleFieldVisibility={handleToggleFieldVisibility}
            onDeleteField={handleDeleteField}
          />
        )}
      </div>

      <SheetTabs
        sheets={sheetInfos}
        activeId={activeSheetId}
        onSwitch={handleSwitchSheet}
        onAdd={readOnly ? () => {} : handleAddSheet}
        onRename={readOnly ? () => {} : handleRenameSheet}
        onDelete={readOnly ? () => {} : handleDeleteSheet}
      />
      {!readOnly && <StatusBar table={activeTable} />}

      {!readOnly && isBase && (
        <FieldConfigPanel
          visible={fieldConfigVisible}
          field={editingFieldId ? activeTable.sheet.columnDefs.find(c => c.id === editingFieldId) || null : null}
          allFields={activeTable.sheet.columnDefs}
          onClose={() => setFieldConfigVisible(false)}
          onConfirm={handleFieldConfigConfirm}
        />
      )}

      {!readOnly && (
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
