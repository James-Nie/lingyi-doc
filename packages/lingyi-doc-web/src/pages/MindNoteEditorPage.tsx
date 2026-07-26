import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { message } from 'antd';
import {
  DocumentManager,
  MindNoteDocument,
  SaveManager,
  DocumentCollabBridge,
  isMindNoteComposing,
  mindnoteNodeLock,
  cloneMindNode,
  printMindNoteOutline,
  type ActiveCellEditor,
  type BlockLockTarget,
  type CollabConnectionState,
  type DocumentApiResponse,
  type MindNode,
  type MindNoteJSON,
  type MindNoteSettings,
  type OnlineUser,
} from '@lingyi-doc/core';
import { MindNoteEditor, printMindNoteMap } from '@lingyi-doc/editor-pro';
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
import { fetchSystemFeatures } from '../api/system';
import type { EditorAccessProps } from '../types/editorAccess';

export const MindNoteEditorPage: React.FC<{ docId?: string; prefetched?: DocumentApiResponse; embedded?: boolean } & EditorAccessProps> = ({
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
  const docRef = useRef<MindNoteDocument | null>(null);
  const saveManagerRef = useRef<SaveManager | null>(null);
  const collabBridgeRef = useRef<DocumentCollabBridge | null>(null);
  const titleRef = useRef('未命名思维笔记');
  const activeNodeIdRef = useRef<string | null>(null);

  const [collabUsers, setCollabUsers] = useState<OnlineUser[]>([]);
  const [collabState, setCollabState] = useState<CollabConnectionState>('idle');
  const [activeBlockEditors, setActiveBlockEditors] = useState<ActiveCellEditor[]>([]);

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('未命名思维笔记');
  const [root, setRoot] = useState<MindNode | null>(null);
  const [settings, setSettings] = useState<MindNoteSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving' | 'error'>('saved');
  const [lastModified, setLastModified] = useState(Date.now());
  const [historyTick, setHistoryTick] = useState(0);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { activeNodeIdRef.current = activeNodeId; }, [activeNodeId]);

  const syncFromDoc = useCallback((doc: MindNoteDocument) => {
    setRoot(cloneMindNode(doc.root));
    setSettings({ ...doc.settings });
    setHistoryTick(v => v + 1);
  }, []);

  const reloadDocumentFromServer = useCallback(async () => {
    if (!docId) return;
    const result = await DocumentManager.loadMindNote(docId);
    if (!result) return;
    docRef.current = result.document;
    setTitle(result.title);
    titleRef.current = result.title;
    syncFromDoc(result.document);
    setDirty(false);
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
    const doc = MindNoteDocument.fromJSON(snapshot as unknown as MindNoteJSON);
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

  const resolveMindnoteLock = useCallback((target: HTMLElement): BlockLockTarget | null => {
    const nodeId = target.closest('[data-node-id]')?.getAttribute('data-node-id');
    if (!nodeId) return null;
    return mindnoteNodeLock(nodeId);
  }, []);

  useCollabBlockLock({
    readOnly,
    collabBridgeRef,
    resolveLock: resolveMindnoteLock,
    isComposing: isMindNoteComposing,
    fallbackNodeIdRef: activeNodeIdRef,
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
      const features = await fetchSystemFeatures().catch(() => ({ collab: false, comments: false, ai: false }));
      if (cancelled) return;
      const result = await DocumentManager.loadMindNote(docId, prefetched);
      if (cancelled) return;
      if (!result) {
        navigate(appPath.home, { replace: true });
        return;
      }
      docRef.current = result.document;
      setTitle(result.title);
      titleRef.current = result.title;
      syncFromDoc(result.document);
      setActiveNodeId(result.document.settings.viewMode === 'map' ? null : result.document.root.id);
      setDirty(false);
      setSaveStatus('saved');

      if (!readOnly) {
        saveManagerRef.current?.dispose();
        const manager = new SaveManager({
          docId,
          docType: 'mindnote',
          debounceMs: 1500,
          getTitle: () => titleRef.current,
          getSnapshot: () => docRef.current!.toJSON() as unknown as Record<string, unknown>,
          saveFull: async (t) => {
            docRef.current!.title = t;
            return DocumentManager.saveMindNote(docId, t, docRef.current!);
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
        manager.initialize(result.version, result.document.toJSON() as unknown as Record<string, unknown>, result.title);
        saveManagerRef.current = manager;

        collabBridgeRef.current?.disconnect();
        if (features.collab) {
          const bridge = new DocumentCollabBridge({
            docId,
            userId: authStore.getState().user?.id ?? '',
            patchKind: 'mindnote',
            getToken: () => authStore.getAccessToken(),
            getSnapshot: () => docRef.current?.toJSON() as unknown as Record<string, unknown> | null,
            onSnapshotReplace: (snap) => handleSnapshotReplaceRef.current(snap),
            isLocalEditing: isMindNoteComposing,
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
    setDirty(true);
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

  const handleNodeTextChange = useCallback((id: string, text: string) => {
    const doc = docRef.current;
    if (!doc) return;
    doc.updateNodeText(id, text);
    if (id === doc.root.id) {
      const nextTitle = text || '未命名思维笔记';
      setTitle(nextTitle);
      titleRef.current = nextTitle;
      doc.title = nextTitle;
    }
    syncFromDoc(doc);
    markDirty();
  }, [markDirty, syncFromDoc]);

  const handleSettingsChange = useCallback((partial: Partial<MindNoteSettings>) => {
    const doc = docRef.current;
    if (!doc) return;
    if (readOnly) {
      setSettings(prev => (prev ? { ...prev, ...partial } : prev));
      return;
    }
    doc.updateSettings(partial);
    syncFromDoc(doc);
    markDirty();
  }, [markDirty, syncFromDoc, readOnly]);

  const handlePrint = useCallback(async () => {
    const doc = docRef.current;
    if (!doc || !root || !settings) return;

    setExporting(true);
    const hide = message.loading('正在准备打印...', 0);
    try {
      if (settings.viewMode === 'map') {
        await printMindNoteMap(root, settings.structure, settings.branchStyle, titleRef.current);
      } else {
        await printMindNoteOutline(root, titleRef.current);
      }
      hide();
    } catch (err) {
      hide();
      message.error(`打印失败: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  }, [root, settings]);

  const withHistory = useCallback((fn: () => void) => {
    fn();
    const doc = docRef.current;
    if (doc) syncFromDoc(doc);
    markDirty();
  }, [markDirty, syncFromDoc]);

  if (loading || !docRef.current || !root || !settings) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#666' }}>
        正在加载思维笔记...
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
          exporting={exporting}
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
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <MindNoteEditor
        title={title}
        root={root}
        settings={settings}
        readOnly={readOnly || history.historyOpen}
        canUndo={doc.canUndo()}
        canRedo={doc.canRedo()}
        onTitleChange={handleTitleChange}
        onRootChange={(newRoot, recordHistory = true) => {
          doc.setRoot(newRoot, recordHistory);
          if (newRoot.text !== title) setTitle(newRoot.text || '未命名思维笔记');
          syncFromDoc(doc);
          markDirty();
        }}
        onSettingsChange={handleSettingsChange}
        onNodeTextChange={handleNodeTextChange}
        onInsertSibling={id => {
          let newId: string | null = null;
          withHistory(() => { newId = doc.insertSibling(id); });
          return newId;
        }}
        onInsertChild={id => {
          let newId: string | null = null;
          withHistory(() => { newId = doc.insertChild(id); });
          return newId;
        }}
        onInsertParent={id => {
          let newId: string | null = null;
          withHistory(() => { newId = doc.insertParent(id); });
          return newId;
        }}
        onDeleteNode={id => withHistory(() => doc.deleteNode(id))}
        onDuplicateNode={id => {
          let newId: string | null = null;
          withHistory(() => { newId = doc.duplicateNode(id); });
          return newId;
        }}
        onToggleCollapse={id => withHistory(() => doc.toggleCollapse(id))}
        onExpandChildren={id => withHistory(() => doc.expandChildren(id))}
        onNodeUpdate={(id, patch) => withHistory(() => doc.updateNode(id, patch))}
        onBulkNodeUpdate={(ids, patch) => withHistory(() => ids.forEach(id => doc.updateNode(id, patch)))}
        onBulkDelete={ids => withHistory(() => ids.forEach(id => doc.deleteNode(id)))}
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
        onActiveNodeChange={setActiveNodeId}
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
      </div>
    </div>
  );
};
