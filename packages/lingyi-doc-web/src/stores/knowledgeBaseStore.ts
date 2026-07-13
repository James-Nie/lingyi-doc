import {
  KnowledgeBaseApi,
  flattenKbNodeTree,
  mapKbNodeToLegacy,
  mapKnowledgeBaseToLegacy,
} from '../api/knowledgeBase';

export type KnowledgeBaseVisibility = 'members' | 'organization';

export type KnowledgeBaseCover = 'blue' | 'sunset';

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  emoji: string;
  visibility: KnowledgeBaseVisibility;
  cover: KnowledgeBaseCover;
  tag?: string;
  createdAt: number;
  updatedAt: number;
}

export type WikiSpaceNodeType = 'page' | 'sheet' | 'doc' | 'folder';

export interface WikiSpaceNode {
  id: string;
  kbId: string;
  title: string;
  type: WikiSpaceNodeType;
  docId?: string;
  parentId?: string | null;
  sortOrder?: number;
  isHome?: boolean;
  createdAt: number;
  updatedAt: number;
}

type Listener = () => void;

let revision = 0;
let loading = false;
const listeners = new Set<Listener>();

let items: KnowledgeBase[] = [];
const nodesCache = new Map<string, WikiSpaceNode[]>();

function notify() {
  revision += 1;
  listeners.forEach(fn => fn());
}

function sortItems(list: KnowledgeBase[]): KnowledgeBase[] {
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

function sortNodes(list: WikiSpaceNode[]): WikiSpaceNode[] {
  return [...list].sort((a, b) => {
    if (a.isHome) return -1;
    if (b.isHome) return 1;
    const ao = a.sortOrder ?? 0;
    const bo = b.sortOrder ?? 0;
    if (ao !== bo) return ao - bo;
    return a.title.localeCompare(b.title, 'zh-CN');
  });
}

export const knowledgeBaseStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getRevision(): number {
    return revision;
  },

  isLoading(): boolean {
    return loading;
  },

  async ensureKb(kbId: string): Promise<KnowledgeBase | undefined> {
    const cached = this.getById(kbId);
    if (cached) return cached;
    try {
      const kb = await KnowledgeBaseApi.get(kbId);
      const mapped = mapKnowledgeBaseToLegacy(kb);
      items = sortItems([mapped, ...items.filter(item => item.id !== kbId)]);
      notify();
      return mapped;
    } catch {
      return undefined;
    }
  },

  async reload(): Promise<void> {
    loading = true;
    notify();
    try {
      const res = await KnowledgeBaseApi.list();
      items = sortItems(res.items.map(mapKnowledgeBaseToLegacy));
      nodesCache.clear();
    } finally {
      loading = false;
      notify();
    }
  },

  list(): KnowledgeBase[] {
    return sortItems(items);
  },

  getById(id: string): KnowledgeBase | undefined {
    return items.find(item => item.id === id);
  },

  async loadNodes(kbId: string): Promise<WikiSpaceNode[]> {
    const res = await KnowledgeBaseApi.listNodes(kbId);
    const flat = flattenKbNodeTree(res.items);
    if (res.home) flat.push(res.home);
    const nodes = sortNodes(flat.map(mapKbNodeToLegacy));
    nodesCache.set(kbId, nodes);
    notify();
    return nodes;
  },

  listNodes(kbId: string): WikiSpaceNode[] {
    return sortNodes(nodesCache.get(kbId) ?? []);
  },

  getNode(kbId: string, nodeId: string): WikiSpaceNode | undefined {
    return this.listNodes(kbId).find(node => node.id === nodeId);
  },

  async create(input: {
    name: string;
    description: string;
    emoji?: string;
    visibility: KnowledgeBaseVisibility;
  }): Promise<{ kb: KnowledgeBase; defaultNodeId: string }> {
    const result = await KnowledgeBaseApi.create({
      name: input.name,
      description: input.description,
      emoji: input.emoji,
      visibility: input.visibility,
    });
    const mapped = mapKnowledgeBaseToLegacy(result);
    items = sortItems([mapped, ...items.filter(item => item.id !== mapped.id)]);
    notify();
    return { kb: mapped, defaultNodeId: result.defaultNodeId };
  },

  async renameNode(kbId: string, nodeId: string, title: string): Promise<void> {
    await KnowledgeBaseApi.updateNode(kbId, nodeId, { title });
    await this.loadNodes(kbId);
    this.touchLocal(kbId);
  },

  async removeNode(kbId: string, nodeId: string, options?: { deleteDocument?: boolean }): Promise<boolean> {
    try {
      await KnowledgeBaseApi.removeNode(kbId, nodeId, options);
      await this.loadNodes(kbId);
      this.touchLocal(kbId);
      return true;
    } catch {
      return false;
    }
  },

  async addNode(input: {
    kbId: string;
    title: string;
    type: WikiSpaceNodeType;
    docId?: string;
    parentId?: string | null;
  }): Promise<WikiSpaceNode> {
    const nodeType = input.type === 'page'
      ? 'page'
      : input.type === 'folder'
        ? 'folder'
        : input.docId
          ? 'doc_ref'
          : 'folder';
    const created = await KnowledgeBaseApi.createNode(input.kbId, {
      title: input.title,
      nodeType,
      docId: input.docId,
      parentId: input.parentId ?? null,
    });
    await this.loadNodes(input.kbId);
    this.touchLocal(input.kbId);
    return mapKbNodeToLegacy(created);
  },

  async createFolder(
    kbId: string,
    title: string,
    parentId?: string | null,
  ): Promise<WikiSpaceNode> {
    return this.addNode({
      kbId,
      title,
      type: 'folder',
      parentId: parentId ?? null,
    });
  },

  async moveNode(
    kbId: string,
    nodeId: string,
    input: { parentId?: string | null; sortOrder?: number },
  ): Promise<void> {
    await KnowledgeBaseApi.updateNode(kbId, nodeId, input);
    await this.loadNodes(kbId);
    this.touchLocal(kbId);
  },

  touchLocal(kbId: string): void {
    const index = items.findIndex(item => item.id === kbId);
    if (index < 0) return;
    items[index] = { ...items[index], updatedAt: Date.now() };
    items = sortItems(items);
    notify();
  },

  async remove(id: string): Promise<void> {
    await KnowledgeBaseApi.remove(id);
    items = items.filter(item => item.id !== id);
    nodesCache.delete(id);
    notify();
  },

  clearCache(): void {
    items = [];
    nodesCache.clear();
    notify();
  },
};
