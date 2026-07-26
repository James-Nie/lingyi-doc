/** 内嵌画板数据（与 core-whiteboard.WhiteboardJSON 结构兼容，避免 doc↔whiteboard 循环依赖） */
export interface EmbeddedWhiteboardData {
  documentId: string;
  title: string;
  viewport: { x: number; y: number; zoom: number };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elements: any[];
}

/** 行内格式标记类型 */

export type MarkType =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'color'
  | 'background'
  | 'link'
  | 'fontSize'
  | 'comment';

export interface TextMark {
  type: MarkType;
  start: number;
  end: number;
  /** color / background / link url / fontSize / comment threadId */
  value?: string;
}

export type BlockAlign = 'left' | 'center' | 'right';
export type ParagraphStyle = 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5' | 'heading6';
export type ListType = 'bullet' | 'ordered' | 'task';

/** 有序列表编号方案：1/a/i、中文编号、层级 decimal */
export type OrderedListStyle = 'multiLevel' | 'chinese' | 'hierarchical';

export interface ListItem {
  text: string;
  level: number;
  checked?: boolean;
  marks: TextMark[];
  align?: BlockAlign;
  /** Word numbering.xml 中的 numFmt，如 decimal / chineseCounting */
  numFmt?: string;
}

export interface HeadingBlock {
  type: 'heading';
  id: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  marks: TextMark[];
  align?: BlockAlign;
  /** 首行缩进（默认约 2 字符 / 0.74cm） */
  firstLineIndent?: boolean;
  /** 整段左缩进级别，每级约 0.74cm */
  indentLevel?: number;
  /** 自定义制表位；缺省为每隔 0.74cm 的左对齐制表位 */
  tabStops?: import('./tabStops').TabStop[];
  /** 段落块背景色 */
  blockBackground?: string;
}

export interface ParagraphBlock {
  type: 'paragraph';
  id: string;
  text: string;
  marks: TextMark[];
  align?: BlockAlign;
  firstLineIndent?: boolean;
  indentLevel?: number;
  tabStops?: import('./tabStops').TabStop[];
  blockBackground?: string;
}

export interface ListBlock {
  type: 'list';
  id: string;
  listType: ListType;
  items: ListItem[];
  /** 有序列表编号方案，仅 listType === 'ordered' 时有效 */
  orderedStyle?: OrderedListStyle;
}

export interface QuoteBlock {
  type: 'quote';
  id: string;
  text: string;
  marks: TextMark[];
  firstLineIndent?: boolean;
  indentLevel?: number;
  tabStops?: import('./tabStops').TabStop[];
  blockBackground?: string;
}

export type TableCellVerticalAlign = 'top' | 'middle' | 'bottom';

export type TableCellStyle =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'orderedList'
  | 'bulletList'
  | 'task'
  | 'code';

export interface TableCell {
  text: string;
  marks: TextMark[];
  align?: BlockAlign;
  verticalAlign?: TableCellVerticalAlign;
  cellStyle?: TableCellStyle;
}

export interface TableBlock {
  type: 'table';
  id: string;
  rows: number;
  cols: number;
  cells: TableCell[][];
  /** 各列宽度（px） */
  columnWidths?: number[];
  /** 各行高度（px） */
  rowHeights?: number[];
}

export interface CodeBlock {
  type: 'code';
  id: string;
  text: string;
  blockBackground?: string;
  /** 代码语言标识 */
  language?: string;
  /** 是否折叠 */
  collapsed?: boolean;
  /** 代码区域高度（px） */
  height?: number;
  /** 自动换行 */
  wordWrap?: boolean;
}

export interface MermaidBlock {
  type: 'mermaid';
  id: string;
  /** Mermaid 源码 */
  text: string;
  /** 是否折叠 */
  collapsed?: boolean;
  /** 预览/源码区域高度（px） */
  height?: number;
}

export interface DividerBlock {
  type: 'divider';
  id: string;
}

export type ImageStyle = 'none' | 'border' | 'shadow';
export type ImageRotation = 0 | 90 | 180 | 270;

export interface ImageBlock {
  type: 'image';
  id: string;
  url: string;
  alt?: string;
  /** 图片下方展示的描述文字 */
  caption?: string;
  /** 显示宽度（px），高度随比例自适应 */
  width?: number;
  align?: BlockAlign;
  /** 图片样式：无 / 描边 / 阴影 */
  imageStyle?: ImageStyle;
  /** 旋转角度 */
  rotation?: ImageRotation;
  /** 图片链接 */
  link?: string;
  /** 原始宽度，用于重置 */
  naturalWidth?: number;
  /** 原始高度，用于重置 */
  naturalHeight?: number;
}

/** 文档内嵌多维表格视图类型 */
export type BaseEmbedViewType = 'grid' | 'kanban' | 'gantt' | 'gallery';

/** 文档内嵌多维表格块 */
export interface BaseBlock {
  type: 'base';
  id: string;
  /** 块标题，默认「表格」 */
  title?: string;
  /** 当前视图类型 */
  activeViewType: BaseEmbedViewType;
  /** FreeTable 序列化数据 */
  sheetData: Record<string, unknown>;
}

/** 文档内嵌画板块 */
export interface WhiteboardBlock {
  type: 'whiteboard';
  id: string;
  title?: string;
  whiteboardData: EmbeddedWhiteboardData;
}

export type DocBlock =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | QuoteBlock
  | CodeBlock
  | MermaidBlock
  | TableBlock
  | DividerBlock
  | ImageBlock
  | BaseBlock
  | WhiteboardBlock;

/** 结构化文档 JSON（存储/传输格式） */
export interface RichDocumentJSON {
  documentId: string;
  title: string;
  content: DocBlock[];
}

export interface OutlineNode {
  id: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  blockIndex: number;
  children: OutlineNode[];
}

export interface ToolbarState {
  paragraphStyle: ParagraphStyle;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  color: string;
  backgroundColor: string;
  align: BlockAlign;
  listType: ListType | null;
  isQuote: boolean;
  isCode: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export const DOC_COLORS = {
  primary: '#165DFF',
  text: '#1F2329',
  muted: '#86909C',
  border: '#E5E6EB',
  pageBg: '#F7F8FA',
  editorBg: '#FFFFFF',
};

export const FONT_SIZES = [12, 14, 15, 16, 18, 20, 22, 24, 26, 28, 32, 40, 48] as const;
