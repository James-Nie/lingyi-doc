import type { MindNode } from '@lingyi-doc/core';
import {
  deleteMindNode,
  insertMindChild,
  insertMindParent,
  insertMindSibling,
  toggleMindCollapse,
} from '@lingyi-doc/core';

export type MindmapNodeAction =
  | 'child'
  | 'childLeft'
  | 'childRight'
  | 'childUp'
  | 'childDown'
  | 'sibling'
  | 'siblingBefore'
  | 'siblingAfter'
  | 'parent'
  | 'delete'
  | 'toggleCollapse';

export interface MindmapActionResult {
  root: MindNode;
  nextActiveId: string | null;
}

function branchDirFromAction(action: MindmapNodeAction): MindNode['branchDir'] | undefined {
  switch (action) {
    case 'childLeft': return 'left';
    case 'childRight': return 'right';
    case 'childUp': return 'up';
    case 'childDown': return 'down';
    default: return undefined;
  }
}

export function childActionForGrowDirection(
  dir?: 'left' | 'right' | 'up' | 'down',
): MindmapNodeAction {
  switch (dir) {
    case 'left': return 'childLeft';
    case 'right': return 'childRight';
    case 'up': return 'childUp';
    case 'down': return 'childDown';
    default: return 'child';
  }
}

export function isMindmapInsertAction(action: MindmapNodeAction): boolean {
  return action === 'child'
    || action === 'childLeft'
    || action === 'childRight'
    || action === 'childUp'
    || action === 'childDown'
    || action === 'sibling'
    || action === 'siblingBefore'
    || action === 'siblingAfter'
    || action === 'parent';
}

export function applyMindmapAction(
  root: MindNode,
  nodeId: string,
  action: MindmapNodeAction,
): MindmapActionResult | null {
  switch (action) {
    case 'child':
    case 'childLeft':
    case 'childRight':
    case 'childUp':
    case 'childDown': {
      const res = insertMindChild(root, nodeId, branchDirFromAction(action));
      return { root: res.root, nextActiveId: res.newId };
    }
    case 'sibling':
    case 'siblingAfter': {
      const res = insertMindSibling(root, nodeId, true);
      return { root: res.root, nextActiveId: res.newId };
    }
    case 'siblingBefore': {
      const res = insertMindSibling(root, nodeId, false);
      return { root: res.root, nextActiveId: res.newId };
    }
    case 'parent': {
      const res = insertMindParent(root, nodeId);
      return { root: res.root, nextActiveId: res.newId };
    }
    case 'delete':
      if (nodeId === root.id) return null;
      return { root: deleteMindNode(root, nodeId), nextActiveId: root.id };
    case 'toggleCollapse':
      return { root: toggleMindCollapse(root, nodeId), nextActiveId: nodeId };
    default:
      return null;
  }
}
