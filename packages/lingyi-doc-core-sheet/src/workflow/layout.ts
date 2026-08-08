import type { WorkflowEdge, WorkflowNode } from './types';
import { compareBranchOrder, getNodeBranchPorts, isBranchNodeType } from './nodeConfig';

export const WORKFLOW_NODE_WIDTH = 200;
export const WORKFLOW_NODE_HEIGHT = 72;
export const WORKFLOW_NODE_GAP = 80;
export const WORKFLOW_COLUMN_WIDTH = 300;
export const WORKFLOW_LAYOUT_START_Y = 80;
export const WORKFLOW_LAYOUT_CENTER_X = 220;

/**
 * 分支感知布局算法：
 * - 普通节点：垂直对齐，等间距分布
 * - 分支节点（condition.if / condition.switch）：子节点横向展开
 *   每个分支子树保持各自的 X 坐标，内部继续垂直排列
 */
export function computeWorkflowLayout<T extends WorkflowNode>(
  nodes: T[],
  edges: WorkflowEdge[],
): T[] {
  if (nodes.length === 0) return nodes;

  const ids = new Set(nodes.map((n) => n.id));

  // 构建子节点邻接表
  const childrenMap = new Map<string, WorkflowEdge[]>();
  for (const id of ids) childrenMap.set(id, []);
  for (const edge of edges) {
    if (!ids.has(edge.sourceNodeId) || !ids.has(edge.targetNodeId)) continue;
    childrenMap.get(edge.sourceNodeId)!.push(edge);
  }

  // 入度统计
  const inDegree = new Map<string, number>();
  for (const id of ids) inDegree.set(id, 0);
  for (const edge of edges) {
    if (!ids.has(edge.sourceNodeId) || !ids.has(edge.targetNodeId)) continue;
    inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) ?? 0) + 1);
  }

  // 找根节点（触发器或无入边的节点）
  const startNode =
    nodes.find((n) => n.type.startsWith('trigger.') || n.type === 'start') ??
    nodes.find((n) => (inDegree.get(n.id) ?? 0) === 0);

  if (startNode) {
    inDegree.set(startNode.id, 0);
  }

  const centerX = WORKFLOW_LAYOUT_CENTER_X - WORKFLOW_NODE_WIDTH / 2;
  const step = WORKFLOW_NODE_HEIGHT + WORKFLOW_NODE_GAP;

  const positions = new Map<string, { x: number; y: number }>();
  const visited = new Set<string>();

  function layoutNode(nodeId: string, x: number, depth: number) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    positions.set(nodeId, { x, y: WORKFLOW_LAYOUT_START_Y + depth * step });

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const childEdges = (childrenMap.get(nodeId) ?? [])
      .slice()
      .sort((a, b) => compareBranchOrder(node, a.branch, b.branch));

    if (isBranchNodeType(node.type)) {
      // 分支节点：按端口位置横向展开（即使只连了一个分支也保持正确列位）
      const ports = getNodeBranchPorts(node);
      const numPorts = Math.max(ports.length, 1);
      childEdges.forEach((edge) => {
        const portIndex = ports.findIndex((p) => p.key === edge.branch);
        const i = portIndex >= 0 ? portIndex : 0;
        const childX = x + (i - (numPorts - 1) / 2) * WORKFLOW_COLUMN_WIDTH;
        layoutNode(edge.targetNodeId, childX, depth + 1);
      });
    } else if (childEdges.length > 0) {
      // 普通节点：子节点继承 X
      childEdges.forEach((edge) => layoutNode(edge.targetNodeId, x, depth + 1));
    }
  }

  // 从根节点开始布局
  if (startNode) {
    layoutNode(startNode.id, centerX, 0);
  }

  // 处理未连通的节点（放在底部）
  let extraIdx = 0;
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      positions.set(node.id, {
        x: centerX,
        y: WORKFLOW_LAYOUT_START_Y + (nodes.length + extraIdx) * step,
      });
      extraIdx++;
    }
  }

  return nodes.map((node) => ({
    ...node,
    position: positions.get(node.id) ?? { x: centerX, y: 0 },
  }));
}

/**
 * 删除节点后重连前后节点：
 * 对每条「入边 (pred -> deleted)」与「出边 (deleted -> succ)」的组合，
 * 生成一条新边 pred -> succ，并沿用入边的分支信息（保留分支语义）。
 * 同时移除所有与被删节点相连的旧边。
 */
export function reconnectEdgesAfterDelete(
  edges: WorkflowEdge[],
  deletedNodeId: string,
): WorkflowEdge[] {
  const incoming = edges.filter((e) => e.targetNodeId === deletedNodeId);
  const outgoing = edges.filter((e) => e.sourceNodeId === deletedNodeId);
  const kept = edges.filter(
    (e) => e.sourceNodeId !== deletedNodeId && e.targetNodeId !== deletedNodeId,
  );
  if (incoming.length === 0 || outgoing.length === 0) return kept;

  let seq = 0;
  for (const inc of incoming) {
    for (const out of outgoing) {
      kept.push({
        id: `edge_${Date.now()}_bypass_${seq++}`,
        sourceNodeId: inc.sourceNodeId,
        targetNodeId: out.targetNodeId,
        branch: inc.branch,
        sourceHandle: inc.sourceHandle,
      });
    }
  }
  return kept;
}
