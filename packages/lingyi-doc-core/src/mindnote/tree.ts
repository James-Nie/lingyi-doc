import type { MindNode, MindNodePath, MindNoteStructure } from './types';
import { cloneMindNode, createEmptyMindNode, genMindNodeId } from './utils';

function walk(
  node: MindNode,
  parent: MindNode | null,
  index: number,
  targetId: string,
): MindNodePath | null {
  if (node.id === targetId) return { node, parent, index };
  for (let i = 0; i < node.children.length; i++) {
    const found = walk(node.children[i], node, i, targetId);
    if (found) return found;
  }
  return null;
}

export function findMindNode(root: MindNode, id: string): MindNodePath | null {
  return walk(root, null, 0, id);
}

function mapTree(node: MindNode, fn: (n: MindNode, parent: MindNode | null) => MindNode, parent: MindNode | null = null): MindNode {
  const next = fn(node, parent);
  return {
    ...next,
    children: next.children.map(c => mapTree(c, fn, next)),
  };
}

function replaceNode(root: MindNode, targetId: string, replacer: (found: MindNodePath) => MindNode | null): MindNode {
  const clone = cloneMindNode(root);
  const apply = (node: MindNode, parent: MindNode | null, index: number): boolean => {
    if (node.id === targetId) {
      const replaced = replacer({ node, parent, index });
      if (replaced === null) {
        if (!parent) return false;
        parent.children.splice(index, 1);
        return true;
      }
      parent!.children[index] = replaced;
      return true;
    }
    for (let i = 0; i < node.children.length; i++) {
      if (apply(node.children[i], node, i)) return true;
    }
    return false;
  };
  if (targetId === clone.id) {
    const replaced = replacer({ node: clone, parent: null, index: 0 });
    return replaced ?? clone;
  }
  apply(clone, null, 0);
  return clone;
}

export function updateMindNode(root: MindNode, id: string, patch: Partial<MindNode>): MindNode {
  return replaceNode(root, id, ({ node }) => ({ ...node, ...patch, id: node.id, children: node.children }));
}

export function insertMindSibling(root: MindNode, targetId: string, after = true): { root: MindNode; newId: string | null } {
  const found = findMindNode(root, targetId);
  if (!found) return { root, newId: null };
  const newNode = createEmptyMindNode('');
  const clone = cloneMindNode(root);
  if (!found.parent) {
    clone.children.splice(after ? 1 : 0, 0, newNode);
    return { root: clone, newId: newNode.id };
  }
  const parent = findMindNode(clone, found.parent.id);
  if (!parent) return { root, newId: null };
  parent.node.children.splice(after ? found.index + 1 : found.index, 0, newNode);
  return { root: clone, newId: newNode.id };
}

export function insertMindChild(
  root: MindNode,
  targetId: string,
  branchDir?: MindNode['branchDir'],
): { root: MindNode; newId: string | null } {
  const newNode = createEmptyMindNode('');
  if (branchDir) newNode.branchDir = branchDir;
  const next = replaceNode(root, targetId, ({ node }) => ({
    ...node,
    collapsed: false,
    children: [...node.children, newNode],
  }));
  return { root: next, newId: newNode.id };
}

export function insertMindParent(root: MindNode, targetId: string): { root: MindNode; newId: string | null } {
  const found = findMindNode(root, targetId);
  if (!found || !found.parent) return { root, newId: null };
  const wrapper = createEmptyMindNode('');
  wrapper.children = [cloneMindNode(found.node)];
  const clone = cloneMindNode(root);
  const parent = findMindNode(clone, found.parent.id);
  if (!parent) return { root, newId: null };
  parent.node.children[found.index] = wrapper;
  return { root: clone, newId: wrapper.id };
}

export function deleteMindNode(root: MindNode, targetId: string): MindNode {
  const found = findMindNode(root, targetId);
  if (!found || !found.parent) return root;
  const clone = cloneMindNode(root);
  const parent = findMindNode(clone, found.parent.id);
  if (!parent) return root;
  const removed = parent.node.children.splice(found.index, 1)[0];
  if (removed?.children.length) {
    parent.node.children.splice(found.index, 0, ...removed.children);
  }
  return clone;
}

export function duplicateMindNode(root: MindNode, targetId: string): { root: MindNode; newId: string | null } {
  const found = findMindNode(root, targetId);
  if (!found) return { root, newId: null };
  const copy = reassignIds(cloneMindNode(found.node));
  const clone = cloneMindNode(root);
  if (!found.parent) {
    clone.children.splice(found.index + 1, 0, copy);
    return { root: clone, newId: copy.id };
  }
  const parent = findMindNode(clone, found.parent.id);
  if (!parent) return { root, newId: null };
  parent.node.children.splice(found.index + 1, 0, copy);
  return { root: clone, newId: copy.id };
}

function reassignIds(node: MindNode): MindNode {
  return {
    ...node,
    id: genMindNodeId(),
    children: node.children.map(reassignIds),
  };
}

export function toggleMindCollapse(root: MindNode, id: string): MindNode {
  const found = findMindNode(root, id);
  if (!found) return root;
  return updateMindNode(root, id, { collapsed: !found.node.collapsed });
}

export function expandMindChildren(root: MindNode, id: string): MindNode {
  return updateMindNode(root, id, { collapsed: false });
}

export function countMindDescendants(node: MindNode): number {
  let count = node.children.length;
  for (const c of node.children) count += countMindDescendants(c);
  return count;
}

/** 可见节点列表（大纲视图用） */
export function flattenVisibleMindNodes(root: MindNode): MindNode[] {
  const result: MindNode[] = [];
  const walk = (node: MindNode) => {
    result.push(node);
    if (!node.collapsed) node.children.forEach(walk);
  };
  walk(root);
  return result;
}

export { mapTree };

const HORIZONTAL_LAYOUTS = new Set<MindNoteStructure>(['right', 'left', 'balanced']);

function isHorizontalMindLayout(layout: MindNoteStructure): boolean {
  return HORIZONTAL_LAYOUTS.has(layout);
}

/** 按布局语义解析根节点一级子节点所处左右侧 */
export function effectiveRootChildSide(
  child: MindNode,
  layout: MindNoteStructure,
): 'left' | 'right' {
  if (layout === 'balanced') {
    return child.branchDir === 'left' ? 'left' : 'right';
  }
  if (layout === 'left') {
    return child.branchDir === 'right' ? 'right' : 'left';
  }
  return child.branchDir === 'left' ? 'left' : 'right';
}

/** 将左右侧编码为目标布局下的 branchDir（undefined 表示该布局的默认侧） */
export function branchDirForRootChildSide(
  side: 'left' | 'right',
  layout: MindNoteStructure,
): MindNode['branchDir'] | undefined {
  if (layout === 'balanced') {
    return side === 'left' ? 'left' : undefined;
  }
  if (layout === 'left') {
    return side === 'right' ? 'right' : undefined;
  }
  return side === 'left' ? 'left' : undefined;
}

function remapRootChildBranchDir(
  child: MindNode,
  branchDir: MindNode['branchDir'] | undefined,
): MindNode {
  if (branchDir) return { ...child, branchDir };
  const next = { ...child };
  delete next.branchDir;
  return next;
}

/** 切换左右类布局时，重映射根节点一级子节点的 branchDir，保持视觉侧不变 */
export function remapMindmapRootForLayout(
  root: MindNode,
  fromLayout: MindNoteStructure,
  toLayout: MindNoteStructure,
): MindNode {
  if (fromLayout === toLayout) return root;

  if (isHorizontalMindLayout(fromLayout) && isHorizontalMindLayout(toLayout)) {
    return {
      ...root,
      children: root.children.map(child => {
        const side = effectiveRootChildSide(child, fromLayout);
        return remapRootChildBranchDir(child, branchDirForRootChildSide(side, toLayout));
      }),
    };
  }

  if (fromLayout === 'vertical' && isHorizontalMindLayout(toLayout)) {
    return {
      ...root,
      children: root.children.map(child => {
        const side: 'left' | 'right' = child.branchDir === 'up' ? 'left' : 'right';
        return remapRootChildBranchDir(child, branchDirForRootChildSide(side, toLayout));
      }),
    };
  }

  if (isHorizontalMindLayout(fromLayout) && toLayout === 'vertical') {
    return {
      ...root,
      children: root.children.map(child => {
        const side = effectiveRootChildSide(child, fromLayout);
        return remapRootChildBranchDir(child, side === 'left' ? 'up' : undefined);
      }),
    };
  }

  return root;
}
