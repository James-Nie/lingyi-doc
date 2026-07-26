import type { MindMapMeasureOptions, MindMapNodeStyle, MindNode, MindNoteBranchStyle, MindNoteJSON, MindNoteSettings } from './types';

/** 思维笔记节点最大宽度（含内边距） */
export const MIND_NODE_MAX_WIDTH = 1000;

/** 节点占位文本 */
export const MIND_NODE_PLACEHOLDER = '输入文本';

export function isMindNodePlaceholder(text: string): boolean {
  const trimmed = text.trim();
  return !trimmed || trimmed === MIND_NODE_PLACEHOLDER;
}

/** 提交节点文本：空或占位符均存为空字符串 */
export function commitMindmapNodeText(text: string): string {
  return isMindNodePlaceholder(text) ? '' : text.trim();
}

/** 布局/渲染用展示文本（空节点显示占位符） */
export function displayMindmapNodeText(text: string): string {
  const trimmed = text.trim();
  return trimmed || MIND_NODE_PLACEHOLDER;
}

/** 根节点水平内边距（单侧，px） */
export const MIND_NODE_ROOT_PAD_X = 25;

/** 根节点垂直内边距（单侧，px） */
export const MIND_NODE_ROOT_PAD_Y = 8;

/** 非根节点水平内边距（单侧，px） */
export const MIND_NODE_PAD_X = 10;

/** 非根节点垂直内边距（单侧，px） */
export const MIND_NODE_PAD_Y = 5;

/** 父子节点之间固定间距（父节点边缘 → 子节点边缘） */
export const MIND_BRANCH_GAP = 40;

/** 父节点到分支总线的固定线段长度 */
export const MIND_BRANCH_STUB = MIND_BRANCH_GAP / 2;

/** 同级节点之间的固定间距 */
export const MIND_SIBLING_GAP = 16;

export function getMindNodePadHorizontal(depth: number): number {
  return depth === 0 ? MIND_NODE_ROOT_PAD_X : MIND_NODE_PAD_X;
}

export function getMindNodePadVertical(depth: number): number {
  return depth === 0 ? MIND_NODE_ROOT_PAD_Y : MIND_NODE_PAD_Y;
}

/** 带边框节点的水平内边距总和 */
export function getMindNodePadX(depth: number, boxed = true): number {
  return boxed ? getMindNodePadHorizontal(depth) * 2 : 0;
}

/** 带边框节点的垂直内边距总和 */
export function getMindNodePadY(depth: number, boxed = true): number {
  return boxed ? getMindNodePadVertical(depth) * 2 : 0;
}

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

/** 画板思维导图主题字号（与 @lingyi-doc/mind-map WHITEBOARD_THEME 一致） */
export const WHITEBOARD_MIND_FONT_SIZES = {
  root: 16,
  branch: 14,
  leaf: 14,
} as const;

/** 画板思维导图默认分支线样式：三阶贝塞尔平滑曲线 */
export const WHITEBOARD_MIND_BRANCH_STYLE_DEFAULT: MindNoteBranchStyle = 'curve';

export function createWhiteboardMeasureOptions(): MindMapMeasureOptions {
  return {
    getFontSize: (node, depth, style) => {
      if (typeof node.fontSize === 'number') return node.fontSize;
      if (depth === 0) return WHITEBOARD_MIND_FONT_SIZES.root;
      if (style === 'leaf') return WHITEBOARD_MIND_FONT_SIZES.leaf;
      return WHITEBOARD_MIND_FONT_SIZES.branch;
    },
    getFontWeight: (node, depth) => (node.bold || depth === 0 ? 600 : 400),
    getLineHeight: (fontSize: number) => Math.round(fontSize * 1.43),
  };
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
    lineThrough: !!n.lineThrough,
    textAlign: n.textAlign === 'left' || n.textAlign === 'center' || n.textAlign === 'right'
      ? n.textAlign
      : undefined,
    textVerticalAlign: n.textVerticalAlign === 'top' || n.textVerticalAlign === 'center' || n.textVerticalAlign === 'bottom'
      ? n.textVerticalAlign
      : undefined,
    color: typeof n.color === 'string' ? n.color : undefined,
    note: typeof n.note === 'string' ? n.note : undefined,
    image: typeof n.image === 'string' ? n.image : undefined,
    imageWidth: typeof n.imageWidth === 'number' ? n.imageWidth : undefined,
    imageHeight: typeof n.imageHeight === 'number' ? n.imageHeight : undefined,
    imageFlipH: n.imageFlipH === true ? true : undefined,
    imageFlipV: n.imageFlipV === true ? true : undefined,
    locked: n.locked === true ? true : undefined,
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
    branchDir: n.branchDir === 'left' || n.branchDir === 'right' || n.branchDir === 'up' || n.branchDir === 'down'
      ? n.branchDir
      : undefined,
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
