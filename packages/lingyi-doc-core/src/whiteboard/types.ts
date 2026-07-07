/** 画布元素类型 */
export type WhiteboardElementType =
  | 'shape'
  | 'text'
  | 'sticky'
  | 'connector'
  | 'section'
  | 'table'
  | 'pen'
  | 'mindmap'
  | 'image';

export interface WhiteboardPoint {
  x: number;
  y: number;
}

export interface WhiteboardElementBase {
  id: string;
  type: WhiteboardElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
  zIndex: number;
  locked?: boolean;
}

export type ShapeKind =
  | 'roundRect'
  | 'ellipse'
  | 'diamond'
  | 'rect'
  | 'circle'
  | 'cylinder'
  | 'chevron'
  | 'dShape'
  | 'parallelogram'
  | 'trapezoid'
  | 'speechBubble'
  | 'speechBubbleRect'
  | 'triangleRight'
  | 'triangle'
  | 'star'
  | 'hexagon'
  | 'pentagon'
  | 'octagon'
  | 'arrowLeft'
  | 'arrowRight'
  | 'arrowDouble'
  | 'cloud'
  | 'braceLeft'
  | 'braceRight'
  | 'plus'
  | 'process'
  | 'document';

export interface ShapeElement extends WhiteboardElementBase {
  type: 'shape';
  shapeKind: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
  text?: string;
  fontSize?: number;
  textColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  textVerticalAlign?: 'top' | 'center' | 'bottom';
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  textUnderline?: boolean;
  textLineThrough?: boolean;
  /** 文字背景高亮色（全行默认） */
  textHighlight?: string;
  /** 按行文字高亮色，优先于 textHighlight */
  textLineHighlights?: string[];
}

export interface TextElement extends WhiteboardElementBase {
  type: 'text';
  text: string;
  fontSize: number;
  color: string;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  textUnderline?: boolean;
  textLineThrough?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  textVerticalAlign?: 'top' | 'center' | 'bottom';
  /** 文字背景高亮色 */
  textHighlight?: string;
}

export interface StickyElement extends WhiteboardElementBase {
  type: 'sticky';
  text: string;
  color: string;
}

export type ConnectorStyle = 'straight' | 'arrow' | 'elbow' | 'curve';

/** 连接锚点（图形四边 + 四角） */
export type AnchorId = 'n' | 'e' | 's' | 'w' | 'nw' | 'ne' | 'se' | 'sw';

export interface ConnectorBind {
  elementId: string;
  anchor: AnchorId;
}

export interface ConnectorElement extends WhiteboardElementBase {
  type: 'connector';
  style: ConnectorStyle;
  points: WhiteboardPoint[];
  stroke: string;
  strokeWidth: number;
  arrowEnd?: boolean;
  /** 起点绑定到图形锚点 */
  startBind?: ConnectorBind;
  /** 终点绑定到图形锚点 */
  endBind?: ConnectorBind;
}

export type SectionAspect = 'custom' | '16:9' | '4:3' | '1:1' | 'a4';

export interface SectionElement extends WhiteboardElementBase {
  type: 'section';
  title: string;
  aspect: SectionAspect;
  fill: string;
  stroke: string;
}

export interface TableElement extends WhiteboardElementBase {
  type: 'table';
  rows: number;
  cols: number;
  cells: string[][];
}

export type PenMode = 'pen' | 'highlighter' | 'eraser';

export interface PenElement extends WhiteboardElementBase {
  type: 'pen';
  mode: PenMode;
  points: WhiteboardPoint[];
  color: string;
  strokeWidth: number;
}

import type { MindNode, MindNoteBranchStyle } from '../mindnote/types';

/** @deprecated 使用 MindNode */
export type MindmapNode = MindNode;

export type MindmapLayout =
  | 'right' | 'left' | 'balanced' | 'vertical'
  | 'treeRight' | 'treeLeft' | 'treeBalanced'
  | 'timelineH' | 'timelineV';

export type MindmapLayoutCategory = 'mindMap' | 'tree' | 'timeline';

export function getMindmapLayoutCategory(layout: MindmapLayout): MindmapLayoutCategory {
  if (layout === 'treeRight' || layout === 'treeLeft' || layout === 'treeBalanced') return 'tree';
  if (layout === 'timelineH' || layout === 'timelineV') return 'timeline';
  return 'mindMap';
}

export interface MindmapElement extends WhiteboardElementBase {
  type: 'mindmap';
  layout: MindmapLayout;
  root: MindNode;
  branchStyle: MindNoteBranchStyle;
  /** @deprecated 画板缩放由 viewport 统一控制，不再使用元素级 zoom */
  zoom?: number;
  /** @deprecated 由 simple-mind-map 主题控制 */
  nodeColor?: string;
  /** @deprecated 由 simple-mind-map 主题控制 */
  lineColor?: string;
}

export interface ImageElement extends WhiteboardElementBase {
  type: 'image';
  src: string;
  alt?: string;
}

export type WhiteboardElement =
  | ShapeElement
  | TextElement
  | StickyElement
  | ConnectorElement
  | SectionElement
  | TableElement
  | PenElement
  | MindmapElement
  | ImageElement;

export interface WhiteboardViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface WhiteboardJSON {
  documentId: string;
  title: string;
  viewport: WhiteboardViewport;
  elements: WhiteboardElement[];
}

export type WhiteboardTool =
  | 'select'
  | 'shape'
  | 'text'
  | 'sticky'
  | 'connector'
  | 'section'
  | 'table'
  | 'pen'
  | 'mindmap'
  | 'image'
  | 'comment'
  | 'pan';
