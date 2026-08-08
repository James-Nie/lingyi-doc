/** Agent 配置 */
export interface AgentConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  tools: string[];
  knowledgeBaseId?: string;
  workflowId?: string;
}

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCallRecord[];
  toolResults?: ToolResultRecord[];
  timestamp: string;
  tokenUsage?: TokenUsage;
  metadata?: Record<string, unknown>;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResultRecord {
  toolCallId: string;
  content: string;
  isError: boolean;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** 工作流节点类型（与 ai-workflow nodes[*].type 对应） */
export type WorkflowNodeType =
  | 'start'
  | 'end'
  | 'agent'
  | 'condition'
  | 'parallel'
  | 'loop'
  | 'tool'
  | 'human_review'
  // 多维表扩展节点
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

/** 工作流节点 */
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
  /** 出口标识：condition.if → 'true' | 'false' | 'default'；
   *  condition.switch / record.find → `case:<value>` / 'default' / 'each' / 'done' */
  branch?: string;
  /** UI 端点 id，对应画布上的满足/不满足/各 case 锚点 */
  sourceHandle?: string;
}

export interface WorkflowVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  defaultValue?: unknown;
  description?: string;
}

/** 触发器筛选条件：与节点配置共享的 ConditionSchema（与 飞书同款） */
export interface ConditionGroup {
  op: 'and' | 'or';
  conditions: Condition[];
}

export interface Condition {
  field: string;
  operator:
    | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
    | 'contains' | 'not_contains' | 'is_empty' | 'is_not_empty'
    | 'in' | 'not_in';
  value?: unknown;
}

export type WorkflowTriggerFilter = ConditionGroup;

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
