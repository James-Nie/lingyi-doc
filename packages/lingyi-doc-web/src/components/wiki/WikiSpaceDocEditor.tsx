import React from 'react';
import { DocumentManager, type DocumentApiResponse } from '@lingyi-doc/core';
import { EditorPage } from '../../pages/EditorPage';
import { DocEditorPage } from '../../pages/DocEditorPage';
import { MindNoteEditorPage } from '../../pages/MindNoteEditorPage';
import { WhiteboardEditorPage } from '../../pages/WhiteboardEditorPage';
import { useDocumentViewMode, type DocumentViewMode } from '../../utils/documentViewMode';

interface WikiSpaceDocEditorProps {
  docId: string;
  onViewModeChange?: (state: {
    readOnly: boolean;
    canEdit: boolean;
    effectiveViewMode: DocumentViewMode;
    togglePreview: () => void;
  }) => void;
}

/** 知识库空间内嵌文档编辑器（无 DocumentBar，由 WikiSpacePage 顶栏负责导航） */
export const WikiSpaceDocEditor: React.FC<WikiSpaceDocEditorProps> = ({ docId, onViewModeChange }) => {
  const [entry, setEntry] = React.useState<DocumentApiResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);

  React.useEffect(() => {
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

  React.useEffect(() => {
    if (!entry || !onViewModeChange) return;
    onViewModeChange({
      readOnly: access.readOnly,
      canEdit: access.canEdit,
      effectiveViewMode: access.effectiveViewMode,
      togglePreview: access.togglePreview,
    });
  }, [entry, onViewModeChange, access.readOnly, access.canEdit, access.effectiveViewMode, access.togglePreview]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#8f959e' }}>
        正在加载文档…
      </div>
    );
  }

  if (notFound || !entry) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#8f959e', fontSize: 14 }}>
        文档不存在或无权访问
      </div>
    );
  }

  const editorAccess = {
    readOnly: access.readOnly,
    canEdit: access.canEdit,
    effectiveViewMode: access.effectiveViewMode,
    onTogglePreview: access.togglePreview,
  };

  const docType = entry.docType || 'freeform';
  if (docType === 'richtext') {
    return <DocEditorPage prefetched={entry} embedded {...editorAccess} />;
  }
  if (docType === 'mindnote') {
    return <MindNoteEditorPage prefetched={entry} embedded {...editorAccess} />;
  }
  if (docType === 'whiteboard') {
    return <WhiteboardEditorPage prefetched={entry} embedded {...editorAccess} />;
  }
  return <EditorPage prefetched={entry} embedded {...editorAccess} />;
};
