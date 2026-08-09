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

interface CellJson {
  type?: string;
  text?: string;
  value?: unknown;
  timestamp?: number;
  format?: unknown;
  formula?: string;
  cached?: CellJson | null;
  error?: unknown;
  segments?: Array<{ text?: string }>;
  url?: string;
  images?: unknown[];
}

function cellToPlainValue(value: unknown): unknown {
  if (value == null) return '';
  if (typeof value !== 'object') return value;
  const v = value as CellJson;
  switch (v.type) {
    case 'empty':
      return '';
    case 'text':
      return v.text ?? '';
    case 'number':
    case 'boolean':
      return v.value;
    case 'date':
      return v.timestamp;
    case 'formula':
      return v.cached ? cellToPlainValue(v.cached) : '#CALC!';
    case 'error':
      return v.error ?? '';
    case 'richtext':
      return (v.segments ?? []).map((s) => s.text ?? '').join('');
    case 'link':
      return v.text || v.url || '';
    case 'image':
      return (v.images ?? []).length > 0 ? `[${(v.images ?? []).length}张图片]` : '';
    default:
      return String(value);
  }
}

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
    changedFields?: string[];
    userId: string;
    tenantId?: string;
  }): Promise<AIWorkflowInstanceEntity[]> {
    const repo = this.dataSource.getRepository(AIWorkflowEntity);
    // 按 docId 或 tableId 兜底获取候选；trigger 节点「选择数据表」可能覆盖工作流级 tableId
    const workflows = await repo.find({
      where: [
        { tableId: payload.tableId, status: 'published', triggerType: 'record_added' as string },
        { tableId: payload.tableId, status: 'published', triggerType: 'record_updated' as string },
        { tableId: payload.tableId, status: 'published', triggerType: 'record_match' as string },
        { tableId: payload.tableId, status: 'published', triggerType: 'record_deleted' as string },
        { docId: payload.docId, status: 'published', triggerType: 'record_added' as string },
        { docId: payload.docId, status: 'published', triggerType: 'record_updated' as string },
        { docId: payload.docId, status: 'published', triggerType: 'record_match' as string },
        { docId: payload.docId, status: 'published', triggerType: 'record_deleted' as string },
      ],
    });
    const matched: AIWorkflowInstanceEntity[] = [];
    for (const w of workflows) {
      // trigger 节点「选择数据表」可能覆盖工作流级 tableId
      const triggerNode = (w.nodes ?? []).find(
        (n) => n.type?.startsWith('trigger.'),
      );
      const triggerTableId =
        typeof triggerNode?.config?.tableId === 'string' && triggerNode.config.tableId
          ? triggerNode.config.tableId
          : w.tableId;
      if (triggerTableId !== payload.tableId) continue;
      if (payload.action === 'added' && w.triggerType !== 'record_added' && w.triggerType !== 'record_match') continue;
      if (payload.action === 'updated' && w.triggerType !== 'record_updated' && w.triggerType !== 'record_match') continue;
      if (payload.action === 'deleted' && w.triggerType !== 'record_deleted') continue;
      // 监听指定字段：仅当本次被修改字段与监听字段有交集时触发
      if (payload.action === 'updated') {
        const watchFields = Array.isArray(triggerNode?.config?.watchFields)
          ? (triggerNode.config.watchFields as string[])
          : [];
        if (watchFields.length > 0) {
          const changed = (payload.changedFields ?? []).filter((f) => watchFields.includes(f));
          if (changed.length === 0) continue;
        }
      }
      // 筛选条件匹配前，从 content_json 重读记录全量字段，
      // 避免只改字段 A 而 filter 条件在字段 B 时误判不触发
      let matchRecord = payload.record;
      if (payload.action === 'updated') {
        const full = await this.loadFullRecord(payload.docId, payload.tableId, String(payload.record._id ?? ''));
        if (full) matchRecord = full;
      }
      if (!matchTriggerFilter(w.triggerFilter, matchRecord)) continue;

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

  /**
   * 从 content_json 读取记录的完整字段（含未被本次变更的字段），
   * 用于 filter 匹配时不再只依赖 changedFields。
   */
  async loadFullRecord(
    docId: string,
    tableId: string,
    recordId: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const rows = await this.dataSource.query(
        `SELECT dc.content_json FROM document_contents dc WHERE dc.doc_id = $1`,
        [docId],
      );
      if (!rows?.[0]?.content_json) return null;

      const content = typeof rows[0].content_json === 'string'
        ? JSON.parse(rows[0].content_json)
        : rows[0].content_json;
      const sheets = Array.isArray(content?.sheets) ? content.sheets : [];
      const sheet = sheets.find((s: any) => s.id === tableId);
      if (!sheet?.data) return null;

      const sheetData = sheet.data;
      const rowArr = Array.isArray(sheetData.rows) ? sheetData.rows : [];
      const rowIdx = rowArr.findIndex((r: any) => r?._id === recordId);
      if (rowIdx < 0) return null;

      const columnDefs = Array.isArray(sheetData.columnDefs)
        ? (sheetData.columnDefs as Array<{ id: string; name: string; type?: string }>)
        : [];
      const cells = (sheetData.cells ?? {}) as Record<string, unknown>;

      const record: Record<string, unknown> = { _id: recordId };
      for (let ci = 0; ci < columnDefs.length; ci++) {
        const col = columnDefs[ci];
        const cellEntry = cells[`R${rowIdx}C${ci}`] as { value?: unknown } | undefined;
        const cellValue = cellEntry?.value;
        const plain = cellToPlainValue(cellValue);
        record[col.id] = plain;
        record[col.name] = plain;
      }

      return record;
    } catch (err) {
      this.logger.warn(`loadFullRecord failed: ${(err as Error).message}`);
      return null;
    }
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
