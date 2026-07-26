import type { MindMapLayoutNode, MindNode } from '@lingyi-doc/core-mindmap';
import type { MindmapTheme } from '../types';

export type MindmapNodeShape = NonNullable<MindNode['shapeKind']>;

/** 与思维笔记大纲完成态一致 */
export const MINDMAP_COMPLETED_STYLE = {
  fill: '#F5F5F5',
  text: '#8F959E',
} as const;

export interface NodeAppearance {
  shapeKind: MindmapNodeShape;
  fillColor: string | null;
  borderColor: string | null;
  textColor: string;
  fontSize: number;
  fontWeight: number;
  showBox: boolean;
  /** 完成态或显式中划线 */
  lineThrough: boolean;
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
  const base: NodeAppearance = {
    shapeKind,
    fillColor: node.fillColor ?? (isRoot ? theme.rootFill : showBox ? '#FFFFFF' : null),
    borderColor: node.borderColor === ''
      ? null
      : (node.borderColor ?? (showBox ? theme.accent : null)),
    textColor: node.color ?? (isRoot && showBox ? theme.rootText : theme.text),
    fontSize: node.fontSize ?? (depth === 0 ? theme.rootFontSize : style === 'leaf' ? theme.leafFontSize : theme.branchFontSize),
    fontWeight: node.bold || isRoot ? 600 : 400,
    showBox,
    lineThrough: !!node.lineThrough || !!node.completed,
  };

  if (!node.completed) return base;

  // 完成态：浅灰底 + 灰字 + 描边框（叶子 text 节点也升为圆角矩形）
  return {
    ...base,
    shapeKind: base.shapeKind === 'text' ? 'roundRect' : base.shapeKind,
    fillColor: node.fillColor ?? MINDMAP_COMPLETED_STYLE.fill,
    borderColor: node.borderColor ?? theme.accent,
    textColor: node.color ?? MINDMAP_COMPLETED_STYLE.text,
    showBox: true,
    lineThrough: true,
  };
}
