import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { DocumentManager, type DocumentApiResponse } from '@lingyi-doc/core';
import { EditorPage } from './EditorPage';
import { DocEditorPage } from './DocEditorPage';
import { MindNoteEditorPage } from './MindNoteEditorPage';
import { WhiteboardEditorPage } from './WhiteboardEditorPage';
import { appPath } from '../utils/appPaths';
import { useDocumentViewMode } from '../utils/documentViewMode';

/** 根据文档类型路由到表格编辑器或富文本文档编辑器（文档只请求一次） */
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
  if (docType === 'richtext') {
    return <DocEditorPage prefetched={entry} {...editorAccess} />;
  }
  if (docType === 'mindnote') {
    return <MindNoteEditorPage prefetched={entry} {...editorAccess} />;
  }
  if (docType === 'whiteboard') {
    return <WhiteboardEditorPage prefetched={entry} {...editorAccess} />;
  }
  return <EditorPage prefetched={entry} {...editorAccess} />;
};
