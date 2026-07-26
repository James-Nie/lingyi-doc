/** 思维笔记节点 */
export type { MindNode, MindNoteBranchStyle } from '@lingyi-doc/core-types';
import type { MindNode, MindNoteBranchStyle } from '@lingyi-doc/core-types';

export type MindNoteViewMode = 'outline' | 'map';
export type MindNoteStructure =
  | 'right' | 'left' | 'balanced' | 'vertical'
  | 'treeRight' | 'treeLeft' | 'treeBalanced'
  | 'timelineH' | 'timelineV';

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
