import type {
  ArrowHeadStyle,
  ConnectorBind,
  ConnectorDashStyle,
  ConnectorStyle,
  MindmapLayout,
  SectionAspect,
  ShapeKind,
  WhiteboardElement,
} from './types';
import { initCurvePathPoints, smoothCurvePath } from './pathEditing';
import { defaultElbowPoints } from './elbowConnector';
import type { MindNode, MindNoteBranchStyle } from '@lingyi-doc/core-types';
import { getMindNodeFactory, getTreeLayoutEngine } from '@lingyi-doc/core-types';
import { genWhiteboardId, nextZIndex } from './utils';
import {
  SHAPE_DEFAULT_FILL,
  SHAPE_DEFAULT_STROKE,
  SHAPE_DEFAULT_STROKE_WIDTH,
} from './shapes/constants';
import { getShapeRegistry } from './shapes/registry';
import { resolvePlacementDefaults } from './shapes/builtin';
import './shapes/builtin';

export {
  SHAPE_DEFAULT_FILL,
  SHAPE_DEFAULT_STROKE,
  SHAPE_DEFAULT_STROKE_WIDTH,
} from './shapes/constants';

export const STICKY_COLORS = [
  '#fff9c4', '#ffe0b2', '#c8e6c9',
  '#b2dfdb', '#bbdefb', '#c5cae9',
  '#e1bee7', '#f8bbd0', '#ffcdd2',
];

export const SHAPE_PRESETS: { kind: ShapeKind; label: string }[] = getShapeRegistry()
  .listShapePresets({ quickPickOnly: true });

export function refreshShapePresets(): { kind: ShapeKind; label: string }[] {
  return getShapeRegistry().listShapePresets({ quickPickOnly: true });
}

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
  return getMindNodeFactory().createEmpty(text) as MindNode;
}

export function createShapeElement(
  shapeKind: ShapeKind,
  x: number,
  y: number,
  zIndex: number,
  options?: { shapeCategoryId?: string },
): WhiteboardElement {
  const registry = getShapeRegistry();
  const categoryId = options?.shapeCategoryId
    ?? registry.resolveShapeCategoryId(shapeKind);
  const baseDefaults = registry.resolveDefaults(shapeKind) ?? {
    width: 140,
    height: 72,
    fill: SHAPE_DEFAULT_FILL,
    stroke: SHAPE_DEFAULT_STROKE,
    strokeWidth: SHAPE_DEFAULT_STROKE_WIDTH,
    fontSize: 14,
    textColor: '#1f2329',
    textAlign: 'center' as const,
    textVerticalAlign: 'center' as const,
    fontWeight: 400,
    fontStyle: 'normal' as const,
  };
  const placement = resolvePlacementDefaults(shapeKind, categoryId);
  const defaults = placement ? { ...baseDefaults, ...placement } : baseDefaults;
  return {
    id: genWhiteboardId(),
    type: 'shape',
    shapeKind,
    shapeCategoryId: categoryId,
    x,
    y,
    width: defaults.width,
    height: defaults.height,
    zIndex,
    fill: defaults.fill,
    stroke: defaults.stroke,
    strokeWidth: defaults.strokeWidth,
    text: defaults.text,
    fontSize: defaults.fontSize,
    textColor: defaults.textColor,
    textAlign: defaults.textAlign,
    textVerticalAlign: defaults.textVerticalAlign,
    fontWeight: defaults.fontWeight,
    fontStyle: defaults.fontStyle,
    seqLifelineLength: defaults.seqLifelineLength,
  };
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
    textVerticalAlign: 'center',
  };
}

/** 表格放置预设：普通表 / 垂直泳道 / 水平泳道 / 类 / 接口（均为 type=table，仅初始化数据不同） */
export type WhiteboardTablePreset = 'default' | 'swimlaneV' | 'swimlaneH' | 'umlClass' | 'umlInterface';

const SWIMLANE_HEADER_STYLE = {
  fill: '#f5f6f7',
  fontWeight: 500,
  textAlign: 'center' as const,
  textVerticalAlign: 'center' as const,
};

function createDefaultTableElement(x: number, y: number, zIndex: number): WhiteboardElement {
  const rows = 3;
  const cols = 3;
  const cellSize = 80;
  return {
    id: genWhiteboardId(),
    type: 'table',
    x,
    y,
    width: cols * cellSize,
    height: rows * cellSize,
    zIndex,
    rows,
    cols,
    cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => '')),
    colWidths: Array.from({ length: cols }, () => cellSize),
    rowHeights: Array.from({ length: rows }, () => cellSize),
    fontSize: 14,
    color: '#1f2329',
    textAlign: 'center',
    textVerticalAlign: 'center',
    stroke: '#1f2329',
    fill: '#ffffff',
  };
}

/**
 * 垂直泳道：顶行「垂直泳道」跨列合并，次行各泳道标题，下方为内容区。
 * 结构 3 行 × 2 列。
 */
function createVerticalSwimlaneTable(x: number, y: number, zIndex: number): WhiteboardElement {
  const rows = 3;
  const cols = 2;
  const colW = 160;
  const titleH = 36;
  const laneH = 36;
  const bodyH = 220;
  const cells = [
    ['垂直泳道', ''],
    ['泳道', '泳道'],
    ['', ''],
  ];
  const cellStyles = [
    [{ ...SWIMLANE_HEADER_STYLE, colSpan: 2 }, null],
    [{ ...SWIMLANE_HEADER_STYLE }, { ...SWIMLANE_HEADER_STYLE }],
    [null, null],
  ];
  return {
    id: genWhiteboardId(),
    type: 'table',
    x,
    y,
    width: cols * colW,
    height: titleH + laneH + bodyH,
    zIndex,
    rows,
    cols,
    cells,
    colWidths: [colW, colW],
    rowHeights: [titleH, laneH, bodyH],
    cellStyles,
    fontSize: 14,
    color: '#1f2329',
    textAlign: 'center',
    textVerticalAlign: 'center',
    stroke: '#1f2329',
    fill: '#ffffff',
  };
}

/**
 * 水平泳道：首列「水平泳道」跨行合并（竖排），次列各泳道标题（竖排），右侧为内容区。
 * 结构 2 行 × 3 列。
 */
function createHorizontalSwimlaneTable(x: number, y: number, zIndex: number): WhiteboardElement {
  const rows = 2;
  const cols = 3;
  const titleW = 40;
  const laneW = 40;
  const bodyW = 320;
  const rowH = 140;
  const cells = [
    ['水平泳道', '泳道', ''],
    ['', '泳道', ''],
  ];
  const cellStyles = [
    [
      { ...SWIMLANE_HEADER_STYLE, rowSpan: 2, textOrientation: 'vertical' as const },
      { ...SWIMLANE_HEADER_STYLE, textOrientation: 'vertical' as const },
      null,
    ],
    [
      null,
      { ...SWIMLANE_HEADER_STYLE, textOrientation: 'vertical' as const },
      null,
    ],
  ];
  return {
    id: genWhiteboardId(),
    type: 'table',
    x,
    y,
    width: titleW + laneW + bodyW,
    height: rows * rowH,
    zIndex,
    rows,
    cols,
    cells,
    colWidths: [titleW, laneW, bodyW],
    rowHeights: [rowH, rowH],
    cellStyles,
    fontSize: 14,
    color: '#1f2329',
    textAlign: 'center',
    textVerticalAlign: 'center',
    stroke: '#1f2329',
    fill: '#ffffff',
  };
}

/**
 * UML 类：3行1列表格，包含标题行、属性行、方法行
 */
function createUmlClassTable(x: number, y: number, zIndex: number): WhiteboardElement {
  const rows = 3;
  const cols = 1;
  const titleH = 44;
  const fieldH = 32;
  const methodH = 32;
  const width = 180;
  const cells = [
    ['Class'],
    ['+ field: type'],
    ['+ method(type): type'],
  ];
  const cellStyles = [
    [{ fill: '#f2f3f5', fontWeight: 700, textAlign: 'center' as const, textVerticalAlign: 'center' as const }],
    [{ fill: '#ffffff', textAlign: 'left' as const, textVerticalAlign: 'center' as const }],
    [{ fill: '#ffffff', textAlign: 'left' as const, textVerticalAlign: 'center' as const }],
  ];
  return {
    id: genWhiteboardId(),
    type: 'table',
    x,
    y,
    width,
    height: titleH + fieldH + methodH,
    zIndex,
    rows,
    cols,
    cells,
    colWidths: [width],
    rowHeights: [titleH, fieldH, methodH],
    cellStyles,
    fontSize: 14,
    color: '#1f2329',
    textAlign: 'center',
    textVerticalAlign: 'center',
    stroke: '#9ca3af',
    fill: '#ffffff',
  };
}

/**
 * UML 接口：2行1列表格，包含标题行、方法行
 */
function createUmlInterfaceTable(x: number, y: number, zIndex: number): WhiteboardElement {
  const rows = 2;
  const cols = 1;
  const titleH = 44;
  const methodH = 32;
  const width = 180;
  const cells = [
    ['<<Interface>>'],
    ['+ method(type): type'],
  ];
  const cellStyles = [
    [{ fill: '#f2f3f5', fontWeight: 700, textAlign: 'center' as const, textVerticalAlign: 'center' as const }],
    [{ fill: '#ffffff', textAlign: 'left' as const, textVerticalAlign: 'center' as const }],
  ];
  return {
    id: genWhiteboardId(),
    type: 'table',
    x,
    y,
    width,
    height: titleH + methodH,
    zIndex,
    rows,
    cols,
    cells,
    colWidths: [width],
    rowHeights: [titleH, methodH],
    cellStyles,
    fontSize: 14,
    color: '#1f2329',
    textAlign: 'center',
    textVerticalAlign: 'center',
    stroke: '#9ca3af',
    fill: '#ffffff',
  };
}

export function createTableElement(
  x: number,
  y: number,
  zIndex: number,
  preset: WhiteboardTablePreset = 'default',
): WhiteboardElement {
  if (preset === 'swimlaneV') return createVerticalSwimlaneTable(x, y, zIndex);
  if (preset === 'swimlaneH') return createHorizontalSwimlaneTable(x, y, zIndex);
  if (preset === 'umlClass') return createUmlClassTable(x, y, zIndex);
  if (preset === 'umlInterface') return createUmlInterfaceTable(x, y, zIndex);
  return createDefaultTableElement(x, y, zIndex);
}

/** 图形库 shapeKind → 表格预设（放置时创建 table，不再创建 shape） */
export function tablePresetFromShapeKind(kind: string): WhiteboardTablePreset | null {
  if (kind === 'swimlaneV2' || kind === 'swimlaneV3') return 'swimlaneV';
  if (kind === 'swimlaneH2') return 'swimlaneH';
  if (kind === 'umlClass3' || kind === 'umlClass2') return 'umlClass';
  if (kind === 'umlInterface') return 'umlInterface';
  return null;
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

export interface CreateConnectorOpts {
  startBind?: ConnectorBind;
  endBind?: ConnectorBind;
  strokeDash?: ConnectorDashStyle;
  arrowStart?: ArrowHeadStyle | boolean;
  arrowEnd?: ArrowHeadStyle | boolean;
}

export function createConnectorElement(
  style: ConnectorStyle,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  zIndex: number,
  opts?: CreateConnectorOpts,
): WhiteboardElement {
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const arrowEnd = opts?.arrowEnd !== undefined ? opts.arrowEnd : style !== 'straight';
  return {
    id: genWhiteboardId(),
    type: 'connector',
    x: minX,
    y: minY,
    width: Math.abs(x2 - x1) || 1,
    height: Math.abs(y2 - y1) || 1,
    zIndex,
    style,
    points: style === 'curve'
      ? smoothCurvePath(initCurvePathPoints({ x: x1, y: y1 }, { x: x2, y: y2 }))
      : style === 'elbow'
        ? defaultElbowPoints({ x: x1, y: y1 }, { x: x2, y: y2 })
        : [{ x: x1, y: y1 }, { x: x2, y: y2 }],
    stroke: '#1f2329',
    strokeWidth: 2,
    strokeDash: opts?.strokeDash,
    arrowStart: opts?.arrowStart,
    arrowEnd,
    startBind: opts?.startBind,
    endBind: opts?.endBind,
    pathMode: (style === 'elbow' || style === 'curve') && opts?.startBind && opts?.endBind
      ? 'auto'
      : undefined,
  };
}

/** 图形库「直线」类 → 连接线工具选项（交互与快捷栏连接线一致） */
export function connectorOptsFromLineShapeKind(kind: string): {
  style: ConnectorStyle;
  strokeDash?: ConnectorDashStyle;
  arrowStart?: ArrowHeadStyle | boolean;
  arrowEnd?: ArrowHeadStyle | boolean;
} | null {
  switch (kind) {
    case 'lineSolid':
      return { style: 'straight', arrowEnd: false };
    case 'lineDashed':
      return { style: 'straight', strokeDash: 'dashed', arrowEnd: false };
    case 'lineArrow':
      return { style: 'arrow', arrowEnd: true };
    case 'lineArrowDouble':
      return { style: 'straight', arrowStart: 'arrow', arrowEnd: 'arrow' };
    // UML类图关系线
    case 'umlAggregation':
      // 聚合：实线 + 结尾空心菱形
      return { style: 'straight', arrowEnd: 'diamond' };
    case 'umlComposition':
      // 组合：实线 + 结尾实心菱形
      return { style: 'straight', arrowEnd: 'diamondFilled' };
    case 'umlGeneralization':
      // 继承：实线 + 结尾实心三角箭头
      return { style: 'straight', arrowEnd: 'arrow' };
    case 'umlRealization':
      // 实现：虚线 + 结尾三角箭头
      return { style: 'straight', strokeDash: 'dashed', arrowEnd: 'triangle' };
    case 'umlDependency':
      // 依赖：虚线 + 结尾开放箭头
      return { style: 'straight', strokeDash: 'dashed', arrowEnd: 'open' };
    default:
      return null;
  }
}

const MINDMAP_EMBED_PADDING = 16;
const MINDMAP_MIN_W = 160;
const MINDMAP_MIN_H = 120;

function mindmapElementSize(
  root: MindNode,
  layout: MindmapLayout,
  branchStyle?: MindNoteBranchStyle,
): { width: number; height: number } {
  const factory = getMindNodeFactory();
  const { width, height } = getTreeLayoutEngine('mindmap').computeLayout(
    root,
    layout,
    branchStyle ?? (factory.defaultBranchStyle as MindNoteBranchStyle),
    factory.createMeasureOptions(),
  );
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
  const factory = getMindNodeFactory();
  const { width, height } = mindmapElementSize(
    root,
    layout,
    factory.defaultBranchStyle as MindNoteBranchStyle,
  );
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
    branchStyle: factory.defaultBranchStyle as MindNoteBranchStyle,
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
