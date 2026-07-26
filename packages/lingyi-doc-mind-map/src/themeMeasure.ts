import type {
  MindMapLayout,
  MindMapMeasureOptions,
  MindMapNodeStyle,
  MindNode,
  MindNoteBranchStyle,
  MindNoteStructure,
} from '@lingyi-doc/core-mindmap';
import { computeMindMapLayout } from '@lingyi-doc/core-mindmap';
import { resolveTheme } from './theme/presets';
import type { MindmapTheme, MindmapThemeId } from './types';

export function createThemeMeasureOptions(theme: MindmapTheme): MindMapMeasureOptions {
  return {
    getFontSize: (node: MindNode, depth: number, style: MindMapNodeStyle) => {
      if (typeof node.fontSize === 'number') return node.fontSize;
      if (depth === 0) return theme.rootFontSize;
      if (style === 'leaf') return theme.leafFontSize;
      return theme.branchFontSize;
    },
    getFontWeight: (node: MindNode, depth: number) => (node.bold || depth === 0 ? 600 : 400),
    getLineHeight: (fontSize: number) => Math.round(fontSize * 1.43),
  };
}

export function computeThemedMindMapLayout(
  root: MindNode,
  structure: MindNoteStructure,
  branchStyle: MindNoteBranchStyle,
  themeId: MindmapThemeId = 'default',
): MindMapLayout {
  const theme = resolveTheme(themeId);
  return computeMindMapLayout(root, structure, branchStyle, createThemeMeasureOptions(theme));
}
