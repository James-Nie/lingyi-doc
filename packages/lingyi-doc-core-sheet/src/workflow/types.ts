/**
 * 工作流核心类型定义
 * 从 server ai.types.ts 和 web api/baseWorkflow.ts 统一抽离，
 * 供 core-sheet / editor-sheet / web 三层共享。
 */

// ==================== 节点类型 ====================

export type WorkflowNodeType =
  | 'start'
  | 'end'
  | 'agent'
  | 'condition'
  | 'parallel'
  | 'loop'
  | 'tool'
  | 'human_review'
  | 'trigger.record_added'
  | 'trigger.record_updated'
  | 'trigger.record_match'
  | 'trigger.record_deleted'
  | 'trigger.record_datetime'
  | 'trigger.scheduled'
  | 'trigger.comment_received'
  | 'trigger.button_clicked'
  | 'trigger.form_submitted'
  | 'trigger.todo_completed'
  | 'trigger.webhook'
  | 'trigger.manual'
  | 'condition.if'
  | 'condition.switch'
  | 'loop.each_record'
  | 'ai.analyze'
  | 'ai.classify'
  | 'ai.generate_text'
  | 'ai.agent'
  | 'record.create'
  | 'record.update'
  | 'record.find'
  | 'notify.dingtalk_bot'
  | 'notify.dingtalk_message'
  | 'notify.dingtalk_email'
  | 'notify.feishu_message';

// ==================== 工作流图元 ====================

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  name: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  branch?: string;
  sourceHandle?: string;
}

export interface WorkflowVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  defaultValue?: unknown;
  description?: string;
}

// ==================== 条件 ====================

export interface Condition {
  field: string;
  operator:
    | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'contains'
    | 'not_contains'
    | 'is_empty'
    | 'is_not_empty'
    | 'in'
    | 'not_in';
  value?: unknown;
}

export interface ConditionGroup {
  op: 'and' | 'or';
  conditions: Condition[];
}

export type WorkflowTriggerFilter = ConditionGroup;

// ==================== 节点执行记录 ====================

export interface NodeExecution {
  nodeId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  branchOutput?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
  duration?: number;
}

// ==================== 工作流 / 实例 ====================

export type WorkflowStatus = 'draft' | 'published' | 'disabled';

export interface WorkflowData {
  id: string;
  name: string;
  description?: string | null;
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: WorkflowVariable[];
  status: WorkflowStatus;
  tenantId?: string | null;
  docId?: string | null;
  tableId?: string | null;
  triggerType?: string | null;
  triggerFilter?: WorkflowTriggerFilter | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowInstance {
  id: string;
  workflowId: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  error?: string | null;
  variables: Record<string, unknown>;
  history: NodeExecution[];
  currentNodeId?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ==================== API 输入输出 ====================

export interface CreateWorkflowInput {
  name: string;
  description?: string;
  docId?: string;
  tableId: string;
  triggerType?: string;
  triggerFilter?: WorkflowTriggerFilter | null;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
}

export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  triggerType?: string;
  triggerFilter?: WorkflowTriggerFilter | null;
  status?: string;
}

// ==================== 视图列表精简类型 ====================

export interface WorkflowItem {
  id: string;
  name: string;
  description?: string | null;
  version: number;
  status: WorkflowStatus;
  triggerType?: string | null;
  updatedAt: string;
}
