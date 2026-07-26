import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { message } from 'antd';
import {
  DocumentManager,
  SaveManager,
  WhiteboardDocument,
  DocumentCollabBridge,
  isWhiteboardComposing,
  whiteboardElementLock,
  whiteboardMindmapNodeLock,
  whiteboardTableCellLock,
  cloneWhiteboardElements,
  buildWhiteboardCommentAnchor,
  getWhiteboardCommentPin,
  isUnsubmittedCommentThread,
  isWhiteboardCommentAnchor,
  updateCommentThreadAnchor,
  type ActiveCellEditor,
  type BlockLockTarget,
  type CollabConnectionState,
  type CommentUpdatePayload,
  type DocCommentThread,
  type DocumentApiResponse,
  type DocumentPermission,
  type OnlineUser,
  type WhiteboardElement,
  type WhiteboardJSON,
  type WhiteboardViewport,
} from '@lingyi-doc/core';
import {
  WhiteboardEditor,
  DocCommentPanel,
  useDocCommentController,
  downloadWhiteboardElementsAsPng,
  printWhiteboard,
  resolveCommentBindAtPoint,
  syncWhiteboardCommentPinsWithElements,
} from '@lingyi-doc/editor-pro';
import { DocumentBar } from '../components/DocumentBar';
import { CollabStatusBar } from '../components/CollabStatusBar';
import {
  DocumentHistoryPanelSlot,
  DocumentHistoryToolbarSlot,
} from '../components/history/DocumentHistoryChrome';
import { useCollabBlockLock } from '../hooks/useCollabBlockLock';
import { useDocumentHistory } from '../hooks/useDocumentHistory';
import { appPath } from '../utils/appPaths';
import { authStore } from '../stores/authStore';
import type { EditorAccessProps } from '../types/editorAccess';
import { isWhiteboardDownloadFormat, type DownloadFormat } from '../utils/downloadAs';
import { fetchSystemFeatures } from '../api/system';
import {
  createDocumentComment,
  deleteDocumentCommentReply,
  editDocumentCommentReply,
  likeDocumentCommentReply,
  listDocumentComments,
  replyDocumentComment,
  resolveDocumentComment,
  updateDocumentCommentAnchor,
} from '../api/documentComment';

export const WhiteboardEditorPage: React.FC<{ docId?: string; prefetched?: DocumentApiResponse; embedded?: boolean } & EditorAccessProps> = ({
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
  const docRef = useRef<WhiteboardDocument | null>(null);
  const saveManagerRef = useRef<SaveManager | null>(null);
  const collabBridgeRef = useRef<DocumentCollabBridge | null>(null);
  const titleRef = useRef('未命名画板');

  const [collabUsers, setCollabUsers] = useState<OnlineUser[]>([]);
  const [collabState, setCollabState] = useState<CollabConnectionState>('idle');
  const [activeBlockEditors, setActiveBlockEditors] = useState<ActiveCellEditor[]>([]);

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('未命名画板');
  const [elements, setElements] = useState<WhiteboardElement[]>([]);
  const [viewport, setViewport] = useState<WhiteboardViewport>({ x: 80, y: 80, zoom: 1 });
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving' | 'error'>('saved');
  const [lastModified, setLastModified] = useState(Date.now());
  const [exporting, setExporting] = useState(false);
  const [commentsEnabled, setCommentsEnabled] = useState(false);
  const [initialCommentThreads, setInitialCommentThreads] = useState<DocCommentThread[]>([]);
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

  useEffect(() => { titleRef.current = title; }, [title]);

  const syncFromDoc = useCallback((doc: WhiteboardDocument) => {
    setElements(cloneWhiteboardElements(doc.elements));
    setViewport({ ...doc.viewport });
  }, []);

  const reloadDocumentFromServer = useCallback(async () => {
    if (!docId) return;
    const result = await DocumentManager.loadWhiteboard(docId);
    if (!result) return;
    docRef.current = result.document;
    setTitle(result.title);
    titleRef.current = result.title;
    syncFromDoc(result.document);
    setSaveStatus('saved');
    setLastModified(Date.now());
    saveManagerRef.current?.initialize(
      result.version,
      result.document.toJSON() as unknown as Record<string, unknown>,
      result.title,
    );
  }, [docId, syncFromDoc]);

  const applyDocumentSnapshot = useCallback((
    snapshot: Record<string, unknown>,
    opts?: { markDirty?: boolean; syncTitle?: boolean },
  ) => {
    const doc = WhiteboardDocument.fromJSON(snapshot as unknown as WhiteboardJSON);
    docRef.current = doc;
    if (opts?.syncTitle !== false && typeof snapshot.title === 'string' && snapshot.title.trim()) {
      setTitle(snapshot.title);
      titleRef.current = snapshot.title;
    }
    syncFromDoc(doc);
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
  });

  const handleSnapshotReplace = useCallback((snapshot: Record<string, unknown>) => {
    if (history.historyOpenRef.current) return;
    applyDocumentSnapshot(snapshot, { markDirty: false, syncTitle: false });
    saveManagerRef.current?.adoptRemoteSnapshot(snapshot);
  }, [applyDocumentSnapshot, history.historyOpenRef]);

  const handleSnapshotReplaceRef = useRef(handleSnapshotReplace);
  handleSnapshotReplaceRef.current = handleSnapshotReplace;

  const resolveWhiteboardLock = useCallback((target: HTMLElement): BlockLockTarget | null => {
    const lockEl = target.closest('[data-wb-lock-id]');
    if (!lockEl) return null;
    const lockId = lockEl.getAttribute('data-wb-lock-id');
    if (!lockId) return null;

    const rowAttr = lockEl.getAttribute('data-wb-lock-row');
    const colAttr = lockEl.getAttribute('data-wb-lock-col');
    if (rowAttr != null && colAttr != null) {
      const row = Number(rowAttr);
      const col = Number(colAttr);
      if (Number.isFinite(row) && Number.isFinite(col)) {
        return whiteboardTableCellLock(lockId, row, col);
      }
    }

    const sep = lockId.indexOf(':');
    if (sep > 0) {
      return whiteboardMindmapNodeLock(lockId.slice(0, sep), lockId.slice(sep + 1));
    }
    return whiteboardElementLock(lockId);
  }, []);

  useCollabBlockLock({
    readOnly,
    collabBridgeRef,
    resolveLock: resolveWhiteboardLock,
    isComposing: isWhiteboardComposing,
    onLockDenied: (lock) => {
      const holder = collabBridgeRef.current
        ?.getRemoteBlockEditors()
        .find(e => e.sheetId === lock.sheetId && e.row === lock.row && e.col === lock.col);
      message.warning(holder ? `${holder.displayName} 正在编辑该区域` : '该区域正在被他人编辑');
    },
  });

  useEffect(() => {
    if (!docId) {
      navigate(appPath.home, { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const features = await fetchSystemFeatures().catch(() => ({ collab: false, comments: false }));
      if (cancelled) return;
      setCommentsEnabled(features.comments);

      const result = await DocumentManager.loadWhiteboard(docId, prefetched);
      if (cancelled) return;
      if (!result) {
        navigate(appPath.home, { replace: true });
        return;
      }

      const meta = prefetched ?? await DocumentManager.fetchDocument(docId).catch(() => null);
      if (cancelled) return;
      if (meta?.permission) setDocPermission(meta.permission);

      let threads: DocCommentThread[] = [];
      if (features.comments) {
        try {
          threads = await listDocumentComments(docId);
          if (cancelled) return;
        } catch {
          threads = [];
        }
      }
      setInitialCommentThreads(threads);

      docRef.current = result.document;
      setTitle(result.title);
      titleRef.current = result.title;
      syncFromDoc(result.document);
      setSaveStatus('saved');

      if (!readOnly) {
        saveManagerRef.current?.dispose();
        const manager = new SaveManager({
          docId,
          docType: 'whiteboard',
          debounceMs: 1500,
          getTitle: () => titleRef.current,
          getSnapshot: () => docRef.current!.toJSON() as unknown as Record<string, unknown>,
          saveFull: async (t) => {
            docRef.current!.title = t;
            return DocumentManager.saveWhiteboard(docId, t, docRef.current!);
          },
          savePatch: (input) => DocumentManager.patch(docId, input),
          onStatusChange: (status) => {
            setSaveStatus(status);
            if (status === 'saved') setSaveStatus('saved');
          },
          onSaved: () => {
            setLastModified(Date.now());
            const snap = docRef.current?.toJSON();
            if (snap) {
              collabBridgeRef.current?.syncSavedSnapshot(snap as unknown as Record<string, unknown>);
            }
          },
        });
        manager.initialize(result.version, result.document.toJSON() as unknown as Record<string, unknown>, result.title);
        saveManagerRef.current = manager;

        collabBridgeRef.current?.disconnect();
        if (features.collab) {
          const bridge = new DocumentCollabBridge({
            docId,
            userId: authStore.getState().user?.id ?? '',
            patchKind: 'whiteboard',
            getToken: () => authStore.getAccessToken(),
            getSnapshot: () => docRef.current?.toJSON() as unknown as Record<string, unknown> | null,
            onSnapshotReplace: (snap) => handleSnapshotReplaceRef.current(snap),
            isLocalEditing: isWhiteboardComposing,
            onPresenceChange: setCollabUsers,
            onBlockEditingChange: setActiveBlockEditors,
            onStateChange: setCollabState,
            onError: (err) => {
              if (err.message.includes('210009') || err.message.includes('正在编辑')) {
                if (document.activeElement instanceof HTMLElement) {
                  document.activeElement.blur();
                }
              }
              message.warning(`协同: ${err.message}`);
            },
            onCommentUpdate: (senderId, payload) => {
              if (senderId === authStore.getState().user?.id) return;
              setRemoteCommentUpdate(payload);
            },
          });
          bridge.initialize(result.document.toJSON() as unknown as Record<string, unknown>);
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
    if (readOnly || history.historyOpenRef.current) return;
    saveManagerRef.current?.markDirty();
    if (!collabBridgeRef.current?.isApplyingRemote()) {
      collabBridgeRef.current?.scheduleBroadcast();
    }
  }, [readOnly, history.historyOpenRef]);

  const handleTitleChange = useCallback((t: string) => {
    if (readOnly) return;
    setTitle(t);
    titleRef.current = t;
    if (docRef.current) docRef.current.title = t;
    saveManagerRef.current?.markTitleDirty();
  }, [readOnly]);

  const handleDownloadAs = useCallback(async (format: DownloadFormat) => {
    if (!isWhiteboardDownloadFormat(format)) return;
    const doc = docRef.current;
    if (!doc) return;

    setExporting(true);
    const hide = message.loading('正在生成图片...', 0);
    try {
      await downloadWhiteboardElementsAsPng(doc.elements, titleRef.current);
      hide();
      message.success('已开始下载');
    } catch (err) {
      hide();
      message.error(`下载失败: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  }, []);

  const handlePrint = useCallback(async () => {
    const doc = docRef.current;
    if (!doc) return;

    setExporting(true);
    const hide = message.loading('正在准备打印...', 0);
    try {
      await printWhiteboard(doc.elements, titleRef.current);
      hide();
    } catch (err) {
      hide();
      message.error(`打印失败: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  }, []);

  const handleElementsChange = useCallback((next: WhiteboardElement[], recordHistory = true) => {
    const doc = docRef.current;
    if (!doc || readOnly) return;
    doc.setElements(next, recordHistory);
    syncFromDoc(doc);
    markDirty();
  }, [markDirty, readOnly, syncFromDoc]);

  const handleViewportChange = useCallback((patch: Partial<WhiteboardViewport>, recordHistory = false) => {
    const doc = docRef.current;
    if (!doc) return;
    doc.setViewport(patch, recordHistory);
    syncFromDoc(doc);
    if (recordHistory) markDirty();
  }, [markDirty, syncFromDoc]);

  const handleElementUpdate = useCallback((id: string, patch: Partial<WhiteboardElement>, recordHistory = false) => {
    const doc = docRef.current;
    if (!doc || readOnly) return;
    doc.updateElement(id, patch, recordHistory);
    syncFromDoc(doc);
    markDirty();
  }, [markDirty, readOnly, syncFromDoc]);

  const commentCtrl = useDocCommentController({
    enabled: commentsEnabled,
    canComment,
    commentAuthor,
    initialThreads: initialCommentThreads,
    remoteCommentUpdate,
    filterThread: docId
      ? thread => isWhiteboardCommentAnchor(thread.anchor) && thread.anchor.blockId === `whiteboard:${docId}`
      : undefined,
    onPersistCreate: commentsEnabled && canComment && docId
      ? async ({ thread }) => createDocumentComment(docId, {
          id: thread.id,
          anchor: thread.anchor,
          text: thread.replies[0]?.text,
        })
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

  const elementsRefForComments = useRef(elements);
  elementsRefForComments.current = elements;

  const handleElementsChangeWithCommentFollow = useCallback((next: WhiteboardElement[], recordHistory = true) => {
    const prevElements = elementsRefForComments.current;
    handleElementsChange(next, recordHistory);
    if (!commentsEnabled || !canComment || !docId || !recordHistory) return;

    const { threads: syncedThreads, changedIds } = syncWhiteboardCommentPinsWithElements(
      commentCtrl.allCommentThreads,
      next,
    );
    if (!changedIds.length) return;
    commentCtrl.setCommentThreads(syncedThreads);
    for (const threadId of changedIds) {
      const thread = syncedThreads.find(t => t.id === threadId);
      if (!thread) continue;
      void updateDocumentCommentAnchor(
        docId,
        threadId,
        thread.anchor.start,
        thread.anchor.end,
      ).catch(() => {
        commentCtrl.setCommentThreads(cur => syncWhiteboardCommentPinsWithElements(cur, prevElements).threads);
      });
    }
  }, [canComment, commentCtrl, commentsEnabled, docId, handleElementsChange]);

  const scrollToWhiteboardComment = useCallback((threadId: string) => {
    const thread = commentCtrl.allCommentThreads.find(t => t.id === threadId);
    if (!thread) return;
    const pin = getWhiteboardCommentPin(thread.anchor);
    const rect = { width: window.innerWidth, height: window.innerHeight - 120 };
    handleViewportChange({
      x: rect.width / 2 - pin.x * viewport.zoom,
      y: rect.height / 2 - pin.y * viewport.zoom,
    }, false);
  }, [commentCtrl.allCommentThreads, handleViewportChange, viewport.zoom]);

  const handleSelectWhiteboardComment = useCallback((id: string) => {
    commentCtrl.handleSelectComment(id);
    commentCtrl.setShowCommentPanel(true);
    scrollToWhiteboardComment(id);
  }, [commentCtrl, scrollToWhiteboardComment]);

  const handleRequestAddComment = useCallback((input: {
    elementId?: string;
    mindNodeId?: string;
    pinX: number;
    pinY: number;
    quote: string;
    pinOffsetX?: number;
    pinOffsetY?: number;
  }) => {
    if (!docId || !canComment) return;
    const anchor = buildWhiteboardCommentAnchor({
      docId,
      elementId: input.elementId,
      mindNodeId: input.mindNodeId,
      pinX: input.pinX,
      pinY: input.pinY,
      quote: input.quote,
      pinOffsetX: input.pinOffsetX,
      pinOffsetY: input.pinOffsetY,
    });

    // 仅允许一条未提交评论：新落点替换旧草稿锚点，不另建 thread
    const existingDraft = commentCtrl.allCommentThreads.find(
      t => isUnsubmittedCommentThread(t) && isWhiteboardCommentAnchor(t.anchor),
    );
    if (existingDraft) {
      commentCtrl.setCommentThreads(cur => updateCommentThreadAnchor(cur, existingDraft.id, anchor));
      commentCtrl.setSelectedCommentId(existingDraft.id);
      commentCtrl.setShowCommentPanel(true);
      const meta = input.elementId
        ? {
            quote: input.quote,
            anchorType: anchor.anchorType,
            elementId: input.elementId,
            mindNodeId: input.mindNodeId,
            pinOffsetX: input.pinOffsetX,
            pinOffsetY: input.pinOffsetY,
          }
        : {
            quote: input.quote,
            clearBind: true as const,
          };
      void (async () => {
        const tryUpdate = () => updateDocumentCommentAnchor(
          docId,
          existingDraft.id,
          input.pinX,
          input.pinY,
          meta,
        );
        try {
          await tryUpdate();
        } catch {
          // 常见于「首条草稿尚在创建」时立刻换点，稍后再试一次
          try {
            await new Promise(r => setTimeout(r, 400));
            await tryUpdate();
          } catch {
            message.error('更新评论位置失败');
          }
        }
      })();
      return;
    }

    commentCtrl.requestAddComment(anchor);
  }, [canComment, commentCtrl, docId]);

  const handleCommentPinMove = useCallback((threadId: string, pinX: number, pinY: number) => {
    if (!docId) return;
    const prevThreads = commentCtrl.allCommentThreads;
    const bind = resolveCommentBindAtPoint(elements, { x: pinX, y: pinY });
    const anchor = bind
      ? buildWhiteboardCommentAnchor({
          docId,
          elementId: bind.elementId,
          mindNodeId: bind.mindNodeId,
          pinX,
          pinY,
          quote: bind.quote,
          pinOffsetX: bind.pinOffsetX,
          pinOffsetY: bind.pinOffsetY,
        })
      : buildWhiteboardCommentAnchor({
          docId,
          pinX,
          pinY,
          quote: '画板',
        });

    commentCtrl.setCommentThreads(cur => updateCommentThreadAnchor(cur, threadId, {
      ...anchor,
      blockId: cur.find(t => t.id === threadId)?.anchor.blockId ?? anchor.blockId,
    }));

    void updateDocumentCommentAnchor(
      docId,
      threadId,
      pinX,
      pinY,
      bind
        ? {
            quote: bind.quote,
            anchorType: anchor.anchorType,
            elementId: bind.elementId,
            mindNodeId: bind.mindNodeId,
            pinOffsetX: bind.pinOffsetX,
            pinOffsetY: bind.pinOffsetY,
          }
        : {
            quote: '画板',
            clearBind: true,
          },
    ).catch(() => {
      commentCtrl.setCommentThreads(prevThreads);
      message.error('更新评论位置失败');
    });
  }, [commentCtrl, docId, elements]);

  if (loading || !docRef.current) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#666' }}>
        正在加载画板...
      </div>
    );
  }

  const doc = docRef.current;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {(!embedded || breadcrumbItems) && (
        <DocumentBar
          docId={docId || null}
          title={title}
          showTitle={false}
          saveStatus={saveStatus === 'saved' ? 'saved' : saveStatus === 'saving' ? 'saving' : 'unsaved'}
          onTitleChange={handleTitleChange}
          lastModified={lastModified}
          docType="whiteboard"
          exporting={exporting}
          onDownloadAs={handleDownloadAs}
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
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <WhiteboardEditor
          title={title}
          elements={elements}
          viewport={viewport}
          readOnly={readOnly || history.historyOpen}
          embedded={embedded}
          canUndo={doc.canUndo()}
          canRedo={doc.canRedo()}
          onTitleChange={handleTitleChange}
          onElementsChange={handleElementsChangeWithCommentFollow}
          onViewportChange={handleViewportChange}
          onElementUpdate={handleElementUpdate}
          onUndo={() => {
            if (doc.undo()) {
              syncFromDoc(doc);
              markDirty();
            }
          }}
          onRedo={() => {
            if (doc.redo()) {
              syncFromDoc(doc);
              markDirty();
            }
          }}
          commentsEnabled={commentsEnabled && canComment && !history.historyOpen}
          commentThreads={commentCtrl.commentThreads}
          selectedCommentId={commentCtrl.selectedCommentId}
          onSelectComment={handleSelectWhiteboardComment}
          onCommentPinMove={canComment && !history.historyOpen ? handleCommentPinMove : undefined}
          onRequestAddComment={canComment && !history.historyOpen ? handleRequestAddComment : undefined}
        />

        {commentsEnabled && commentCtrl.showCommentPanel && !history.historyOpen && (
          <DocCommentPanel
            threads={commentCtrl.commentThreads}
            selectedId={commentCtrl.selectedCommentId}
            onSelect={handleSelectWhiteboardComment}
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
      {!readOnly && !history.historyOpen && (
        <CollabStatusBar
          collabState={collabState}
          collabUsers={collabUsers}
          activeEditors={activeBlockEditors}
        />
      )}
    </div>
  );
};
