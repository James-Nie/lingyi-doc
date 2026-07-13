import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { message } from 'antd';
import {
  Workbook,
  CHART_COLOR_PALETTES,
  ChartParser,
  getRatingConfig,
  getRatingColumnWidth,
  DocumentManager,
  SaveManager,
  WorkbookCollabBridge,
  XlsxIO,
  exportActiveSheetAsPng,
  printActiveSheet,
  cellRefLabel,
  isBaseSheet,
  prepareGroupedRecordIndices,
  type ActiveCellEditor,
  type CollabConnectionState,
  type CommentUpdatePayload,
  type DocumentApiResponse,
  type DocumentPermission,
  type DocCommentThread,
  type OnlineUser,
  buildSheetCommentAnchor,
  buildFreeformCommentAnchor,
  isSheetCommentAnchor,
  isFreeformSheet,
  filterCommentThreadsForSheet,
} from '@lingyi-doc/core';
import type { ChartType, ChartVariant, ChartInstance, SheetType } from '@lingyi-doc/core';
import {
  Toolbar, BaseToolbar, FieldConfigPanel, StatusBar, SheetTabs, useSheetStore, BASE_THEME,
  ensureFormView, activateBaseView, getActiveBaseView, ensureActiveBaseView, applySheetStoreFromBaseView,
  updateFormViewConfig, updateBaseViewGroupRules, updateBaseViewFilter, updateBaseViewSort,
  FreeformSheetEditor, BaseSheetEditor, DocCommentPanel, useDocCommentController,
} from '@lingyi-doc/editor';
import type { FormSharePanelContext, SheetCommentRequest } from '@lingyi-doc/editor';
import { FormSharePanel } from '../components/share/FormSharePanel';
import type { GroupRule, FilterCondition, SortRule } from '@lingyi-doc/core';
import { ChartInsertDialog, ChartEditor } from '@lingyi-doc/editor';
import { DocumentBar } from '../components/DocumentBar';
import { CollabStatusBar } from '../components/CollabStatusBar';
import { commitPendingSheetEdits } from '../utils/commitPendingEdits';
import { appPath } from '../utils/appPaths';
import { authStore } from '../stores/authStore';
import type { EditorAccessProps } from '../types/editorAccess';
import type { DownloadFormat } from '../utils/downloadAs';
import { BASE_SHEET_PRINT_MESSAGE } from '../utils/printMessages';
import { fetchSystemFeatures } from '../api/system';
import {
  createDocumentComment,
  deleteDocumentCommentReply,
  editDocumentCommentReply,
  likeDocumentCommentReply,
  listDocumentComments,
  replyDocumentComment,
  resolveDocumentComment,
} from '../api/documentComment';

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
  const collabBridgeRef = useRef<WorkbookCollabBridge | null>(null);
  const titleDirtyByUserRef = useRef(false);
  const docTypeRef = useRef('freeform');

  const [collabUsers, setCollabUsers] = useState<OnlineUser[]>([]);
  const [collabState, setCollabState] = useState<CollabConnectionState>('idle');
  const [activeCellEditor, setActiveCellEditor] = useState<ActiveCellEditor | null>(null);
  const myUserIdRef = useRef(authStore.getState().user?.id ?? '');

  const collabViewOnly = !readOnly
    && collabState === 'connected'
    && activeCellEditor != null
    && activeCellEditor.userId !== myUserIdRef.current;

  useEffect(() => {
    docTitleRef.current = docTitle;
  }, [docTitle]);

  const [fieldConfigVisible, setFieldConfigVisible] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [showChartDialog, setShowChartDialog] = useState(false);
  const [selectedChartId, setSelectedChartId] = useState<string | null>(null);
  const [lastModified, setLastModified] = useState<number>(Date.now());
  const [commentsEnabled, setCommentsEnabled] = useState(false);
  const [docPermission, setDocPermission] = useState<DocumentPermission>('owner');
  const [initialCommentThreads, setInitialCommentThreads] = useState<DocCommentThread[]>([]);
  const [remoteCommentUpdate, setRemoteCommentUpdate] = useState<CommentUpdatePayload | null>(null);

  const canComment = commentsEnabled && (
    docPermission === 'comment'
    || docPermission === 'edit'
    || docPermission === 'manage'
    || docPermission === 'owner'
    || canEdit
  );

  const commentAuthor = useMemo(() => {
    const user = authStore.getState().user;
    return {
      authorId: user?.id ?? 'local',
      authorName: user?.displayName?.trim() || user?.email?.split('@')[0] || '当前用户',
      authorAvatar: user?.avatarUrl ?? null,
    };
  }, []);

  const markDirty = useCallback(() => {
    if (readOnly) return;
    setDirty(true);
    saveManagerRef.current?.markDirty();
    if (!collabBridgeRef.current?.isApplyingRemote()) {
      collabBridgeRef.current?.scheduleBroadcast();
    }
  }, [readOnly]);

  const attachWorkbookListeners = useCallback((wb: Workbook) => {
    workbookRef.current = wb;
  }, []);

  const handleWorkbookReplace = useCallback((next: Workbook) => {
    const prevActive = workbookRef.current?.activeSheetId;
    if (prevActive && next.getSheet(prevActive)) {
      next.switchSheet(prevActive);
    }
    attachWorkbookListeners(next);
    setWorkbook(next);
    setActiveSheetId(next.activeSheetId);
    saveManagerRef.current?.markDirty();
  }, [attachWorkbookListeners]);

  const handleWorkbookReplaceRef = useRef(handleWorkbookReplace);
  handleWorkbookReplaceRef.current = handleWorkbookReplace;

  useEffect(() => {
    if (!workbook) return;
    const unsubs: Array<() => void> = [workbook.onChange(markDirty)];
    for (const sheet of workbook.sheets) {
      unsubs.push(sheet.table.onChange(markDirty));
    }
    return () => unsubs.forEach(unsub => unsub());
  }, [workbook, activeSheetId, workbook?.sheets.length, markDirty]);

  useEffect(() => {
    if (readOnly) return;
    let prevEditing = useSheetStore.getState().editingCell;
    const unsub = useSheetStore.subscribe((state) => {
      const nextEditing = state.editingCell;
      const bridge = collabBridgeRef.current;
      const sheetId = workbookRef.current?.activeSheetId;
      if (!bridge || !sheetId) {
        prevEditing = nextEditing;
        return;
      }

      if (nextEditing && !prevEditing) {
        if (!bridge.canStartCellEdit()) {
          state.setEditingCell(null);
          const holder = bridge.getRemoteCellEditor();
          if (holder) {
            state.setStatusText(`${holder.displayName} 正在编辑 ${cellRefLabel(holder.row, holder.col)}`);
          }
          prevEditing = null;
          return;
        }
        bridge.startCellEdit(sheetId, nextEditing.row, nextEditing.col);
      } else if (!nextEditing && prevEditing) {
        bridge.endCellEdit();
      }
      prevEditing = nextEditing;
    });
    return unsub;
  }, [readOnly, workbook]);

  useEffect(() => {
    if (!docId) {
      navigate(appPath.home, { replace: true });
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const features = await fetchSystemFeatures().catch(() => ({ collab: false, comments: false }));
        if (cancelled) return;
        setCommentsEnabled(features.comments);

        const result = await DocumentManager.load(docId!, prefetched);
        if (cancelled) return;
        if (!result) {
          navigate(appPath.home, { replace: true });
          return;
        }
        const meta = prefetched ?? await DocumentManager.fetchDocument(docId!).catch(() => null);
        if (cancelled) return;
        if (meta?.permission) setDocPermission(meta.permission);

        let threads: DocCommentThread[] = [];
        if (features.comments) {
          try {
            threads = await listDocumentComments(docId!);
          } catch {
            threads = [];
          }
        }
        if (cancelled) return;
        setInitialCommentThreads(threads);

        attachWorkbookListeners(result.workbook);
        docTypeRef.current = result.docType;
        if (!result.workbook.activeSheet) {
          result.workbook.addSheet('Sheet1');
        }
        setWorkbook(result.workbook);
        setDocTitle(result.title);
        setLastModified(Date.now());
        setActiveSheetId(result.workbook.activeSheetId);
        const activeTable = result.workbook.activeSheet;
        if (activeTable && isBaseSheet(activeTable.sheet)) {
          applySheetStoreFromBaseView(activeTable.sheet);
        } else {
          useSheetStore.getState().setCurrentView('grid');
        }
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
            onSaved: () => {
              setLastModified(Date.now());
              const snap = workbookRef.current?.toJSON();
              if (snap) {
                collabBridgeRef.current?.syncSavedSnapshot(snap as Record<string, unknown>);
              }
            },
            onError: (err) => useSheetStore.getState().setStatusText(`保存失败: ${err.message}`),
          });
          manager.initialize(
            result.version,
            result.workbook.toJSON() as Record<string, unknown>,
            result.title,
          );
          saveManagerRef.current = manager;

          collabBridgeRef.current?.disconnect();
          const bridge = new WorkbookCollabBridge({
            docId: docId!,
            docType: result.docType,
            userId: authStore.getState().user?.id ?? '',
            getToken: () => authStore.getAccessToken(),
            getWorkbook: () => workbookRef.current ?? null,
            isLocalEditing: () => useSheetStore.getState().editingCell != null,
            onWorkbookReplace: (wb: Workbook) => handleWorkbookReplaceRef.current(wb),
            onBeforeLocalFlush: () => commitPendingSheetEdits(workbookRef.current, useSheetStore.getState()),
            onPresenceChange: setCollabUsers,
            onCellEditingChange: setActiveCellEditor,
            onStateChange: setCollabState,
            onCommentUpdate: (senderId, payload) => {
              if (senderId === authStore.getState().user?.id) return;
              setRemoteCommentUpdate(payload);
            },
            onError: (err: Error) => {
              if (err.message.includes('210009') || err.message.includes('正在编辑')) {
                useSheetStore.getState().setEditingCell(null);
              }
              useSheetStore.getState().setStatusText(`协同: ${err.message}`);
            },
          });
          bridge.initialize(result.workbook.toJSON() as Record<string, unknown>);
          collabBridgeRef.current = bridge;
          bridge.connect();
        } else {
          saveManagerRef.current?.dispose();
          saveManagerRef.current = null;
          collabBridgeRef.current?.disconnect();
          collabBridgeRef.current = null;
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
      collabBridgeRef.current?.disconnect();
      collabBridgeRef.current = null;
      setCollabState('idle');
      setCollabUsers([]);
      setActiveCellEditor(null);
    };
  }, [docId, navigate, attachWorkbookListeners, prefetched, readOnly]);

  useEffect(() => {
    const onLeave = () => { void saveManagerRef.current?.flush(true); };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, []);

  const activeTable = workbook?.activeSheet ?? null;
  const isBase = activeTable ? isBaseSheet(activeTable.sheet) : false;

  const commentCtrl = useDocCommentController({
    enabled: commentsEnabled,
    canComment,
    commentAuthor,
    initialThreads: initialCommentThreads,
    remoteCommentUpdate,
    filterThread: thread => (
      !activeSheetId
      || thread.anchor.sheetId === activeSheetId
      || thread.anchor.blockId === `sheet:${activeSheetId}`
    ),
    onPersistCreate: commentsEnabled && canComment && docId
      ? async ({ thread }) => {
          const saved = await createDocumentComment(docId, {
            id: thread.id,
            anchor: thread.anchor,
          });
          return saved;
        }
      : undefined,
    onPersistReply: commentsEnabled && canComment && docId
      ? (threadId, text) => replyDocumentComment(docId, threadId, text)
      : undefined,
    onPersistResolve: commentsEnabled && canComment && docId
      ? async (threadId) => { await resolveDocumentComment(docId, threadId); }
      : undefined,
    onPersistEdit: commentsEnabled && canComment && docId
      ? (threadId, replyId, text) => editDocumentCommentReply(docId, threadId, replyId, text)
      : undefined,
    onPersistDelete: commentsEnabled && canComment && docId
      ? (threadId, replyId) => deleteDocumentCommentReply(docId, threadId, replyId)
      : undefined,
    onPersistLike: commentsEnabled && docId
      ? (threadId, replyId) => likeDocumentCommentReply(docId, threadId, replyId)
      : undefined,
  });

  const activeSheetCommentThreads = useMemo(
    () => (activeSheetId
      ? filterCommentThreadsForSheet(commentCtrl.allCommentThreads, activeSheetId)
      : []),
    [commentCtrl.allCommentThreads, activeSheetId],
  );

  const focusSheetCell = useCallback((row: number, col: number) => {
    if (!activeSheetId) return;
    useSheetStore.getState().setSelection({
      sheetId: activeSheetId,
      start: { row, col },
      end: { row, col },
    }, { row, col });
  }, [activeSheetId]);

  const scrollToSheetComment = useCallback((threadId: string) => {
    const thread = commentCtrl.allCommentThreads.find(t => t.id === threadId);
    if (!thread || !isSheetCommentAnchor(thread.anchor) || !workbook) return;
    if (thread.anchor.anchorType === 'freeform_cell') {
      focusSheetCell(thread.anchor.start, thread.anchor.end);
      return;
    }
    const table = workbook.getSheet(thread.anchor.sheetId ?? activeSheetId);
    if (!table || !isBaseSheet(table.sheet)) return;
    const recordIndex = table.sheet.rows.findIndex(r => r._id === thread.anchor.recordId);
    if (recordIndex < 0) return;
    let colIndex = 0;
    if (thread.anchor.fieldId) {
      const idx = table.sheet.columnDefs.findIndex(c => c.id === thread.anchor.fieldId);
      if (idx >= 0) colIndex = idx;
    }
    focusSheetCell(recordIndex, colIndex);
  }, [commentCtrl.allCommentThreads, workbook, activeSheetId, focusSheetCell]);

  const handleSelectSheetComment = useCallback((id: string) => {
    commentCtrl.handleSelectComment(id);
    scrollToSheetComment(id);
  }, [commentCtrl, scrollToSheetComment]);

  const handleAddSheetComment = useCallback((request: SheetCommentRequest) => {
    if (!activeSheetId || !activeTable) return;
    if (isBaseSheet(activeTable.sheet)) {
      if (!request.recordId) return;
      const anchor = buildSheetCommentAnchor({
        sheetId: activeSheetId,
        recordId: request.recordId,
        fieldId: request.fieldId,
        viewId: activeTable.sheet.activeViewId,
        quote: request.quote,
      });
      commentCtrl.requestAddComment(anchor);
    } else if (isFreeformSheet(activeTable.sheet)) {
      const anchor = buildFreeformCommentAnchor({
        sheetId: activeSheetId,
        row: request.rowIndex,
        col: request.colIndex,
        quote: request.quote,
      });
      commentCtrl.requestAddComment(anchor);
    } else {
      return;
    }
    focusSheetCell(request.rowIndex, request.colIndex);
  }, [activeSheetId, activeTable, commentCtrl, focusSheetCell]);

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

  const handlePrint = useCallback(async () => {
    if (isBase) {
      message.info(BASE_SHEET_PRINT_MESSAGE);
      return;
    }
    if (!workbook) return;
    setExporting(true);
    const hide = message.loading('正在准备打印...', 0);
    try {
      await printActiveSheet(workbook, docTitle);
      hide();
    } catch (err) {
      hide();
      message.error(`打印失败: ${(err as Error).message}`);
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
    const table = workbook?.getSheet(sheetId);
    if (table && isBaseSheet(table.sheet)) {
      applySheetStoreFromBaseView(table.sheet);
    } else {
      useSheetStore.getState().setCurrentView('grid');
    }
    useSheetStore.getState().setEditingCell(null);
    useSheetStore.getState().setFormulaBarText('');
    useSheetStore.getState().setSelection(null, null);
  }, [workbook]);

  const handleAddSheet = useCallback((type: SheetType) => {
    if (!workbook) return;
    const sheetType = type === 'base' ? 'base' : 'freeform';
    const sheetName = sheetType === 'base' ? '多维表格' : '普通表格';
    const newId = workbook.addSheet(sheetName, sheetType);
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

  const handleSelectView = useCallback((viewId: string) => {
    if (!activeTable || !isBaseSheet(activeTable.sheet)) return;
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

  const activeFormView = (() => {
    if (!isBase || !activeTable || !isBaseSheet(activeTable.sheet)) return null;
    const sheet = activeTable.sheet;
    return sheet.views?.find(v => v.viewId === sheet.activeViewId && v.viewType === 'form')
      ?? sheet.views?.find(v => v.viewType === 'form')
      ?? null;
  })();

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
        const updated = { ...existing, ...fieldData } as import('@lingyi-doc/core').ColumnDef;
        sheet.columnDefs[idx] = updated;
        if (updated.type === 'rating') {
          const width = getRatingColumnWidth(getRatingConfig(updated));
          updated.width = width;
          activeTable.setColumnWidth(idx, width);
        }
        useSheetStore.getState().setStatusText('字段已更新');
      }
    } else {
      const colIndex = sheet.columnDefs.length;
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
      sheet.columnDefs.push(newField);
      activeTable.setColumnWidth(colIndex, newField.width || 160);
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
  const sortRules = activeBaseView?.sort ?? [];

  const filteredRecordCount = useMemo(() => {
    if (!activeTable || !isBaseSheet(activeTable.sheet)) return activeTable?.rowCount ?? 0;
    if (!filterConditions.length) return activeTable.rowCount;
    const sheet = activeTable.sheet;
    return prepareGroupedRecordIndices({
      rowCount: sheet.rowCount,
      filter: filterConditions,
      columnDefs: sheet.columnDefs,
      getFieldValue: (row, fieldId) => {
        const colIndex = sheet.columnDefs.findIndex(c => c.id === fieldId);
        return colIndex >= 0 ? activeTable.getCell(row, colIndex)?.value : undefined;
      },
    }).length;
  }, [activeTable, filterConditions]);

  const handleGroupRulesChange = useCallback((rules: GroupRule[]) => {
    if (!activeTable || !isBaseSheet(activeTable.sheet)) return;
    const view = ensureActiveBaseView(activeTable.sheet);
    updateBaseViewGroupRules(view, rules);
    activeTable.notifyChange(null);
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
    markDirty();
    useSheetStore.getState().setStatusText(
      conditions.length > 0 ? `已设置 ${conditions.length} 条筛选` : '已清除筛选',
    );
  }, [activeTable, markDirty]);

  const handleSortChange = useCallback((rules: SortRule[]) => {
    if (!activeTable || !isBaseSheet(activeTable.sheet)) return;
    const view = ensureActiveBaseView(activeTable.sheet);
    updateBaseViewSort(view, rules);
    activeTable.notifyChange(null);
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
        />
      )}

      {!readOnly && !collabViewOnly && !isBase && (
        <Toolbar
          table={activeTable}
          onInsertChart={() => setShowChartDialog(true)}
          commentsEnabled={commentsEnabled}
          commentPanelOpen={commentCtrl.showCommentPanel}
          onToggleCommentPanel={() => commentCtrl.setShowCommentPanel(v => !v)}
        />
      )}
      {!readOnly && !collabViewOnly && isBase && currentView !== 'form' && (
        <BaseToolbar
          table={activeTable}
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
          sortRules={sortRules}
          onSortChange={handleSortChange}
        />
      )}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        background: isBase ? BASE_THEME.pageBg : '#fff',
        padding: isBase ? '12px 16px' : 0,
      }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {isBase ? (
            <BaseSheetEditor
              table={activeTable}
              previewMode={readOnly || collabViewOnly}
              selectedChartId={selectedChartId}
              onSelectChart={setSelectedChartId}
              onOpenFieldConfig={fieldId => { setEditingFieldId(fieldId || null); setFieldConfigVisible(true); }}
              onToggleFieldVisibility={handleToggleFieldVisibility}
              onDeleteField={handleDeleteField}
              containerKey={`${docId}-${activeSheetId}`}
              currentView={currentView}
              activeFormView={activeFormView}
              onSelectView={handleSelectView}
              onFormViewChange={handleFormViewChange}
              readOnly={readOnly}
              renderFormSharePanel={renderFormSharePanel}
              commentsEnabled={commentsEnabled && canComment}
              onAddSheetComment={handleAddSheetComment}
              sheetCommentThreads={activeSheetCommentThreads}
              selectedCommentId={commentCtrl.selectedCommentId}
            />
          ) : (
            <FreeformSheetEditor
              table={activeTable}
              previewMode={readOnly || collabViewOnly}
              selectedChartId={selectedChartId}
              onSelectChart={setSelectedChartId}
              onOpenFieldConfig={fieldId => { setEditingFieldId(fieldId || null); setFieldConfigVisible(true); }}
              onToggleFieldVisibility={handleToggleFieldVisibility}
              onDeleteField={handleDeleteField}
              containerKey={`${docId}-${activeSheetId}`}
              showFormulaBar={!readOnly && !collabViewOnly}
              commentsEnabled={commentsEnabled && canComment}
              onAddSheetComment={handleAddSheetComment}
              sheetCommentThreads={activeSheetCommentThreads}
              selectedCommentId={commentCtrl.selectedCommentId}
            />
          )}
        </div>

        {commentsEnabled && commentCtrl.showCommentPanel && (
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
      {!readOnly && (
        <CollabStatusBar
          collabState={collabState}
          collabUsers={collabUsers}
          collabViewOnly={collabViewOnly}
          activeCellEditor={activeCellEditor}
        />
      )}

      {!readOnly && isBase && isBaseSheet(activeTable.sheet) && (
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
