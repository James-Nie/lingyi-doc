import type { MindMapLayoutNode, MindNode } from '@lingyi-doc/core';
import { WB_MM_THEME } from '../mindmap/wbMindmapTheme';

export type WbMindmapNodeShape = NonNullable<MindNode['shapeKind']>;

export interface WbNodeAppearance {
  shapeKind: WbMindmapNodeShape;
  fillColor: string | null;
  borderColor: string | null;
  textColor: string;
  fontSize: number;
  fontWeight: number;
  showBox: boolean;
}

function defaultShape(layoutStyle: MindMapLayoutNode['style']): WbMindmapNodeShape {
  if (layoutStyle === 'leaf') return 'text';
  if (layoutStyle === 'root') return 'roundRect';
  return 'text';
}

export function resolveNodeAppearance(
  node: MindNode,
  layoutNode: MindMapLayoutNode,
): WbNodeAppearance {
  const { style, depth, isRoot } = layoutNode;
  const shapeKind = node.shapeKind ?? defaultShape(style);
  const showBox = shapeKind !== 'text';
  return {
    shapeKind,
    fillColor: node.fillColor ?? (isRoot ? WB_MM_THEME.rootFill : showBox ? '#FFFFFF' : null),
    borderColor: node.borderColor ?? (showBox ? WB_MM_THEME.accent : null),
    textColor: node.color ?? (isRoot && showBox ? WB_MM_THEME.rootText : WB_MM_THEME.text),
    fontSize: node.fontSize ?? (depth === 0 ? 16 : 14),
    fontWeight: node.bold || isRoot ? 600 : 400,
    showBox,
  };
}
