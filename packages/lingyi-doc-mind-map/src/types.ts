import type {
  MindMapLayout,
  MindMapLayoutNode,
  MindNode,
  MindNoteBranchStyle,
  MindNoteStructure,
} from '@lingyi-doc/core-mindmap';

export type MindmapThemeId = 'default' | 'whiteboard' | 'print';

export interface MindmapTheme {
  id: MindmapThemeId;
  canvasBg: string;
  lineColor: string;
  lineWidth: number;
  accent: string;
  text: string;
  rootFill: string;
  rootText: string;
  fontFamily: string;
  rootFontSize: number;
  branchFontSize: number;
  leafFontSize: number;
}

export interface MindmapRenderOptions {
  structure: MindNoteStructure;
  branchStyle: MindNoteBranchStyle;
  themeId?: MindmapThemeId;
  theme?: Partial<MindmapTheme>;
  /** 内容区相对元素左上角的偏移（embedded 模式） */
  contentPadding?: number;
}

export interface MindmapPaintOptions {
  selected?: boolean;
  hovered?: boolean;
  activeNodeId?: string | null;
  hideNodeTextId?: string | null;
  hoveredCollapseNodeId?: string | null;
}

export interface MindmapHitResult {
  kind: 'node' | 'nodeImage' | 'collapseButton' | 'none';
  nodeId?: string;
}

export interface MindmapViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface MindmapContentBounds {
  width: number;
  height: number;
  layoutWidth: number;
  layoutHeight: number;
  padding: number;
}

export type { MindMapLayout, MindMapLayoutNode, MindNode, MindNoteBranchStyle, MindNoteStructure };

/** 画板元素内内容区 padding（替代 SMM 64px hack） */
export const MINDMAP_CONTENT_PADDING = 16;

export const MINDMAP_MIN_WIDTH = 160;
export const MINDMAP_MIN_HEIGHT = 120;
