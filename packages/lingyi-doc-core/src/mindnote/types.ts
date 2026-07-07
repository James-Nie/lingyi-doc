/** 思维笔记节点 */
export interface MindNode {
  id: string;
  text: string;
  completed?: boolean;
  collapsed?: boolean;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
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

export interface MindMapLayout {
  nodes: MindMapLayoutNode[];
  paths: MindMapPath[];
  width: number;
  height: number;
}
