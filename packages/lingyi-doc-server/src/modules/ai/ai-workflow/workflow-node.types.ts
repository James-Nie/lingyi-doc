/**
 * 工作流节点开放架构 - 元数据契约
 *
 * 单一事实源：节点类型 / 展示信息 / 配置 Schema / 分支 / 超时重试 / 默认值
 * 全部收敛到 WorkflowNodeDefinition，前端画布、配置面板与服务端校验均由注册表派生。
 */

export type WorkflowValueType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'select'
  | 'tags'
  | 'secret'
  | 'field-select'
  | 'multi-field-select'
  | 'table-select'
  | 'condition-group'
  | 'field-map';

export interface NodeConfigField {
  /** config[key] 的 key */
  key: string;
  label: string;
  type: WorkflowValueType;
  required?: boolean;
  description?: string;
  placeholder?: string;
  default?: unknown;
  /** select / tags 的静态选项 */
  options?: Array<{ value: string; label: string }>;
  /** 敏感字段：值不回显，编辑时以占位符展示 */
  secret?: boolean;
  /** 条件显示：仅当 config[onlyFor.key] === onlyFor.value 时渲染 */
  onlyFor?: { key: string; value: unknown };
}

export interface NodeBranchPort {
  /** 分支 key，即 edge.branch 存的值、引擎 branchOutput 返回的值 */
  key: string;
  label: string;
}

export interface NodeOutputItem {
  key: string;
  description: string;
}

export interface NodeInputItem {
  key: string;
  description: string;
}

export interface WorkflowNodeDefinition<C = Record<string, unknown>> {
  type: string;
  label: string;
  category: 'trigger' | 'logic' | 'data' | 'ai' | 'notify' | 'integration';
  icon?: string;
  color?: string;
  description?: string;
  /** async：需要结果回调（resume）续跑 */
  kind: 'sync' | 'async';
  /** 单次执行超时（ms），缺省不设超时 */
  timeoutMs?: number;
  /** 失败重试次数（指数退避） */
  retries?: number;
  /** 触发器分组 */
  triggerGroup?: 'table' | 'todo' | 'tool';
  /** 画布分支端点（edge.branch / branchOutput 的取值来源） */
  branches?: NodeBranchPort[];
  /** SchemaForm 自动渲染 + 服务端配置校验 */
  configFields?: NodeConfigField[];
  /** 自定义强校验；返回错误信息或 null */
  validateConfig?(config: C): string | null;
  defaultConfig?: Partial<C>;
  outputs?: NodeOutputItem[];
  inputs?: NodeInputItem[];
}

/** 分支 key 约定（前后端唯一对齐点） */
export const BRANCH_DEFAULT = 'default';
export const BRANCH_TRUE = 'true';
export const BRANCH_FALSE = 'false';
/** switch 分支：`branch:<branchId>` */
export function switchBranchKey(branchId: string): string {
  return `branch:${branchId}`;
}
