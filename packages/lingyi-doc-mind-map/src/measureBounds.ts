import {
  type MindNode,
  type MindNoteBranchStyle,
  type MindNoteStructure,
} from '@lingyi-doc/core-mindmap';
import {
  MINDMAP_CONTENT_PADDING,
  MINDMAP_MIN_HEIGHT,
  MINDMAP_MIN_WIDTH,
  type MindmapContentBounds,
  type MindmapThemeId,
} from './types';
import { computeThemedMindMapLayout } from './themeMeasure';

export function measureMindmapElementSize(
  root: MindNode,
  structure: MindNoteStructure,
  branchStyle: MindNoteBranchStyle = 'straight',
  padding = MINDMAP_CONTENT_PADDING,
  themeId: MindmapThemeId = 'whiteboard',
): MindmapContentBounds {
  const layout = computeThemedMindMapLayout(root, structure, branchStyle, themeId);
  const layoutWidth = layout.width;
  const layoutHeight = layout.height;
  return {
    layoutWidth,
    layoutHeight,
    padding,
    width: Math.max(Math.ceil(layoutWidth + padding * 2), MINDMAP_MIN_WIDTH),
    height: Math.max(Math.ceil(layoutHeight + padding * 2), MINDMAP_MIN_HEIGHT),
  };
}
