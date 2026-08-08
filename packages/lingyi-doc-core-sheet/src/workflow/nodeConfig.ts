/**
 * 条件分支 / 多分支节点配置工具
 * 统一属性面板 schema、画布分支端口、布局排序的数据来源。
 */
import type { ConditionGroup, WorkflowNode, WorkflowNodeType } from './types';

// ==================== 配置类型 ====================

export interface IfElseConfig {
  groups: ConditionGroup[];
}

export interface SwitchBranchConfig {
  id: string;
  name: string;
  /** 条件组列表，组间 OR、组内 AND（与 If/Else 一致） */
  groups: ConditionGroup[];
  /** @deprecated 兼容旧版单组结构，读取时自动迁移到 groups */
  conditions?: ConditionGroup;
}

export interface SwitchConfig {
  executionMode: 'first' | 'all';
  branches: SwitchBranchConfig[];
}

export interface NodeBranchPort {
  key: string;
  label: string;
}

export const SWITCH_DEFAULT_BRANCH_KEY = 'default';
export const SWITCH_DEFAULT_BRANCH_LABEL = '其他';

export const IF_ELSE_BRANCH_PORTS: NodeBranchPort[] = [
  { key: 'true', label: '满足' },
  { key: 'false', label: '不满足' },
];

// ==================== 工厂 / 归一化 ====================

export function createSwitchBranchId(suffix?: string | number): string {
  const tail = suffix != null ? String(suffix) : Math.random().toString(36).slice(2, 6);
  return `branch-${Date.now()}-${tail}`;
}

export function getIfElseDefaultConfig(): IfElseConfig {
  return { groups: [{ op: 'and', conditions: [] }] };
}

export function createEmptyConditionGroup(): ConditionGroup {
  return { op: 'and', conditions: [] };
}

export function getSwitchDefaultConfig(): SwitchConfig {
  return {
    executionMode: 'first',
    branches: [{ id: 'branch-1', name: '分支 1', groups: [createEmptyConditionGroup()] }],
  };
}

/** 归一化分支条件组，兼容旧版 conditions 单组结构 */
export function normalizeBranchGroups(branch: Pick<SwitchBranchConfig, 'groups' | 'conditions'>): ConditionGroup[] {
  if (branch.groups && branch.groups.length > 0) {
    return branch.groups;
  }
  if (branch.conditions) {
    return [branch.conditions];
  }
  return [createEmptyConditionGroup()];
}

/** 归一化 If/Else 配置，兼容旧版 conditions 单组结构 */
export function normalizeIfElseConfig(config: Record<string, unknown>): IfElseConfig {
  const groups = config.groups as ConditionGroup[] | undefined;
  if (groups && groups.length > 0) {
    return { groups };
  }
  const legacy = config.conditions as ConditionGroup | undefined;
  if (legacy) {
    return { groups: [legacy] };
  }
  return getIfElseDefaultConfig();
}

/** 归一化 Switch 配置，兼容旧版 conditions 单组结构 */
export function normalizeSwitchConfig(config: Record<string, unknown>): SwitchConfig {
  const executionMode = (config.executionMode as SwitchConfig['executionMode']) ?? 'first';
  const branches = config.branches as SwitchBranchConfig[] | undefined;
  if (branches && branches.length > 0) {
    return {
      executionMode,
      branches: branches.map((b, i) => ({
        id: b.id || `branch-${i + 1}`,
        name: b.name || `分支 ${i + 1}`,
        groups: normalizeBranchGroups(b),
      })),
    };
  }
  return getSwitchDefaultConfig();
}

// ==================== 分支端口 ====================

export function isBranchNodeType(type: WorkflowNodeType): boolean {
  return type === 'condition.if' || type === 'condition.switch';
}

/** 获取节点在画布上应展示的分支出口（Switch 含 implicit default「其他」） */
export function getNodeBranchPorts(node: Pick<WorkflowNode, 'type' | 'config'>): NodeBranchPort[] {
  if (node.type === 'condition.if') {
    return IF_ELSE_BRANCH_PORTS;
  }
  if (node.type === 'condition.switch') {
    const cfg = normalizeSwitchConfig(node.config ?? {});
    return [
      ...cfg.branches.map((b) => ({ key: b.id, label: b.name || '分支' })),
      { key: SWITCH_DEFAULT_BRANCH_KEY, label: SWITCH_DEFAULT_BRANCH_LABEL },
    ];
  }
  return [];
}

export function getBranchLabel(
  node: Pick<WorkflowNode, 'type' | 'config'>,
  branchKey: string,
): string {
  const port = getNodeBranchPorts(node).find((p) => p.key === branchKey);
  return port?.label ?? branchKey;
}

export function compareBranchOrder(
  node: Pick<WorkflowNode, 'type' | 'config'>,
  a?: string,
  b?: string,
): number {
  const order = getNodeBranchPorts(node).map((p) => p.key);
  const ai = a ? order.indexOf(a) : -1;
  const bi = b ? order.indexOf(b) : -1;
  return (ai >= 0 ? ai : order.length) - (bi >= 0 ? bi : order.length);
}

/** 计算分支出口在画布上的坐标（底部横向均分） */
export function getBranchPortPosition(
  nodePosition: { x: number; y: number },
  branchKey: string,
  ports: NodeBranchPort[],
  nodeWidth: number,
  nodeHeight: number,
): { x: number; y: number } {
  const index = ports.findIndex((p) => p.key === branchKey);
  const n = Math.max(ports.length, 1);
  const i = index >= 0 ? index : 0;
  return {
    x: nodePosition.x + ((i + 0.5) / n) * nodeWidth,
    y: nodePosition.y + nodeHeight,
  };
}

// ==================== 配置状态 ====================

export function countIfElseConditions(config: Record<string, unknown>): number {
  const { groups } = normalizeIfElseConfig(config);
  return groups.reduce((sum, g) => sum + g.conditions.length, 0);
}

export function isIfElseConfigured(config: Record<string, unknown>): boolean {
  const { groups } = normalizeIfElseConfig(config);
  return groups.some((g) => g.conditions.some((c) => Boolean(c.field)));
}

export function isSwitchConfigured(config: Record<string, unknown>): boolean {
  const { branches } = normalizeSwitchConfig(config);
  return branches.some((b) =>
    b.groups.some((g) => g.conditions.some((c) => Boolean(c.field))),
  );
}

export function countSwitchBranchConditions(branch: Pick<SwitchBranchConfig, 'groups' | 'conditions'>): number {
  return normalizeBranchGroups(branch).reduce((sum, g) => sum + g.conditions.length, 0);
}
