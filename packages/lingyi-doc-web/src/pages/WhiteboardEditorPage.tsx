import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DocumentManager,
  SaveManager,
  WhiteboardDocument,
  cloneWhiteboardElements,
  type DocumentApiResponse,
  type WhiteboardElement,
  type WhiteboardViewport,
} from '@lingyi-doc/core';
import { WhiteboardEditor } from '@lingyi-doc/editor';
import { DocumentBar } from '../components/DocumentBar';
import { appPath } from '../utils/appPaths';
import type { EditorAccessProps } from '../types/editorAccess';

export const WhiteboardEditorPage: React.FC<{ docId?: string; prefetched?: DocumentApiResponse; embedded?: boolean } & EditorAccessProps> = ({
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
  const docRef = useRef<WhiteboardDocument | null>(null);
  const saveManagerRef = useRef<SaveManager | null>(null);
  const titleRef = useRef('未命名画板');

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('未命名画板');
  const [elements, setElements] = useState<WhiteboardElement[]>([]);
  const [viewport, setViewport] = useState<WhiteboardViewport>({ x: 80, y: 80, zoom: 1 });
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving' | 'error'>('saved');
  const [lastModified, setLastModified] = useState(Date.now());

  useEffect(() => { titleRef.current = title; }, [title]);

  const syncFromDoc = useCallback((doc: WhiteboardDocument) => {
    setElements(cloneWhiteboardElements(doc.elements));
    setViewport({ ...doc.viewport });
  }, []);

  useEffect(() => {
    if (!docId) {
      navigate(appPath.home, { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await DocumentManager.loadWhiteboard(docId, prefetched);
      if (cancelled) return;
      if (!result) {
        navigate(appPath.home, { replace: true });
        return;
      }
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
    saveManagerRef.current?.markDirty();
  }, [readOnly]);

  const handleTitleChange = useCallback((t: string) => {
    if (readOnly) return;
    setTitle(t);
    titleRef.current = t;
    if (docRef.current) docRef.current.title = t;
    saveManagerRef.current?.markTitleDirty();
  }, [readOnly]);

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
      <WhiteboardEditor
        title={title}
        elements={elements}
        viewport={viewport}
        readOnly={readOnly}
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
      />
    </div>
  );
};
