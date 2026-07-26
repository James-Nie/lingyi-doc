import React, { Suspense } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { DocumentManager, type DocumentApiResponse } from '@lingyi-doc/core';
import { appPath } from '../utils/appPaths';
import { useDocumentViewMode } from '../utils/documentViewMode';

const EditorPage = React.lazy(() => import('./EditorPage').then(m => ({ default: m.EditorPage })));
const DocEditorPage = React.lazy(() => import('./DocEditorPage').then(m => ({ default: m.DocEditorPage })));
const MindNoteEditorPage = React.lazy(() =>
  import('./MindNoteEditorPage').then(m => ({ default: m.MindNoteEditorPage })),
);
const WhiteboardEditorPage = React.lazy(() =>
  import('./WhiteboardEditorPage').then(m => ({ default: m.WhiteboardEditorPage })),
);

function EditorLoading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#666' }}>
      正在加载编辑器...
    </div>
  );
}

/** 根据文档类型路由到对应编辑器（按 docType 懒加载，文档只请求一次） */
export const UnifiedEditorPage: React.FC = () => {
  const { docId } = useParams<{ docId: string }>();
  const [entry, setEntry] = React.useState<DocumentApiResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);

  React.useEffect(() => {
    if (!docId) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    DocumentManager.fetchDocument(docId)
      .then(doc => {
        if (cancelled) return;
        if (!doc?.data) {
          setNotFound(true);
          return;
        }
        setEntry(doc);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [docId]);

  const access = useDocumentViewMode(docId, {
    canEdit: entry?.canEdit,
    viewMode: entry?.viewMode,
    permission: entry?.permission,
  });

  if (!docId) {
    return <Navigate to={appPath.home} replace />;
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#666' }}>
        正在加载...
      </div>
    );
  }

  if (notFound || !entry) {
    return <Navigate to={appPath.home} replace />;
  }

  const editorAccess = {
    readOnly: access.readOnly,
    canEdit: access.canEdit,
    effectiveViewMode: access.effectiveViewMode,
    onTogglePreview: access.togglePreview,
  };

  const docType = entry.docType || 'freeform';
  let page: React.ReactNode;
  if (docType === 'richtext') {
    page = <DocEditorPage prefetched={entry} {...editorAccess} />;
  } else if (docType === 'mindnote') {
    page = <MindNoteEditorPage prefetched={entry} {...editorAccess} />;
  } else if (docType === 'whiteboard') {
    page = <WhiteboardEditorPage prefetched={entry} {...editorAccess} />;
  } else {
    page = <EditorPage prefetched={entry} {...editorAccess} />;
  }

  return <Suspense fallback={<EditorLoading />}>{page}</Suspense>;
};
