import type { MindNode } from '@lingyi-doc/core-mindmap';
import { cloneMindNode } from '@lingyi-doc/core-mindmap';
import { findMindNode } from '@lingyi-doc/core-mindmap';

interface FlatEntry {
  id: string;
  text: string;
  completed: boolean;
  collapsed: boolean;
  parentId: string | null;
  index: number;
}

function getRoot(doc: Record<string, unknown>): MindNode {
  return (doc.root ?? {}) as MindNode;
}

function flattenMindTree(root: MindNode): Map<string, FlatEntry> {
  const map = new Map<string, FlatEntry>();
  const walk = (node: MindNode, parentId: string | null, index: number) => {
    map.set(node.id, {
      id: node.id,
      text: node.text,
      completed: !!node.completed,
      collapsed: !!node.collapsed,
      parentId,
      index,
    });
    node.children.forEach((child, i) => walk(child, node.id, i));
  };
  walk(root, null, 0);
  return map;
}

function extractSubTree(root: MindNode, id: string): MindNode | null {
  const found = findMindNode(root, id);
  return found ? cloneMindNode(found.node) : null;
}

function computeNodeOps(
  beforeRoot: MindNode,
  afterRoot: MindNode,
): import('./types').MindNotePatchOp[] {
  const beforeMap = flattenMindTree(beforeRoot);
  const afterMap = flattenMindTree(afterRoot);
  const beforeIds = new Set(beforeMap.keys());
  const afterIds = new Set(afterMap.keys());
  const ops: import('./types').MindNotePatchOp[] = [];

  const removedIds = [...beforeIds].filter(id => !afterIds.has(id));
  const topLevelRemoved = removedIds.filter(id => {
    const parentId = beforeMap.get(id)!.parentId;
    return parentId == null || !removedIds.includes(parentId);
  });
  for (const id of topLevelRemoved) {
    if (id !== beforeRoot.id) {
      ops.push({ type: 'delete_node', id });
    }
  }

  const addedIds = [...afterIds].filter(id => !beforeIds.has(id));
  const topLevelAdded = addedIds.filter(id => {
    const parentId = afterMap.get(id)!.parentId;
    return parentId == null || !addedIds.includes(parentId);
  });
  for (const id of topLevelAdded) {
    if (id === afterRoot.id) continue;
    const entry = afterMap.get(id)!;
    const node = extractSubTree(afterRoot, id);
    if (!node) continue;
    ops.push({
      type: 'insert_node',
      parentId: entry.parentId ?? afterRoot.id,
      index: entry.index,
      node: node as unknown as Record<string, unknown>,
    });
  }

  for (const id of [...beforeIds].filter(x => afterIds.has(x))) {
    const b = beforeMap.get(id)!;
    const a = afterMap.get(id)!;
    const patch: { text?: string; completed?: boolean; collapsed?: boolean } = {};
    if (b.text !== a.text) patch.text = a.text;
    if (b.completed !== a.completed) patch.completed = a.completed;
    if (b.collapsed !== a.collapsed) patch.collapsed = a.collapsed;
    if (Object.keys(patch).length > 0) {
      ops.push({ type: 'update_node', id, patch });
    }
    if (id !== afterRoot.id && (b.parentId !== a.parentId || b.index !== a.index)) {
      ops.push({
        type: 'move_node',
        id,
        parentId: a.parentId ?? afterRoot.id,
        index: a.index,
      });
    }
  }

  return ops;
}

export function diffMindNote(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): import('./types').MindNotePatchOp[] {
  const ops: import('./types').MindNotePatchOp[] = [];

  const metaPatch: { title?: string; documentId?: string } = {};
  if (before.title !== after.title) metaPatch.title = after.title as string;
  if (before.documentId !== after.documentId) metaPatch.documentId = after.documentId as string;
  if (Object.keys(metaPatch).length > 0) {
    ops.push({ type: 'set_doc_meta', patch: metaPatch });
  }

  if (JSON.stringify(before.settings) !== JSON.stringify(after.settings)) {
    ops.push({ type: 'set_settings', settings: (after.settings as Record<string, unknown>) || {} });
  }

  const beforeRoot = getRoot(before);
  const afterRoot = getRoot(after);
  if (JSON.stringify(beforeRoot) === JSON.stringify(afterRoot)) {
    return ops;
  }

  const nodeOps = computeNodeOps(beforeRoot, afterRoot);
  if (nodeOps.length === 0 || nodeOps.length > 30) {
    ops.push({ type: 'set_root', root: afterRoot as unknown as Record<string, unknown> });
    return ops;
  }

  ops.push(...nodeOps);
  return ops;
}

export function mindNoteSnapshotForDiff(doc: Record<string, unknown>): Record<string, unknown> {
  return {
    documentId: doc.documentId ?? '',
    title: doc.title ?? '',
    root: doc.root ?? {},
    settings: doc.settings ?? {},
  };
}
