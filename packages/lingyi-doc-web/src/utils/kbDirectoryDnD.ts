import type { WikiSpaceNode } from '../stores/knowledgeBaseStore';
import { collectDescendantIds } from './kbTreeUtils';

export type KbDropPosition = 'before' | 'after' | 'inside';

export interface KbDropTarget {
  nodeId: string;
  position: KbDropPosition;
}

function compareNodes(a: WikiSpaceNode, b: WikiSpaceNode): number {
  const ao = a.sortOrder ?? 0;
  const bo = b.sortOrder ?? 0;
  if (ao !== bo) return ao - bo;
  return a.title.localeCompare(b.title, 'zh-CN');
}

/** 节点在数据层的父 id（顶层节点的父为首页） */
export function effectiveParentId(
  node: WikiSpaceNode,
  homeId: string | null | undefined,
): string | null {
  if (!node.parentId || node.parentId === homeId) return homeId ?? null;
  return node.parentId;
}

function siblingsUnderParent(
  nodes: WikiSpaceNode[],
  parentId: string | null,
  homeId: string | null | undefined,
  excludeId?: string,
): WikiSpaceNode[] {
  return nodes
    .filter(node => !node.isHome
      && node.id !== excludeId
      && effectiveParentId(node, homeId) === parentId)
    .sort(compareNodes);
}

export function canDropKbNode(
  nodes: WikiSpaceNode[],
  dragId: string,
  targetId: string,
  position: KbDropPosition,
): boolean {
  if (dragId === targetId) return false;
  const blocked = collectDescendantIds(nodes, dragId);
  if (blocked.has(targetId)) return false;

  const target = nodes.find(node => node.id === targetId);
  if (!target || target.isHome) return false;
  if (position === 'inside' && target.type !== 'folder') return false;
  return true;
}

/** 根据拖放位置计算 parentId / sortOrder */
export function computeKbNodeMove(
  nodes: WikiSpaceNode[],
  dragId: string,
  targetId: string,
  position: KbDropPosition,
  homeId: string | null | undefined,
): { parentId: string | null; sortOrder: number } | null {
  if (!canDropKbNode(nodes, dragId, targetId, position)) return null;

  const target = nodes.find(node => node.id === targetId);
  if (!target) return null;

  if (position === 'inside') {
    const children = siblingsUnderParent(nodes, targetId, homeId, dragId);
    const maxOrder = children.reduce((max, node) => Math.max(max, node.sortOrder ?? 0), -1);
    return { parentId: targetId, sortOrder: maxOrder + 1 };
  }

  const parentId = effectiveParentId(target, homeId);
  const siblings = siblingsUnderParent(nodes, parentId, homeId, dragId);
  const targetIndex = siblings.findIndex(node => node.id === targetId);
  if (targetIndex < 0) return null;

  if (position === 'before') {
    if (targetIndex === 0) {
      return { parentId, sortOrder: Math.max(0, (target.sortOrder ?? 0) - 1) };
    }
    const prev = siblings[targetIndex - 1];
    const gap = (target.sortOrder ?? 0) - (prev.sortOrder ?? 0);
    if (gap > 1) {
      return { parentId, sortOrder: (prev.sortOrder ?? 0) + Math.floor(gap / 2) };
    }
    return { parentId, sortOrder: Math.max(0, (target.sortOrder ?? 0) - 1) };
  }

  // after
  if (targetIndex >= siblings.length - 1) {
    return { parentId, sortOrder: (target.sortOrder ?? 0) + 1 };
  }
  const next = siblings[targetIndex + 1];
  const gap = (next.sortOrder ?? 0) - (target.sortOrder ?? 0);
  if (gap > 1) {
    return { parentId, sortOrder: (target.sortOrder ?? 0) + Math.floor(gap / 2) };
  }
  return { parentId, sortOrder: (target.sortOrder ?? 0) + 1 };
}

/** 根据指针在行内的相对 Y 判断落点 */
export function resolveKbDropPosition(
  clientY: number,
  rect: DOMRect,
  isFolder: boolean,
): KbDropPosition {
  const ratio = (clientY - rect.top) / Math.max(rect.height, 1);
  if (isFolder && ratio > 0.28 && ratio < 0.72) return 'inside';
  if (ratio < 0.5) return 'before';
  return 'after';
}
