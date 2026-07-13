import type { MindMapLayoutNode, MindNode } from '@lingyi-doc/core';
import type { MindmapTheme } from '../types';

export type MindmapNodeShape = NonNullable<MindNode['shapeKind']>;

export interface NodeAppearance {
  shapeKind: MindmapNodeShape;
  fillColor: string | null;
  borderColor: string | null;
  textColor: string;
  fontSize: number;
  fontWeight: number;
  showBox: boolean;
}

function defaultShape(layoutStyle: MindMapLayoutNode['style']): MindmapNodeShape {
  if (layoutStyle === 'leaf') return 'text';
  return 'roundRect';
}

export function resolveNodeAppearance(
  node: MindNode,
  layoutNode: MindMapLayoutNode,
  theme: MindmapTheme,
): NodeAppearance {
  const { style, depth, isRoot } = layoutNode;
  const shapeKind = node.shapeKind ?? defaultShape(style);
  const showBox = shapeKind !== 'text';
  return {
    shapeKind,
    fillColor: node.fillColor ?? (isRoot ? theme.rootFill : showBox ? '#FFFFFF' : null),
    borderColor: node.borderColor ?? (showBox ? theme.accent : null),
    textColor: node.color ?? (isRoot && showBox ? theme.rootText : theme.text),
    fontSize: node.fontSize ?? (depth === 0 ? theme.rootFontSize : style === 'leaf' ? theme.leafFontSize : theme.branchFontSize),
    fontWeight: node.bold || isRoot ? 600 : 400,
    showBox,
  };
}
