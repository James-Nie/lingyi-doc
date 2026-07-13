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
} from '@lingyi-doc/core';
import { RichDocEditor, prepareRichDocBlocksForExport, type ToolbarAction, type RichDocEditorSaveRef } from '@lingyi-doc/editor';
import { DocumentBar } from '../components/DocumentBar';
import { CollabStatusBar } from '../components/CollabStatusBar';
import { isCollabViewOnly, useCollabBlockLock } from '../hooks/useCollabBlockLock';
import { appPath } from '../utils/appPaths';
import { authStore } from '../stores/authStore';
import type { EditorAccessProps } from '../types/editorAccess';
import { isRichDocDownloadFormat, type DownloadFormat } from '../utils/downloadAs';
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
  const [activeBlockEditor, setActiveBlockEditor] = useState<ActiveCellEditor | null>(null);
  const myUserIdRef = useRef(authStore.getState().user?.id ?? '');

  const collabViewOnly = isCollabViewOnly(readOnly, collabState, activeBlockEditor, myUserIdRef.current);

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

  useEffect(() => { titleRef.current = title; }, [title]);

  const syncFromDoc = useCallback((doc: RichDocument, index?: number) => {
    setBlocks([...doc.blocks]);
    setOutline(doc.getOutline());
    setToolbarState(doc.getToolbarState(index ?? activeIndexRef.current));
  }, []);

  const handleSnapshotReplace = useCallback((snapshot: Record<string, unknown>) => {
    const doc = RichDocument.fromJSON(snapshot as unknown as RichDocumentJSON);
    docRef.current = doc;
    syncFromDoc(doc, activeIndexRef.current);
    setHistoryRevision(v => v + 1);
    saveManagerRef.current?.markDirty();
  }, [syncFromDoc]);

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
      const features = await fetchSystemFeatures().catch(() => ({ collab: false, comments: false }));
      if (cancelled) return;
      setCommentsEnabled(features.comments);

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
        const bridge = new DocumentCollabBridge({
          docId,
          userId: authStore.getState().user?.id ?? '',
          patchKind: 'richtext',
          getToken: () => authStore.getAccessToken(),
          getSnapshot: () => docRef.current?.toJSON() as unknown as Record<string, unknown> | null,
          onSnapshotReplace: (snap) => handleSnapshotReplaceRef.current(snap),
          isLocalEditing: isRichTextComposing,
          onBeforeLocalFlush: () => editorSaveRef.current?.flushBeforeSave(),
          onPresenceChange: setCollabUsers,
          onBlockEditingChange: setActiveBlockEditor,
          onStateChange: setCollabState,
          onError: (err) => message.warning(`协同: ${err.message}`),
          onCommentUpdate: (senderId, payload) => {
            if (senderId === authStore.getState().user?.id) return;
            setRemoteCommentUpdate(payload);
          },
        });
        bridge.initialize(document.toJSON() as unknown as Record<string, unknown>);
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

  const applyBlocks = useCallback((next: DocBlock[], recordHistory = false) => {
    const doc = docRef.current;
    if (!doc) return;
    doc.setBlocks(next, recordHistory);
    syncFromDoc(doc, activeIndex);
    markDirty();
  }, [activeIndex, syncFromDoc, markDirty]);

  const handlePersistCommentCreate = useCallback(async (input: {
    thread: DocCommentThread;
    blocks: DocBlock[];
  }) => {
    if (!docId) return input.thread;
    const saved = await createDocumentComment(docId, {
      id: input.thread.id,
      anchor: input.thread.anchor,
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
      case 'undo':
        doc.undo();
        syncFromDoc(doc, idx);
        setHistoryRevision(v => v + 1);
        markDirty();
        break;
      case 'redo':
        doc.redo();
        syncFromDoc(doc, idx);
        setHistoryRevision(v => v + 1);
        markDirty();
        break;
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
        />
      )}
      <RichDocEditor
        documentId={docId || ''}
        title={title}
        blocks={blocks}
        toolbarState={toolbarState}
        outline={outline}
        showOutline={showOutline}
        fullscreen={fullscreen}
        readOnly={readOnly || collabViewOnly}
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
