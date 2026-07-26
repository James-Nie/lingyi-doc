/** 思维导图 / 思维笔记节点（共享类型，避免 whiteboard→mindmap 硬依赖） */
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
  /** 图片水平翻转 */
  imageFlipH?: boolean;
  /** 图片垂直翻转 */
  imageFlipV?: boolean;
  /** 锁定后不可编辑 / 删除 */
  locked?: boolean;
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

export type MindNoteBranchStyle = 'curve' | 'straight';
