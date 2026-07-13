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
  isWhiteboardCommentAnchor,
  updateCommentThreadPin,
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
import { WhiteboardEditor, DocCommentPanel, useDocCommentController, downloadWhiteboardElementsAsPng, printWhiteboard } from '@lingyi-doc/editor';
import { DocumentBar } from '../components/DocumentBar';
import { CollabStatusBar } from '../components/CollabStatusBar';
import { isCollabViewOnly, useCollabBlockLock } from '../hooks/useCollabBlockLock';
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
  const [activeBlockEditor, setActiveBlockEditor] = useState<ActiveCellEditor | null>(null);
  const myUserIdRef = useRef(authStore.getState().user?.id ?? '');

  const collabViewOnly = isCollabViewOnly(readOnly, collabState, activeBlockEditor, myUserIdRef.current);

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

  const handleSnapshotReplace = useCallback((snapshot: Record<string, unknown>) => {
    const doc = WhiteboardDocument.fromJSON(snapshot as unknown as WhiteboardJSON);
    docRef.current = doc;
    syncFromDoc(doc);
    saveManagerRef.current?.markDirty();
  }, [syncFromDoc]);

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
        const bridge = new DocumentCollabBridge({
          docId,
          userId: authStore.getState().user?.id ?? '',
          patchKind: 'whiteboard',
          getToken: () => authStore.getAccessToken(),
          getSnapshot: () => docRef.current?.toJSON() as unknown as Record<string, unknown> | null,
          onSnapshotReplace: (snap) => handleSnapshotReplaceRef.current(snap),
          isLocalEditing: isWhiteboardComposing,
          onPresenceChange: setCollabUsers,
          onBlockEditingChange: setActiveBlockEditor,
          onStateChange: setCollabState,
          onCommentUpdate: (senderId, payload) => {
            if (senderId === authStore.getState().user?.id) return;
            setRemoteCommentUpdate(payload);
          },
        });
        bridge.initialize(result.document.toJSON() as unknown as Record<string, unknown>);
        collabBridgeRef.current = bridge;
        bridge.connect();
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
      setActiveBlockEditor(null);
    };
  }, [docId, navigate, syncFromDoc, prefetched, readOnly]);

  useEffect(() => {
    const onLeave = () => { void saveManagerRef.current?.flush(true); };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, []);

  const markDirty = useCallback(() => {
    if (readOnly) return;
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
    elementId: string;
    mindNodeId?: string;
    pinX: number;
    pinY: number;
    quote: string;
  }) => {
    if (!docId || !canComment) return;
    const anchor = buildWhiteboardCommentAnchor({
      docId,
      elementId: input.elementId,
      mindNodeId: input.mindNodeId,
      pinX: input.pinX,
      pinY: input.pinY,
      quote: input.quote,
    });
    commentCtrl.requestAddComment(anchor);
  }, [canComment, commentCtrl, docId]);

  const handleCommentPinMove = useCallback((threadId: string, pinX: number, pinY: number) => {
    if (!docId) return;
    const prevThreads = commentCtrl.allCommentThreads;
    commentCtrl.setCommentThreads(cur => updateCommentThreadPin(cur, threadId, pinX, pinY));
    void updateDocumentCommentAnchor(docId, threadId, pinX, pinY).catch(() => {
      commentCtrl.setCommentThreads(prevThreads);
      message.error('更新评论位置失败');
    });
  }, [commentCtrl, docId]);

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
        />
      )}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <WhiteboardEditor
          title={title}
          elements={elements}
          viewport={viewport}
          readOnly={readOnly || collabViewOnly}
          embedded={embedded}
          canUndo={doc.canUndo()}
          canRedo={doc.canRedo()}
          onTitleChange={handleTitleChange}
          onElementsChange={handleElementsChange}
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
          commentsEnabled={commentsEnabled && canComment}
          commentThreads={commentCtrl.commentThreads}
          selectedCommentId={commentCtrl.selectedCommentId}
          onSelectComment={handleSelectWhiteboardComment}
          onCommentPinMove={canComment ? handleCommentPinMove : undefined}
          onRequestAddComment={canComment ? handleRequestAddComment : undefined}
        />

        {commentsEnabled && commentCtrl.showCommentPanel && (
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
      </div>
      {!readOnly && (
        <CollabStatusBar
          collabState={collabState}
          collabUsers={collabUsers}
          collabViewOnly={collabViewOnly}
          activeBlockEditor={activeBlockEditor}
        />
      )}
    </div>
  );
};
