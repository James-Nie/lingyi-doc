import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DocumentManager,
  MindNoteDocument,
  SaveManager,
  cloneMindNode,
  type DocumentApiResponse,
  type MindNode,
  type MindNoteSettings,
} from '@lingyi-doc/core';
import { MindNoteEditor } from '@lingyi-doc/editor';
import { DocumentBar } from '../components/DocumentBar';
import { appPath } from '../utils/appPaths';
import type { EditorAccessProps } from '../types/editorAccess';

export const MindNoteEditorPage: React.FC<{ docId?: string; prefetched?: DocumentApiResponse; embedded?: boolean } & EditorAccessProps> = ({
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
  const docRef = useRef<MindNoteDocument | null>(null);
  const saveManagerRef = useRef<SaveManager | null>(null);
  const titleRef = useRef('未命名思维笔记');

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('未命名思维笔记');
  const [root, setRoot] = useState<MindNode | null>(null);
  const [settings, setSettings] = useState<MindNoteSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving' | 'error'>('saved');
  const [lastModified, setLastModified] = useState(Date.now());
  const [historyTick, setHistoryTick] = useState(0);

  useEffect(() => { titleRef.current = title; }, [title]);

  const syncFromDoc = useCallback((doc: MindNoteDocument) => {
    setRoot(cloneMindNode(doc.root));
    setSettings({ ...doc.settings });
    setHistoryTick(v => v + 1);
  }, []);

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
          onSaved: () => setLastModified(Date.now()),
        });
        manager.initialize(result.version, result.document.toJSON() as unknown as Record<string, unknown>, result.title);
        saveManagerRef.current = manager;
      } else {
        saveManagerRef.current?.dispose();
        saveManagerRef.current = null;
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      saveManagerRef.current?.dispose();
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
      {!embedded && (
        <DocumentBar
          docId={docId || null}
          title={title}
          showTitle={false}
          saveStatus={saveStatus === 'saved' ? 'saved' : saveStatus === 'saving' ? 'saving' : 'unsaved'}
          onTitleChange={handleTitleChange}
          lastModified={lastModified}
          canEdit={canEdit}
          effectiveViewMode={effectiveViewMode}
          onTogglePreview={onTogglePreview}
        />
      )}
      <MindNoteEditor
        title={title}
        root={root}
        settings={settings}
        readOnly={readOnly}
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
      />
    </div>
  );
};
