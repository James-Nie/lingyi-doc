import { DocumentManager } from '@lingyi-doc/core';
import { knowledgeBaseStore } from '../stores/knowledgeBaseStore';
import { documentLibraryStore } from '../stores/documentLibraryStore';
import type { WikiSpaceNode } from '../stores/knowledgeBaseStore';

export interface MoveDocumentKbSource {
  kbId: string;
  nodeId: string;
  parentId?: string | null;
}

export interface MoveDocumentSource {
  docId: string;
  title: string;
  locationLabel: string;
  kbNode?: MoveDocumentKbSource;
}

export type MoveDocumentTarget =
  | { scope: 'library' }
  | { scope: 'kb'; kbId: string; parentId: string | null };

function normalizeParentId(parentId: string | null | undefined, homeId?: string | null): string | null {
  if (!parentId || parentId === homeId) return homeId ?? null;
  return parentId;
}

function isSameTarget(
  source: MoveDocumentSource,
  target: MoveDocumentTarget,
  homeId?: string | null,
): boolean {
  if (target.scope === 'library') {
    return !source.kbNode;
  }
  if (!source.kbNode) return false;
  const sourceParent = normalizeParentId(source.kbNode.parentId, homeId);
  const targetParent = normalizeParentId(target.parentId, homeId);
  return source.kbNode.kbId === target.kbId && sourceParent === targetParent;
}

/** 在所有知识库中查找文档对应的节点 */
export async function findKbNodeByDocId(docId: string): Promise<{
  kbId: string;
  node: WikiSpaceNode;
} | null> {
  await knowledgeBaseStore.reload();
  for (const kb of knowledgeBaseStore.list()) {
    const nodes = knowledgeBaseStore.listNodes(kb.id);
    if (nodes.length === 0) {
      await knowledgeBaseStore.loadNodes(kb.id);
    }
    const node = knowledgeBaseStore.listNodes(kb.id).find(item => item.docId === docId);
    if (node) return { kbId: kb.id, node };
  }
  return null;
}

export async function resolveMoveDocumentSource(input: {
  docId: string;
  title: string;
  kbNode?: MoveDocumentKbSource;
  kbName?: string;
}): Promise<MoveDocumentSource> {
  if (input.kbNode) {
    const kb = knowledgeBaseStore.getById(input.kbNode.kbId);
    return {
      docId: input.docId,
      title: input.title,
      locationLabel: input.kbName ?? kb?.name ?? '知识库',
      kbNode: input.kbNode,
    };
  }

  const found = await findKbNodeByDocId(input.docId);
  if (found) {
    const kb = knowledgeBaseStore.getById(found.kbId);
    return {
      docId: input.docId,
      title: input.title,
      locationLabel: kb?.name ?? '知识库',
      kbNode: {
        kbId: found.kbId,
        nodeId: found.node.id,
        parentId: found.node.parentId,
      },
    };
  }

  return {
    docId: input.docId,
    title: input.title,
    locationLabel: '我的文档库',
  };
}

export async function moveDocument(
  source: MoveDocumentSource,
  target: MoveDocumentTarget,
): Promise<void> {
  const homeId = target.scope === 'kb'
    ? knowledgeBaseStore.listNodes(target.kbId).find(node => node.isHome)?.id ?? null
    : null;

  if (isSameTarget(source, target, homeId)) {
    throw new Error('文档已在此位置');
  }

  if (target.scope === 'library') {
    if (!source.kbNode) {
      throw new Error('文档已在「我的文档库」');
    }
    await knowledgeBaseStore.removeNode(source.kbNode.kbId, source.kbNode.nodeId, {
      deleteDocument: false,
    });
    documentLibraryStore.bump();
    return;
  }

  const parentId = normalizeParentId(target.parentId, homeId);

  if (source.kbNode) {
    if (source.kbNode.kbId === target.kbId) {
      await knowledgeBaseStore.moveNode(target.kbId, source.kbNode.nodeId, { parentId });
      return;
    }
    await knowledgeBaseStore.removeNode(source.kbNode.kbId, source.kbNode.nodeId, {
      deleteDocument: false,
    });
    await knowledgeBaseStore.addNode({
      kbId: target.kbId,
      title: source.title || '未命名文档',
      type: 'doc',
      docId: source.docId,
      parentId,
    });
    documentLibraryStore.bump();
    return;
  }

  const doc = await DocumentManager.getDocMeta(source.docId).catch(() => null);
  await knowledgeBaseStore.addNode({
    kbId: target.kbId,
    title: source.title || doc?.title || '未命名文档',
    type: 'doc',
    docId: source.docId,
    parentId,
  });
}
