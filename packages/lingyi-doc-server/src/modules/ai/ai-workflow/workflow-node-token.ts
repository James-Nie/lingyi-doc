/**
 * 工作流节点插件化注册：Token 与 Provider 形态
 *
 * 第三方模块通过 `WORKFLOW_NODE_PROVIDERS` 多注入一条 provider 即可注册一类节点，
 * 核心引擎 / 模块 / 控制器零改动，真正实现「注册即插即用」。
 */
import type { ConfigService } from '@nestjs/config';
import type { NodeExecutor } from './node-registry';
import type { WorkflowNodeDefinition } from './workflow-node.types';
import type { WorkflowRecordPort } from './workflow-record.port';

export const WORKFLOW_NODE_PROVIDERS = 'WORKFLOW_NODE_PROVIDERS';

/** provider 工厂在创建执行器时可访问的外部依赖 */
export interface WorkflowNodeProviderContext {
  recordPort: WorkflowRecordPort;
  config: ConfigService;
  /** 预留：AI 节点后续接入 AgentService */
  agentService?: unknown;
}

export interface WorkflowNodeProvider<C = Record<string, unknown>> {
  definition: WorkflowNodeDefinition<C>;
  /** 用依赖创建一个执行器实例 */
  createExecutor(ctx: WorkflowNodeProviderContext): NodeExecutor;
}