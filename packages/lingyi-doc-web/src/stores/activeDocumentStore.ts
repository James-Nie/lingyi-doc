type Listener = () => void;

let activeDocId: string | undefined;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach(l => l());
}

/** 当前正在查看的文档（公开路径编辑页写入，侧栏「我的文档库」读取选中态） */
export const activeDocumentStore = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** 稳定快照：未打开文档时为 undefined（勿返回每次新建的对象） */
  getDocId(): string | undefined {
    return activeDocId;
  },

  getServerSnapshot(): string | undefined {
    return undefined;
  },

  setDocId(docId: string | null | undefined) {
    const next = docId || undefined;
    if (activeDocId === next) return;
    activeDocId = next;
    emit();
  },
};
