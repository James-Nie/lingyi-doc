import type { MindmapLayout } from '@lingyi-doc/core-whiteboard';
import type { MindNode, MindNoteBranchStyle } from '@lingyi-doc/core-types';
import { WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT } from '@lingyi-doc/core-mindmap';
import { measureMindmapElementSize, MINDMAP_CONTENT_PADDING } from '@lingyi-doc/mind-map';

/** @deprecated 使用 MINDMAP_CONTENT_PADDING */
export const SMM_EMBED_PADDING = MINDMAP_CONTENT_PADDING;

export interface MindmapBoundsUpdate {
  width: number;
  height: number;
}

export function computeMindmapElementSize(
  root: MindNode,
  layout: MindmapLayout,
  branchStyle: MindNoteBranchStyle = WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT,
): { width: number; height: number } {
  const bounds = measureMindmapElementSize(root, layout, branchStyle);
  return { width: bounds.width, height: bounds.height };
}
