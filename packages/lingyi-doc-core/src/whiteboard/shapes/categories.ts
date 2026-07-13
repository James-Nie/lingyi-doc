import type { ShapeCategoryDefinition } from './types';

/** 内置图形分类 ID */
export const SHAPE_CATEGORY_IDS = {
  basic: 'basic',
  line: 'line',
  swimlane: 'swimlane',
  flowchart: 'flowchart',
  classDiagram: 'class',
  sequence: 'sequence',
  dfd: 'dfd',
  er: 'er',
  component: 'component',
  state: 'state',
  other: 'other',
} as const;

export type BuiltinShapeCategoryId = typeof SHAPE_CATEGORY_IDS[keyof typeof SHAPE_CATEGORY_IDS];

export const BUILTIN_SHAPE_CATEGORIES: ShapeCategoryDefinition[] = [
  { id: SHAPE_CATEGORY_IDS.basic, label: '基础', order: 0 },
  { id: SHAPE_CATEGORY_IDS.line, label: '直线', order: 10 },
  { id: SHAPE_CATEGORY_IDS.swimlane, label: '泳道', order: 20 },
  { id: SHAPE_CATEGORY_IDS.flowchart, label: '流程图', order: 30 },
  { id: SHAPE_CATEGORY_IDS.classDiagram, label: '类图', order: 40 },
  { id: SHAPE_CATEGORY_IDS.sequence, label: '时序图', order: 50 },
  { id: SHAPE_CATEGORY_IDS.dfd, label: '数据流图', order: 60 },
  { id: SHAPE_CATEGORY_IDS.er, label: '实体关系图', order: 70 },
  { id: SHAPE_CATEGORY_IDS.component, label: '组件图', order: 80 },
  { id: SHAPE_CATEGORY_IDS.state, label: '状态图', order: 90 },
  { id: SHAPE_CATEGORY_IDS.other, label: '其他', order: 100 },
];

/** 兼容旧代码：分类标签列表 */
export const SHAPE_CATEGORY_LABELS = BUILTIN_SHAPE_CATEGORIES.map(c => c.label);
