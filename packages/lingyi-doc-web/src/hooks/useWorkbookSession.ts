import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { message } from 'antd';
import {
  Workbook,
  CHART_COLOR_PALETTES,
  ChartParser,
  DocumentManager,
  SaveManager,
  WorkbookCollabBridge,
  XlsxIO,
  exportActiveSheetAsPng,
  printActiveSheet,
  cellRefLabel,
  isBaseSheet,
  setCurrentRecordOperator,
  collectRecordHistoryFromWorkbook,
  clearRecordHistoryFromWorkbook,
  type ActiveCellEditor,
  type CollabConnectionState,
  type CommentUpdatePayload,
  type DocumentApiResponse,
  type DocumentPermission,
  type DocCommentThread,
  type OnlineUser,
  type ChartType,
  type ChartVariant,
  type SheetType,
  buildSheetCommentAnchor,
  buildFreeformCommentAnchor,
  isSheetCommentAnchor,
  isFreeformSheet,
  filterCommentThreadsForSheet,
  type RecordHistoryPayloadEntry,
} from '@lingyi-doc/core';
import {
  useSheetStore,
  useDocCommentController,
  applySheetStoreFromBaseView,
  activateBaseView,
  type SheetCommentRequest,
} from '@lingyi-doc/editor-pro';
import { configureRecordHistoryApi } from '@lingyi-doc/editor-sheet';
import { useDocumentHistory } from './useDocumentHistory';
import { commitPendingSheetEdits } from '../utils/commitPendingEdits';
import { appPath } from '../utils/appPaths';
import { authStore } from '../stores/authStore';
import { activeDocumentStore } from '../stores/activeDocumentStore';
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

export interface WorkbookSessionOptions {
  docId?: string;
  navigate: NavigateFunction;
  prefetched?: DocumentApiResponse;
  readOnly: boolean;
  canEdit: boolean;
  workbookRef: MutableRefObject<Workbook | undefined>;
  deepLinkSheetId: string | null;
  deepLinkViewId: string | null;
  deepLinkRecordId: string | null;
  deepLinkPreferGrid: boolean;
  resetDashboardSession: (wb?: Workbook | null) => void;
  ensureDashboardsLoaded: (wb: Workbook, id: string) => Promise<void>;
  setActiveDashboardId: (id: string | null) => void;
  setDashboardRevision: (fn: (v: number) => number) => void;
}

export function useWorkbookSession(options: WorkbookSessionOptions) {
  const {
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
    resetDashboardSession,
    ensureDashboardsLoaded,
    setActiveDashboardId,
    setDashboardRevision,
  } = options;

  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [docTitle, setDocTitle] = useState('未命名文档');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving' | 'error'>('saved');
  const [activeSheetId, setActiveSheetId] = useState('');
  /** /meta 接口返回的完整 sheet 列表（所有 sheet，含未加载的） */
  const [sheetMetaList, setSheetMetaList] = useState<Array<{ id: string; name: string; type: string }>>([]);

  const activeTable = workbook?.activeSheet ?? null;
  const isBase = activeTable ? isBaseSheet(activeTable.sheet) : false;

  const docTitleRef = useRef(docTitle);
  const saveManagerRef = useRef<SaveManager | null>(null);
  const collabBridgeRef = useRef<WorkbookCollabBridge | null>(null);
  const titleDirtyByUserRef = useRef(false);
  const docTypeRef = useRef('freeform');
  /** 最近一次保存请求携带的行级变更历史（成功后按 id 精确清空，避免误删保存期间新历史） */
  const lastSentRecordHistoryRef = useRef<RecordHistoryPayloadEntry[]>([]);

  const [collabUsers, setCollabUsers] = useState<OnlineUser[]>([]);
  const [collabState, setCollabState] = useState<CollabConnectionState>('idle');
  const [activeCellEditors, setActiveCellEditors] = useState<ActiveCellEditor[]>([]);

  useEffect(() => {
    docTitleRef.current = docTitle;
  }, [docTitle]);

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

  useEffect(() => {
    setCurrentRecordOperator(commentAuthor.authorName);
  }, [commentAuthor.authorName]);

  const historyModeRef = useRef(false);

  const markDirty = useCallback(() => {
    if (readOnly || historyModeRef.current) return;
    setDirty(true);
    saveManagerRef.current?.markDirty();
    if (!collabBridgeRef.current?.isApplyingRemote()) {
      collabBridgeRef.current?.scheduleBroadcast();
    }
  }, [readOnly]);

  const attachWorkbookListeners = useCallback((wb: Workbook) => {
    workbookRef.current = wb;
  }, []);

  const handleWorkbookReplace = useCallback((next: Workbook, opts?: { markDirty?: boolean }) => {
    const prevActive = workbookRef.current?.activeSheetId;
    if (prevActive && next.getSheet(prevActive)) {
      next.switchSheet(prevActive);
    }
    attachWorkbookListeners(next);
    setWorkbook(next);
    setActiveSheetId(next.activeSheetId);
    if (opts?.markDirty !== false) {
      saveManagerRef.current?.markDirty();
    }
  }, [attachWorkbookListeners]);

  const reloadDocumentFromServer = useCallback(async () => {
    if (!docId) return;
    const result = await DocumentManager.load(docId);
    if (!result) return;
    docTypeRef.current = result.docType;
    if (!result.workbook.activeSheet) {
      result.workbook.addSheet('Sheet1');
    }
    attachWorkbookListeners(result.workbook);
    setWorkbook(result.workbook);
    setDocTitle(result.title);
    setLastModified(Date.now());
    setActiveSheetId(result.workbook.activeSheetId);
    setSheetMetaList(result.sheetMetaList ?? result.workbook.sheets.map(s => ({ id: s.id, name: s.name, type: s.type })));
    setActiveDashboardId(null);
    resetDashboardSession(result.workbook);
    setDashboardRevision(v => v + 1);
    const activeTable = result.workbook.activeSheet;
    // 多维表文档：打开时拉取仪表盘列表
    if (activeTable && isBaseSheet(activeTable.sheet)) {
      void ensureDashboardsLoaded(result.workbook, docId!);
    }
    if (activeTable && isBaseSheet(activeTable.sheet)) {
      applySheetStoreFromBaseView(activeTable.sheet);
    } else {
      useSheetStore.getState().setCurrentView('grid');
    }
    setDirty(false);
    setSaveStatus('saved');
    titleDirtyByUserRef.current = false;
    saveManagerRef.current?.initialize(
      result.version,
      result.workbook.toJSON() as Record<string, unknown>,
      result.title,
    );
    useSheetStore.getState().setEditingCell(null);
    useSheetStore.getState().setFormulaBarText('');
    useSheetStore.getState().setSelection(null, null);
  }, [attachWorkbookListeners, docId, resetDashboardSession]);

  const history = useDocumentHistory({
    docId,
    canRestore: canEdit && !readOnly,
    saveManagerRef,
    applyPreviewSnapshot: (snapshot) => {
      const next = Workbook.fromJSON(snapshot);
      handleWorkbookReplace(next, { markDirty: false });
    },
    reloadCurrentDocument: reloadDocumentFromServer,
  });

  useEffect(() => {
    historyModeRef.current = history.historyOpen;
  }, [history.historyOpen]);

  const handleCollabWorkbookReplace = useCallback((next: Workbook) => {
    if (history.historyOpenRef.current) return;
    handleWorkbookReplace(next, { markDirty: false });
    saveManagerRef.current?.adoptRemoteSnapshot(next.toJSON() as Record<string, unknown>);
  }, [handleWorkbookReplace, history.historyOpenRef]);

  const handleCollabWorkbookReplaceRef = useRef(handleCollabWorkbookReplace);
  handleCollabWorkbookReplaceRef.current = handleCollabWorkbookReplace;

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

      const switched = !!nextEditing && (
        !prevEditing
        || prevEditing.row !== nextEditing.row
        || prevEditing.col !== nextEditing.col
      );

      if (switched && nextEditing) {
        if (!bridge.canStartCellEdit(sheetId, nextEditing.row, nextEditing.col)) {
          state.setEditingCell(null);
          const holder = bridge.getRemoteCellEditors().find(e =>
            e.sheetId === sheetId && e.row === nextEditing.row && e.col === nextEditing.col,
          );
          if (holder) {
            state.setStatusText(`${holder.displayName} 正在编辑 ${cellRefLabel(holder.row, holder.col)}`);
          }
          prevEditing = null;
          return;
        }
        if (!bridge.startCellEdit(sheetId, nextEditing.row, nextEditing.col)) {
          state.setEditingCell(null);
          prevEditing = null;
          return;
        }
        // 进入编辑即标脏，避免未提交内容在刷新时被当成「已保存」而丢失
        markDirty();
      } else if (!nextEditing && prevEditing) {
        bridge.endCellEdit();
      }
      prevEditing = nextEditing;
    });
    return unsub;
  }, [readOnly, workbook, markDirty]);

  useEffect(() => {
    if (!docId) {
      navigate(appPath.home, { replace: true });
      return;
    }
    // 普通表格走 EditorPage：确保侧栏选中与当前 docId 对齐
    activeDocumentStore.setDocId(docId);

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
        // 权限信息：prefetched 自带，渐进加载从 /meta 获取
        if (result.permission) setDocPermission(result.permission as DocumentPermission);
        else if (prefetched?.permission) setDocPermission(prefetched.permission);
        // 保存完整 sheet 列表（含未加载 sheet）供 SheetTabs 渲染
        if (result.sheetMetaList) {
          setSheetMetaList(result.sheetMetaList);
        } else {
          setSheetMetaList(
            result.workbook.sheets.map(s => ({ id: s.id, name: s.name, type: s.type })),
          );
        }

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

        // 表单分享页「编辑表单 / 查看收集结果」深链：?sheetId=&viewId= 或 ?view=grid
        if (deepLinkSheetId && result.workbook.getSheet(deepLinkSheetId)) {
          result.workbook.switchSheet(deepLinkSheetId);
        }
        const deepTable = result.workbook.activeSheet;
        if (deepTable && isBaseSheet(deepTable.sheet)) {
          if (deepLinkPreferGrid) {
            const grid = deepTable.sheet.views?.find(v => v.viewType === 'grid');
            if (grid) {
              activateBaseView(deepTable.sheet, grid.viewId);
            }
            useSheetStore.getState().setCurrentView('grid');
          } else if (deepLinkViewId) {
            const view = activateBaseView(deepTable.sheet, deepLinkViewId);
            if (view?.viewType === 'form') {
              useSheetStore.getState().setCurrentView('form');
              useSheetStore.getState().setFormEditorTab('edit');
            } else {
              applySheetStoreFromBaseView(deepTable.sheet);
            }
          } else {
            applySheetStoreFromBaseView(deepTable.sheet);
          }
        } else {
          useSheetStore.getState().setCurrentView('grid');
        }

        setWorkbook(result.workbook);
        setDocTitle(result.title);
        setLastModified(Date.now());
        setActiveSheetId(result.workbook.activeSheetId);
        resetDashboardSession(result.workbook);
        // 多维表文档：打开时拉取仪表盘列表（避免 sidebar 第一次为空）
        if (deepTable && isBaseSheet(deepTable.sheet)) {
          void ensureDashboardsLoaded(result.workbook, docId!);
        }
        setDirty(false);
        setSaveStatus('saved');
        titleDirtyByUserRef.current = false;

        // 深链：从全局搜索结果打开多维表格记录时定位到对应记录
        if (deepLinkRecordId && deepTable && isBaseSheet(deepTable.sheet)) {
          const recordIndex = deepTable.sheet.rows.findIndex(r => r._id === deepLinkRecordId);
          if (recordIndex >= 0) {
            focusSheetCell(recordIndex, 0);
          }
        }

        if (!readOnly) {
          saveManagerRef.current?.dispose();
          lastSentRecordHistoryRef.current = [];
          configureRecordHistoryApi(async (recordId, page, pageSize) =>
            DocumentManager.listRecordHistory(docId!, recordId, page, pageSize),
          );
          const manager = new SaveManager({
            docId: docId!,
            docType: result.docType,
            debounceMs: 1500,
            getTitle: () => docTitleRef.current,
            getSnapshot: () => workbookRef.current!.toJSON() as Record<string, unknown>,
            onBeforeFlush: () => commitPendingSheetEdits(workbookRef.current, useSheetStore.getState()),
            shouldDeferFlush: () => {
              const s = useSheetStore.getState();
              return s.editingCell != null || s.editingRecordCoord != null;
            },
            getExtra: () => {
              const wb = workbookRef.current;
              if (!wb) return {};
              const history = collectRecordHistoryFromWorkbook(wb);
              lastSentRecordHistoryRef.current = history;
              return { recordHistory: history };
            },
            saveFull: (title, _snapshot, extra) =>
              DocumentManager.save(docId!, title, workbookRef.current!, {
                recordHistory: extra?.recordHistory as RecordHistoryPayloadEntry[] | undefined,
                baseVersion: extra?.baseVersion as number | undefined,
              }),
            savePatch: (input) => DocumentManager.patch(docId!, input),
            onStatusChange: (status) => {
              setSaveStatus(status);
              if (status === 'saved') setDirty(false);
            },
            onSaved: () => {
              setLastModified(Date.now());
              // 保存成功：按本次携带的 id 清空内存历史，避免重发；保存期间新历史保留
              const sent = lastSentRecordHistoryRef.current;
              if (sent.length > 0 && workbookRef.current) {
                clearRecordHistoryFromWorkbook(workbookRef.current, new Set(sent.map(e => e.id)));
                lastSentRecordHistoryRef.current = [];
              }
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
          if (features.collab) {
            const bridge = new WorkbookCollabBridge({
              docId: docId!,
              docType: result.docType,
              userId: authStore.getState().user?.id ?? '',
              getToken: () => authStore.getAccessToken(),
              getWorkbook: () => workbookRef.current ?? null,
              isLocalEditing: () => useSheetStore.getState().editingCell != null,
              onWorkbookReplace: (wb: Workbook) => handleCollabWorkbookReplaceRef.current(wb),
              onBeforeLocalFlush: () => commitPendingSheetEdits(workbookRef.current, useSheetStore.getState()),
              onPresenceChange: setCollabUsers,
              onCellEditingChange: setActiveCellEditors,
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
            collabBridgeRef.current = null;
            setCollabState('idle');
            setCollabUsers([]);
            setActiveCellEditors([]);
          }
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
      configureRecordHistoryApi(null);
      lastSentRecordHistoryRef.current = [];
      saveManagerRef.current?.dispose();
      collabBridgeRef.current?.disconnect();
      collabBridgeRef.current = null;
      setCollabState('idle');
      setCollabUsers([]);
      setActiveCellEditors([]);
    };
  }, [
    docId,
    navigate,
    attachWorkbookListeners,
    prefetched,
    readOnly,
    resetDashboardSession,
    deepLinkSheetId,
    deepLinkViewId,
    deepLinkPreferGrid,
  ]);

  useEffect(() => {
    const persistOnLeave = () => {
      const wb = workbookRef.current;
      const manager = saveManagerRef.current;
      if (!wb || !docId || readOnly) return false;
      const hadPendingEdit = !!useSheetStore.getState().editingCell;
      commitPendingSheetEdits(wb, useSheetStore.getState());
      const hadDirty = (manager?.isDirty() ?? false) || hadPendingEdit;
      if (!hadDirty) return false;
      // 页面卸载时用 keepalive 全量 PUT，尽量保证落盘
      void DocumentManager.save(docId, docTitleRef.current, wb, {
        keepalive: true,
        recordHistory: collectRecordHistoryFromWorkbook(wb),
      });
      return true;
    };

    const onLeave = (e: BeforeUnloadEvent) => {
      if (persistOnLeave()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const onPageHide = () => { persistOnLeave(); };
    window.addEventListener('beforeunload', onLeave);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('beforeunload', onLeave);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [docId, readOnly]);

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
          const firstReply = thread.replies[0];
          const saved = await createDocumentComment(docId, {
            id: thread.id,
            anchor: thread.anchor,
            text: firstReply?.text,
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
    if (!commentCtrl.showCommentPanel) {
      commentCtrl.setShowCommentPanel(true);
    }
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

  const handleSwitchSheet = useCallback(async (sheetId: string) => {
    if (!workbook) return;

    // 渐进加载：sheet 未加载时先远程加载再切入
    if (!workbook.hasSheet(sheetId)) {
      const sheetData = await DocumentManager.loadSheet(docId!, sheetId);
      if (!sheetData?.data) return;
      workbook.addSheetFromJson(sheetId, sheetData.data as Record<string, unknown>);
    }

    workbook.switchSheet(sheetId);
    workbook.switchDashboard(undefined);
    setActiveSheetId(sheetId);
    setActiveDashboardId(null);
    const table = workbook.getSheet(sheetId);
    if (table && isBaseSheet(table.sheet)) {
      applySheetStoreFromBaseView(table.sheet);
    } else {
      useSheetStore.getState().setCurrentView('grid');
    }
    useSheetStore.getState().setEditingCell(null);
    useSheetStore.getState().setFormulaBarText('');
    useSheetStore.getState().setSelection(null, null);
  }, [workbook, docId]);

  const handleAddSheet = useCallback((type: SheetType) => {
    if (!workbook) return;
    const sheetType = type === 'base' ? 'base' : 'freeform';
    const sheetName = sheetType === 'base' ? '多维表格' : '普通表格';
    const newId = workbook.addSheet(sheetName, sheetType);
    workbook.switchSheet(newId);
    setActiveSheetId(newId);
    // 新 sheet 追加到 meta 列表，避免 SheetTabs 未显示
    if (sheetMetaList.length > 0) {
      setSheetMetaList(prev => [...prev, { id: newId, name: sheetName, type: sheetType }]);
    }
    useSheetStore.getState().setEditingCell(null);
    useSheetStore.getState().setFormulaBarText('');
    useSheetStore.getState().setSelection(null, null);
  }, [workbook, sheetMetaList]);

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

  return {
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
    focusSheetCell,
  };
}
