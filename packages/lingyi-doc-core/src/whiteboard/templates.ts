import type {
  ConnectorBind,
  ConnectorStyle,
  MindmapLayout,
  SectionAspect,
  ShapeKind,
  WhiteboardElement,
} from './types';
import type { MindNode, MindNoteBranchStyle } from '../mindnote/types';
import { computeMindMapLayout } from '../mindnote/layout';
import { createEmptyMindNode } from '../mindnote/utils';
import { genWhiteboardId, nextZIndex } from './utils';

export const SHAPE_DEFAULT_FILL = '#e8f0fe';
export const SHAPE_DEFAULT_STROKE = '#3370ff';
export const SHAPE_DEFAULT_STROKE_WIDTH = 2;

export const STICKY_COLORS = [
  '#fff9c4', '#ffe0b2', '#c8e6c9',
  '#b2dfdb', '#bbdefb', '#c5cae9',
  '#e1bee7', '#f8bbd0', '#ffcdd2',
];

export const SHAPE_PRESETS: { kind: ShapeKind; label: string }[] = [
  { kind: 'roundRect', label: '圆角矩形' },
  { kind: 'ellipse', label: '全圆角矩形' },
  { kind: 'diamond', label: '菱形' },
  { kind: 'rect', label: '矩形' },
  { kind: 'circle', label: '圆形' },
  { kind: 'cylinder', label: '圆柱' },
  { kind: 'chevron', label: '箭头' },
  { kind: 'dShape', label: 'D形' },
  { kind: 'parallelogram', label: '平行四边形' },
  { kind: 'trapezoid', label: '梯形' },
  { kind: 'speechBubble', label: '圆形气泡' },
  { kind: 'speechBubbleRect', label: '矩形气泡' },
  { kind: 'triangleRight', label: '直角三角形' },
  { kind: 'triangle', label: '三角形' },
  { kind: 'star', label: '星形' },
  { kind: 'hexagon', label: '六边形' },
  { kind: 'pentagon', label: '五边形' },
  { kind: 'octagon', label: '八边形' },
  { kind: 'arrowLeft', label: '左箭头' },
  { kind: 'arrowRight', label: '右箭头' },
  { kind: 'arrowDouble', label: '双向箭头' },
  { kind: 'cloud', label: '云形' },
  { kind: 'braceLeft', label: '左括号' },
  { kind: 'braceRight', label: '右括号' },
  { kind: 'plus', label: '十字' },
];

export const CONNECTOR_PRESETS: { style: ConnectorStyle; label: string }[] = [
  { style: 'straight', label: '直线' },
  { style: 'arrow', label: '箭头' },
  { style: 'elbow', label: '折线' },
  { style: 'curve', label: '曲线' },
];

export const SECTION_PRESETS: { aspect: SectionAspect; label: string; w: number; h: number }[] = [
  { aspect: 'custom', label: '自定义', w: 480, h: 320 },
  { aspect: '16:9', label: '16:9', w: 640, h: 360 },
  { aspect: '4:3', label: '4:3', w: 640, h: 480 },
  { aspect: '1:1', label: '1:1', w: 480, h: 480 },
  { aspect: 'a4', label: 'A4', w: 420, h: 594 },
];

export function isFixedSectionAspect(aspect: SectionAspect): boolean {
  return aspect !== 'custom';
}

export function getSectionAspectRatio(aspect: SectionAspect): number | null {
  if (!isFixedSectionAspect(aspect)) return null;
  const preset = SECTION_PRESETS.find(p => p.aspect === aspect);
  if (!preset || preset.h <= 0) return null;
  return preset.w / preset.h;
}

export const MINDMAP_TEMPLATES: { layout: MindmapLayout; label: string; category: string }[] = [
  { layout: 'right', label: '向右', category: '思维导图' },
  { layout: 'left', label: '向左', category: '思维导图' },
  { layout: 'balanced', label: '左右', category: '思维导图' },
  { layout: 'vertical', label: '向下', category: '思维导图' },
  { layout: 'treeRight', label: '向右', category: '树状图' },
  { layout: 'treeLeft', label: '向左', category: '树状图' },
  { layout: 'treeBalanced', label: '左右', category: '树状图' },
  { layout: 'timelineH', label: '横向', category: '时间线' },
  { layout: 'timelineV', label: '纵向', category: '时间线' },
];

export const MINDMAP_LAYOUT_CATEGORIES = ['思维导图', '树状图', '时间线'] as const;

function createDefaultMindmapRoot(text: string): MindNode {
  const root = createEmptyMindNode(text);
  root.children = Array.from({ length: 3 }, (_, i) => {
    const child = createEmptyMindNode('输入文本');
    if (i === 0) {
      child.children = [createEmptyMindNode('输入文本')];
    }
    return child;
  });
  return root;
}

export function createShapeElement(
  shapeKind: ShapeKind,
  x: number,
  y: number,
  zIndex: number,
): WhiteboardElement {
  const base = {
    id: genWhiteboardId(),
    type: 'shape' as const,
    shapeKind,
    x,
    y,
    width: shapeKind === 'ellipse' ? 168 : shapeKind === 'circle' ? 96 : 140,
    height: shapeKind === 'ellipse' ? 56 : shapeKind === 'circle' ? 96 : 72,
    zIndex,
    fill: SHAPE_DEFAULT_FILL,
    stroke: SHAPE_DEFAULT_STROKE,
    strokeWidth: SHAPE_DEFAULT_STROKE_WIDTH,
    text: undefined as string | undefined,
    fontSize: 14,
    textColor: '#1f2329',
    textAlign: 'center' as const,
    textVerticalAlign: 'center' as const,
    fontWeight: 400,
    fontStyle: 'normal' as const,
  };
  if (shapeKind === 'braceLeft' || shapeKind === 'braceRight') {
    return {
      ...base,
      width: 160,
      height: 100,
      stroke: '#1f2329',
      strokeWidth: 2.5,
      text: shapeKind === 'braceLeft' ? '左括号' : '右括号',
    };
  }
  return base;
}

export function createStickyElement(x: number, y: number, color: string, zIndex: number): WhiteboardElement {
  return {
    id: genWhiteboardId(),
    type: 'sticky',
    x,
    y,
    width: 160,
    height: 160,
    zIndex,
    text: '',
    color,
  };
}

export function createTextElement(x: number, y: number, zIndex: number): WhiteboardElement {
  return {
    id: genWhiteboardId(),
    type: 'text',
    x,
    y,
    width: 200,
    height: 40,
    zIndex,
    text: '输入文本',
    fontSize: 16,
    color: '#1f2329',
  };
}

export function createTableElement(x: number, y: number, zIndex: number): WhiteboardElement {
  const rows = 3;
  const cols = 3;
  return {
    id: genWhiteboardId(),
    type: 'table',
    x,
    y,
    width: cols * 80,
    height: rows * 32,
    zIndex,
    rows,
    cols,
    cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => '')),
  };
}

export function createSectionElement(
  aspect: SectionAspect,
  x: number,
  y: number,
  zIndex: number,
): WhiteboardElement {
  const preset = SECTION_PRESETS.find(p => p.aspect === aspect) ?? SECTION_PRESETS[0];
  return {
    id: genWhiteboardId(),
    type: 'section',
    x,
    y,
    width: preset.w,
    height: preset.h,
    zIndex,
    title: '分区',
    aspect,
    fill: '#fafafa',
    stroke: '#dee0e3',
  };
}

export function createConnectorElement(
  style: ConnectorStyle,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  zIndex: number,
  binds?: { startBind?: ConnectorBind; endBind?: ConnectorBind },
): WhiteboardElement {
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  return {
    id: genWhiteboardId(),
    type: 'connector',
    x: minX,
    y: minY,
    width: Math.abs(x2 - x1) || 1,
    height: Math.abs(y2 - y1) || 1,
    zIndex,
    style,
    points: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
    stroke: '#1f2329',
    strokeWidth: 2,
    arrowEnd: style !== 'straight',
    startBind: binds?.startBind,
    endBind: binds?.endBind,
  };
}

const MINDMAP_EMBED_PADDING = 64;
const MINDMAP_MIN_W = 160;
const MINDMAP_MIN_H = 120;

function mindmapElementSize(
  root: MindNode,
  layout: MindmapLayout,
  branchStyle: MindNoteBranchStyle = 'straight',
): { width: number; height: number } {
  const { width, height } = computeMindMapLayout(root, layout, branchStyle);
  return {
    width: Math.max(Math.ceil(width + MINDMAP_EMBED_PADDING * 2), MINDMAP_MIN_W),
    height: Math.max(Math.ceil(height + MINDMAP_EMBED_PADDING * 2), MINDMAP_MIN_H),
  };
}

export function createMindmapElement(
  layout: MindmapLayout,
  x: number,
  y: number,
  zIndex: number,
): WhiteboardElement {
  const root = createDefaultMindmapRoot('输入文本');
  const { width, height } = mindmapElementSize(root, layout, 'straight');
  return {
    id: genWhiteboardId(),
    type: 'mindmap',
    x,
    y,
    width,
    height,
    zIndex,
    layout,
    root,
    branchStyle: 'straight',
  };
}

export function createPenStroke(
  mode: 'pen' | 'highlighter' | 'eraser',
  color: string,
  strokeWidth: number,
  points: { x: number; y: number }[],
  zIndex: number,
): WhiteboardElement {
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    id: genWhiteboardId(),
    type: 'pen',
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX || 1,
    height: Math.max(...ys) - minY || 1,
    zIndex,
    mode,
    points,
    color: mode === 'eraser' ? '#ffffff' : color,
    strokeWidth,
  };
}

export function createDefaultElements(): WhiteboardElement[] {
  const elements: WhiteboardElement[] = [];
  let z = 0;
  elements.push(createShapeElement('rect', 120, 120, z++));
  elements.push(createStickyElement(320, 80, STICKY_COLORS[4], z++));
  elements.push(createTableElement(280, 280, z++));
  elements.push(createMindmapElement('right', 520, 100, z++));
  return elements;
}

export function appendElement(elements: WhiteboardElement[], el: WhiteboardElement): WhiteboardElement[] {
  return [...elements, { ...el, zIndex: nextZIndex(elements) }];
}
