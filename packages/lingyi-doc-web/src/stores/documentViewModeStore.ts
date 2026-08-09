/** 按文档 ID 记录拥有者手动切换的预览模式（会话内有效） */
const ownerPreviewByDocId = new Map<string, boolean>();
let revision = 0;
const listeners = new Set<() => void>();

function bump(): void {
  revision += 1;
  listeners.forEach(fn => fn());
}

export const documentViewModeStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getRevision(): number {
    return revision;
  },

  getOwnerPreview(docId: string): boolean {
    return ownerPreviewByDocId.get(docId) ?? false;
  },

  setOwnerPreview(docId: string, value: boolean): void {
    if (ownerPreviewByDocId.get(docId) === value) return;
    ownerPreviewByDocId.set(docId, value);
    bump();
  },

  toggleOwnerPreview(docId: string): void {
    documentViewModeStore.setOwnerPreview(docId, !documentViewModeStore.getOwnerPreview(docId));
  },
};
