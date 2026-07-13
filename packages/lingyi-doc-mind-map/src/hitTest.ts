import {
  type MindMapLayout,
  type MindNode,
  type MindNoteBranchStyle,
  type MindNoteStructure,
} from '@lingyi-doc/core';
import { hitCollapseButton } from './renderer/collapseButton';
import { computeThemedMindMapLayout } from './themeMeasure';
import type { MindmapHitResult, MindmapThemeId } from './types';

export function hitMindmapNode(
  root: MindNode,
  structure: MindNoteStructure,
  branchStyle: MindNoteBranchStyle,
  localX: number,
  localY: number,
  contentPadding = 0,
  layout?: MindMapLayout,
  themeId: MindmapThemeId = 'whiteboard',
): MindmapHitResult {
  const map = layout ?? computeThemedMindMapLayout(root, structure, branchStyle, themeId);
  const lx = localX - contentPadding;
  const ly = localY - contentPadding;

  const collapseId = hitCollapseButton(lx, ly, map.nodes, structure);
  if (collapseId) {
    return { kind: 'collapseButton', nodeId: collapseId };
  }

  const sorted = [...map.nodes].sort((a, b) => b.depth - a.depth);
  for (const n of sorted) {
    if (lx >= n.x && lx <= n.x + n.width && ly >= n.y && ly <= n.y + n.height) {
      return { kind: 'node', nodeId: n.id };
    }
  }
  return { kind: 'none' };
}

export function getMindmapNodeRect(
  root: MindNode,
  structure: MindNoteStructure,
  branchStyle: MindNoteBranchStyle,
  nodeId: string,
  contentPadding = 0,
  layout?: MindMapLayout,
  themeId: MindmapThemeId = 'whiteboard',
): { x: number; y: number; width: number; height: number } | null {
  const map = layout ?? computeThemedMindMapLayout(root, structure, branchStyle, themeId);
  const node = map.nodes.find(n => n.id === nodeId);
  if (!node) return null;
  return {
    x: contentPadding + node.x,
    y: contentPadding + node.y,
    width: node.width,
    height: node.height,
  };
}
