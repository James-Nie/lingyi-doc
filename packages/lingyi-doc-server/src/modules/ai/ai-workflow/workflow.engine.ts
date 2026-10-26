/**
 * 多维表工作流执行引擎（开放架构版）
 *
 * 关键能力：
 * 1. 插件化节点：通过 WorkflowNodeRegistryService 按 nodes[*].type 查表执行，
 *    不再在引擎内硬编码注册（新增节点 = 新增 provider）。
 * 2. 条件分支：edges[*].branch 决定下一节点（condition.if → 'true'/'false'；switch → branch:<id>）
 * 3. 同步/异步生命周期：async 节点返回 status='waiting'，实例挂起为 waiting；
 *    经 resume() 结果回调，从等待节点的下一节点续跑。
 * 4. 节点超时与重试：依据 WorkflowNodeDefinition.timeoutMs / retries。
 * 5. 历史记录：每个节点的执行写回 instance.history（含 branchOutput）。
 * 6. 异常隔离：单节点失败即终止实例，错误信息持久化。
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';
import { AIWorkflowEntity } from '../entities/ai-workflow.entity';
import { AIWorkflowInstanceEntity } from '../entities/ai-workflow-instance.entity';
import type { NodeExecution, WorkflowEdge, WorkflowNode } from '../entities/ai.types';
import type { AuthUser } from '../../../auth/decorators/current-user.decorator';
import { WorkflowNodeRegistryService } from './workflow-node-registry.service';
import type { NodeExecContext, NodeExecResult } from './node-registry';
import { matchTriggerFilter } from './node-registry';
import { InjectDataSource } from '@nestjs/typeorm';
import { AIWorkflowRunStepEntity } from '../../../database/entities/ai-workflow-run-step.entity';

export interface DispatchPayload {
  action: 'added' | 'updated' | 'deleted';
  docId: string;
  tableId: string;
  record: Record<string, unknown>;
  changedFields?: string[];
  userId: string;
  tenantId?: string;
  /** 'workflow:<instanceId>'：来自工作流自写，跳过触发，防止自循环 */
  source?: string;
}

/** 执行所需的流程图（可来自活定义或冻结快照） */
interface WorkflowGraph {
  workflowId: string;
  docId?: string | null;
  tableId?: string | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

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
    case 'empty': return '';
    case 'text': return v.text ?? '';
    case 'number':
    case 'boolean': return v.value;
    case 'date': return v.timestamp;
    case 'formula': return v.cached ? cellToPlainValue(v.cached) : '#CALC!';
    case 'error': return v.error ?? '';
    case 'richtext': return (v.segments ?? []).map((s) => s.text ?? '').join('');
    case 'link': return v.text || v.url || '';
    case 'image': return (v.images ?? []).length > 0 ? `[${(v.images ?? []).length}张图片]` : '';
    default: return String(value);
  }
}

@Injectable()
export class WorkflowEngine {
  private readonly logger = new Logger(WorkflowEngine.name);

  constructor(
    private readonly nodeRegistry: WorkflowNodeRegistryService,
    private readonly config: ConfigService,
    @InjectRepository(AIWorkflowInstanceEntity)
    private readonly instanceRepo: Repository<AIWorkflowInstanceEntity>,
    @InjectRepository(AIWorkflowRunStepEntity)
    private readonly stepRepo: Repository<AIWorkflowRunStepEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 同步执行（手动触发 / API 触发的请求-响应场景；async 节点会挂起为 waiting）
   */
  async runSync(
    workflow: AIWorkflowEntity,
    initialVariables: Record<string, unknown>,
    user: AuthUser,
  ): Promise<AIWorkflowInstanceEntity> {
    const startNode = this.getStartNode(graphOf(workflow));
    const record = (initialVariables.record ?? null) as Record<string, unknown> | null;
    const instance = await this.instanceRepo.save({
      id: uuidv4(),
      workflowId: workflow.id,
      docId: workflow.docId ?? null,
      tableId: workflow.tableId ?? null,
      recordId: (typeof record?._id === 'string' && record._id) ? record._id : null,
      triggerType: workflow.triggerType ?? null,
      definitionSnapshot: {
        version: workflow.version,
        nodes: workflow.nodes ?? [],
        edges: workflow.edges ?? [],
        variables: workflow.variables ?? [],
      },
      variables: initialVariables,
      currentNodeId: startNode.id,
      history: [],
      status: 'running',
      error: null,
      waitToken: null,
      waitNodeId: null,
      waitExpiresAt: null,
    });

    try {
      await this.runWorkflow(instance, graphOf(workflow), user);
    } catch (error) {
      this.logger.error(`Workflow ${instance.id} failed: ${(error as Error).message}`);
    }
    return this.reload(instance.id);
  }

  /**
   * 异步执行（触发器场景，fire-and-forget）
   */
  runAsync(
    workflow: AIWorkflowEntity,
    initialVariables: Record<string, unknown>,
    user: AuthUser,
  ): Promise<AIWorkflowInstanceEntity> {
    return this.runSync(workflow, initialVariables, user);
  }

  /**
   * 结果回调：把挂起(waiting)的实例从等待节点的下一节点续跑。
   * 使用发布时刻冻结的 definitionSnapshot（P0），避免续跑时读到已被改动的活定义。
   * result.branchOutput 可指定走哪个分支（默认 'default'）；result.payload 合并进 variables(以 lastResult 承载)。
   */
  async resume(
    instanceId: string,
    waitToken: string,
    result: { payload?: Record<string, unknown>; branchOutput?: string },
    user: AuthUser,
  ): Promise<AIWorkflowInstanceEntity | null> {
    const instance = await this.instanceRepo.findOne({ where: { id: instanceId } });
    if (!instance) return null;
    if (instance.status !== 'waiting') return null;
    if (!instance.waitToken || instance.waitToken !== waitToken) {
      throw new Error('无效的 waitToken');
    }
    if (instance.waitExpiresAt && new Date(instance.waitExpiresAt).getTime() < Date.now()) {
      instance.status = 'failed';
      instance.error = '等待超时';
      instance.waitToken = null;
      await this.instanceRepo.save(instance);
      return instance;
    }

    // P0：以冻结快照为续跑的流程定义来源；旧实例（无快照）回退读活定义
    const snapshot = instance.definitionSnapshot;
    let graph: WorkflowGraph | null = null;
    if (snapshot) {
      graph = {
        workflowId: instance.workflowId,
        docId: instance.docId,
        tableId: instance.tableId,
        nodes: snapshot.nodes ?? [],
        edges: snapshot.edges ?? [],
      };
    } else {
      const workflow = await this.dataSource
        .getRepository(AIWorkflowEntity)
        .findOne({ where: { id: instance.workflowId } });
      if (workflow) graph = graphOf(workflow);
    }
    if (!graph) {
      instance.status = 'failed';
      instance.error = '工作流定义不存在';
      await this.instanceRepo.save(instance);
      return instance;
    }

    const waitNodeId = instance.waitNodeId;
    const nowIso = new Date().toISOString();
    // 等待节点补记一条 completed（明细落 ai_workflow_run_step 子表）
    const waitStep: NodeExecution = {
      nodeId: waitNodeId ?? '',
      status: 'completed',
      input: { ...(instance.variables ?? {}) },
      output: { result: result.payload ?? {} },
      branchOutput: result.branchOutput ?? 'default',
      startedAt: nowIso,
      completedAt: nowIso,
    };
    await this.appendStep(instance.id, waitStep);
    instance.variables = { ...(instance.variables ?? {}), lastResult: result.payload ?? {} };
    instance.status = 'running';
    instance.waitToken = null;
    instance.waitNodeId = null;
    instance.waitExpiresAt = null;

    const branch = result.branchOutput ?? 'default';
    const edge = waitNodeId ? this.pickNextEdge(graph, waitNodeId, branch) : undefined;
    instance.currentNodeId = edge?.targetNodeId ?? null;
    await this.instanceRepo.save(instance);

    if (!instance.currentNodeId) {
      instance.status = 'completed';
      await this.instanceRepo.save(instance);
      return instance;
    }

    try {
      await this.runWorkflow(instance, graph, user);
    } catch (error) {
      this.logger.error(`Workflow resume ${instance.id} failed: ${(error as Error).message}`);
    }
    return this.reload(instance.id);
  }

  /**
   * 由触发器调用：把 record.changed 事件匹配 + 派发到所有匹配的工作流
   */
  async dispatchRecordChange(payload: DispatchPayload): Promise<AIWorkflowInstanceEntity[]> {
    // 来自工作流自身的变更，跳过触发（防止 record.* 自循环）
    if (payload.source?.startsWith('workflow:')) return [];

    // 匹配的触发器类型（分 table / doc 两级作用域，统一一次查询）
    const triggerTypes = ['record_added', 'record_updated', 'record_match', 'record_deleted'];

    const repo = this.dataSource.getRepository(AIWorkflowEntity);
    // P1：单一查询，避免 8 个 OR 分支无法命中 (table_id, status, trigger_type) 复合索引
    const workflows = await repo
      .createQueryBuilder('w')
      .where('w.status = :status', { status: 'published' })
      .andWhere('w.trigger_type = ANY(:triggerTypes)', {
        triggerTypes,
      })
      .andWhere('(w.doc_id = :docId OR w.table_id = :tableId)', {
        docId: payload.docId,
        tableId: payload.tableId,
      })
      .getMany();
    const matched: AIWorkflowInstanceEntity[] = [];
    for (const w of workflows) {
      const triggerNode = (w.nodes ?? []).find((n) => n.type?.startsWith('trigger.'));
      const triggerTableId =
        typeof triggerNode?.config?.tableId === 'string' && triggerNode.config.tableId
          ? triggerNode.config.tableId
          : w.tableId;
      if (triggerTableId !== payload.tableId) continue;
      if (payload.action === 'added' && w.triggerType !== 'record_added' && w.triggerType !== 'record_match') continue;
      if (payload.action === 'updated' && w.triggerType !== 'record_updated' && w.triggerType !== 'record_match') continue;
      if (payload.action === 'deleted' && w.triggerType !== 'record_deleted') continue;
      if (payload.action === 'updated') {
        const watchFields = Array.isArray(triggerNode?.config?.watchFields)
          ? (triggerNode.config.watchFields as string[])
          : [];
        if (watchFields.length > 0) {
          const changed = (payload.changedFields ?? []).filter((f) => watchFields.includes(f));
          if (changed.length === 0) continue;
        }
      }
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
   * 从 content_json 读取记录的完整字段（用于 filter 匹配时避免只依赖 changedFields）
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
      for (let ci = 0; ci < columnDefs.length; ci += 1) {
        const col = columnDefs[ci];
        const cellEntry = cells[`R${rowIdx}C${ci}`] as { value?: unknown } | undefined;
        const plain = cellToPlainValue(cellEntry?.value);
        if (col.id) record[col.id] = plain;
        if (col.name) record[col.name] = plain;
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

  /** 明细日志写入子表；stepRepo 自增 seq */
  private async appendStep(instanceId: string, execution: NodeExecution): Promise<void> {
    const seq = await this.stepRepo.count({ where: { instanceId } });
    await this.stepRepo.save({
      id: uuidv4(),
      instanceId,
      seq: seq + 1,
      nodeId: execution.nodeId,
      nodeType: null,
      status: execution.status,
      branchOutput: execution.branchOutput ?? null,
      input: execution.input ?? {},
      output: execution.output ?? null,
      error: execution.error ?? null,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt ?? null,
      duration: execution.duration ?? null,
    });
  }

  private getStartNode(graph: WorkflowGraph): WorkflowNode {
    const triggerLike = graph.nodes.find(
      (n) => n.type?.startsWith('trigger.') || n.type === 'start',
    );
    if (!triggerLike) throw new Error('Workflow has no trigger/start node');
    return triggerLike;
  }

  private async runWorkflow(
    instance: AIWorkflowInstanceEntity,
    graph: WorkflowGraph,
    user: AuthUser,
  ): Promise<void> {
    let currentNodeId: string | null = instance.currentNodeId;
    const variables: Record<string, unknown> = { ...(instance.variables ?? {}) };
    const record = variables.record as Record<string, unknown> | undefined;

    while (currentNodeId) {
      const node = graph.nodes.find((n) => n.id === currentNodeId);
      if (!node) {
        await this.failInstance(instance, `Node not found: ${currentNodeId}`);
        return;
      }

      const execution = await this.executeNode(node, variables, user, {
        workflowId: graph.workflowId,
        docId: graph.docId ?? undefined,
        tableId: graph.tableId ?? undefined,
        record,
      });
      await this.appendStep(instance.id, execution);
      instance.variables = variables;
      instance.currentNodeId = node.id;

      if (execution.status === 'failed') {
        instance.status = 'failed';
        instance.error = execution.error ?? 'Unknown error';
        await this.instanceRepo.save(instance);
        return;
      }

      // async 节点：挂起等待结果回调
      if (execution.status === 'waiting') {
        const waitInfo = (execution.output as { wait?: { token?: string; reason?: string } } | undefined)?.wait;
        const waitTimeoutMs = this.config.get<number>('workflow.waitTimeoutMs') ?? 24 * 60 * 60_000;
        instance.status = 'waiting';
        instance.waitToken = waitInfo?.token ?? null;
        instance.waitNodeId = node.id;
        instance.waitExpiresAt = new Date(Date.now() + waitTimeoutMs);
        await this.instanceRepo.save(instance);
        return;
      }

      if (node.type === 'end') {
        instance.status = 'completed';
        instance.currentNodeId = null;
        await this.instanceRepo.save(instance);
        return;
      }

      const branch = execution.branchOutput ?? 'default';
      const edge = this.pickNextEdge(graph, node.id, branch);
      if (!edge) {
        instance.status = 'completed';
        instance.currentNodeId = null;
        await this.instanceRepo.save(instance);
        return;
      }
      currentNodeId = edge.targetNodeId;
      instance.currentNodeId = currentNodeId;
      await this.instanceRepo.save(instance);
    }

    if (instance.status === 'running') {
      instance.status = 'completed';
      await this.instanceRepo.save(instance);
    }
  }

  private pickNextEdge(
    graph: Pick<WorkflowGraph, 'edges'>,
    nodeId: string,
    branch: string,
  ): WorkflowEdge | undefined {
    const edges = (graph.edges ?? []).filter((e) => e.sourceNodeId === nodeId);
    if (edges.length === 0) return undefined;
    const exact = edges.find((e) => (e.branch ?? 'default') === branch);
    if (exact) return exact;
    const def = edges.find((e) => (e.branch ?? 'default') === 'default');
    if (def) return def;
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

    const definition = this.nodeRegistry.getDefinition(node.type);
    const executor = this.nodeRegistry.getExecutor(node.type);
    if (!executor) {
      return {
        ...base,
        status: 'skipped',
        output: { reason: `unknown node type: ${node.type}` },
        completedAt: new Date().toISOString(),
      };
    }

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

    try {
      const retries = definition?.retries ?? 0;
      const timeoutMs = definition?.timeoutMs;
      let result: NodeExecResult;
      let attempt = 0;
      let lastErr: unknown;
      for (; ;) {
        try {
          const run = () => executor.execute(ctx);
          result = timeoutMs ? await withTimeout(run(), timeoutMs) : await run();
          break;
        } catch (err) {
          lastErr = err;
          if (attempt >= retries) throw err;
          attempt += 1;
          const backoff = Math.min(500 * Math.pow(2, attempt), 8000);
          this.logger.warn(`[workflow-node] ${node.type} 第 ${attempt} 次重试，${backoff}ms 后：${(err as Error).message}`);
          await new Promise((r) => setTimeout(r, backoff));
        }
      }

      if (result.output) {
        Object.assign(variables, result.output);
      }
      const isWaiting = result.status === 'waiting';
      return {
        ...base,
        status: isWaiting ? 'waiting' : 'completed',
        output: isWaiting ? { ...result.output, wait: result.wait } : result.output,
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

  /** 列出某工作流的最近运行实例（用于运行日志面板），history 由子表聚合回填 */
  async listInstances(workflowId: string, limit = 20): Promise<AIWorkflowInstanceEntity[]> {
    const instances = await this.instanceRepo.find({
      where: { workflowId },
      order: { createdAt: 'DESC' as const },
      take: limit,
    });
    await this.hydrateHistory(instances);
    return instances;
  }

  /** 读取单个实例详情并回填明细日志 */
  async getInstanceWithHistory(id: string): Promise<AIWorkflowInstanceEntity | null> {
    const instance = await this.instanceRepo.findOne({ where: { id } });
    if (!instance) return null;
    await this.hydrateHistory([instance]);
    return instance;
  }

  /** 批量按 seq 聚合子表明细回填到实例.history（保持前端契约） */
  private async hydrateHistory(instances: AIWorkflowInstanceEntity[]): Promise<void> {
    if (instances.length === 0) return;
    const ids = instances.map((i) => i.id);
    const steps = await this.stepRepo
      .createQueryBuilder('s')
      .where('s.instanceId IN (:...ids)', { ids })
      .orderBy('s.seq', 'ASC')
      .getMany();
    const byInstance = new Map<string, AIWorkflowRunStepEntity[]>();
    for (const s of steps) {
      const list = byInstance.get(s.instanceId) ?? [];
      list.push(s);
      byInstance.set(s.instanceId, list);
    }
    for (const inst of instances) {
      const list = byInstance.get(inst.id) ?? [];
      inst.history = list.map((s) => ({
        nodeId: s.nodeId,
        status: s.status,
        input: s.input ?? {},
        output: s.output ?? {},
        branchOutput: s.branchOutput ?? undefined,
        error: s.error ?? undefined,
        startedAt: s.startedAt,
        completedAt: s.completedAt ?? undefined,
        duration: s.duration ?? undefined,
      }));
    }
  }
}

/** Promise 超时包装（超时抛错） */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`节点执行超时（${timeoutMs}ms）`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function graphOf(workflow: AIWorkflowEntity): WorkflowGraph {
  return {
    workflowId: workflow.id,
    docId: workflow.docId,
    tableId: workflow.tableId,
    nodes: workflow.nodes ?? [],
    edges: workflow.edges ?? [],
  };
}