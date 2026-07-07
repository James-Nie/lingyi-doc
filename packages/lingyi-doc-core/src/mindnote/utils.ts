import type { MindNode, MindNoteJSON, MindNoteSettings } from './types';

/** 思维笔记节点最大宽度 */
export const MIND_NODE_MAX_WIDTH = 640;

/** 按层级返回字号：标题 28 / 第一列 24 / 第二列 22 / 第三列起 20 */
export function getMindNodeFontSize(depth: number): number {
  if (depth <= 0) return 28;
  if (depth === 1) return 24;
  if (depth === 2) return 22;
  return 20;
}

/** 行高约为字号的 1.43 倍 */
export function getMindNodeLineHeight(depth: number): number {
  return Math.round(getMindNodeFontSize(depth) * 1.43);
}

export function getMindNodeFont(
  depth: number,
  weight: number | string = depth === 0 ? 500 : 400,
): string {
  return `${weight} ${getMindNodeFontSize(depth)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
}

let nodeIdCounter = 0;

export function genMindNodeId(): string {
  nodeIdCounter += 1;
  return `mn_${Date.now()}_${nodeIdCounter}`;
}

export function createEmptyMindNode(text = ''): MindNode {
  return { id: genMindNodeId(), text, children: [] };
}

const DEFAULT_SETTINGS: MindNoteSettings = {
  viewMode: 'outline',
  structure: 'right',
  branchStyle: 'straight',
  zoom: 100,
};

export function createEmptyMindNote(documentId = '', title = '未命名思维笔记'): MindNoteJSON {
  return {
    documentId,
    title,
    root: createEmptyMindNode(''),
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function normalizeMindNode(raw: unknown): MindNode {
  const n = raw as Partial<MindNode>;
  return {
    id: n.id || genMindNodeId(),
    text: n.text ?? '',
    completed: !!n.completed,
    collapsed: !!n.collapsed,
    bold: !!n.bold,
    italic: !!n.italic,
    underline: !!n.underline,
    color: typeof n.color === 'string' ? n.color : undefined,
    note: typeof n.note === 'string' ? n.note : undefined,
    image: typeof n.image === 'string' ? n.image : undefined,
    imageWidth: typeof n.imageWidth === 'number' ? n.imageWidth : undefined,
    imageHeight: typeof n.imageHeight === 'number' ? n.imageHeight : undefined,
    headingLevel: n.headingLevel === 1 || n.headingLevel === 2 || n.headingLevel === 3
      ? n.headingLevel
      : undefined,
    shapeKind: n.shapeKind === 'text' || n.shapeKind === 'roundRect' || n.shapeKind === 'ellipse' || n.shapeKind === 'rect'
      ? n.shapeKind
      : undefined,
    fillColor: typeof n.fillColor === 'string' ? n.fillColor : undefined,
    borderColor: typeof n.borderColor === 'string' ? n.borderColor : undefined,
    textBgColor: typeof n.textBgColor === 'string' ? n.textBgColor : undefined,
    fontSize: typeof n.fontSize === 'number' ? n.fontSize : undefined,
    fillOpacity: typeof n.fillOpacity === 'number' ? n.fillOpacity : undefined,
    borderOpacity: typeof n.borderOpacity === 'number' ? n.borderOpacity : undefined,
    children: Array.isArray(n.children) ? n.children.map(normalizeMindNode) : [],
  };
}

export function normalizeMindNoteJSON(raw: unknown): MindNoteJSON {
  const j = raw as Partial<MindNoteJSON>;
  const settings = j.settings ?? DEFAULT_SETTINGS;
  return {
    documentId: j.documentId ?? '',
    title: j.title ?? '未命名思维笔记',
    root: normalizeMindNode(j.root ?? createEmptyMindNode('')),
    settings: {
      viewMode: settings.viewMode === 'map' ? 'map' : 'outline',
      structure: settings.structure ?? 'right',
      branchStyle: settings.branchStyle === 'curve' ? 'curve' : 'straight',
      zoom: typeof settings.zoom === 'number' ? settings.zoom : 100,
    },
  };
}

export function cloneMindNode(node: MindNode): MindNode {
  return JSON.parse(JSON.stringify(node)) as MindNode;
}
