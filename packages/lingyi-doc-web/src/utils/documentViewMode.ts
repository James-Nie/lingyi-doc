import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { documentViewModeStore } from '../stores/documentViewModeStore';

export type DocumentViewMode = 'edit' | 'preview';
export type DocumentPermission = 'owner' | 'none' | 'read' | 'comment' | 'edit' | 'manage';

export interface DocumentAccessFields {
  canEdit?: boolean;
  viewMode?: DocumentViewMode;
  permission?: DocumentPermission;
}

export function resolveInitialViewMode(entry: Pick<DocumentAccessFields, 'canEdit' | 'viewMode'>): DocumentViewMode {
  if (entry.viewMode === 'preview' || entry.viewMode === 'edit') return entry.viewMode;
  return entry.canEdit === false ? 'preview' : 'edit';
}

export function useDocumentViewMode(
  docId: string | null | undefined,
  entry: DocumentAccessFields,
) {
  const canEdit = entry.canEdit !== false;

  const ownerPreview = useSyncExternalStore(
    documentViewModeStore.subscribe,
    () => {
      void documentViewModeStore.getRevision();
      return docId ? documentViewModeStore.getOwnerPreview(docId) : false;
    },
    () => (docId ? documentViewModeStore.getOwnerPreview(docId) : false),
  );

  const effectiveViewMode: DocumentViewMode = useMemo(() => {
    if (!canEdit) return 'preview';
    if (ownerPreview) return 'preview';
    return resolveInitialViewMode(entry);
  }, [canEdit, ownerPreview, entry.viewMode, entry.canEdit]);

  const readOnly = effectiveViewMode === 'preview';

  const togglePreview = useCallback(() => {
    if (!docId || !canEdit) return;
    documentViewModeStore.toggleOwnerPreview(docId);
  }, [docId, canEdit]);

  const setOwnerPreview = useCallback((value: boolean) => {
    if (!docId || !canEdit) return;
    documentViewModeStore.setOwnerPreview(docId, value);
  }, [docId, canEdit]);

  return {
    canEdit,
    permission: entry.permission ?? (canEdit ? 'owner' : 'read'),
    effectiveViewMode,
    readOnly,
    ownerPreview,
    setOwnerPreview,
    togglePreview,
  };
}
