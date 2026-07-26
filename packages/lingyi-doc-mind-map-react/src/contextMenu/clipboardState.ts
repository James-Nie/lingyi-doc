import type { MindNode } from '@lingyi-doc/core-mindmap';

const STYLE_KEYS = [
  'bold',
  'italic',
  'underline',
  'lineThrough',
  'textAlign',
  'textVerticalAlign',
  'color',
  'shapeKind',
  'fillColor',
  'borderColor',
  'textBgColor',
  'fontSize',
  'fillOpacity',
  'borderOpacity',
] as const;

export type MindmapStyleClipboard = Partial<Pick<MindNode, (typeof STYLE_KEYS)[number]>>;

let styleClipboard: MindmapStyleClipboard | null = null;
let nodeClipboard: MindNode | null = null;

export function copyMindmapNodeStyle(node: MindNode): MindmapStyleClipboard {
  const patch: MindmapStyleClipboard = {};
  for (const key of STYLE_KEYS) {
    const value = node[key];
    if (value !== undefined) (patch as Record<string, unknown>)[key] = value;
  }
  styleClipboard = patch;
  return patch;
}

export function getMindmapStyleClipboard(): MindmapStyleClipboard | null {
  return styleClipboard;
}

export function hasMindmapStyleClipboard(): boolean {
  return !!styleClipboard && Object.keys(styleClipboard).length > 0;
}

export function setMindmapNodeClipboard(node: MindNode | null): void {
  nodeClipboard = node;
}

export function getMindmapNodeClipboard(): MindNode | null {
  return nodeClipboard;
}

export function hasMindmapNodeClipboard(): boolean {
  return !!nodeClipboard;
}
