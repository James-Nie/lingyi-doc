/**
 * 多维表工作流执行引擎（重写）
 *
 * 关键能力：
 * 1. 节点执行器注册表（NodeExecutorRegistry）按 type 分发
 * 2. 条件分支：edges[*].branch 决定下一节点（condition.if → 'true' | 'false'）
 * 3. 多入口 trigger：trigger.record_added 等节点从 variables.record 取上下文
 * 4. 历史记录：每个节点的执行写回 instance.history（含 branchOutput）
 * 5. 异常隔离：单节点失败即终止实例，错误信息持久化
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { AIWorkflowEntity } from '../entities/ai-workflow.entity';
import { AIWorkflowInstanceEntity } from '../entities/ai-workflow-instance.entity';
import type { NodeExecution, WorkflowEdge, WorkflowNode } from '../entities/ai.types';
import { AgentService } from '../ai-agent/agent.service';
import type { AuthUser } from '../../../auth/decorators/current-user.decorator';
import { NodeExecutorRegistry } from './node-registry';
import type { NodeExecContext } from './node-registry';
import {
  AiAgentExecutor,
  AiAnalyzeExecutor,
  AiClassifyExecutor,
  AiGenerateTextExecutor,
  ConditionIfExecutor,
  ConditionLegacyExecutor,
  ConditionSwitchExecutor,
  EndExecutor,
  LoopEachRecordExecutor,
  NotifyDingTalkBotExecutor,
  NotifyDingTalkEmailExecutor,
  NotifyDingTalkMessageExecutor,
  NotifyFeishuMessageExecutor,
  RecordCreateExecutor,
  RecordFindExecutor,
  RecordUpdateExecutor,
  StartLegacyExecutor,
  TriggerButtonClickedExecutor,
  TriggerCommentReceivedExecutor,
  TriggerFormSubmittedExecutor,
  TriggerManualExecutor,
  TriggerRecordAddedExecutor,
  TriggerRecordDatetimeExecutor,
  TriggerRecordDeletedExecutor,
  TriggerRecordMatchExecutor,
  TriggerRecordUpdatedExecutor,
  TriggerScheduledExecutor,
  TriggerTodoCompletedExecutor,
  TriggerWebhookExecutor,
} from './node-executors';
import { matchTriggerFilter } from './node-registry';
import { InjectDataSource } from '@nestjs/typeorm';

@Injectable()
export class WorkflowEngine {
  private readonly logger = new Logger(WorkflowEngine.name);
  readonly registry: NodeExecutorRegistry;

  constructor(
    private readonly agentService: AgentService,
    @InjectRepository(AIWorkflowInstanceEntity)
    private readonly instanceRepo: Repository<AIWorkflowInstanceEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {
    this.registry = new NodeExecutorRegistry();
    // 注册内置执行器
    this.registry.register(new StartLegacyExecutor());
    this.registry.register(new EndExecutor());
    this.registry.register(new ConditionLegacyExecutor());
    this.registry.register(new ConditionIfExecutor());
    this.registry.register(new ConditionSwitchExecutor());
    this.registry.register(new LoopEachRecordExecutor());
    this.registry.register(new AiAnalyzeExecutor());
    this.registry.register(new AiClassifyExecutor());
    this.registry.register(new AiGenerateTextExecutor());
    this.registry.register(new AiAgentExecutor());
    this.registry.register(new RecordCreateExecutor());
    this.registry.register(new RecordUpdateExecutor());
    this.registry.register(new RecordFindExecutor());
    this.registry.register(new NotifyDingTalkBotExecutor());
    this.registry.register(new NotifyDingTalkMessageExecutor());
    this.registry.register(new NotifyDingTalkEmailExecutor());
    this.registry.register(new NotifyFeishuMessageExecutor());
    this.registry.register(new TriggerRecordAddedExecutor());
    this.registry.register(new TriggerRecordUpdatedExecutor());
    this.registry.register(new TriggerRecordMatchExecutor());
    this.registry.register(new TriggerRecordDeletedExecutor());
    this.registry.register(new TriggerRecordDatetimeExecutor());
    this.registry.register(new TriggerButtonClickedExecutor());
    this.registry.register(new TriggerFormSubmittedExecutor());
    this.registry.register(new TriggerTodoCompletedExecutor());
    this.registry.register(new TriggerCommentReceivedExecutor());
    this.registry.register(new TriggerScheduledExecutor());
    this.registry.register(new TriggerWebhookExecutor());
    this.registry.register(new TriggerManualExecutor());
  }

  /**
   * 同步执行（用于 manual 触发 / API 触发的请求-响应场景）
   * 返回最终 instance
   */
  async runSync(
    workflow: AIWorkflowEntity,
    initialVariables: Record<string, unknown>,
    user: AuthUser,
  ): Promise<AIWorkflowInstanceEntity> {
    const startNode = this.getStartNode(workflow);
    const instance = await this.instanceRepo.save({
      id: uuidv4(),
      workflowId: workflow.id,
      variables: initialVariables,
      currentNodeId: startNode.id,
      history: [],
      status: 'running',
      error: null,
    });

    try {
      await this.runWorkflow(instance, workflow, user);
    } catch (error) {
      this.logger.error(`Workflow ${instance.id} failed: ${(error as Error).message}`);
    }
    return this.reload(instance.id);
  }

  /**
   * 异步执行（用于触发器订阅场景，fire-and-forget）
   */
  runAsync(
    workflow: AIWorkflowEntity,
    initialVariables: Record<string, unknown>,
    user: AuthUser,
  ): Promise<AIWorkflowInstanceEntity> {
    return this.runSync(workflow, initialVariables, user);
  }

  /**
   * 由触发器调用：把 record.changed 事件匹配 + 派发到所有匹配的工作流
   */
  async dispatchRecordChange(payload: {
    action: 'added' | 'updated' | 'deleted';
    docId: string;
    tableId: string;
    record: Record<string, unknown>;
    userId: string;
    tenantId?: string;
  }): Promise<AIWorkflowInstanceEntity[]> {
    const repo = this.dataSource.getRepository(AIWorkflowEntity);
    const workflows = await repo.find({
      where: [
        { tableId: payload.tableId, status: 'published', triggerType: 'record_added' as string },
        { tableId: payload.tableId, status: 'published', triggerType: 'record_updated' as string },
        { tableId: payload.tableId, status: 'published', triggerType: 'record_match' as string },
      ],
    });
    const matched: AIWorkflowInstanceEntity[] = [];
    for (const w of workflows) {
      if (payload.action === 'added' && w.triggerType !== 'record_added' && w.triggerType !== 'record_match') continue;
      if (payload.action === 'updated' && w.triggerType !== 'record_updated' && w.triggerType !== 'record_match') continue;
      if (!matchTriggerFilter(w.triggerFilter, payload.record)) continue;

      const user = { userId: payload.userId, currentTenantId: payload.tenantId ?? null } as AuthUser;
      const instance = await this.runAsync(
        w,
        { record: payload.record, docId: payload.docId, tableId: payload.tableId },
        user,
      );
      matched.push(instance);
    }
    return matched;
  }

  private async reload(id: string): Promise<AIWorkflowInstanceEntity> {
    const inst = await this.instanceRepo.findOne({ where: { id } });
    if (!inst) throw new Error(`Instance ${id} disappeared`);
    return inst;
  }

  private getStartNode(workflow: AIWorkflowEntity): WorkflowNode {
    const triggerLike = workflow.nodes.find(
      (n) => n.type?.startsWith('trigger.') || n.type === 'start',
    );
    if (!triggerLike) throw new Error('Workflow has no trigger/start node');
    return triggerLike;
  }

  private async runWorkflow(
    instance: AIWorkflowInstanceEntity,
    workflow: AIWorkflowEntity,
    user: AuthUser,
  ): Promise<void> {
    let currentNodeId: string | null = instance.currentNodeId;
    const variables: Record<string, unknown> = { ...(instance.variables ?? {}) };
    // 给执行节点提供的触发记录（trigger 节点把 record 写入 variables.record）
    const record = variables.record as Record<string, unknown> | undefined;

    while (currentNodeId) {
      const node = workflow.nodes.find((n) => n.id === currentNodeId);
      if (!node) {
        await this.failInstance(instance, `Node not found: ${currentNodeId}`);
        return;
      }

      const execution = await this.executeNode(node, variables, user, {
        workflowId: workflow.id,
        docId: workflow.docId ?? undefined,
        tableId: workflow.tableId ?? undefined,
        record,
      });
      instance.history = [...(instance.history ?? []), execution];
      instance.variables = variables;
      instance.currentNodeId = node.id;

      if (execution.status === 'failed') {
        instance.status = 'failed';
        instance.error = execution.error ?? 'Unknown error';
        await this.instanceRepo.save(instance);
        return;
      }

      if (node.type === 'end') {
        instance.status = 'completed';
        instance.currentNodeId = null;
        await this.instanceRepo.save(instance);
        return;
      }

      // 找匹配本节点 branchOutput 的出边
      const branch = execution.branchOutput ?? 'default';
      const edge = this.pickNextEdge(workflow, node.id, branch);
      if (!edge) {
        // 没有出边 → 流程自然结束
        instance.status = 'completed';
        instance.currentNodeId = null;
        await this.instanceRepo.save(instance);
        return;
      }
      currentNodeId = edge.targetNodeId;
      instance.currentNodeId = currentNodeId;
      await this.instanceRepo.save(instance);
    }

    // currentNodeId 变 null，自然完成
    if (instance.status === 'running') {
      instance.status = 'completed';
      await this.instanceRepo.save(instance);
    }
  }

  private pickNextEdge(
    workflow: AIWorkflowEntity,
    nodeId: string,
    branch: string,
  ): WorkflowEdge | undefined {
    const edges = (workflow.edges ?? []).filter((e) => e.sourceNodeId === nodeId);
    if (edges.length === 0) return undefined;
    // 1) 精确匹配 branch
    const exact = edges.find((e) => (e.branch ?? 'default') === branch);
    if (exact) return exact;
    // 2) 兜底匹配 default
    const def = edges.find((e) => (e.branch ?? 'default') === 'default');
    if (def) return def;
    // 3) 没有任何匹配，取第一条
    return edges[0];
  }

  private async executeNode(
    node: WorkflowNode,
    variables: Record<string, unknown>,
    user: AuthUser,
    baseCtx: Pick<NodeExecContext, 'workflowId' | 'docId' | 'tableId' | 'record'>,
  ): Promise<NodeExecution> {
    const startedAt = new Date().toISOString();
    const base: NodeExecution = {
      nodeId: node.id,
      status: 'running',
      input: { ...variables },
      startedAt,
    };

    const executor = this.registry.get(node.type);
    if (!executor) {
      return {
        ...base,
        status: 'skipped',
        output: { reason: `unknown node type: ${node.type}` },
        completedAt: new Date().toISOString(),
      };
    }

    try {
      const ctx: NodeExecContext = {
        node,
        input: { ...variables },
        variables,
        workflowId: baseCtx.workflowId,
        docId: baseCtx.docId,
        tableId: baseCtx.tableId,
        record: baseCtx.record,
        userId: user.userId,
        tenantId: user.currentTenantId ?? undefined,
      };
      const result = await executor.execute(ctx);
      if (result.output) {
        Object.assign(variables, result.output);
      }
      return {
        ...base,
        status: 'completed',
        output: result.output,
        branchOutput: result.branchOutput,
        completedAt: new Date().toISOString(),
        duration: Date.now() - new Date(startedAt).getTime(),
      };
    } catch (err) {
      return {
        ...base,
        status: 'failed',
        error: (err as Error).message,
        completedAt: new Date().toISOString(),
        duration: Date.now() - new Date(startedAt).getTime(),
      };
    }
  }

  private async failInstance(instance: AIWorkflowInstanceEntity, error: string): Promise<void> {
    instance.status = 'failed';
    instance.error = error;
    await this.instanceRepo.save(instance);
  }

  async pauseInstance(instanceId: string): Promise<AIWorkflowInstanceEntity | null> {
    const instance = await this.instanceRepo.findOne({ where: { id: instanceId } });
    if (!instance || instance.status !== 'running') return instance;
    instance.status = 'paused';
    return this.instanceRepo.save(instance);
  }

  async resumeInstance(instanceId: string): Promise<AIWorkflowInstanceEntity | null> {
    const instance = await this.instanceRepo.findOne({ where: { id: instanceId } });
    if (!instance || instance.status !== 'paused') return instance;
    instance.status = 'running';
    return this.instanceRepo.save(instance);
  }

  /** 列出某工作流的最近运行实例（用于运行日志面板） */
  async listInstances(workflowId: string, limit = 20): Promise<AIWorkflowInstanceEntity[]> {
    return this.instanceRepo.find({
      where: { workflowId },
      order: { createdAt: 'DESC' as const },
      take: limit,
    });
  }
}
