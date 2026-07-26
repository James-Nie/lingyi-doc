import {
  findMindNode,
  type MindMapLayout,
  type MindNode,
  type MindNoteBranchStyle,
  type MindNoteStructure,
} from '@lingyi-doc/core-mindmap';
import { hitCollapseButton } from './renderer/collapseButton';
import {
  pointInMindmapNodeImageRect,
  resolveMindmapNodeImageRect,
} from './renderer/nodeImage';
import { computeThemedMindMapLayout } from './themeMeasure';
import { resolveTheme } from './theme/presets';
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
  const theme = resolveTheme(themeId);

  const collapseId = hitCollapseButton(lx, ly, map.nodes, structure);
  if (collapseId) {
    return { kind: 'collapseButton', nodeId: collapseId };
  }

  const sorted = [...map.nodes].sort((a, b) => b.depth - a.depth);
  for (const n of sorted) {
    const found = findMindNode(root, n.id)?.node;
    if (found?.image) {
      const imgRect = resolveMindmapNodeImageRect(root, n, theme);
      if (imgRect && pointInMindmapNodeImageRect(lx, ly, imgRect)) {
        return { kind: 'nodeImage', nodeId: n.id };
      }
    }
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

export function getMindmapNodeImageScreenLayoutRect(
  root: MindNode,
  structure: MindNoteStructure,
  branchStyle: MindNoteBranchStyle,
  nodeId: string,
  contentPadding = 0,
  layout?: MindMapLayout,
  themeId: MindmapThemeId = 'whiteboard',
): { x: number; y: number; width: number; height: number } | null {
  const map = layout ?? computeThemedMindMapLayout(root, structure, branchStyle, themeId);
  const ln = map.nodes.find(n => n.id === nodeId);
  if (!ln) return null;
  const theme = resolveTheme(themeId);
  const rect = resolveMindmapNodeImageRect(root, ln, theme);
  if (!rect) return null;
  return {
    x: contentPadding + rect.x,
    y: contentPadding + rect.y,
    width: rect.width,
    height: rect.height,
  };
}
