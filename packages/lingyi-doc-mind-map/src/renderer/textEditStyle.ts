import type { MindMapLayoutNode, MindNode } from '@lingyi-doc/core';
import { getMindNodePadHorizontal, getMindNodePadVertical } from '@lingyi-doc/core';
import type { MindmapTheme } from '../types';
import { resolveNodeAppearance } from './nodeAppearance';

export interface MindmapTextEditStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  textDecoration: string;
  color: string;
  textAlign: 'left' | 'center' | 'right';
  textVerticalAlign: 'top' | 'center' | 'bottom';
  lineHeight: number;
  padding: string;
  background: string;
  border: string;
  borderRadius: number;
  boxSizing: 'border-box';
  outline: string;
  boxShadow: string;
}

export function resolveMindmapTextEditStyle(
  node: MindNode,
  layoutNode: MindMapLayoutNode,
  theme: MindmapTheme,
  zoom = 1,
): MindmapTextEditStyle {
  const appearance = resolveNodeAppearance(node, layoutNode, theme);
  const lineHeight = Math.round(appearance.fontSize * 1.43);
  const padX = appearance.showBox ? getMindNodePadHorizontal(layoutNode.depth) : 0;
  const padY = appearance.showBox ? getMindNodePadVertical(layoutNode.depth) : 0;
  const scaledFont = appearance.fontSize * zoom;
  const scaledLine = lineHeight * zoom;
  const borderW = appearance.showBox ? Math.max(1, 1.5 * zoom) : 0;

  const background = appearance.showBox
    ? (appearance.fillColor ?? 'transparent')
    : (node.textBgColor ?? 'transparent');
  const border = appearance.borderColor && appearance.showBox
    ? `${borderW}px solid ${appearance.borderColor}`
    : 'none';

  const decorations: string[] = [];
  if (node.underline) decorations.push('underline');
  if (node.lineThrough) decorations.push('line-through');

  return {
    fontFamily: theme.fontFamily,
    fontSize: scaledFont,
    fontWeight: appearance.fontWeight,
    fontStyle: node.italic ? 'italic' : 'normal',
    textDecoration: decorations.length ? decorations.join(' ') : 'none',
    color: appearance.textColor,
    textAlign: node.textAlign ?? (appearance.showBox ? 'center' : 'left'),
    textVerticalAlign: node.textVerticalAlign ?? 'center',
    lineHeight: scaledLine,
    padding: `${padY * zoom}px ${padX * zoom}px`,
    background,
    border,
    borderRadius: appearance.showBox ? 8 * zoom : 0,
    boxSizing: 'border-box',
    outline: 'none',
    boxShadow: 'none',
  };
}
