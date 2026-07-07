import type { MindNode, MindNoteBranchStyle, MindNoteStructure } from '@lingyi-doc/core';
import {
  getMindNodeFontSize,
  MIND_NODE_MAX_WIDTH,
} from '@lingyi-doc/core';

export interface SmmNode {
  data: Record<string, unknown>;
  children?: SmmNode[];
}

const COMPLETED_COLOR = '#8F959E';
const COMPLETED_MAP_BG = '#E8E9EB';
const DEFAULT_BORDER = '#DEE0E3';

const STRUCTURE_MAP: Record<MindNoteStructure, string> = {
  right: 'logicalStructure',
  left: 'logicalStructureLeft',
  balanced: 'mindMap',
  vertical: 'catalogOrganization',
  treeRight: 'verticalTimeline3',
  treeLeft: 'verticalTimeline2',
  treeBalanced: 'verticalTimeline',
  timelineH: 'timeline',
  timelineV: 'verticalTimeline',
};

export function mapStructure(structure: MindNoteStructure): string {
  return STRUCTURE_MAP[structure] ?? 'logicalStructure';
}

export function mapLineStyle(branchStyle: MindNoteBranchStyle): 'straight' | 'curve' {
  return branchStyle === 'curve' ? 'curve' : 'straight';
}

export function mindNodeToSmmData(root: MindNode): SmmNode {
  return convertNode(root, 0);
}

export function smmDataToMindNode(data: SmmNode | null | undefined): MindNode {
  if (!data?.data) {
    return { id: 'root', text: '', children: [] };
  }
  return parseNode(data, 0);
}

function buildTextDecoration(node: MindNode): string | undefined {
  const parts: string[] = [];
  if (node.underline) parts.push('underline');
  if (node.completed) parts.push('line-through');
  return parts.length ? parts.join(' ') : undefined;
}

function stripRichText(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  if (typeof document === 'undefined') {
    return value.replace(/<[^>]+>/g, '');
  }
  const div = document.createElement('div');
  div.innerHTML = value;
  return div.textContent ?? '';
}

function resolveImageValue(
  value: unknown,
  imgMap?: Record<string, string>,
): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  if (value.startsWith('data:') || /^https?:\/\//.test(value)) return value;
  return imgMap?.[value] ?? value;
}

function parseNodeText(d: Record<string, unknown>): string {
  if (typeof d.text === 'string' && d.text.trim()) return d.text;
  const rich = stripRichText(d.richText);
  if (rich.trim()) return rich;
  return typeof d.text === 'string' ? d.text : '';
}

function parseTextDecoration(value: unknown): { underline: boolean; completed: boolean } {
  const s = typeof value === 'string' ? value : '';
  return {
    underline: s.includes('underline'),
    completed: s.includes('line-through'),
  };
}

function buildCompletedMapStyle(node: MindNode, hasImage: boolean): Record<string, unknown> {
  if (!node.completed) return {};
  return {
    completed: true,
    color: COMPLETED_COLOR,
    fillColor: hasImage ? '#FFFFFF' : COMPLETED_MAP_BG,
    borderRadius: 8,
    borderColor: hasImage ? DEFAULT_BORDER : 'transparent',
    borderWidth: hasImage ? 1 : 0,
  };
}

function mapShapeKind(shapeKind?: MindNode['shapeKind']): string | undefined {
  switch (shapeKind) {
    case 'roundRect': return 'roundedRectangle';
    case 'rect': return 'rectangle';
    case 'ellipse': return 'ellipse';
    case 'text': return 'rectangle';
    default: return undefined;
  }
}

function convertNode(node: MindNode, depth: number): SmmNode {
  const fontSize = node.fontSize ?? getMindNodeFontSize(depth);
  const hasImage = !!node.image;
  const completedStyle = buildCompletedMapStyle(node, hasImage);
  const shape = mapShapeKind(node.shapeKind);
  const textOnly = node.shapeKind === 'text';
  return {
    data: {
      text: node.text,
      uid: node.id,
      expand: node.collapsed ? false : true,
      fontSize,
      ...(node.bold ? { fontWeight: 'bold' } : {}),
      ...(node.italic ? { fontStyle: 'italic' } : {}),
      ...(buildTextDecoration(node) ? { textDecoration: buildTextDecoration(node) } : {}),
      ...(node.color && !node.completed ? { color: node.color } : {}),
      ...(node.note ? { note: node.note } : {}),
      ...(node.fillColor ? { fillColor: node.fillColor } : {}),
      ...(node.borderColor ? { borderColor: node.borderColor, borderWidth: 1 } : {}),
      ...(node.textBgColor ? { fillColor: node.textBgColor } : {}),
      ...(shape ? { shape } : {}),
      ...(textOnly ? { fillColor: 'transparent', borderWidth: 0, borderColor: 'transparent' } : {}),
      ...completedStyle,
      ...(hasImage ? {
        image: node.image,
        imageSize: {
          width: node.imageWidth ?? 240,
          height: node.imageHeight ?? 160,
          custom: true,
        },
        fillColor: (completedStyle.fillColor as string | undefined) ?? '#FFFFFF',
        borderColor: (completedStyle.borderColor as string | undefined) ?? DEFAULT_BORDER,
        borderWidth: (completedStyle.borderWidth as number | undefined) ?? 1,
        borderRadius: 8,
        imgPlacement: 'bottom',
        paddingX: 12,
        paddingY: 10,
      } : {}),
    },
    children: node.children.map(c => convertNode(c, depth + 1)),
  };
}

function parseNode(node: SmmNode, depth: number, imgMap?: Record<string, string>): MindNode {
  const d = node.data ?? {};
  const rootImgMap = depth === 0
    ? (d.imgMap as Record<string, string> | undefined)
    : imgMap;
  const text = parseNodeText(d);
  const id = typeof d.uid === 'string' ? d.uid : `mn_${depth}_${Math.random().toString(36).slice(2, 9)}`;
  const expand = d.expand !== false;
  const deco = parseTextDecoration(d.textDecoration);
  const completed = !!d.completed || deco.completed;
  const underline = deco.underline;
  const imageSize = d.imageSize as { width?: number; height?: number } | undefined;

  return {
    id,
    text,
    completed,
    collapsed: !expand,
    bold: d.fontWeight === 'bold',
    italic: d.fontStyle === 'italic',
    underline,
    color: typeof d.color === 'string' ? d.color : undefined,
    note: typeof d.note === 'string' ? d.note : undefined,
    image: resolveImageValue(d.image, rootImgMap),
    imageWidth: typeof imageSize?.width === 'number' ? imageSize.width : undefined,
    imageHeight: typeof imageSize?.height === 'number' ? imageSize.height : undefined,
    fontSize: typeof d.fontSize === 'number' ? d.fontSize : undefined,
    fillColor: typeof d.fillColor === 'string' ? d.fillColor : undefined,
    borderColor: typeof d.borderColor === 'string' ? d.borderColor : undefined,
    shapeKind: parseShapeKind(d.shape),
    children: (node.children ?? []).map(c => parseNode(c, depth + 1, rootImgMap)),
  };
}

function parseShapeKind(shape: unknown): MindNode['shapeKind'] | undefined {
  if (shape === 'roundedRectangle') return 'roundRect';
  if (shape === 'rectangle') return 'rect';
  if (shape === 'ellipse') return 'ellipse';
  return undefined;
}

function mergeMindNode(existing: MindNode, incoming: MindNode): MindNode {
  const childMap = new Map(existing.children.map(child => [child.id, child]));
  const mergedChildren = incoming.children.map(child => {
    const prev = childMap.get(child.id);
    return prev ? mergeMindNode(prev, child) : child;
  });

  return {
    ...existing,
    ...incoming,
    text: incoming.text.trim() ? incoming.text : existing.text,
    image: incoming.image ?? existing.image,
    imageWidth: incoming.imageWidth ?? existing.imageWidth,
    imageHeight: incoming.imageHeight ?? existing.imageHeight,
    note: incoming.note ?? existing.note,
    color: incoming.color ?? existing.color,
    bold: incoming.bold ?? existing.bold,
    italic: incoming.italic ?? existing.italic,
    underline: incoming.underline ?? existing.underline,
    completed: incoming.completed ?? existing.completed,
    fontSize: incoming.fontSize ?? existing.fontSize,
    fillColor: incoming.fillColor ?? existing.fillColor,
    borderColor: incoming.borderColor ?? existing.borderColor,
    shapeKind: incoming.shapeKind ?? existing.shapeKind,
    textBgColor: incoming.textBgColor ?? existing.textBgColor,
    children: mergedChildren,
  };
}

/** 将导图回传数据与已有节点树合并，避免 SMM 丢失 text/image 等字段 */
export function mergeMindNodeTree(existing: MindNode, incoming: MindNode): MindNode {
  if (existing.id !== incoming.id) return incoming;
  return mergeMindNode(existing, incoming);
}

export function mindNodesEqual(a: MindNode, b: MindNode): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export { MIND_NODE_MAX_WIDTH };
