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
import { MindNoteEditor, printMindNoteMap } from '@lingyi-doc/editor';
import { DocumentBar } from '../components/DocumentBar';
import { CollabStatusBar } from '../components/CollabStatusBar';
import { isCollabViewOnly, useCollabBlockLock } from '../hooks/useCollabBlockLock';
import { appPath } from '../utils/appPaths';
import { authStore } from '../stores/authStore';
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
  const [activeBlockEditor, setActiveBlockEditor] = useState<ActiveCellEditor | null>(null);
  const myUserIdRef = useRef(authStore.getState().user?.id ?? '');

  const collabViewOnly = isCollabViewOnly(readOnly, collabState, activeBlockEditor, myUserIdRef.current);

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

  const handleSnapshotReplace = useCallback((snapshot: Record<string, unknown>) => {
    const doc = MindNoteDocument.fromJSON(snapshot as unknown as MindNoteJSON);
    docRef.current = doc;
    syncFromDoc(doc);
    saveManagerRef.current?.markDirty();
  }, [syncFromDoc]);

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
  });

  useEffect(() => {
    if (!docId) {
      navigate(appPath.home, { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
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
        const bridge = new DocumentCollabBridge({
          docId,
          userId: authStore.getState().user?.id ?? '',
          patchKind: 'mindnote',
          getToken: () => authStore.getAccessToken(),
          getSnapshot: () => docRef.current?.toJSON() as unknown as Record<string, unknown> | null,
          onSnapshotReplace: (snap) => handleSnapshotReplaceRef.current(snap),
          isLocalEditing: isMindNoteComposing,
          onPresenceChange: setCollabUsers,
          onBlockEditingChange: setActiveBlockEditor,
          onStateChange: setCollabState,
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
        />
      )}
      <MindNoteEditor
        title={title}
        root={root}
        settings={settings}
        readOnly={readOnly || collabViewOnly}
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
