/**
 * 多维表工作流节点执行器注册表
 *
 * - 每个节点类型一个 executor，通过 register() 注册
 * - WorkflowEngine 按 nodes[*].type 查找并执行
 * - 执行器返回 branchOutput，用于驱动条件分支边的下一节点
 */
import type { LoggerService } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import type {
  Condition,
  ConditionGroup,
  WorkflowNode,
  WorkflowTriggerFilter,
} from '../entities/ai.types';

export interface NodeExecContext {
  /** 当前节点 */
  node: WorkflowNode;
  /** 节点输入：trigger 节点的 record / variables 等 */
  input: Record<string, unknown>;
  /** 共享执行变量（在节点间传递） */
  variables: Record<string, unknown>;
  /** 当前工作流 id */
  workflowId: string;
  /** doc/table 上下文（来自 trigger） */
  docId?: string;
  tableId?: string;
  /** 当前触发记录（trigger 节点提供，后续节点可通过 variables.record 拿到） */
  record?: Record<string, unknown>;
  /** 用户上下文（用于 AI / 通知节点） */
  userId: string;
  tenantId?: string;
}

export interface NodeExecResult {
  /** 节点输出：合并到 variables */
  output?: Record<string, unknown>;
  /** 分支出口：用于驱动下一节点（condition.if → 'true' / 'false'） */
  branchOutput?: string;
}

export interface NodeExecutor {
  type: string;
  /** 执行节点逻辑 */
  execute(ctx: NodeExecContext): Promise<NodeExecResult>;
}

@Injectable()
export class NodeExecutorRegistry {
  private readonly logger = new Logger(NodeExecutorRegistry.name);
  private readonly map = new Map<string, NodeExecutor>();

  register(executor: NodeExecutor): void {
    this.map.set(executor.type, executor);
  }

  get(type: string): NodeExecutor | undefined {
    return this.map.get(type);
  }

  has(type: string): boolean {
    return this.map.has(type);
  }

  list(): string[] {
    return Array.from(this.map.keys());
  }
}

/** 评估单个条件（与 UI 配置面板共享语义） */
export function evaluateCondition(cond: Condition, value: unknown): boolean {
  const v = value;
  switch (cond.operator) {
    case 'eq':
      return v === cond.value;
    case 'neq':
      return v !== cond.value;
    case 'gt':
      return typeof v === 'number' && typeof cond.value === 'number' && v > cond.value;
    case 'gte':
      return typeof v === 'number' && typeof cond.value === 'number' && v >= cond.value;
    case 'lt':
      return typeof v === 'number' && typeof cond.value === 'number' && v < cond.value;
    case 'lte':
      return typeof v === 'number' && typeof cond.value === 'number' && v <= cond.value;
    case 'contains':
      return typeof v === 'string' && typeof cond.value === 'string' && v.includes(cond.value);
    case 'not_contains':
      return typeof v === 'string' && typeof cond.value === 'string' && !v.includes(cond.value);
    case 'is_empty':
      return v == null || v === '' || (Array.isArray(v) && v.length === 0);
    case 'is_not_empty':
      return !(v == null || v === '' || (Array.isArray(v) && v.length === 0));
    case 'in':
      return Array.isArray(cond.value) && (cond.value as unknown[]).includes(v);
    case 'not_in':
      return Array.isArray(cond.value) && !(cond.value as unknown[]).includes(v);
    default:
      return false;
  }
}

/** 评估条件组：与/或 */
export function evaluateConditionGroup(
  group: ConditionGroup | null | undefined,
  record: Record<string, unknown> | undefined,
): boolean {
  if (!group || !group.conditions || group.conditions.length === 0) return true;
  if (!record) return false;
  const fn = (cond: Condition) => evaluateCondition(cond, record[cond.field]);
  return group.op === 'or'
    ? group.conditions.some(fn)
    : group.conditions.every(fn);
}

/** 评估触发器 filter（语法同节点 condition） */
export function matchTriggerFilter(
  filter: WorkflowTriggerFilter | null | undefined,
  record: Record<string, unknown> | undefined,
): boolean {
  return evaluateConditionGroup(filter ?? null, record);
}
