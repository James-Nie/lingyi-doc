type Listener = () => void;

let revision = 0;
const listeners = new Set<Listener>();

/** 文档库列表变更通知（新建、删除、恢复、重命名等） */
export const documentLibraryStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getRevision(): number {
    return revision;
  },

  bump(): void {
    revision += 1;
    listeners.forEach(fn => fn());
  },
};
