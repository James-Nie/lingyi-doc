import type {
  MindMapLayout,
  MindMapLayoutNode,
  MindMapMeasureOptions,
  MindMapNodeStyle,
  MindMapPath,
  MindNode,
  MindNoteBranchStyle,
  MindNoteStructure,
} from './types';
import {
  getMindNodeFontSize,
  getMindNodePadX,
  getMindNodePadY,
  MIND_BRANCH_GAP,
  MIND_BRANCH_STUB,
  MIND_NODE_MAX_WIDTH,
  MIND_SIBLING_GAP,
} from './utils';

const NODE_MIN_W = 56;
const NODE_MAX_W = MIND_NODE_MAX_WIDTH;
const ROOT_MIN_W = 80;
const SIBLING_GAP = MIND_SIBLING_GAP;
const ROOT_PAD = 48;
const BRANCH_GAP = MIND_BRANCH_GAP;
const BUS_INSET = MIND_BRANCH_STUB;
/** 向下结构：竖向分支线相对子节点列左边缘的偏移 */
const BRACKET_INSET = 10;
/** 三阶贝塞尔：父/子节点边缘到控制点的水平缓冲 */
const CURVE_STUB = MIND_BRANCH_STUB;
/** 三阶贝塞尔：控制点沿主轴缓冲比例 */
const CURVE_STUB_RATIO = 0.42;
/** 三阶贝塞尔：控制点沿主轴缓冲上限 */
const CURVE_STUB_MAX = 120;
/** 三阶贝塞尔：CP1 向子节点纵轴靠拢的比例（避免多分支缠绕） */
const CURVE_PULL_RATIO = 0.34;
/** 三阶贝塞尔：拱弯叠加到 CP1 的比例 */
const CURVE_ARCH_BLEND = 0.35;

type Direction = 'right' | 'left';
type VertDir = 'up' | 'down';

interface LTree {
  node: MindNode;
  depth: number;
  style: MindMapNodeStyle;
  side: 'left' | 'right';
  vertDir?: VertDir;
  width: number;
  height: number;
  x: number;
  y: number;
  subtreeW: number;
  subtreeH: number;
  children: LTree[];
}

function wrapTextLines(
  measure: (text: string) => number,
  text: string,
  maxContentWidth: number,
): string[] {
  if (!text) return [''];
  if (maxContentWidth <= 0) return [text];

  const lines: string[] = [];
  let line = '';
  for (const char of text) {
    const next = line + char;
    if (line && measure(next) > maxContentWidth) {
      lines.push(line);
      line = char;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function resolveMeasureFontSize(
  node: MindNode,
  depth: number,
  style: MindMapNodeStyle,
  measure?: MindMapMeasureOptions,
): number {
  if (typeof node.fontSize === 'number') return node.fontSize;
  if (measure?.getFontSize) return measure.getFontSize(node, depth, style);
  return getMindNodeFontSize(depth);
}

function resolveMeasureFontWeight(
  node: MindNode,
  depth: number,
  style: MindMapNodeStyle,
  measure?: MindMapMeasureOptions,
): number | string {
  if (measure?.getFontWeight) return measure.getFontWeight(node, depth, style);
  return depth === 0 ? 500 : 400;
}

function resolveMeasureLineHeight(
  fontSize: number,
  depth: number,
  style: MindMapNodeStyle,
  measure?: MindMapMeasureOptions,
): number {
  if (measure?.getLineHeight) return measure.getLineHeight(fontSize, depth, style);
  return Math.round(fontSize * 1.43);
}

function measureNode(
  node: MindNode,
  depth: number,
  style: MindMapNodeStyle,
  measure?: MindMapMeasureOptions,
): { width: number; height: number } {
  const text = node.text;
  const display = text || '输入文本';
  // 完成态导图会绘制圆角底框，度量需按带内边距节点计算
  const boxed = style !== 'leaf' || !!node.completed;
  const padX = getMindNodePadX(depth, boxed);
  const padY = getMindNodePadY(depth, boxed);
  const minW = depth === 0 ? ROOT_MIN_W : (!boxed ? 28 : NODE_MIN_W);
  const maxW = NODE_MAX_W;
  const maxContentW = maxW - padX;
  const fontSize = resolveMeasureFontSize(node, depth, style, measure);
  const fontWeight = resolveMeasureFontWeight(node, depth, style, measure);
  const lineHeight = resolveMeasureLineHeight(fontSize, depth, style, measure);
  const minH = lineHeight + padY;
  const imgGap = 8;

  let width = minW;
  let height = minH;

  if (typeof document === 'undefined') {
    const factor = fontSize * 0.55;
    const singleLineW = display.length * factor;
    const contentW = Math.min(maxContentW, Math.max(minW - padX, singleLineW));
    const lineCount = Math.max(1, Math.ceil(singleLineW / Math.max(contentW, 1)));
    width = Math.min(maxW, Math.max(minW, Math.ceil(contentW) + padX));
    height = Math.max(minH, lineCount * lineHeight + padY);
  } else {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return { width: minW, height: minH };

    ctx.font = `${fontWeight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    const measureText = (value: string) => ctx.measureText(value).width;
    const singleLineW = measureText(display);

    let contentW = Math.min(maxContentW, Math.max(minW - padX, Math.ceil(singleLineW)));
    let lines = wrapTextLines(measureText, display, contentW);

    if (singleLineW > maxContentW) {
      contentW = maxContentW;
      lines = wrapTextLines(measureText, display, contentW);
    }

    const lineMaxW = Math.max(...lines.map(measureText), 0);
    const contentWidth = lines.length === 1 && singleLineW <= maxContentW
      ? Math.ceil(singleLineW)
      : Math.ceil(lineMaxW);
    width = Math.min(maxW, Math.max(minW, contentWidth + padX));
    height = Math.max(minH, lines.length * lineHeight + padY);
  }

  if (node.image) {
    let imgW = node.imageWidth ?? Math.min(maxContentW, 240);
    let imgH = node.imageHeight ?? 120;
    if (imgW > maxContentW) {
      imgH = Math.round(imgH * (maxContentW / imgW));
      imgW = maxContentW;
    }
    width = Math.max(width, Math.ceil(imgW) + padX);
    height += imgGap + Math.ceil(imgH);
  }

  return { width, height };
}

function nodeStyle(depth: number): MindMapNodeStyle {
  if (depth === 0) return 'root';
  if (depth === 1) return 'branch';
  return 'leaf';
}

function blockHeight(children: LTree[]): number {
  if (!children.length) return 0;
  return children.reduce((s, c) => s + c.subtreeH, 0) + SIBLING_GAP * (children.length - 1);
}

function hGap(_depth: number): number {
  return BRANCH_GAP;
}

type RootAnchor = { x: number; y: number };

function buildTree(
  node: MindNode,
  depth: number,
  side: 'left' | 'right',
  measure?: MindMapMeasureOptions,
): LTree {
  const style = nodeStyle(depth);
  const size = measureNode(node, depth, style, measure);
  const visible = node.collapsed ? [] : node.children;
  return {
    node,
    depth,
    style,
    side,
    width: size.width,
    height: size.height,
    x: 0,
    y: 0,
    subtreeW: size.width,
    subtreeH: size.height,
    children: visible.map(c => buildTree(c, depth + 1, side, measure)),
  };
}

/** 忽略折叠状态构建完整树，用于计算稳定的主节点锚点 */
function buildTreeExpanded(
  node: MindNode,
  depth: number,
  side: 'left' | 'right',
  measure?: MindMapMeasureOptions,
): LTree {
  const style = nodeStyle(depth);
  const size = measureNode(node, depth, style, measure);
  return {
    node,
    depth,
    style,
    side,
    width: size.width,
    height: size.height,
    x: 0,
    y: 0,
    subtreeW: size.width,
    subtreeH: size.height,
    children: node.children.map(c => buildTreeExpanded(c, depth + 1, side, measure)),
  };
}

function measureHorizontal(tree: LTree, direction: Direction): void {
  if (!tree.children.length) {
    tree.subtreeW = tree.width;
    tree.subtreeH = tree.height;
    return;
  }
  tree.children.forEach(c => measureHorizontal(c, direction));
  const childBlockH = tree.children.reduce((s, c) => s + c.subtreeH, 0)
    + SIBLING_GAP * (tree.children.length - 1);
  const childBlockW = Math.max(...tree.children.map(c => c.subtreeW));
  tree.subtreeH = Math.max(tree.height, childBlockH);
  tree.subtreeW = tree.width + hGap(tree.depth) + childBlockW;
}

function placeHorizontal(tree: LTree, x: number, y: number, direction: Direction, pinRoot?: RootAnchor): void {
  // right: x = 节点左缘；left: x = 节点右缘（与 down/up 顶底锚点对称）
  if (pinRoot && tree.depth === 0) {
    tree.x = pinRoot.x;
    tree.y = pinRoot.y;
  } else {
    tree.x = direction === 'left' ? x - tree.width : x;
    tree.y = y + (measureBlockH(tree) - tree.height) / 2;
  }

  if (!tree.children.length) return;

  const blockH = measureBlockH(tree);
  const childBlockH = tree.children.reduce((s, c) => s + c.subtreeH, 0)
    + SIBLING_GAP * (tree.children.length - 1);
  const blockTop = tree.y - (blockH - tree.height) / 2;
  let cy = blockTop + (blockH - childBlockH) / 2;

  for (const child of tree.children) {
    const childAnchorX = direction === 'right'
      ? tree.x + tree.width + hGap(tree.depth)
      : tree.x - hGap(tree.depth);
    placeHorizontal(child, childAnchorX, cy, direction);
    cy += child.subtreeH + SIBLING_GAP;
  }
}

function measureBlockH(tree: LTree): number {
  if (!tree.children.length) return tree.height;
  const childBlockH = tree.children.reduce((s, c) => s + c.subtreeH, 0)
    + SIBLING_GAP * (tree.children.length - 1);
  return Math.max(tree.height, childBlockH);
}

function assignSide(tree: LTree, side: 'left' | 'right'): void {
  tree.side = side;
  tree.children.forEach(c => assignSide(c, side));
}

function layoutHorizontalRoot(tree: LTree, direction: Direction, anchor?: RootAnchor): void {
  measureHorizontal(tree, direction);
  assignSide(tree, direction);
  const x = direction === 'right' ? ROOT_PAD : ROOT_PAD + tree.subtreeW;
  placeHorizontal(tree, x, ROOT_PAD, direction, anchor);
}

function layoutBalanced(root: LTree, anchor?: RootAnchor): void {
  const leftKids = root.children.filter(c => c.node.branchDir === 'left');
  const rightKids = root.children.filter(c => c.node.branchDir !== 'left');
  layoutRootHorizontalSplit(root, leftKids, rightKids, anchor);
}

/** 根节点左右两侧子树（按 branchDir 或手动分组，非索引自动分配） */
function layoutRootHorizontalSplit(
  root: LTree,
  leftKids: LTree[],
  rightKids: LTree[],
  anchor?: RootAnchor,
): void {
  leftKids.forEach(c => { assignSide(c, 'left'); measureHorizontal(c, 'left'); });
  rightKids.forEach(c => { assignSide(c, 'right'); measureHorizontal(c, 'right'); });

  const leftW = leftKids.length ? Math.max(...leftKids.map(c => c.subtreeW)) : 0;
  const rightW = rightKids.length ? Math.max(...rightKids.map(c => c.subtreeW)) : 0;
  const leftH = blockHeight(leftKids);
  const rightH = blockHeight(rightKids);
  const blockH = Math.max(root.height, leftH, rightH);

  root.subtreeW = leftW + hGap(0) + root.width + hGap(0) + rightW;
  root.subtreeH = blockH;

  const rootCenterY = anchor
    ? anchor.y + root.height / 2
    : ROOT_PAD + blockH / 2;
  root.x = anchor?.x ?? (ROOT_PAD + leftW + hGap(0));
  root.y = anchor?.y ?? (rootCenterY - root.height / 2);

  let ly = rootCenterY - leftH / 2;
  for (const child of leftKids) {
    placeHorizontal(child, root.x - hGap(0), ly, 'left');
    ly += child.subtreeH + SIBLING_GAP;
  }

  let ry = rootCenterY - rightH / 2;
  for (const child of rightKids) {
    placeHorizontal(child, root.x + root.width + hGap(0), ry, 'right');
    ry += child.subtreeH + SIBLING_GAP;
  }
}

function layoutDirectionalHorizontalRoot(tree: LTree, defaultSide: Direction, anchor?: RootAnchor): void {
  const altSide: Direction = defaultSide === 'right' ? 'left' : 'right';
  const primaryKids = tree.children.filter(c => (c.node.branchDir ?? defaultSide) === defaultSide);
  const altKids = tree.children.filter(c => c.node.branchDir === altSide);
  if (altKids.length > 0) {
    const leftKids = defaultSide === 'left' ? primaryKids : altKids;
    const rightKids = defaultSide === 'right' ? primaryKids : altKids;
    layoutRootHorizontalSplit(tree, leftKids, rightKids, anchor);
    // 只标记根节点侧向；子树 side 已由 layoutRootHorizontalSplit 按左右分组写入。
    // 若这里 assignSide(tree, defaultSide) 会递归覆盖子节点 side，导致
    // 节点坐标在一侧、连线/折叠按钮按另一侧绘制（向右切向左时典型）。
    tree.side = defaultSide;
    return;
  }
  layoutHorizontalRoot(tree, defaultSide, anchor);
}

function measureVerticalAxis(tree: LTree, dir: VertDir): void {
  tree.vertDir = dir;
  if (!tree.children.length) {
    tree.subtreeW = tree.width;
    tree.subtreeH = tree.height;
    return;
  }
  tree.children.forEach(c => measureVerticalAxis(c, dir));
  const rowW = tree.children.reduce((s, c) => s + c.subtreeW, 0)
    + SIBLING_GAP * (tree.children.length - 1);
  const rowH = Math.max(...tree.children.map(c => c.subtreeH));
  tree.subtreeW = Math.max(tree.width, rowW);
  tree.subtreeH = tree.height + BRANCH_GAP + rowH;
}

function placeVerticalAxis(tree: LTree, x: number, anchorY: number, dir: VertDir): void {
  tree.vertDir = dir;
  tree.x = x + Math.max(0, (tree.subtreeW - tree.width) / 2);

  if (!tree.children.length) {
    tree.y = dir === 'down' ? anchorY : anchorY - tree.height;
    return;
  }

  const rowW = tree.children.reduce((s, c) => s + c.subtreeW, 0)
    + SIBLING_GAP * (tree.children.length - 1);
  let cx = x + Math.max(0, (tree.subtreeW - rowW) / 2);

  if (dir === 'down') {
    tree.y = anchorY;
    const childAnchorY = anchorY + tree.height + BRANCH_GAP;
    for (const child of tree.children) {
      placeVerticalAxis(child, cx, childAnchorY, 'down');
      cx += child.subtreeW + SIBLING_GAP;
    }
    return;
  }

  // up：anchorY 为节点底缘，同级节点底缘对齐（与 down 顶缘锚点对称）
  tree.y = anchorY - tree.height;
  const childAnchorY = tree.y - BRANCH_GAP;
  for (const child of tree.children) {
    placeVerticalAxis(child, cx, childAnchorY, 'up');
    cx += child.subtreeW + SIBLING_GAP;
  }
}

function layoutVerticalRoot(tree: LTree, anchor?: RootAnchor): void {
  const upKids = tree.children.filter(c => c.node.branchDir === 'up');
  const downKids = tree.children.filter(c => c.node.branchDir !== 'up');

  upKids.forEach(c => measureVerticalAxis(c, 'up'));
  downKids.forEach(c => measureVerticalAxis(c, 'down'));

  const topRowH = upKids.length ? Math.max(...upKids.map(c => c.subtreeH)) : 0;
  const bottomRowH = downKids.length ? Math.max(...downKids.map(c => c.subtreeH)) : 0;
  const topRowW = upKids.length
    ? upKids.reduce((s, c) => s + c.subtreeW, 0) + SIBLING_GAP * (upKids.length - 1)
    : 0;
  const bottomRowW = downKids.length
    ? downKids.reduce((s, c) => s + c.subtreeW, 0) + SIBLING_GAP * (downKids.length - 1)
    : 0;

  tree.subtreeW = Math.max(tree.width, topRowW, bottomRowW);
  tree.subtreeH = topRowH + BRANCH_GAP + tree.height + BRANCH_GAP + bottomRowH;
  tree.vertDir = 'down';
  tree.x = anchor?.x ?? (ROOT_PAD + Math.max(0, (tree.subtreeW - tree.width) / 2));
  tree.y = anchor?.y ?? (ROOT_PAD + topRowH + BRANCH_GAP);

  if (upKids.length) {
    let cx = ROOT_PAD + Math.max(0, (tree.subtreeW - topRowW) / 2);
    const childBottomY = tree.y - BRANCH_GAP;
    for (const child of upKids) {
      placeVerticalAxis(child, cx, childBottomY, 'up');
      cx += child.subtreeW + SIBLING_GAP;
    }
  }

  if (downKids.length) {
    let cx = ROOT_PAD + Math.max(0, (tree.subtreeW - bottomRowW) / 2);
    const bottomRowY = tree.y + tree.height + BRANCH_GAP;
    for (const child of downKids) {
      placeVerticalAxis(child, cx, bottomRowY, 'down');
      cx += child.subtreeW + SIBLING_GAP;
    }
  }
}

function measureTreeSide(tree: LTree, side: 'left' | 'right'): void {
  if (!tree.children.length) {
    tree.subtreeW = tree.width;
    tree.subtreeH = tree.height;
    return;
  }
  tree.children.forEach(c => measureTreeSide(c, side));
  const childBlockH = tree.children.reduce((s, c) => s + c.subtreeH, 0)
    + SIBLING_GAP * (tree.children.length - 1);
  const childBlockW = Math.max(...tree.children.map(c => c.subtreeW));
  tree.subtreeH = Math.max(tree.height, childBlockH);
  tree.subtreeW = tree.width + BRANCH_GAP + childBlockW;
}

/** 树状图（左/右）：根在上方，一级子节点纵向排列，二级起按普通左/右布局展开 */
function measureTreeColumnRoot(tree: LTree, side: 'left' | 'right'): void {
  if (!tree.children.length) {
    tree.subtreeW = tree.width;
    tree.subtreeH = tree.height;
    return;
  }
  tree.children.forEach(c => {
    assignSide(c, side);
    measureHorizontal(c, side);
  });
  const childBlockH = tree.children.reduce((s, c) => s + c.subtreeH, 0)
    + SIBLING_GAP * (tree.children.length - 1);
  const childBlockW = Math.max(...tree.children.map(c => c.subtreeW));
  tree.subtreeH = tree.height + BRANCH_GAP + childBlockH;
  tree.subtreeW = tree.width / 2 + BRANCH_GAP + childBlockW;
}

function placeTreeColumnRoot(tree: LTree, side: 'left' | 'right', anchor?: RootAnchor): void {
  tree.x = anchor?.x ?? (side === 'right' ? ROOT_PAD : ROOT_PAD + tree.subtreeW - tree.width);
  tree.y = anchor?.y ?? ROOT_PAD;

  if (!tree.children.length) return;

  const stemX = tree.x + tree.width / 2;
  let cy = tree.y + tree.height + BRANCH_GAP;
  for (const child of tree.children) {
    const childAnchorX = side === 'right'
      ? stemX + BRANCH_GAP
      : stemX - BRANCH_GAP;
    placeHorizontal(child, childAnchorX, cy, side);
    cy += child.subtreeH + SIBLING_GAP;
  }
}

function layoutTreeRoot(tree: LTree, side: 'left' | 'right', anchor?: RootAnchor): void {
  measureTreeColumnRoot(tree, side);
  assignSide(tree, side);
  placeTreeColumnRoot(tree, side, anchor);
}

function placeTreeSide(tree: LTree, x: number, y: number, side: 'left' | 'right'): void {
  if (side === 'right') {
    tree.x = x;
  } else {
    tree.x = x + tree.subtreeW - tree.width;
  }
  const childBlockH = tree.children.reduce((s, c) => s + c.subtreeH, 0)
    + SIBLING_GAP * (tree.children.length - 1);
  tree.y = y + Math.max(0, (childBlockH - tree.height) / 2);

  if (!tree.children.length) return;

  let cy = y;
  for (const child of tree.children) {
    const childX = side === 'right'
      ? tree.x + tree.width + BRANCH_GAP
      : tree.x - BRANCH_GAP - child.subtreeW;
    placeTreeSide(child, childX, cy, side);
    cy += child.subtreeH + SIBLING_GAP;
  }
}

function layoutTreeBalanced(root: LTree, anchor?: RootAnchor): void {
  const kids = root.children;
  const mid = Math.ceil(kids.length / 2);
  const leftKids = kids.slice(0, mid);
  const rightKids = kids.slice(mid);

  leftKids.forEach(c => { assignSide(c, 'left'); measureHorizontal(c, 'left'); });
  rightKids.forEach(c => { assignSide(c, 'right'); measureHorizontal(c, 'right'); });

  const leftW = leftKids.length ? Math.max(...leftKids.map(c => c.subtreeW)) : 0;
  const rightW = rightKids.length ? Math.max(...rightKids.map(c => c.subtreeW)) : 0;
  const leftH = blockHeight(leftKids);
  const rightH = blockHeight(rightKids);
  const branchH = Math.max(leftH, rightH, 0);

  root.subtreeW = leftW + BRANCH_GAP + root.width + BRANCH_GAP + rightW;
  root.subtreeH = root.height + BRANCH_GAP + branchH;
  root.x = anchor?.x ?? (ROOT_PAD + leftW + BRANCH_GAP);
  root.y = anchor?.y ?? ROOT_PAD;

  const stemX = root.x + root.width / 2;
  const branchY = root.y + root.height + BRANCH_GAP;
  let ly = branchY + (branchH - leftH) / 2;
  for (const child of leftKids) {
    placeHorizontal(child, stemX - BRANCH_GAP, ly, 'left');
    ly += child.subtreeH + SIBLING_GAP;
  }
  let ry = branchY + (branchH - rightH) / 2;
  for (const child of rightKids) {
    placeHorizontal(child, stemX + BRANCH_GAP, ry, 'right');
    ry += child.subtreeH + SIBLING_GAP;
  }
}

function measureTimelineHNode(tree: LTree): void {
  if (!tree.children.length) {
    tree.subtreeW = tree.width;
    tree.subtreeH = tree.height;
    return;
  }
  tree.children.forEach(c => measureHorizontal(c, 'right'));
  const upKids = tree.children.filter((_, i) => i % 2 === 0);
  const downKids = tree.children.filter((_, i) => i % 2 === 1);
  const upH = upKids.length ? Math.max(...upKids.map(c => c.subtreeH)) : 0;
  const downH = downKids.length ? Math.max(...downKids.map(c => c.subtreeH)) : 0;
  const branchW = Math.max(...tree.children.map(c => c.subtreeW));
  tree.subtreeW = tree.width + BRANCH_GAP + branchW;
  tree.subtreeH = (upH ? upH + BRANCH_GAP : 0) + tree.height + (downH ? downH + BRANCH_GAP : 0);
}

function placeTimelineHNode(tree: LTree, cx: number, spineY: number): void {
  tree.x = cx;
  tree.y = spineY - tree.height / 2;
  if (!tree.children.length) return;

  const colX = tree.x + tree.width + BRANCH_GAP;
  const halfH = tree.height / 2;
  tree.children.forEach((child, i) => {
    const rowY = i % 2 === 0
      ? spineY - halfH - BRANCH_GAP - child.subtreeH
      : spineY + halfH + BRANCH_GAP;
    placeHorizontal(child, colX, rowY, 'right');
  });
}

function measureTimelineHRoot(tree: LTree): void {
  if (!tree.children.length) {
    tree.subtreeW = tree.width;
    tree.subtreeH = tree.height;
    return;
  }
  tree.children.forEach(measureTimelineHNode);
  const spanW = tree.children.reduce((s, c) => s + c.subtreeW, 0)
    + BRANCH_GAP * Math.max(0, tree.children.length - 1);
  const maxH = Math.max(...tree.children.map(c => c.subtreeH));
  tree.subtreeW = tree.width + BRANCH_GAP + spanW;
  tree.subtreeH = maxH;
}

function placeTimelineHRoot(tree: LTree, anchor?: RootAnchor): void {
  assignSide(tree, 'right');
  const maxH = tree.children.length
    ? Math.max(...tree.children.map(c => c.subtreeH))
    : tree.height;
  const spineY = anchor
    ? anchor.y + tree.height / 2
    : ROOT_PAD + maxH / 2;
  tree.x = anchor?.x ?? ROOT_PAD;
  tree.y = anchor?.y ?? (spineY - tree.height / 2);

  if (!tree.children.length) return;

  let cx = tree.x + tree.width + BRANCH_GAP;
  for (const child of tree.children) {
    placeTimelineHNode(child, cx, spineY);
    cx += child.subtreeW + BRANCH_GAP;
  }
}

function layoutTimelineHRoot(tree: LTree, anchor?: RootAnchor): void {
  measureTimelineHRoot(tree);
  placeTimelineHRoot(tree, anchor);
}

function measureTimelineVSpineNode(tree: LTree): void {
  if (!tree.children.length) {
    tree.subtreeW = tree.width;
    tree.subtreeH = tree.height;
    return;
  }
  const leftKids = tree.children.filter((_, i) => i % 2 === 0);
  const rightKids = tree.children.filter((_, i) => i % 2 === 1);
  leftKids.forEach(c => measureHorizontal(c, 'left'));
  rightKids.forEach(c => measureHorizontal(c, 'right'));
  const leftW = leftKids.length ? Math.max(...leftKids.map(c => c.subtreeW)) : 0;
  const rightW = rightKids.length ? Math.max(...rightKids.map(c => c.subtreeW)) : 0;
  const leftH = blockHeight(leftKids);
  const rightH = blockHeight(rightKids);
  tree.subtreeW = (leftW ? leftW + BRANCH_GAP : 0) + tree.width + (rightW ? BRANCH_GAP + rightW : 0);
  tree.subtreeH = Math.max(tree.height, leftH, rightH);
}

function placeTimelineVSpineNode(tree: LTree, cy: number, spineX: number): void {
  tree.x = spineX - tree.width / 2;
  if (!tree.children.length) {
    tree.y = cy;
    return;
  }

  const leftKids = tree.children.filter((_, i) => i % 2 === 0);
  const rightKids = tree.children.filter((_, i) => i % 2 === 1);
  leftKids.forEach(c => assignSide(c, 'left'));
  rightKids.forEach(c => assignSide(c, 'right'));

  const leftH = blockHeight(leftKids);
  const rightH = blockHeight(rightKids);
  const blockH = Math.max(tree.height, leftH, rightH);
  tree.y = cy + (blockH - tree.height) / 2;

  let ly = cy + (blockH - leftH) / 2;
  for (const child of leftKids) {
    placeHorizontal(child, tree.x - BRANCH_GAP, ly, 'left');
    ly += child.subtreeH + SIBLING_GAP;
  }
  let ry = cy + (blockH - rightH) / 2;
  for (const child of rightKids) {
    placeHorizontal(child, tree.x + tree.width + BRANCH_GAP, ry, 'right');
    ry += child.subtreeH + SIBLING_GAP;
  }
}

function measureTimelineVRoot(tree: LTree): void {
  if (!tree.children.length) {
    tree.subtreeW = tree.width;
    tree.subtreeH = tree.height;
    return;
  }
  tree.children.forEach(measureTimelineVSpineNode);
  const spanH = tree.children.reduce((s, c) => s + c.subtreeH, 0)
    + BRANCH_GAP * Math.max(0, tree.children.length - 1);
  const maxW = Math.max(...tree.children.map(c => c.subtreeW));
  tree.subtreeW = Math.max(tree.width, maxW);
  tree.subtreeH = tree.height + BRANCH_GAP + spanH;
}

function placeTimelineVRoot(tree: LTree, anchor?: RootAnchor): void {
  assignSide(tree, 'right');
  if (!tree.children.length) {
    tree.x = anchor?.x ?? ROOT_PAD;
    tree.y = anchor?.y ?? ROOT_PAD;
    return;
  }

  const maxW = Math.max(tree.width, ...tree.children.map(c => c.subtreeW));
  const spineX = anchor
    ? anchor.x + tree.width / 2
    : ROOT_PAD + maxW / 2;
  tree.x = anchor?.x ?? (spineX - tree.width / 2);
  tree.y = anchor?.y ?? ROOT_PAD;

  let cy = tree.y + tree.height + BRANCH_GAP;
  for (const child of tree.children) {
    placeTimelineVSpineNode(child, cy, spineX);
    cy += child.subtreeH + BRANCH_GAP;
  }
}

function layoutTimelineVRoot(tree: LTree, anchor?: RootAnchor): void {
  measureTimelineVRoot(tree);
  placeTimelineVRoot(tree, anchor);
}

function collectNodes(tree: LTree, out: MindMapLayoutNode[]): void {
  out.push({
    id: tree.node.id,
    text: tree.node.text,
    completed: tree.node.completed,
    collapsed: tree.node.collapsed,
    childCount: tree.node.children.length,
    depth: tree.depth,
    x: tree.x,
    y: tree.y,
    width: tree.width,
    height: tree.height,
    isRoot: tree.depth === 0,
    style: tree.style,
    side: tree.side,
    vertDir: tree.vertDir,
  });
  tree.children.forEach(c => collectNodes(c, out));
}

/** 中心主干在各一级子节点 Y 处直接分叉（两段 BUS_INSET，与 buildHalfBus 一致） */
function appendTreeStemFanBranches(
  parts: string[],
  stemX: number,
  entries: { child: LTree; side: 'left' | 'right' }[],
): void {
  for (const { child, side } of entries) {
    const cy = childMidY(child);
    const busX = side === 'right' ? stemX + BUS_INSET : stemX - BUS_INSET;
    const cx = side === 'right' ? child.x : child.x + child.width;
    // 一级分支：垂直主干 + 水平直连子节点，不使用贝塞尔（避免连接处波浪）
    parts.push(`L ${stemX} ${cy}`, `L ${busX} ${cy}`, `L ${cx} ${cy}`);
    parts.push(`M ${stemX} ${cy}`);
  }
}

/** 树状图：中心垂直主干，在各一级子节点 Y 处直接分叉 */
function buildTreeBalancedRootPath(
  parent: LTree,
  leftKids: LTree[],
  rightKids: LTree[],
  style: MindNoteBranchStyle,
): string {
  const entries = [
    ...leftKids.map(child => ({ child, side: 'left' as const })),
    ...rightKids.map(child => ({ child, side: 'right' as const })),
  ];
  if (!entries.length) return '';

  entries.sort((a, b) => childMidY(a.child) - childMidY(b.child));

  const stemX = parent.x + parent.width / 2;
  const attach = parent.y + parent.height;
  const top = childMidY(entries[0].child);
  const bottom = childMidY(entries[entries.length - 1].child);
  const parts: string[] = [`M ${stemX} ${attach}`, `L ${stemX} ${top}`];
  appendTreeStemFanBranches(parts, stemX, entries);
  parts.push(`L ${stemX} ${bottom}`);
  return parts.join(' ');
}

/** 树状左/右：中心垂直主干，在各一级子节点 Y 处直接分叉 */
function buildTreeRootDownPath(
  parent: LTree,
  kids: LTree[],
  side: 'left' | 'right',
  style: MindNoteBranchStyle,
): string {
  if (!kids.length) return '';
  const entries = kids.map(child => ({ child, side }));
  const stemX = parent.x + parent.width / 2;
  const attach = parent.y + parent.height;
  const top = childMidY(kids[0]);
  const bottom = childMidY(kids[kids.length - 1]);
  const parts: string[] = [`M ${stemX} ${attach}`, `L ${stemX} ${top}`];
  appendTreeStemFanBranches(parts, stemX, entries);
  parts.push(`L ${stemX} ${bottom}`);
  return parts.join(' ');
}

function buildTimelineHSpinePath(parent: LTree, kids: LTree[]): string {
  if (!kids.length) return '';
  const spineY = parent.y + parent.height / 2;
  const startX = parent.x + parent.width;
  const last = kids[kids.length - 1];
  const endX = last.x + last.width;
  return `M ${startX} ${spineY} L ${endX} ${spineY}`;
}

function buildTimelineVSpinePath(parent: LTree, kids: LTree[]): string {
  if (!kids.length) return '';
  const spineX = parent.x + parent.width / 2;
  const startY = parent.y + parent.height;
  const last = kids[kids.length - 1];
  const endY = last.y + last.height;
  return `M ${spineX} ${startY} L ${spineX} ${endY}`;
}

/** 时间线主轴节点向上下分支：先垂直到总线，再水平连到子树 */
function buildTimelineHBranchPath(
  parent: LTree,
  kids: LTree[],
  dir: 'up' | 'down',
  style: MindNoteBranchStyle,
): string {
  if (!kids.length) return '';
  const px = parent.x + parent.width / 2;
  const attach = dir === 'up' ? parent.y : parent.y + parent.height;
  const stubY = dir === 'up' ? attach - BUS_INSET : attach + BUS_INSET;
  const busX = parent.x + parent.width + BUS_INSET;
  const top = childMidY(kids[0]);
  const bottom = childMidY(kids[kids.length - 1]);
  const parts: string[] = [`M ${px} ${attach}`, `L ${px} ${stubY}`, `L ${busX} ${stubY}`, `L ${busX} ${top}`];

  for (const child of kids) {
    const cy = childMidY(child);
    const cx = child.x;
    // 总线到子节点水平段保持直线，避免贝塞尔控制点产生波浪
    parts.push(`L ${busX} ${cy}`, `L ${cx} ${cy}`, `M ${busX} ${cy}`);
  }
  parts.push(`L ${busX} ${bottom}`);
  return parts.join(' ');
}

function isTreeStructure(structure: MindNoteStructure): boolean {
  return structure === 'treeRight' || structure === 'treeLeft' || structure === 'treeBalanced';
}

function isTimelineStructure(structure: MindNoteStructure): boolean {
  return structure === 'timelineH' || structure === 'timelineV';
}

function collectPaths(
  tree: LTree,
  structure: MindNoteStructure,
  branchStyle: MindNoteBranchStyle,
  paths: MindMapPath[],
): void {
  if (!tree.children.length) return;

  if (isTimelineStructure(structure)) {
    if (structure === 'timelineH') {
      if (tree.depth === 0) {
        paths.push({
          id: `path-${tree.node.id}-spine`,
          d: buildTimelineHSpinePath(tree, tree.children),
        });
      } else {
        const upKids = tree.children.filter((_, i) => i % 2 === 0);
        const downKids = tree.children.filter((_, i) => i % 2 === 1);
        if (upKids.length) {
          paths.push({
            id: `path-${tree.node.id}-u`,
            d: buildTimelineHBranchPath(tree, upKids, 'up', branchStyle),
          });
        }
        if (downKids.length) {
          paths.push({
            id: `path-${tree.node.id}-d`,
            d: buildTimelineHBranchPath(tree, downKids, 'down', branchStyle),
          });
        }
      }
    } else {
      if (tree.depth === 0) {
        paths.push({
          id: `path-${tree.node.id}-spine`,
          d: buildTimelineVSpinePath(tree, tree.children),
        });
      } else {
        const leftKids = tree.children.filter((_, i) => i % 2 === 0);
        const rightKids = tree.children.filter((_, i) => i % 2 === 1);
        if (leftKids.length) {
          paths.push({
            id: `path-${tree.node.id}-l`,
            d: buildHalfBus(tree, leftKids, 'left', branchStyle),
          });
        }
        if (rightKids.length) {
          paths.push({
            id: `path-${tree.node.id}-r`,
            d: buildHalfBus(tree, rightKids, 'right', branchStyle),
          });
        }
      }
    }
  } else if (isTreeStructure(structure)) {
    if (tree.depth === 0 && structure === 'treeBalanced') {
      const leftKids = tree.children.filter(c => c.side === 'left');
      const rightKids = tree.children.filter(c => c.side === 'right');
      paths.push({
        id: `path-${tree.node.id}`,
        d: buildTreeBalancedRootPath(tree, leftKids, rightKids, branchStyle),
      });
    } else if (tree.depth === 0 && (structure === 'treeRight' || structure === 'treeLeft')) {
      const side = structure === 'treeLeft' ? 'left' : 'right';
      paths.push({
        id: `path-${tree.node.id}`,
        d: buildTreeRootDownPath(tree, tree.children, side, branchStyle),
      });
    } else if (structure === 'treeRight' || structure === 'treeLeft' || structure === 'treeBalanced') {
      const side = structure === 'treeLeft' ? 'left' : tree.side;
      paths.push({
        id: `path-${tree.node.id}`,
        d: buildHalfBus(tree, tree.children, side, branchStyle),
      });
    }
  } else if (structure === 'vertical') {
    if (tree.depth === 0) {
      const upKids = tree.children.filter(c => c.vertDir === 'up');
      const downKids = tree.children.filter(c => c.vertDir === 'down');
      if (upKids.length) {
        paths.push({
          id: `path-${tree.node.id}-u`,
          d: buildVerticalRowPath(tree, upKids, 'up', branchStyle),
        });
      }
      if (downKids.length) {
        paths.push({
          id: `path-${tree.node.id}-d`,
          d: buildVerticalRowPath(tree, downKids, 'down', branchStyle),
        });
      }
    } else {
      paths.push({
        id: `path-${tree.node.id}`,
        d: buildVerticalRowPath(tree, tree.children, tree.vertDir ?? 'down', branchStyle),
      });
    }
  } else if (tree.depth === 0) {
    if (structure === 'balanced') {
      const leftKids = tree.children.filter(c => c.side === 'left');
      const rightKids = tree.children.filter(c => c.side === 'right');
      if (rightKids.length) {
        paths.push({ id: `path-${tree.node.id}-r`, d: buildHalfBus(tree, rightKids, 'right', branchStyle) });
      }
      if (leftKids.length) {
        paths.push({ id: `path-${tree.node.id}-l`, d: buildHalfBus(tree, leftKids, 'left', branchStyle) });
      }
    } else if (structure === 'right' || structure === 'left') {
      const leftKids = tree.children.filter(c => c.side === 'left');
      const rightKids = tree.children.filter(c => c.side === 'right');
      if (rightKids.length) {
        paths.push({ id: `path-${tree.node.id}-r`, d: buildHalfBus(tree, rightKids, 'right', branchStyle) });
      }
      if (leftKids.length) {
        paths.push({ id: `path-${tree.node.id}-l`, d: buildHalfBus(tree, leftKids, 'left', branchStyle) });
      }
    }
  } else {
    paths.push({
      id: `path-${tree.node.id}`,
      d: buildHalfBus(tree, tree.children, tree.side, branchStyle),
    });
  }

  tree.children.forEach(c => collectPaths(c, structure, branchStyle, paths));
}

function childMidY(c: LTree): number {
  return c.y + c.height / 2;
}

function treeMidY(tree: LTree): number {
  return tree.y + tree.height / 2;
}

function treeMidX(tree: LTree): number {
  return tree.x + tree.width / 2;
}

/** 根据父子相对位置计算拱弯偏移：上层微拱、下层微垂 */
function computeCurveBend(refCoord: number, targetCoord: number): number {
  const delta = targetCoord - refCoord;
  if (Math.abs(delta) < 0.5) return 0;
  const sign = delta < 0 ? -1 : 1;
  const magnitude = Math.min(
    28,
    Math.max(10, Math.abs(delta) * 0.22),
  );
  return sign * magnitude;
}

/** 按父子主轴间距计算控制点缓冲长度 */
function computeAxisStub(span: number): number {
  if (span <= CURVE_STUB * 2) return CURVE_STUB;
  return Math.max(CURVE_STUB, Math.min(span * CURVE_STUB_RATIO, CURVE_STUB_MAX));
}

/**
 * 水平布局三阶贝塞尔分支（右/左）：
 * P0 父节点侧缘中点 → CP1 水平缓冲 + 垂直拱弯 → CP2 子节点对侧水平缓冲 → P3 子节点侧缘中点
 */
function cubicHorizontalBranchD(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  side: 'left' | 'right',
  refMidY: number,
  withMove = true,
): string {
  const dy = endY - startY;
  const stub = computeAxisStub(Math.abs(endX - startX));
  const arch = computeCurveBend(refMidY, endY) * CURVE_ARCH_BLEND;
  const dir = side === 'right' ? 1 : -1;
  // CP1 沿子节点 Y 方向提前分离，避免多分支从同一点扇出后互相缠绕
  const cp1x = startX + dir * stub;
  const cp1y = startY + dy * CURVE_PULL_RATIO + arch;
  const cp2x = endX - dir * stub;
  const cp2y = endY;
  const prefix = withMove ? `M ${startX} ${startY} ` : '';
  return `${prefix}C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${endX} ${endY}`;
}

/**
 * 上下布局三阶贝塞尔分支：
 * P0 父节点上下缘中点 → CP1 垂直缓冲 + 水平拱弯 → CP2 子节点对侧垂直缓冲 → P3 子节点上下缘中点
 */
function cubicVerticalBranchD(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  dir: 'up' | 'down',
  refMidX: number,
  withMove = true,
): string {
  const dx = endX - startX;
  const stub = computeAxisStub(Math.abs(endY - startY));
  const arch = computeCurveBend(refMidX, endX) * CURVE_ARCH_BLEND;
  const vdir = dir === 'down' ? 1 : -1;
  const cp1x = startX + dx * CURVE_PULL_RATIO + arch;
  const cp1y = startY + vdir * stub;
  const cp2x = endX;
  const cp2y = endY - vdir * stub;
  const prefix = withMove ? `M ${startX} ${startY} ` : '';
  return `${prefix}C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${endX} ${endY}`;
}

function buildHalfBus(
  parent: LTree,
  kids: LTree[],
  side: 'left' | 'right',
  style: MindNoteBranchStyle,
): string {
  if (!kids.length) return '';
  const top = childMidY(kids[0]);
  const bottom = childMidY(kids[kids.length - 1]);
  const py = parent.y + parent.height / 2;
  const px = side === 'right' ? parent.x + parent.width : parent.x;
  const busX = side === 'right' ? px + BUS_INSET : px - BUS_INSET;
  const parts: string[] = [];

  if (style === 'straight') {
    parts.push(`M ${px} ${py}`, `L ${busX} ${py}`, `L ${busX} ${top}`);
    for (const child of kids) {
      const cy = childMidY(child);
      const cx = side === 'right' ? child.x : child.x + child.width;
      parts.push(`L ${busX} ${cy}`, `L ${cx} ${cy}`, `M ${busX} ${cy}`);
    }
    parts.push(`L ${busX} ${bottom}`);
  } else {
    for (const child of kids) {
      const cy = childMidY(child);
      const cx = side === 'right' ? child.x : child.x + child.width;
      parts.push(cubicHorizontalBranchD(px, py, cx, cy, side, py));
    }
  }
  return parts.join(' ');
}

function childCenterX(c: LTree): number {
  return c.x + c.width / 2;
}

/** 上下结构：直线=垂直主干+水平横杆；曲线=父节点扇出直连（与 buildHalfBus curve 对称） */
function buildVerticalRowPath(
  parent: LTree,
  kids: LTree[],
  dir: VertDir,
  style: MindNoteBranchStyle,
): string {
  if (!kids.length) return '';
  const px = parent.x + parent.width / 2;
  const attach = dir === 'down' ? parent.y + parent.height : parent.y;

  if (style === 'curve') {
    const refX = treeMidX(parent);
    const parts: string[] = [];
    for (const child of kids) {
      const cx = childCenterX(child);
      const joinY = dir === 'down' ? child.y : child.y + child.height;
      parts.push(cubicVerticalBranchD(px, attach, cx, joinY, dir, refX));
    }
    return parts.join(' ');
  }

  const busY = dir === 'down' ? attach + BUS_INSET : attach - BUS_INSET;
  const centers = kids.map(childCenterX);
  const leftX = Math.min(...centers);
  const rightX = Math.max(...centers);
  const parts: string[] = [`M ${px} ${attach}`, `L ${px} ${busY}`, `L ${leftX} ${busY}`];

  for (const child of kids) {
    const cx = childCenterX(child);
    const joinY = dir === 'down' ? child.y : child.y + child.height;
    parts.push(`L ${cx} ${busY}`, `L ${cx} ${joinY}`, `M ${cx} ${busY}`);
  }
  parts.push(`L ${rightX} ${busY}`);
  return parts.join(' ');
}

function bounds(nodes: MindMapLayoutNode[]): { width: number; height: number } {
  let maxX = ROOT_PAD;
  let maxY = ROOT_PAD;
  for (const n of nodes) {
    maxX = Math.max(maxX, n.x + n.width + ROOT_PAD);
    maxY = Math.max(maxY, n.y + n.height + ROOT_PAD);
  }
  return { width: maxX, height: maxY };
}

function applyMindmapLayout(tree: LTree, structure: MindNoteStructure, anchor?: RootAnchor): void {
  if (structure === 'vertical') {
    layoutVerticalRoot(tree, anchor);
  } else if (structure === 'balanced') {
    layoutBalanced(tree, anchor);
  } else if (structure === 'left') {
    layoutDirectionalHorizontalRoot(tree, 'left', anchor);
  } else if (structure === 'treeRight') {
    layoutTreeRoot(tree, 'right', anchor);
  } else if (structure === 'treeLeft') {
    layoutTreeRoot(tree, 'left', anchor);
  } else if (structure === 'treeBalanced') {
    layoutTreeBalanced(tree, anchor);
  } else if (structure === 'timelineH') {
    layoutTimelineHRoot(tree, anchor);
  } else if (structure === 'timelineV') {
    layoutTimelineVRoot(tree, anchor);
  } else {
    layoutDirectionalHorizontalRoot(tree, 'right', anchor);
  }
}

function computeRootAnchor(
  root: MindNode,
  structure: MindNoteStructure,
  measure?: MindMapMeasureOptions,
): RootAnchor {
  const expanded = buildTreeExpanded(root, 0, 'right', measure);
  applyMindmapLayout(expanded, structure);
  return { x: expanded.x, y: expanded.y };
}

export function computeMindMapLayout(
  root: MindNode,
  structure: MindNoteStructure = 'right',
  branchStyle: MindNoteBranchStyle = 'straight',
  measure?: MindMapMeasureOptions,
): MindMapLayout {
  const anchor = computeRootAnchor(root, structure, measure);
  const tree = buildTree(root, 0, 'right', measure);

  applyMindmapLayout(tree, structure, anchor);

  const nodes: MindMapLayoutNode[] = [];
  const paths: MindMapPath[] = [];
  collectNodes(tree, nodes);
  collectPaths(tree, structure, branchStyle, paths);
  const { width, height } = bounds(nodes);
  return { nodes, paths, width, height };
}

export function buildBranchPath(): string {
  return '';
}
