import type { AnchorId, ShapeElement, WhiteboardElement, WhiteboardJSON } from './types';
import { makeConnectorBind } from './connector';
import { createEmptyWhiteboard } from './utils';
import {
  createMindmapElement,
  SHAPE_DEFAULT_FILL,
  SHAPE_DEFAULT_STROKE,
  SHAPE_DEFAULT_STROKE_WIDTH,
} from './templates';
import { getMindNodeFactory, getTreeLayoutEngine } from '@lingyi-doc/core-types';

const MINDMAP_EMBED_PADDING = 16;
const MINDMAP_MIN_W = 160;
const MINDMAP_MIN_H = 120;

function mindmapElementSize(root: unknown, layout: 'right' = 'right') {
  const factory = getMindNodeFactory();
  const { width, height } = getTreeLayoutEngine('mindmap').computeLayout(
    root,
    layout,
    factory.defaultBranchStyle,
    factory.createMeasureOptions(),
  );
  return {
    width: Math.max(Math.ceil(width + MINDMAP_EMBED_PADDING * 2), MINDMAP_MIN_W),
    height: Math.max(Math.ceil(height + MINDMAP_EMBED_PADDING * 2), MINDMAP_MIN_H),
  };
}

function flowShape(
  id: string,
  shapeKind: ShapeElement['shapeKind'],
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  zIndex: number,
): ShapeElement {
  return {
    id,
    type: 'shape',
    shapeKind,
    x,
    y,
    width,
    height,
    zIndex,
    fill: SHAPE_DEFAULT_FILL,
    stroke: SHAPE_DEFAULT_STROKE,
    strokeWidth: SHAPE_DEFAULT_STROKE_WIDTH,
    text,
    fontSize: 14,
    textColor: '#1f2329',
    textAlign: 'center',
    textVerticalAlign: 'center',
    fontWeight: 400,
    fontStyle: 'normal',
  };
}

function flowConnector(
  id: string,
  fromId: string,
  fromAnchor: AnchorId,
  toId: string,
  toAnchor: AnchorId,
  zIndex: number,
  label?: string,
): WhiteboardElement {
  return {
    id,
    type: 'connector',
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    zIndex,
    style: 'elbow',
    points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    stroke: '#646a73',
    strokeWidth: 2,
    arrowEnd: true,
    text: label,
    labelPosition: label ? 'on' : undefined,
    startBind: makeConnectorBind(fromId, fromAnchor),
    endBind: makeConnectorBind(toId, toAnchor),
  };
}

/** 思维导图画板：仅含一个主节点思维导图元素 */
export function createMindmapBoardWhiteboard(title = '未命名思维导图'): WhiteboardJSON {
  const wb = createEmptyWhiteboard('', title);
  const root = getMindNodeFactory().createEmpty('');
  const mindmapEl = createMindmapElement('right', 120, 120, 0);
  if (mindmapEl.type !== 'mindmap') {
    wb.elements = [mindmapEl];
    return wb;
  }
  mindmapEl.root = root as typeof mindmapEl.root;
  const size = mindmapElementSize(root);
  mindmapEl.width = size.width;
  mindmapEl.height = size.height;
  wb.elements = [mindmapEl];
  return wb;
}

/** 流程图画板：默认流程模板（开始 → 执行 → 分支 → 结束） */
export function createFlowchartWhiteboard(title = '未命名流程图'): WhiteboardJSON {
  const wb = createEmptyWhiteboard('', title);
  const nodeW = 140;
  const nodeH = 56;
  const cx = 200;
  let z = 0;

  const start = flowShape('flow_start', 'roundRect', cx, 40, nodeW, nodeH, '开始', z++);
  const exec1 = flowShape('flow_exec1', 'rect', cx, 130, nodeW, nodeH, '执行节点', z++);
  const branch = flowShape('flow_branch', 'diamond', cx + 10, 220, 120, 72, '分支节点', z++);
  const exec2 = flowShape('flow_exec2', 'rect', cx, 340, nodeW, nodeH, '执行节点', z++);
  const exec3 = flowShape('flow_exec3', 'rect', cx + 220, 340, nodeW, nodeH, '执行节点', z++);
  const end = flowShape('flow_end', 'roundRect', cx, 460, nodeW, nodeH, '结束', z++);

  const connectors: WhiteboardElement[] = [
    flowConnector('flow_c1', start.id, 's', exec1.id, 'n', z++),
    flowConnector('flow_c2', exec1.id, 's', branch.id, 'n', z++),
    flowConnector('flow_c3', branch.id, 's', exec2.id, 'n', z++, '是'),
    flowConnector('flow_c4', branch.id, 'e', exec3.id, 'n', z++, '否'),
    flowConnector('flow_c5', exec2.id, 's', end.id, 'n', z++),
    flowConnector('flow_c6', exec3.id, 'w', exec2.id, 'e', z++),
  ];

  wb.elements = [start, exec1, branch, exec2, exec3, end, ...connectors];
  return wb;
}
