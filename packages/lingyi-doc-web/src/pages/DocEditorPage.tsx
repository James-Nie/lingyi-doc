import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { message } from 'antd';
import {
  DocumentManager,
  RichDocument,
  RichDocExport,
  SaveManager,
  DocumentCollabBridge,
  isRichTextComposing,
  richTextBlockLock,
  richTextTitleLock,
  isTextBlock,
  mergeBlocksToListBlock,
  applyCommentMarksFromThreads,
  type ActiveCellEditor,
  type BlockLockTarget,
  type CollabConnectionState,
  type CommentUpdatePayload,
  type DocBlock,
  type DocumentApiResponse,
  type DocumentPermission,
  type DocCommentThread,
  type OnlineUser,
  type RichDocumentJSON,
  type ToolbarState,
  type DocSelectionContext,
  type RichDocExportFormat,
  setCurrentRecordOperator,
} from '@lingyi-doc/core';
import { RichDocEditor, prepareRichDocBlocksForExport, type ToolbarAction, type RichDocEditorSaveRef } from '@lingyi-doc/editor-pro';
import { DocumentBar } from '../components/DocumentBar';
import { CollabStatusBar } from '../components/CollabStatusBar';
import { useCollabBlockLock } from '../hooks/useCollabBlockLock';
import { appPath } from '../utils/appPaths';
import { authStore } from '../stores/authStore';
import type { EditorAccessProps } from '../types/editorAccess';
import { isRichDocDownloadFormat, type DownloadFormat } from '../utils/downloadAs';
import { fetchSystemFeatures } from '../api/system';
import { DocAiPanel } from '../components/ai/DocAiPanel';
import {
  DocumentHistoryPanelSlot,
  DocumentHistoryToolbarSlot,
} from '../components/history/DocumentHistoryChrome';
import { useDocumentHistory } from '../hooks/useDocumentHistory';
import {
  createDocumentComment,
  deleteDocumentCommentReply,
  editDocumentCommentReply,
  likeDocumentCommentReply,
  listDocumentComments,
  replyDocumentComment,
  resolveDocumentComment,
} from '../api/documentComment';

function blockIndicesFromCtx(ctx: DocSelectionContext | null, fallback: number): number[] {
  if (!ctx) return [fallback];
  const indices: number[] = [];
  for (let i = ctx.startBlock; i <= ctx.endBlock; i++) indices.push(i);
  return indices.length ? indices : [fallback];
}

export const DocEditorPage: React.FC<{ docId?: string; prefetched?: DocumentApiResponse; embedded?: boolean } & EditorAccessProps> = ({
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
  const docRef = useRef<RichDocument | null>(null);
  const saveManagerRef = useRef<SaveManager | null>(null);
  const collabBridgeRef = useRef<DocumentCollabBridge | null>(null);
  const titleRef = useRef('未命名文档');

  const [collabUsers, setCollabUsers] = useState<OnlineUser[]>([]);
  const [collabState, setCollabState] = useState<CollabConnectionState>('idle');
  const [activeBlockEditors, setActiveBlockEditors] = useState<ActiveCellEditor[]>([]);

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('未命名文档');
  const [blocks, setBlocks] = useState<DocBlock[]>([]);
  const [toolbarState, setToolbarState] = useState<ToolbarState>(RichDocument.empty().getToolbarState(0));
  const [outline, setOutline] = useState(RichDocument.empty().getOutline());
  const [showOutline, setShowOutline] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving' | 'error'>('saved');
  const [lastModified, setLastModified] = useState(Date.now());
  const [historyRevision, setHistoryRevision] = useState(0);
  const [exporting, setExporting] = useState(false);
  const editorSaveRef = useRef<RichDocEditorSaveRef | null>(null);
  const [commentsEnabled, setCommentsEnabled] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [commentThreads, setCommentThreads] = useState<DocCommentThread[]>([]);
  const [remoteCommentUpdate, setRemoteCommentUpdate] = useState<CommentUpdatePayload | null>(null);
  const [docPermission, setDocPermission] = useState<DocumentPermission>('owner');

  const canComment = commentsEnabled && (
    docPermission === 'comment'
    || docPermission === 'edit'
    || docPermission === 'manage'
    || docPermission === 'owner'
    || (!readOnly && canEdit)
  );

  const commentAuthor = useMemo(() => {
    const user = authStore.getState().user;
    if (!user) return { authorId: 'local', authorName: '当前用户' };
    return {
      authorId: user.id,
      authorName: user.displayName?.trim() || user.email?.split('@')[0] || '用户',
      authorAvatar: user.avatarUrl,
    };
  }, []);

  useEffect(() => {
    setCurrentRecordOperator(commentAuthor.authorName);
  }, [commentAuthor.authorName]);

  useEffect(() => { titleRef.current = title; }, [title]);

  const syncFromDoc = useCallback((doc: RichDocument, index?: number) => {
    setBlocks([...doc.blocks]);
    setOutline(doc.getOutline());
    setToolbarState(doc.getToolbarState(index ?? activeIndexRef.current));
  }, []);

  const reloadDocumentFromServer = useCallback(async () => {
    if (!docId) return;
    const result = await DocumentManager.loadRichText(docId);
    if (!result) return;
    docRef.current = result.document;
    setTitle(result.title);
    titleRef.current = result.title;
    syncFromDoc(result.document, activeIndexRef.current);
    setLastModified(Date.now());
    setDirty(false);
    setSaveStatus('saved');
    saveManagerRef.current?.initialize(
      result.version,
      result.document.toJSON() as unknown as Record<string, unknown>,
      result.title,
    );
  }, [docId, syncFromDoc]);

  const applyDocumentSnapshot = useCallback((
    snapshot: Record<string, unknown>,
    opts?: { markDirty?: boolean; syncTitle?: boolean; preserveCaret?: boolean },
  ) => {
    // 1. 在替换前保存当前光标位置（远端协同变更时不丢失输入焦点）
    const caret = opts?.preserveCaret
      ? (editorSaveRef.current?.captureHistoryCaret() ?? null)
      : null;

    // 2. 应用 snapshot
    const doc = RichDocument.fromJSON(snapshot as unknown as RichDocumentJSON);
    docRef.current = doc;
    if (opts?.syncTitle !== false && typeof snapshot.title === 'string' && snapshot.title.trim()) {
      setTitle(snapshot.title);
      titleRef.current = snapshot.title;
    }
    syncFromDoc(doc, activeIndexRef.current);
    setHistoryRevision(v => v + 1);

    // 3. 恢复光标位置（等 DOM 更新完成后）
    if (caret) {
      requestAnimationFrame(() => {
        editorSaveRef.current?.restoreHistoryCaret(caret);
      });
    }

    if (opts?.markDirty) {
      saveManagerRef.current?.markDirty();
    }
  }, [syncFromDoc]);

  const history = useDocumentHistory({
    docId,
    canRestore: canEdit && !readOnly,
    saveManagerRef,
    applyPreviewSnapshot: (snapshot) => {
      applyDocumentSnapshot(snapshot, { markDirty: false, syncTitle: true });
    },
    reloadCurrentDocument: reloadDocumentFromServer,
    onBeforeOpen: () => setShowAiPanel(false),
  });

  const handleSnapshotReplace = useCallback((snapshot: Record<string, unknown>) => {
    if (history.historyOpenRef.current) return;
    // 远端协同变更：不 markDirty，避免过期 baseVersion 触发 patch 冲突
    // preserveCaret: 保留本地光标位置，避免远端 patch 应用后光标消失
    applyDocumentSnapshot(snapshot, { markDirty: false, syncTitle: false, preserveCaret: true });
    saveManagerRef.current?.adoptRemoteSnapshot(snapshot);
  }, [applyDocumentSnapshot, history.historyOpenRef]);

  const handleSnapshotReplaceRef = useRef(handleSnapshotReplace);
  handleSnapshotReplaceRef.current = handleSnapshotReplace;
  const resolveRichTextLock = useCallback((target: HTMLElement): BlockLockTarget | null => {
    if (target.closest('[data-doc-title]')) return richTextTitleLock();
    const blockEl = target.closest('[data-block-index]');
    if (!blockEl) return null;
    const idx = Number(blockEl.getAttribute('data-block-index'));
    if (!Number.isFinite(idx)) return null;
    return richTextBlockLock(idx);
  }, []);

  useCollabBlockLock({
    readOnly,
    collabBridgeRef,
    resolveLock: resolveRichTextLock,
    isComposing: isRichTextComposing,
    onLockDenied: (lock) => {
      const holder = collabBridgeRef.current
        ?.getRemoteBlockEditors()
        .find(e => e.sheetId === lock.sheetId && e.row === lock.row && e.col === lock.col);
      message.warning(holder ? `${holder.displayName} 正在编辑该区域` : '该区域正在被他人编辑');
    },
  });

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    if (!docId) {
      navigate(appPath.home, { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const features = await fetchSystemFeatures().catch(() => ({ collab: false, comments: false, ai: false }));
      if (cancelled) return;
      setCommentsEnabled(features.comments);
      setAiEnabled(features.ai);

      const result = await DocumentManager.loadRichText(docId, prefetched);
      if (cancelled) return;
      if (!result) {
        navigate(appPath.home, { replace: true });
        return;
      }
      const meta = prefetched ?? await DocumentManager.fetchDocument(docId).catch(() => null);
      if (cancelled) return;
      if (meta?.permission) setDocPermission(meta.permission);

      let document = result.document;
      let threads: DocCommentThread[] = [];
      if (features.comments) {
        try {
          threads = await listDocumentComments(docId);
          if (cancelled) return;
          const markedBlocks = applyCommentMarksFromThreads(document.blocks, threads);
          document = RichDocument.fromJSON({
            ...document.toJSON(),
            content: markedBlocks,
          });
          document.documentId = docId;
        } catch {
          threads = [];
        }
      }
      setCommentThreads(threads);
      docRef.current = document;
      setTitle(result.title);
      titleRef.current = result.title;
      setLastModified(Date.now());
      syncFromDoc(document, 0);
      setActiveIndex(0);
      activeIndexRef.current = 0;
      setDirty(false);
      setSaveStatus('saved');

      if (!readOnly) {
        saveManagerRef.current?.dispose();
        const manager = new SaveManager({
          docId,
          docType: 'richtext',
          debounceMs: 1500,
          getTitle: () => titleRef.current,
          getSnapshot: () => docRef.current!.toJSON() as unknown as Record<string, unknown>,
          onBeforeFlush: () => {
            editorSaveRef.current?.flushBeforeSave();
          },
          saveFull: async (t) => {
            docRef.current!.title = t;
            return DocumentManager.saveRichText(docId, t, docRef.current!);
          },
          savePatch: (input) => DocumentManager.patch(docId, input),
          onStatusChange: (status) => {
            setSaveStatus(status);
            if (status === 'saved') setDirty(false);
          },
          onSaved: () => {
            setLastModified(Date.now());
            const snap = docRef.current?.toJSON();
            if (snap) {
              collabBridgeRef.current?.syncSavedSnapshot(snap as unknown as Record<string, unknown>);
            }
          },
        });
        manager.initialize(result.version, document.toJSON() as unknown as Record<string, unknown>, result.title);
        saveManagerRef.current = manager;

        collabBridgeRef.current?.disconnect();
        if (features.collab) {
          const bridge = new DocumentCollabBridge({
            docId,
            userId: authStore.getState().user?.id ?? '',
            patchKind: 'richtext',
            getToken: () => authStore.getAccessToken(),
            getSnapshot: () => docRef.current?.toJSON() as unknown as Record<string, unknown> | null,
            onSnapshotReplace: (snap) => handleSnapshotReplaceRef.current(snap),
            isLocalEditing: isRichTextComposing,
            onBeforeLocalFlush: () => editorSaveRef.current?.flushBeforeSave(),
            /** 广播 debounce 800ms：减少协同 patch 频率，降低服务端压力 */
            broadcastDebounceMs: 800,
            onPresenceChange: setCollabUsers,
            onBlockEditingChange: setActiveBlockEditors,
            onStateChange: setCollabState,
            onError: (err) => {
              if (err.message.includes('210009') || err.message.includes('正在编辑')) {
                const active = globalThis.document.activeElement;
                if (active instanceof HTMLElement) {
                  active.blur();
                }
              }
              message.warning(`协同: ${err.message}`);
            },
            onCommentUpdate: (senderId, payload) => {
              if (senderId === authStore.getState().user?.id) return;
              setRemoteCommentUpdate(payload);
            },
          });
          bridge.initialize(document.toJSON() as unknown as Record<string, unknown>);
          collabBridgeRef.current = bridge;
          bridge.connect();
        } else {
          collabBridgeRef.current = null;
          setCollabState('idle');
          setCollabUsers([]);
          setActiveBlockEditors([]);
        }
      } else {
        saveManagerRef.current?.dispose();
        saveManagerRef.current = null;
        collabBridgeRef.current?.disconnect();
        collabBridgeRef.current = null;
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      saveManagerRef.current?.dispose();
      collabBridgeRef.current?.disconnect();
      collabBridgeRef.current = null;
      setCollabState('idle');
      setCollabUsers([]);
      setActiveBlockEditors([]);
    };
  }, [docId, navigate, syncFromDoc, prefetched, readOnly]);

  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      const manager = saveManagerRef.current;
      if (!manager) return;
      const hadDirty = manager.isDirty();
      void manager.flush(false);
      if (hadDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, []);

  const markDirty = useCallback(() => {
    if (readOnly) return;
    setDirty(true);
    saveManagerRef.current?.markDirty();
    if (!collabBridgeRef.current?.isApplyingRemote()) {
      collabBridgeRef.current?.scheduleBroadcast();
    }
  }, [readOnly]);

  const handleTitleChange = useCallback((t: string) => {
    if (readOnly) return;
    setTitle(t);
    titleRef.current = t;
    if (docRef.current) docRef.current.title = t;
    saveManagerRef.current?.markTitleDirty();
    collabBridgeRef.current?.scheduleBroadcast();
  }, [readOnly]);

  const handleDownloadAs = useCallback(async (format: DownloadFormat) => {
    if (!isRichDocDownloadFormat(format)) return;
    const doc = docRef.current;
    if (!doc) return;

    setExporting(true);
    const hide = message.loading('正在准备导出...', 0);
    try {
      editorSaveRef.current?.flushBeforeSave();
      const exportFormat = format as RichDocExportFormat;
      const needsEmbed = exportFormat === 'word' || exportFormat === 'pdf';
      await RichDocExport.exportAsync(
        doc.blocks,
        titleRef.current,
        exportFormat,
        needsEmbed ? { prepareBlocks: prepareRichDocBlocksForExport } : undefined,
      );
      hide();
      if (format === 'pdf') {
        message.info('请在打印对话框中选择「存储为 PDF」');
      } else {
        message.success('已开始下载');
      }
    } catch (err) {
      hide();
      message.error(`下载失败: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  }, []);

  const handlePrint = useCallback(() => {
    const hide = message.loading('正在准备打印...', 0);
    void handleDownloadAs('pdf')
      .then(() => hide())
      .catch(() => hide());
  }, [handleDownloadAs]);

  const applyBlocks = useCallback((next: DocBlock[], recordHistory = false, skipSave = false) => {
    const doc = docRef.current;
    if (!doc) return;
    const caret = recordHistory
      ? (editorSaveRef.current?.captureHistoryCaret() ?? null)
      : null;
    doc.setBlocks(next, recordHistory, caret);
    syncFromDoc(doc, activeIndex);
    if (!skipSave) markDirty();
  }, [activeIndex, syncFromDoc, markDirty]);

  const handlePersistCommentCreate = useCallback(async (input: {
    thread: DocCommentThread;
    blocks: DocBlock[];
  }) => {
    if (!docId) return input.thread;
    const firstReply = input.thread.replies[0];
    const saved = await createDocumentComment(docId, {
      id: input.thread.id,
      anchor: input.thread.anchor,
      text: firstReply?.text,
    });
    setCommentThreads(prev => {
      const exists = prev.some(t => t.id === saved.id);
      return exists ? prev.map(t => (t.id === saved.id ? saved : t)) : [...prev, saved];
    });
    return saved;
  }, [docId]);

  const handlePersistCommentReply = useCallback(async (threadId: string, text: string) => {
    if (!docId) return;
    return replyDocumentComment(docId, threadId, text);
  }, [docId]);

  const handlePersistCommentResolve = useCallback(async (threadId: string) => {
    if (!docId) return;
    await resolveDocumentComment(docId, threadId);
    setCommentThreads(prev => prev.map(t => (t.id === threadId ? { ...t, resolved: true } : t)));
  }, [docId]);

  const handlePersistCommentEdit = useCallback(async (threadId: string, replyId: string, text: string) => {
    if (!docId) return;
    return editDocumentCommentReply(docId, threadId, replyId, text);
  }, [docId]);

  const handlePersistCommentDelete = useCallback(async (threadId: string, replyId: string) => {
    if (!docId) return { threadDeleted: false };
    return deleteDocumentCommentReply(docId, threadId, replyId);
  }, [docId]);

  const handlePersistCommentLike = useCallback(async (threadId: string, replyId: string) => {
    if (!docId) return;
    return likeDocumentCommentReply(docId, threadId, replyId);
  }, [docId]);

  const handleToolbarStateChange = useCallback((partial: Partial<ToolbarState>, blockIndex: number) => {
    const doc = docRef.current;
    if (!doc) return;
    setToolbarState(doc.getToolbarState(blockIndex, partial));
  }, []);

  const handleToolbarAction = useCallback((action: ToolbarAction, ctx: DocSelectionContext | null) => {
    const doc = docRef.current;
    if (!doc) return;
    const idx = activeIndex;
    const indices = blockIndicesFromCtx(ctx, idx);

    switch (action.type) {
      case 'undo': {
        const caret = editorSaveRef.current?.captureHistoryCaret() ?? null;
        if (!doc.undo(caret)) break;
        syncFromDoc(doc, idx);
        setHistoryRevision(v => v + 1);
        markDirty();
        requestAnimationFrame(() => {
          editorSaveRef.current?.restoreHistoryCaret(doc.lastRestoredCaret);
        });
        break;
      }
      case 'redo': {
        const caret = editorSaveRef.current?.captureHistoryCaret() ?? null;
        if (!doc.redo(caret)) break;
        syncFromDoc(doc, idx);
        setHistoryRevision(v => v + 1);
        markDirty();
        requestAnimationFrame(() => {
          editorSaveRef.current?.restoreHistoryCaret(doc.lastRestoredCaret);
        });
        break;
      }
      case 'paragraphStyle':
        indices.forEach(i => doc.applyStyleToBlock(i, action.style));
        syncFromDoc(doc, indices[0] ?? idx);
        markDirty();
        break;
      case 'align':
        indices.forEach(i => {
          const block = doc.blocks[i];
          if (isTextBlock(block) && block.type !== 'quote') {
            doc.updateBlock(i, { ...block, align: action.align }, true);
          }
        });
        syncFromDoc(doc, indices[0] ?? idx);
        markDirty();
        break;
      case 'list': {
        if (indices.length > 1) {
          const start = indices[0];
          const end = indices[indices.length - 1];
          const selected = indices.map(i => doc.blocks[i]);
          const listBlock = mergeBlocksToListBlock(
            selected, action.listType, doc.blocks[start]?.id, action.orderedStyle,
          );
          const next = [...doc.blocks];
          next.splice(start, end - start + 1, listBlock);
          doc.setBlocks(next, true);
        } else {
          doc.toggleList(indices[0] ?? idx, action.listType, action.orderedStyle);
        }
        syncFromDoc(doc, indices[0] ?? idx);
        markDirty();
        break;
      }
      case 'quote':
        indices.forEach(i => doc.toggleQuote(i));
        syncFromDoc(doc, indices[0] ?? idx);
        markDirty();
        break;
      case 'code':
        doc.insertCode(indices[0] ?? idx);
        syncFromDoc(doc, (indices[0] ?? idx) + 1);
        setActiveIndex((indices[0] ?? idx) + 1);
        markDirty();
        break;
      case 'divider':
        doc.insertDivider(indices[0] ?? idx);
        syncFromDoc(doc, indices[0] ?? idx);
        markDirty();
        break;
      case 'image':
        doc.insertImage(indices[0] ?? idx, action.url);
        syncFromDoc(doc, indices[0] ?? idx);
        markDirty();
        break;
      case 'new':
        doc.insertBlock((indices[0] ?? idx) + 1, {
          type: 'paragraph', id: `blk_${Date.now()}`, text: '', marks: [], align: 'left',
        }, true);
        syncFromDoc(doc, (indices[0] ?? idx) + 1);
        setActiveIndex((indices[0] ?? idx) + 1);
        markDirty();
        break;
    }
  }, [activeIndex, syncFromDoc, markDirty]);

  if (loading || !docRef.current) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#666' }}>
        正在加载文档...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {(!embedded || breadcrumbItems) && !fullscreen && (
        <DocumentBar
          docId={docId || null}
          title={title}
          showTitle={false}
          saveStatus={saveStatus === 'saved' ? 'saved' : saveStatus === 'saving' ? 'saving' : 'unsaved'}
          onTitleChange={handleTitleChange}
          lastModified={lastModified}
          docType="richtext"
          exporting={exporting}
          onDownloadAs={handleDownloadAs}
          onPrint={handlePrint}
          canEdit={canEdit}
          effectiveViewMode={effectiveViewMode}
          onTogglePreview={onTogglePreview}
          breadcrumbItems={breadcrumbItems}
          showAiToggle={aiEnabled && !!docId && canEdit && !readOnly && !history.historyOpen}
          aiPanelOpen={showAiPanel}
          onToggleAi={() => setShowAiPanel(v => !v)}
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
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <RichDocEditor
        documentId={docId || ''}
        title={title}
        blocks={blocks}
        toolbarState={toolbarState}
        outline={outline}
        showOutline={showOutline}
        fullscreen={fullscreen}
        readOnly={readOnly || history.historyOpen}
        onTitleChange={handleTitleChange}
        onBlocksChange={applyBlocks}
        onToolbarAction={handleToolbarAction}
        onToolbarStateChange={handleToolbarStateChange}
        onToggleOutline={() => setShowOutline(v => !v)}
        onToggleFullscreen={() => setFullscreen(v => !v)}
        onActiveBlockChange={index => {
          setActiveIndex(index);
          activeIndexRef.current = index;
        }}
        historyRevision={historyRevision}
        editorSaveRef={editorSaveRef}
        commentsEnabled={commentsEnabled}
        canComment={canComment}
        commentAuthor={commentAuthor}
        initialCommentThreads={commentThreads}
        remoteCommentUpdate={remoteCommentUpdate}
        onPersistCommentCreate={commentsEnabled && canComment ? handlePersistCommentCreate : undefined}
        onPersistCommentReply={commentsEnabled && canComment ? handlePersistCommentReply : undefined}
        onPersistCommentResolve={commentsEnabled && canComment ? handlePersistCommentResolve : undefined}
        onPersistCommentEdit={commentsEnabled && canComment ? handlePersistCommentEdit : undefined}
        onPersistCommentDelete={commentsEnabled && canComment ? handlePersistCommentDelete : undefined}
        onPersistCommentLike={commentsEnabled ? handlePersistCommentLike : undefined}
      />
      {!readOnly && !history.historyOpen && (
        <CollabStatusBar
          collabState={collabState}
          collabUsers={collabUsers}
          activeEditors={activeBlockEditors}
        />
      )}
        </div>
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
        {aiEnabled && showAiPanel && !history.historyOpen && docId && (
          <DocAiPanel
            documentId={docId}
            documentTitle={title}
            onClose={() => setShowAiPanel(false)}
            onDocumentUpdated={reloadDocumentFromServer}
          />
        )}
      </div>
    </div>
  );
};
