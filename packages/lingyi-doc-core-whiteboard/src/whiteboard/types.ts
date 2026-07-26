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
  /**
   * 所属容器 id（如表格）。
   * 仅在用户主动将对象拖入表格后写入；移动该表格时仅带动带有此字段的对象。
   */
  containerId?: string;
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
  | 'document'
  // 直线
  | 'lineSolid'
  | 'lineDashed'
  | 'lineArrow'
  | 'lineArrowDouble'
  // 泳道
  | 'swimlaneV2'
  | 'swimlaneH2'
  | 'swimlaneV3'
  // 流程图专用
  | 'documentWavy'
  | 'internalStorage'
  | 'multiDocument'
  | 'display'
  | 'predefinedProcess'
  | 'manualInput'
  | 'flowDataFlow'
  | 'flowOffPage'
  | 'flowQueue'
  // UML 类图
  | 'umlClass3'
  | 'umlClass2'
  | 'umlInterface'
  | 'umlPackage'
  | 'umlNote'
  | 'umlAggregation'
  | 'umlComposition'
  | 'umlGeneralization'
  | 'umlRealization'
  | 'umlDependency'
  // 时序图
  | 'seqActor'
  | 'seqLifeline'
  | 'seqDbLifeline'
  | 'seqStorageLifeline'
  | 'seqBoundaryLifeline'
  | 'seqControlLifeline'
  | 'seqEntityLifeline'
  | 'seqMessage'
  | 'seqActivation'
  | 'seqFrame'
  | 'seqAltFrame'
  | 'seqNote'
  // 数据流图
  | 'dfdDataStore'
  | 'dfdSubProcess'
  | 'dfdStoreOpenRight'
  | 'dfdStoreOpenLeft'
  // 实体关系图
  | 'erTable1'
  | 'erTable2'
  | 'erTable3'
  | 'erTable4'
  // 组件图
  | 'compComponent'
  | 'compComponentAlt'
  | 'compProvided'
  | 'compAssembly'
  | 'compRequired'
  // 状态图
  | 'stateInitial'
  | 'stateFinal'
  | 'stateForkJoin'
  // 其他
  | 'star4'
  | 'star6'
  | 'calloutBurst'
  | 'actorStick';

export interface ShapeElement extends WhiteboardElementBase {
  type: 'shape';
  shapeKind: ShapeKind;
  /** 图形库分类（用于「更改图形」时限定同分类可选） */
  shapeCategoryId?: string;
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
  /** 时序图生命线长度（虚线尾段，不含头部） */
  seqLifelineLength?: number;
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
  /** 便签底色 */
  color: string;
  fontSize?: number;
  textColor?: string;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  textUnderline?: boolean;
  textLineThrough?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  textVerticalAlign?: 'top' | 'center' | 'bottom';
  textHighlight?: string;
}

export type ConnectorStyle = 'straight' | 'arrow' | 'elbow' | 'curve';

/** 连接线端点箭头样式 */
export type ArrowHeadStyle = 'none' | 'open' | 'arrow' | 'triangle' | 'circle' | 'dot' | 'diamond' | 'diamondFilled';

/** 连接线描边线型 */
export type ConnectorDashStyle = 'solid' | 'dashed' | 'dotted';

/** 连接线标签相对路径的位置 */
export type ConnectorLabelPosition = 'above' | 'on' | 'below';

/** 连接锚点（图形四边 + 四角） */
export type AnchorId = 'n' | 'e' | 's' | 'w' | 'nw' | 'ne' | 'se' | 'sw';

export interface ConnectorBind {
  elementId: string;
  anchor: AnchorId;
}

/** 曲线路径点类型：平滑点（对称手柄）/ 拐点（独立手柄） */
export type PathPointKind = 'corner' | 'smooth';

export interface ConnectorPathPoint extends WhiteboardPoint {
  kind?: PathPointKind;
  /** 入向贝塞尔控制点（绝对坐标）；null 表示自动推算 */
  handleIn?: WhiteboardPoint | null;
  /** 出向贝塞尔控制点（绝对坐标）；null 表示自动推算 */
  handleOut?: WhiteboardPoint | null;
}

export interface ConnectorElement extends WhiteboardElementBase {
  type: 'connector';
  style: ConnectorStyle;
  points: ConnectorPathPoint[];
  stroke: string;
  strokeWidth: number;
  /** 起点箭头样式；兼容旧数据默认 none */
  arrowStart?: ArrowHeadStyle | boolean;
  /** 终点箭头样式；兼容旧 boolean */
  arrowEnd?: ArrowHeadStyle | boolean;
  /** 描边线型，默认 solid */
  strokeDash?: ConnectorDashStyle;
  /** 描边不透明度 0–1，默认 1 */
  strokeOpacity?: number;
  /** 起点绑定到图形锚点 */
  startBind?: ConnectorBind;
  /** 终点绑定到图形锚点 */
  endBind?: ConnectorBind;
  /** 连接线标签文字 */
  text?: string;
  /** 标签相对连接线的位置 */
  labelPosition?: ConnectorLabelPosition;
  /** 路径模式：auto=随绑定自动路由，manual=保留用户编辑折点/手柄 */
  pathMode?: 'auto' | 'manual';
}

export type SectionAspect = 'custom' | '16:9' | '4:3' | '1:1' | 'a4';

export interface SectionElement extends WhiteboardElementBase {
  type: 'section';
  title: string;
  aspect: SectionAspect;
  fill: string;
  stroke: string;
}

export interface WbTableCellStyle {
  fontSize?: number;
  color?: string;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  textUnderline?: boolean;
  textLineThrough?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  textVerticalAlign?: 'top' | 'center' | 'bottom';
  textHighlight?: string;
  /** 单元格背景色 */
  fill?: string;
  /** 水平合并列数（仅锚点单元格有效） */
  colSpan?: number;
  /** 垂直合并行数（仅锚点单元格有效） */
  rowSpan?: number;
  /** 文字方向：垂直用于水平泳道标题列 */
  textOrientation?: 'horizontal' | 'vertical';
}

export interface TableElement extends WhiteboardElementBase {
  type: 'table';
  rows: number;
  cols: number;
  cells: string[][];
  /** 各列宽度；缺省均分 width */
  colWidths?: number[];
  /** 各行高度；缺省均分 height */
  rowHeights?: number[];
  /** 单元格样式（与 cells 同形）；缺省继承表级样式 */
  cellStyles?: (WbTableCellStyle | null | undefined)[][];
  fontSize?: number;
  color?: string;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  textUnderline?: boolean;
  textLineThrough?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  textVerticalAlign?: 'top' | 'center' | 'bottom';
  textHighlight?: string;
  /** 单元格边框色 */
  stroke?: string;
  /** 默认单元格背景色 */
  fill?: string;
}

export type PenMode = 'pen' | 'highlighter' | 'eraser';

export interface PenElement extends WhiteboardElementBase {
  type: 'pen';
  mode: PenMode;
  points: WhiteboardPoint[];
  color: string;
  strokeWidth: number;
}

import type { MindNode, MindNoteBranchStyle } from '@lingyi-doc/core-types';

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
  borderColor?: string;
  borderWidth?: number;
  /** 源图裁剪区域（像素，相对原图自然尺寸） */
  cropSrc?: { x: number; y: number; width: number; height: number };
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
