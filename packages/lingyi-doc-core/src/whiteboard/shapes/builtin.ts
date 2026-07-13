import type { ShapeKind } from '../types';
import {
  SEQ_LIFELINE_DEFAULT_LENGTH,
  SEQ_LIFELINE_FILL,
  SEQ_LIFELINE_STROKE,
} from '../seqLifeline';
import { BUILTIN_SHAPE_CATEGORIES, SHAPE_CATEGORY_IDS } from './categories';
import {
  SHAPE_DEFAULT_FILL,
  SHAPE_DEFAULT_STROKE,
  SHAPE_DEFAULT_STROKE_WIDTH,
  SHAPE_DEFAULT_TEXT,
} from './constants';
import { getShapeRegistry } from './registry';
import type { ShapeCatalogEntry, ShapeDefinition, ShapeElementDefaults } from './types';
import type { ShapeRegistry } from './registry';

function baseDefaults(
  width = 140,
  height = 72,
  overrides: Partial<ShapeElementDefaults> = {},
): ShapeElementDefaults {
  return {
    width,
    height,
    fill: SHAPE_DEFAULT_FILL,
    stroke: SHAPE_DEFAULT_STROKE,
    strokeWidth: SHAPE_DEFAULT_STROKE_WIDTH,
    ...SHAPE_DEFAULT_TEXT,
    ...overrides,
  };
}

const thinLineDefaults = () => baseDefaults(160, 24, { height: 24, text: '' });
const swimlaneDefaults = (w = 320, h = 240, overrides: Partial<ShapeElementDefaults> = {}) =>
  baseDefaults(w, h, {
    text: '',
    fill: '#ffffff',
    stroke: '#1f2329',
    strokeWidth: 1.5,
    ...overrides,
  });
const lifelineDefaults = (
  headH: number,
  overrides: Partial<ShapeElementDefaults> = {},
) =>
  baseDefaults(80, headH, {
    fill: SEQ_LIFELINE_FILL,
    stroke: SEQ_LIFELINE_STROKE,
    strokeWidth: 1.5,
    seqLifelineLength: SEQ_LIFELINE_DEFAULT_LENGTH,
    text: '',
    ...overrides,
  });
const smallDecorDefaults = () => baseDefaults(120, 48, { text: '' });
const stateDefaults = () => baseDefaults(32, 32, { text: '' });
const actorDefaults = () => baseDefaults(64, 96, { text: '' });

/** 流程图分类放置时的默认样式与文案（对照产品图） */
const FLOWCHART_STROKE = '#1f2329';

const flowchartPlacementDefaults = (
  overrides: Partial<ShapeElementDefaults>,
): Partial<ShapeElementDefaults> => ({
  stroke: FLOWCHART_STROKE,
  strokeWidth: 1.5,
  textColor: '#1f2329',
  ...overrides,
});

const FLOWCHART_PLACEMENT: Partial<Record<ShapeKind, Partial<ShapeElementDefaults>>> = {
  process: flowchartPlacementDefaults({ text: '流程', fill: '#e6e9fe' }),
  ellipse: flowchartPlacementDefaults({ text: '开始/结束', fill: '#ede7f6', width: 168, height: 56 }),
  diamond: flowchartPlacementDefaults({ text: '判定', fill: '#fff8e1' }),
  documentWavy: flowchartPlacementDefaults({ text: '文档', fill: '#e3f2fd', width: 120, height: 96 }),
  parallelogram: flowchartPlacementDefaults({ text: '数据', fill: '#e8f5e9' }),
  cylinder: flowchartPlacementDefaults({ text: '数据库', fill: '#e8f5e9' }),
  flowDataFlow: flowchartPlacementDefaults({ text: '数据流', fill: '#e8f5e9', width: 160, height: 64 }),
  predefinedProcess: flowchartPlacementDefaults({ text: '预定义流程', fill: '#ede7f6' }),
  manualInput: flowchartPlacementDefaults({ text: '手动输入', fill: '#f7f7f7' }),
  trapezoid: flowchartPlacementDefaults({ text: '手动操作', fill: '#f7f7f7' }),
  dShape: flowchartPlacementDefaults({ text: '延迟', fill: '#ede7f6' }),
  hexagon: flowchartPlacementDefaults({ text: '准备', fill: '#ede7f6' }),
  flowOffPage: flowchartPlacementDefaults({ text: '跨页引用', fill: '#e3f2fd', width: 120, height: 88 }),
  flowQueue: flowchartPlacementDefaults({ text: '队列', fill: '#e8f5e9', width: 88, height: 88 }),
};

/** 图形元数据（绘制能力、默认样式；不含分类位置） */
const BUILTIN_SHAPE_DEFS: ShapeDefinition[] = [
  { kind: 'roundRect', label: '圆角矩形', defaults: () => baseDefaults() },
  { kind: 'ellipse', label: '全圆角矩形', defaults: () => baseDefaults(168, 56) },
  { kind: 'diamond', label: '菱形', defaults: () => baseDefaults() },
  { kind: 'rect', label: '矩形', defaults: () => baseDefaults() },
  { kind: 'circle', label: '圆形', uniformScaled: true, defaults: () => baseDefaults(96, 96) },
  { kind: 'cylinder', label: '圆柱', defaults: () => baseDefaults() },
  { kind: 'dShape', label: 'D形', defaults: () => baseDefaults() },
  { kind: 'document', label: '文档', defaults: () => baseDefaults(120, 96) },
  { kind: 'parallelogram', label: '平行四边形', defaults: () => baseDefaults() },
  { kind: 'trapezoid', label: '梯形', defaults: () => baseDefaults() },
  { kind: 'speechBubbleRect', label: '矩形气泡', defaults: () => baseDefaults() },
  { kind: 'speechBubble', label: '圆形气泡', defaults: () => baseDefaults() },
  { kind: 'triangleRight', label: '直角三角形', defaults: () => baseDefaults() },
  { kind: 'triangle', label: '三角形', defaults: () => baseDefaults() },
  { kind: 'star', label: '星形', defaults: () => baseDefaults() },
  { kind: 'hexagon', label: '六边形', defaults: () => baseDefaults() },
  { kind: 'pentagon', label: '五边形', defaults: () => baseDefaults() },
  { kind: 'octagon', label: '八边形', defaults: () => baseDefaults() },
  { kind: 'arrowLeft', label: '左箭头', defaults: () => baseDefaults() },
  { kind: 'arrowRight', label: '右箭头', defaults: () => baseDefaults() },
  { kind: 'arrowDouble', label: '双向箭头', defaults: () => baseDefaults() },
  { kind: 'cloud', label: '云形', defaults: () => baseDefaults() },
  {
    kind: 'braceLeft',
    label: '左括号',
    strokeOnly: true,
    defaults: () => baseDefaults(56, 240, { stroke: '#1f2329', strokeWidth: 2.5, text: '左括号' }),
  },
  {
    kind: 'braceRight',
    label: '右括号',
    strokeOnly: true,
    defaults: () => baseDefaults(56, 240, { stroke: '#1f2329', strokeWidth: 2.5, text: '右括号' }),
  },
  { kind: 'plus', label: '十字', uniformScaled: true, defaults: () => baseDefaults(96, 96) },
  { kind: 'chevron', label: '箭头', defaults: () => baseDefaults() },
  { kind: 'process', label: '流程', defaults: () => baseDefaults(140, 72) },

  { kind: 'lineSolid', label: '直线', strokeOnly: true, defaults: thinLineDefaults },
  { kind: 'lineDashed', label: '虚线', strokeOnly: true, defaults: thinLineDefaults },
  { kind: 'lineArrow', label: '箭头直线', strokeOnly: true, defaults: thinLineDefaults },
  { kind: 'lineArrowDouble', label: '双向箭头直线', strokeOnly: true, defaults: thinLineDefaults },

  { kind: 'swimlaneV2', label: '垂直泳道', defaults: () => swimlaneDefaults(320, 240) },
  { kind: 'swimlaneH2', label: '水平泳道', defaults: () => swimlaneDefaults(280, 280) },
  { kind: 'swimlaneV3', label: '垂直泳道×3', defaults: () => swimlaneDefaults(360, 240) },

  { kind: 'documentWavy', label: '文档', defaults: () => baseDefaults(120, 96) },
  { kind: 'internalStorage', label: '内部存储', defaults: () => baseDefaults() },
  { kind: 'multiDocument', label: '多文档', defaults: () => baseDefaults(120, 96) },
  { kind: 'display', label: '显示', defaults: () => baseDefaults() },
  { kind: 'predefinedProcess', label: '预定义流程', defaults: () => baseDefaults() },
  { kind: 'manualInput', label: '手动输入', defaults: () => baseDefaults() },
  { kind: 'flowDataFlow', label: '数据流', defaults: () => baseDefaults(160, 64) },
  { kind: 'flowOffPage', label: '跨页引用', defaults: () => baseDefaults(120, 88) },
  { kind: 'flowQueue', label: '队列', defaults: () => baseDefaults(88, 88) },

  { kind: 'umlClass3', label: '类', defaults: () => baseDefaults(140, 120) },
  { kind: 'umlClass2', label: '类', defaults: () => baseDefaults(140, 96) },
  { kind: 'umlInterface', label: '接口', defaults: () => baseDefaults(120, 96) },
  { kind: 'umlPackage', label: '包', defaults: () => baseDefaults(140, 100) },
  { kind: 'umlNote', label: '注释', defaults: () => baseDefaults(120, 88) },
  { kind: 'umlAggregation', label: '聚合', strokeOnly: true, defaults: smallDecorDefaults },
  { kind: 'umlComposition', label: '组合', strokeOnly: true, defaults: smallDecorDefaults },
  { kind: 'umlGeneralization', label: '泛化', strokeOnly: true, defaults: smallDecorDefaults },
  { kind: 'umlRealization', label: '实现', strokeOnly: true, defaults: smallDecorDefaults },
  { kind: 'umlDependency', label: '依赖', strokeOnly: true, defaults: smallDecorDefaults },

  { kind: 'seqActor', label: '角色', defaults: () => lifelineDefaults(72, { width: 64, text: '角色' }) },
  { kind: 'seqLifeline', label: '对象', defaults: () => lifelineDefaults(32, { text: '对象' }) },
  { kind: 'seqDbLifeline', label: '数据库', defaults: () => lifelineDefaults(44, { text: '数据库' }) },
  { kind: 'seqStorageLifeline', label: '数据流', defaults: () => lifelineDefaults(32, { text: '数据流' }) },
  { kind: 'seqBoundaryLifeline', label: '边界', defaults: () => lifelineDefaults(52, { text: '边界' }) },
  { kind: 'seqControlLifeline', label: '控制', defaults: () => lifelineDefaults(52, { text: '控制' }) },
  { kind: 'seqEntityLifeline', label: '实体', defaults: () => lifelineDefaults(52, { text: '实体' }) },
  { kind: 'seqMessage', label: '集合', defaults: () => lifelineDefaults(40, { width: 100, text: '集合' }) },
  { kind: 'seqActivation', label: '激活', defaults: () => baseDefaults(20, 120, { text: '', fill: '#8ab4f8', stroke: '#5f87d6' }) },
  { kind: 'seqFrame', label: '片段', defaults: () => baseDefaults(200, 160, { text: '[Condition]' }) },
  { kind: 'seqAltFrame', label: '备选片段', defaults: () => baseDefaults(200, 180, { text: '[Condition]\n[Else]' }) },
  { kind: 'seqNote', label: '注释', defaults: () => baseDefaults(120, 88) },

  { kind: 'dfdDataStore', label: '数据存储', defaults: () => baseDefaults() },
  { kind: 'dfdSubProcess', label: '子过程', defaults: () => baseDefaults() },
  { kind: 'dfdStoreOpenRight', label: '数据存储', strokeOnly: true, defaults: () => baseDefaults(120, 56, { text: '' }) },
  { kind: 'dfdStoreOpenLeft', label: '数据存储', strokeOnly: true, defaults: () => baseDefaults(120, 56, { text: '' }) },

  { kind: 'erTable1', label: '实体', defaults: () => baseDefaults(140, 100) },
  { kind: 'erTable2', label: '实体', defaults: () => baseDefaults(160, 100) },
  { kind: 'erTable3', label: '实体', defaults: () => baseDefaults(180, 100) },
  { kind: 'erTable4', label: '实体', defaults: () => baseDefaults(200, 100) },

  { kind: 'compComponent', label: '组件', defaults: () => baseDefaults(160, 96) },
  { kind: 'compComponentAlt', label: '组件', defaults: () => baseDefaults(140, 88) },
  { kind: 'compProvided', label: '提供接口', strokeOnly: true, defaults: smallDecorDefaults },
  { kind: 'compAssembly', label: '组装连接器', strokeOnly: true, defaults: smallDecorDefaults },
  { kind: 'compRequired', label: '需求接口', strokeOnly: true, defaults: smallDecorDefaults },

  { kind: 'stateInitial', label: '初始状态', strokeOnly: true, defaults: stateDefaults },
  { kind: 'stateFinal', label: '终止状态', defaults: stateDefaults },
  { kind: 'stateForkJoin', label: '分叉/汇合', strokeOnly: true, defaults: () => baseDefaults(80, 16, { text: '' }) },

  { kind: 'star4', label: '四角星', defaults: () => baseDefaults(96, 96) },
  { kind: 'star6', label: '六角星', defaults: () => baseDefaults(96, 96) },
  { kind: 'calloutBurst', label: '爆炸标注', defaults: () => baseDefaults(120, 96) },
  { kind: 'actorStick', label: '参与者', strokeOnly: true, defaults: actorDefaults },
];

const C = SHAPE_CATEGORY_IDS;

export function resolvePlacementDefaults(
  kind: ShapeKind,
  categoryId?: string,
): Partial<ShapeElementDefaults> | undefined {
  if (categoryId !== C.flowchart) return undefined;
  return FLOWCHART_PLACEMENT[kind];
}

/** 图形库展示顺序（严格对照产品截图） */
const BUILTIN_CATALOG: ShapeCatalogEntry[] = [
  // 基础（25 项快捷）
  { kind: 'roundRect', categoryId: C.basic, order: 0, quickPick: true },
  { kind: 'ellipse', categoryId: C.basic, order: 1, quickPick: true },
  { kind: 'diamond', categoryId: C.basic, order: 2, quickPick: true },
  { kind: 'rect', categoryId: C.basic, order: 3, quickPick: true },
  { kind: 'circle', categoryId: C.basic, order: 4, quickPick: true },
  { kind: 'cylinder', categoryId: C.basic, order: 5, quickPick: true },
  { kind: 'dShape', categoryId: C.basic, order: 6, quickPick: true },
  { kind: 'document', categoryId: C.basic, order: 7, quickPick: true },
  { kind: 'parallelogram', categoryId: C.basic, order: 8, quickPick: true },
  { kind: 'trapezoid', categoryId: C.basic, order: 9, quickPick: true },
  { kind: 'speechBubbleRect', categoryId: C.basic, order: 10, quickPick: true },
  { kind: 'speechBubble', categoryId: C.basic, order: 11, quickPick: true },
  { kind: 'triangleRight', categoryId: C.basic, order: 12, quickPick: true },
  { kind: 'triangle', categoryId: C.basic, order: 13, quickPick: true },
  { kind: 'star', categoryId: C.basic, order: 14, quickPick: true },
  { kind: 'hexagon', categoryId: C.basic, order: 15, quickPick: true },
  { kind: 'pentagon', categoryId: C.basic, order: 16, quickPick: true },
  { kind: 'octagon', categoryId: C.basic, order: 17, quickPick: true },
  { kind: 'arrowLeft', categoryId: C.basic, order: 18, quickPick: true },
  { kind: 'arrowRight', categoryId: C.basic, order: 19, quickPick: true },
  { kind: 'arrowDouble', categoryId: C.basic, order: 20, quickPick: true },
  { kind: 'cloud', categoryId: C.basic, order: 21, quickPick: true },
  { kind: 'braceLeft', categoryId: C.basic, order: 22, quickPick: true },
  { kind: 'braceRight', categoryId: C.basic, order: 23, quickPick: true },
  { kind: 'plus', categoryId: C.basic, order: 24, quickPick: true },

  // 直线
  { kind: 'lineSolid', categoryId: C.line, order: 0 },
  { kind: 'lineDashed', categoryId: C.line, order: 1 },
  { kind: 'lineArrow', categoryId: C.line, order: 2 },
  { kind: 'lineArrowDouble', categoryId: C.line, order: 3 },

  // 泳道（垂直 / 水平 / 表格）
  { kind: 'swimlaneV2', categoryId: C.swimlane, order: 0, label: '垂直泳道' },
  { kind: 'swimlaneH2', categoryId: C.swimlane, order: 1, label: '水平泳道' },

  // 流程图（14 项，对照产品图）
  { kind: 'process', categoryId: C.flowchart, order: 0, label: '流程' },
  { kind: 'ellipse', categoryId: C.flowchart, order: 1, label: '开始/结束' },
  { kind: 'diamond', categoryId: C.flowchart, order: 2, label: '判定' },
  { kind: 'documentWavy', categoryId: C.flowchart, order: 3, label: '文档' },
  { kind: 'parallelogram', categoryId: C.flowchart, order: 4, label: '数据' },
  { kind: 'cylinder', categoryId: C.flowchart, order: 5, label: '数据库' },
  { kind: 'flowDataFlow', categoryId: C.flowchart, order: 6, label: '数据流' },
  { kind: 'predefinedProcess', categoryId: C.flowchart, order: 7, label: '预定义流程' },
  { kind: 'manualInput', categoryId: C.flowchart, order: 8, label: '手动输入' },
  { kind: 'trapezoid', categoryId: C.flowchart, order: 9, label: '手动操作' },
  { kind: 'dShape', categoryId: C.flowchart, order: 10, label: '延迟' },
  { kind: 'hexagon', categoryId: C.flowchart, order: 11, label: '准备' },
  { kind: 'flowOffPage', categoryId: C.flowchart, order: 12, label: '跨页引用' },
  { kind: 'flowQueue', categoryId: C.flowchart, order: 13, label: '队列' },

  // 类图
  { kind: 'umlClass3', categoryId: C.classDiagram, order: 0 },
  { kind: 'umlClass2', categoryId: C.classDiagram, order: 1 },
  { kind: 'umlInterface', categoryId: C.classDiagram, order: 2 },
  { kind: 'umlPackage', categoryId: C.classDiagram, order: 3 },
  { kind: 'umlNote', categoryId: C.classDiagram, order: 4 },
  { kind: 'umlAggregation', categoryId: C.classDiagram, order: 5 },
  { kind: 'umlComposition', categoryId: C.classDiagram, order: 6 },
  { kind: 'umlGeneralization', categoryId: C.classDiagram, order: 7 },
  { kind: 'umlRealization', categoryId: C.classDiagram, order: 8 },
  { kind: 'umlDependency', categoryId: C.classDiagram, order: 9 },

  // 时序图（顺序对照产品图）
  { kind: 'seqActor', categoryId: C.sequence, order: 0, label: '角色' },
  { kind: 'seqLifeline', categoryId: C.sequence, order: 1, label: '对象' },
  { kind: 'seqDbLifeline', categoryId: C.sequence, order: 2, label: '数据库' },
  { kind: 'seqStorageLifeline', categoryId: C.sequence, order: 3, label: '数据流' },
  { kind: 'seqBoundaryLifeline', categoryId: C.sequence, order: 4, label: '边界' },
  { kind: 'seqControlLifeline', categoryId: C.sequence, order: 5, label: '控制' },
  { kind: 'seqEntityLifeline', categoryId: C.sequence, order: 6, label: '实体' },
  { kind: 'seqMessage', categoryId: C.sequence, order: 7, label: '集合' },
  { kind: 'seqActivation', categoryId: C.sequence, order: 8, label: '激活' },
  { kind: 'seqFrame', categoryId: C.sequence, order: 9, label: 'Opt / Loop' },
  { kind: 'seqAltFrame', categoryId: C.sequence, order: 10, label: 'Alt' },

  // 数据流图
  { kind: 'rect', categoryId: C.dfd, order: 0, label: '外部实体' },
  { kind: 'dfdDataStore', categoryId: C.dfd, order: 1 },
  { kind: 'circle', categoryId: C.dfd, order: 2, label: '处理' },
  { kind: 'rect', categoryId: C.dfd, order: 3, label: '外部实体' },
  { kind: 'dfdSubProcess', categoryId: C.dfd, order: 4 },
  { kind: 'dfdStoreOpenRight', categoryId: C.dfd, order: 5 },
  { kind: 'dfdStoreOpenLeft', categoryId: C.dfd, order: 6 },

  // 实体关系图
  { kind: 'erTable1', categoryId: C.er, order: 0 },
  { kind: 'erTable2', categoryId: C.er, order: 1 },
  { kind: 'erTable3', categoryId: C.er, order: 2 },
  { kind: 'erTable4', categoryId: C.er, order: 3 },

  // 组件图
  { kind: 'compComponent', categoryId: C.component, order: 0 },
  { kind: 'compComponentAlt', categoryId: C.component, order: 1 },
  { kind: 'compProvided', categoryId: C.component, order: 2 },
  { kind: 'compAssembly', categoryId: C.component, order: 3 },
  { kind: 'compRequired', categoryId: C.component, order: 4 },

  // 状态图
  { kind: 'stateInitial', categoryId: C.state, order: 0 },
  { kind: 'stateFinal', categoryId: C.state, order: 1 },
  { kind: 'stateForkJoin', categoryId: C.state, order: 2 },

  // 其他
  { kind: 'star4', categoryId: C.other, order: 0 },
  { kind: 'star6', categoryId: C.other, order: 1 },
  { kind: 'calloutBurst', categoryId: C.other, order: 2 },
  { kind: 'actorStick', categoryId: C.other, order: 3 },
];

let catalogRegistered = false;

export function registerBuiltinShapeCatalog(registry: ShapeRegistry = getShapeRegistry()): void {
  if (catalogRegistered) return;
  for (const cat of BUILTIN_SHAPE_CATEGORIES) {
    registry.registerCategory(cat);
  }
  for (const def of BUILTIN_SHAPE_DEFS) {
    registry.registerShape(def);
  }
  for (const entry of BUILTIN_CATALOG) {
    registry.registerCatalogEntry(entry);
  }
  catalogRegistered = true;
}

export function isBuiltinShapeCatalogRegistered(): boolean {
  return catalogRegistered;
}

export function getBuiltinShapeKinds(): ShapeKind[] {
  return BUILTIN_SHAPE_DEFS.map(e => e.kind);
}

registerBuiltinShapeCatalog();
