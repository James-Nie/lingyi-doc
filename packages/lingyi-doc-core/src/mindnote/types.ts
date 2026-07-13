/** 思维笔记节点 */
export interface MindNode {
  id: string;
  text: string;
  completed?: boolean;
  collapsed?: boolean;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** 中划线 */
  lineThrough?: boolean;
  /** 文字水平对齐 */
  textAlign?: 'left' | 'center' | 'right';
  /** 文字垂直对齐 */
  textVerticalAlign?: 'top' | 'center' | 'bottom';
  /** 文字颜色 */
  color?: string;
  /** 节点描述/备注 */
  note?: string;
  /** 节点图片（URL 或 data URL） */
  image?: string;
  /** 图片显示宽度 */
  imageWidth?: number;
  /** 图片显示高度 */
  imageHeight?: number;
  /** 大纲标题级别 1-3 */
  headingLevel?: 1 | 2 | 3;
  /** 画板思维导图：节点形状 */
  shapeKind?: 'text' | 'roundRect' | 'ellipse' | 'rect';
  /** 画板思维导图：填充色 */
  fillColor?: string;
  /** 画板思维导图：边框色 */
  borderColor?: string;
  /** 画板思维导图：文字背景色 */
  textBgColor?: string;
  /** 画板思维导图：字号 */
  fontSize?: number;
  /** 画板思维导图：填充不透明度 0-100 */
  fillOpacity?: number;
  /** 画板思维导图：边框不透明度 0-100 */
  borderOpacity?: number;
  /** 主节点一级子节点的扩展方向（左右/上下布局手动指定，不自动分配） */
  branchDir?: 'left' | 'right' | 'up' | 'down';
  children: MindNode[];
}

export type MindNoteViewMode = 'outline' | 'map';
export type MindNoteStructure =
  | 'right' | 'left' | 'balanced' | 'vertical'
  | 'treeRight' | 'treeLeft' | 'treeBalanced'
  | 'timelineH' | 'timelineV';
export type MindNoteBranchStyle = 'curve' | 'straight';

export interface MindNoteSettings {
  viewMode: MindNoteViewMode;
  structure: MindNoteStructure;
  branchStyle: MindNoteBranchStyle;
  zoom: number;
}

export interface MindNoteJSON {
  documentId: string;
  title: string;
  root: MindNode;
  settings: MindNoteSettings;
}

export interface MindNodePath {
  node: MindNode;
  parent: MindNode | null;
  index: number;
}

/** 导图布局节点 */
export type MindMapNodeStyle = 'root' | 'branch' | 'leaf';

export interface MindMapLayoutNode {
  id: string;
  text: string;
  completed?: boolean;
  collapsed?: boolean;
  childCount: number;
  depth: number;
  x: number;
  y: number;
  width: number;
  height: number;
  isRoot: boolean;
  style: MindMapNodeStyle;
  side?: 'left' | 'right';
  /** 上下结构：子节点扩展方向 */
  vertDir?: 'up' | 'down';
}

export interface MindMapPath {
  id: string;
  d: string;
}

export interface MindMapEdge {
  fromId: string;
  toId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** 思维导图布局测量选项（主题字号等与渲染保持一致） */
export interface MindMapMeasureOptions {
  getFontSize?: (node: MindNode, depth: number, style: MindMapNodeStyle) => number;
  getFontWeight?: (node: MindNode, depth: number, style: MindMapNodeStyle) => number | string;
  getLineHeight?: (fontSize: number, depth: number, style: MindMapNodeStyle) => number;
}

export interface MindMapLayout {
  nodes: MindMapLayoutNode[];
  paths: MindMapPath[];
  width: number;
  height: number;
}
