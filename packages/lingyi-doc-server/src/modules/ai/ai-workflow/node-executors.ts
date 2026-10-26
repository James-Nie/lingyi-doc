/**
 * 多维表工作流 - 内置节点执行器与 Provider
 *
 * 本文件只负责「内置」节点。第三方新增节点无需改动此文件：
 * 在任意模块里向 `WORKFLOW_NODE_PROVIDERS` 多注入一条 provider 即可注册。
 *
 * 设计原则：
 * - trigger.*：把 record 注入 variables，并校验 filter
 * - condition.if：按条件求值，branchOutput 驱动下一节点（'true'/'false'）
 * - condition.switch：按分支条件命中 `branch:<branchId>` / 'default'
 * - record.*：通过 WorkflowRecordPort 真实落库（模板已解析）
 * - approval.human：async 节点示例，返回 waiting，待 resume 结果回调续跑
 * - notify / ai.*：占位或最小实现
 */
import {
  evaluateConditionGroup,
  type NodeExecContext,
  type NodeExecResult,
  type NodeExecutor,
} from './node-registry';
import type { Condition, ConditionGroup } from '../entities/ai.types';
import type { WorkflowNodeDefinition } from './workflow-node.types';
import type { WorkflowNodeProvider, WorkflowNodeProviderContext } from './workflow-node-token';
import { switchBranchKey } from './workflow-node.types';

/* ============ 触发器：把触发上下文注入 variables ============ */

class RecordInjectExecutor implements NodeExecutor {
  constructor(private readonly key: string) {}
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    const record = ctx.record ?? (ctx.input.record as Record<string, unknown> | undefined);
    return { output: { [this.key]: record ?? null } };
  }
}

class TriggerNoInputExecutor implements NodeExecutor {
  async execute(_ctx: NodeExecContext): Promise<NodeExecResult> {
    return { output: {} };
  }
}

/* ============ 条件判断 ============ */

class ConditionIfExecutor implements NodeExecutor {
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    const group = (ctx.node.config?.conditions ?? { op: 'and', conditions: [] }) as ConditionGroup;
    const record = (ctx.variables.record ?? ctx.input.record) as Record<string, unknown> | undefined;
    const matched = evaluateConditionGroup(group, record);
    return {
      output: { matched },
      branchOutput: matched ? 'true' : 'false',
    };
  }
}

class ConditionLegacyExecutor implements NodeExecutor {
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    return new ConditionIfExecutor().execute(ctx);
  }
}

/**
 * Switch 多分支：与 UI 分支模型对齐——每个分支是一组（组内 AND / 组间 OR）条件。
 * 命中顺序靠前的分支 → `branch:<branchId>`；全不命中 → 'default'。
 * development-only 备注：executionMode='all' 需并行语义，引擎现阶段按 first-match 执行。
 */
class ConditionSwitchExecutor implements NodeExecutor {
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    const cfg = ctx.node.config ?? {};
    const branches = (cfg.branches as Array<{ id: string; name?: string; groups?: ConditionGroup[] } | undefined> | undefined) ?? [];
    const record = (ctx.variables.record ?? ctx.input.record) as Record<string, unknown> | undefined;
    for (const b of branches) {
      if (!b || !b.id) continue;
      const groups = Array.isArray(b.groups) && b.groups.length ? b.groups : [cfg.conditions as ConditionGroup].filter(Boolean);
      const matched = groups.some((g) => evaluateConditionGroup(g, record));
      if (matched) {
        return { output: { matchedBranch: b.id }, branchOutput: switchBranchKey(b.id) };
      }
    }
    return { output: { matchedBranch: null }, branchOutput: 'default' };
  }
}

/* ============ 数据节点：走 WorkflowRecordPort 真实落库 ============ */

/** Hello-style：config.fields = { targetFieldId: '{{record.xxx}}' | 静态值 } */
class RecordCreateExecutor implements NodeExecutor {
  constructor(private readonly port: WorkflowRecordPortLike) {}
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    const cfg = ctx.node.config ?? {};
    const targetTableId = (cfg.tableId as string) || ctx.tableId;
    if (!targetTableId) throw new Error('record.create: 缺少目标 tableId');
    const docId = ctx.docId;
    if (!docId) throw new Error('record.create: 缺少 docId');
    const fieldMap = (cfg.fields as Record<string, unknown> | undefined) ?? {};
    const scope = { record: ctx.variables.record ?? ctx.record, ...ctx.variables };
    const fieldValues: Record<string, unknown> = {};
    for (const [target, src] of Object.entries(fieldMap)) {
      fieldValues[target] = resolveTemplate(src, scope);
    }
    const created = await this.port.createRecord({
      docId,
      tableId: targetTableId,
      fieldValues,
      user: { userId: ctx.userId, tenantId: ctx.tenantId },
    });
    return {
      output: {
        action: 'create',
        targetTableId,
        recordId: created.recordId,
        record: created.record,
      },
    };
  }
}

class RecordUpdateExecutor implements NodeExecutor {
  constructor(private readonly port: WorkflowRecordPortLike) {}
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    const cfg = ctx.node.config ?? {};
    const targetTableId = (cfg.tableId as string) || ctx.tableId;
    if (!targetTableId) throw new Error('record.update: 缺少目标 tableId');
    const docId = ctx.docId;
    if (!docId) throw new Error('record.update: 缺少 docId');
    const conditions = (cfg.conditions as Condition[] | undefined) ?? [];
    const fieldMap = (cfg.fields as Record<string, unknown> | undefined) ?? {};
    const scope = { record: ctx.variables.record ?? ctx.record, ...ctx.variables };
    const setValues: Record<string, unknown> = {};
    for (const [target, src] of Object.entries(fieldMap)) {
      setValues[target] = resolveTemplate(src, scope);
    }
    const result = await this.port.updateRecord({
      docId,
      tableId: targetTableId,
      conditions,
      setValues,
      user: { userId: ctx.userId, tenantId: ctx.tenantId },
    });
    return {
      output: {
        action: 'update',
        targetTableId,
        matched: result.matched,
        records: result.records,
      },
    };
  }
}

class RecordFindExecutor implements NodeExecutor {
  constructor(private readonly port: WorkflowRecordPortLike) {}
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    const cfg = ctx.node.config ?? {};
    const targetTableId = (cfg.tableId as string) || ctx.tableId;
    if (!targetTableId) throw new Error('record.find: 缺少目标 tableId');
    const docId = ctx.docId;
    if (!docId) throw new Error('record.find: 缺少 docId');
    const conditions = (cfg.conditions as Condition[] | undefined) ?? [];
    const records = await this.port.findRecords({
      docId,
      tableId: targetTableId,
      conditions,
      limit: typeof cfg.limit === 'number' ? cfg.limit : undefined,
    });
    return { output: { records } };
  }
}

/** 端口类型窄化（避免与完整接口耦合导致循环 import） */
type WorkflowRecordPortLike = import('./workflow-record.port').WorkflowRecordPort;

/* ============ 异步节点：等待结果回调续跑 ============ */

/**
 * approval.human —— async 节点示例。
 * 返回 waiting + waitToken，实例挂起；外部/用户调用
 * POST /api/v1/c/base/workflows/runs/:instanceId/resume 提供结果后续跑。
 */
class ApprovalHumanExecutor implements NodeExecutor {
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    const reason = String(ctx.node.config?.reason ?? '等待人工确认');
    const token = `wt_${ctx.workflowId.slice(0, 8)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      status: 'waiting',
      output: { waitStatus: 'waiting', waitToken: token },
      wait: { token, reason },
    };
  }
}

/* ============ 通知节点 ============ */

class NotifyDingTalkMessageExecutor implements NodeExecutor {
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    const cfg = (ctx.node.config ?? {}) as {
      webhook?: string; secret?: string; msgType?: 'text' | 'markdown';
      title?: string; body?: string; atMobiles?: string[]; atAll?: boolean;
    };
    const scope = { record: ctx.record, ...ctx.variables };
    const webhook = (cfg.webhook ?? '').trim();
    if (!webhook) {
      return { output: { sent: false, skipped: true, reason: 'webhook empty' } };
    }
    const msgType = cfg.msgType === 'markdown' ? 'markdown' : 'text';
    const body = String(resolveTemplate(cfg.body ?? '', scope) ?? '');
    const atMobiles = (cfg.atMobiles ?? []).filter(Boolean);
    const atAll = !!cfg.atAll;

    let payload: Record<string, unknown>;
    if (msgType === 'markdown') {
      const title = String(resolveTemplate(cfg.title ?? '', scope) ?? '');
      payload = {
        msgtype: 'markdown',
        markdown: { title: title || body.slice(0, 20), text: body },
        at: { atMobiles, isAtAll: atAll },
      };
    } else {
      payload = { msgtype: 'text', text: { content: body }, at: { atMobiles, isAtAll: atAll } };
    }

    try {
      const url = await buildDingTalkWebhookUrl(webhook, cfg.secret);
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, 10_000);
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const ok = res.ok && data.errcode === 0;
      return { output: { sent: ok, msgType, body, data, status: res.status } };
    } catch (err) {
      return { output: { sent: false, msgType, error: (err as Error).message } };
    }
  }
}

class NotifyStubExecutor implements NodeExecutor {
  constructor(private readonly label: string) {}
  async execute(_ctx: NodeExecContext): Promise<NodeExecResult> {
    return { output: { sent: false, skipped: true, reason: `${this.label} 待接入` } };
  }
}

/* ============ AI 节点：占位，P1 接通 AgentService ============ */

class AiStubExecutor implements NodeExecutor {
  constructor(private readonly label: string) {}
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    const prompt = String(ctx.node.config?.prompt ?? '');
    return { output: { content: '', skipped: true, reason: `${this.label} 待接入 LLM`, prompt } };
  }
}

/* ============ 终止 / 兼容节点 ============ */

class EndExecutor implements NodeExecutor {
  async execute(_ctx: NodeExecContext): Promise<NodeExecResult> {
    return { output: { ended: true }, branchOutput: 'default' };
  }
}

class StartLegacyExecutor implements NodeExecutor {
  async execute(_ctx: NodeExecContext): Promise<NodeExecResult> {
    return { output: {} };
  }
}

class LoopEachRecordExecutor implements NodeExecutor {
  async execute(_ctx: NodeExecContext): Promise<NodeExecResult> {
    return { output: { skipped: true, reason: 'loop 需并行语义，MVP 未启用' } };
  }
}

/* ============ 内置 Provider 组装 ============ */

type ExecutorFactory = (ctx: WorkflowNodeProviderContext) => NodeExecutor;

function provider<C = Record<string, unknown>>(
  definition: Omit<WorkflowNodeDefinition<C>, 'kind'> & { kind?: WorkflowNodeDefinition<C>['kind'] },
  createExecutor: ExecutorFactory,
): WorkflowNodeProvider<C> {
  return {
    definition: {
      ...definition,
      kind: definition.kind ?? 'sync',
      category: definition.category ?? 'integration',
    } as WorkflowNodeDefinition<C>,
    createExecutor,
  };
}

/** 所有内置节点 Provider */
export function builtInNodeProviders(ctx: WorkflowNodeProviderContext): WorkflowNodeProvider[] {
  const f = (fn: ExecutorFactory): ExecutorFactory => fn;

  const triggerProviders: WorkflowNodeProvider[] = [
    ['trigger.record_added', '创建记录时', 'table'],
    ['trigger.record_updated', '记录变更时', 'table'],
    ['trigger.record_match', '记录满足条件时', 'table'],
    ['trigger.record_deleted', '删除记录时', 'table'],
    ['trigger.record_datetime', '到达记录时间时', 'table'],
    ['trigger.button_clicked', '点击按钮时', 'table'],
    ['trigger.form_submitted', '表单提交时', 'table'],
    ['trigger.comment_received', '收到评论时', 'table'],
    ['trigger.todo_completed', '待办完成时', 'todo'],
    ['trigger.scheduled', '定时触发', 'tool'],
    ['trigger.webhook', 'Webhook 触发', 'tool'],
    ['trigger.manual', '手动触发', 'tool'],
  ].map(([type, label, triggerGroup]) =>
    provider({ type, label, category: 'trigger', icon: '⚡', color: '#ff7a45', triggerGroup: triggerGroup as any, configFields: [] },
      f(() => new RecordInjectExecutor('record'))),
  );

  return [
    ...triggerProviders,
    provider({
      type: 'condition.if', label: '条件判断 (If/Else)', category: 'logic', icon: '🔀', color: '#5b5c61',
      branches: [{ key: 'true', label: '满足' }, { key: 'false', label: '不满足' }],
      configFields: [{ key: 'conditions', label: '条件', type: 'condition-group' }],
      defaultConfig: { conditions: { op: 'and', conditions: [] } },
    }, f(() => new ConditionIfExecutor())),
    provider({ type: 'condition', label: '条件判断（兼容旧版）', category: 'logic' }, f(() => new ConditionLegacyExecutor())),
    provider({
      type: 'condition.switch', label: '多分支 (Switch)', category: 'logic', icon: '🌿', color: '#5b5c61',
      configFields: [{ key: 'branches', label: '分支列表', type: 'condition-group' }],
      defaultConfig: { executionMode: 'first', branches: [{ id: 'branch-1', name: '分支 1', groups: [{ op: 'and', conditions: [] }] }] },
    }, f(() => new ConditionSwitchExecutor())),
    provider({ type: 'loop.each_record', label: '循环', category: 'logic' }, f(() => new LoopEachRecordExecutor())),
    provider({
      type: 'record.create', label: '新增记录', category: 'data', icon: '➕', color: '#00b96b',
      configFields: [
        { key: 'tableId', label: '目标数据表', type: 'table-select' },
        { key: 'fields', label: '字段映射', type: 'field-map' },
      ],
      defaultConfig: { tableId: '', fields: {} },
    }, f(() => new RecordCreateExecutor(ctx.recordPort))),
    provider({
      type: 'record.update', label: '修改记录', category: 'data', icon: '✏️', color: '#00b96b',
      configFields: [
        { key: 'tableId', label: '目标数据表', type: 'table-select' },
        { key: 'conditions', label: '匹配条件', type: 'condition-group' },
        { key: 'fields', label: '要更新的字段', type: 'field-map' },
      ],
      defaultConfig: { tableId: '', conditions: [], fields: {} },
    }, f(() => new RecordUpdateExecutor(ctx.recordPort))),
    provider({
      type: 'record.find', label: '查找记录', category: 'data', icon: '🔍', color: '#00b96b',
      configFields: [{ key: 'conditions', label: '查找条件', type: 'condition-group' }],
      defaultConfig: { conditions: [] },
    }, f(() => new RecordFindExecutor(ctx.recordPort))),
    provider({
      type: 'ai.analyze', label: 'AI 分析', category: 'ai', icon: '✨',
      configFields: [{ key: 'prompt', label: 'Prompt', type: 'textarea' }],
      timeoutMs: 60_000,
    }, f(() => new AiStubExecutor('AI 分析'))),
    provider({
      type: 'ai.classify', label: 'AI 分类', category: 'ai', icon: '🏷️',
      configFields: [
        { key: 'prompt', label: 'Prompt', type: 'textarea' },
        { key: 'categories', label: '分类选项', type: 'tags' },
      ],
      timeoutMs: 60_000,
    }, f(() => new AiStubExecutor('AI 分类'))),
    provider({
      type: 'ai.generate_text', label: 'AI 生成文本', category: 'ai', icon: '📝',
      configFields: [{ key: 'prompt', label: 'Prompt', type: 'textarea' }],
      timeoutMs: 60_000,
    }, f(() => new AiStubExecutor('AI 生成文本'))),
    provider({
      type: 'ai.agent', label: 'AI Agent', category: 'ai', icon: '🤖',
      configFields: [{ key: 'prompt', label: 'Prompt', type: 'textarea' }],
      timeoutMs: 120_000,
    }, f(() => new AiStubExecutor('AI Agent'))),
    provider({
      type: 'notify.dingtalk_message', label: '发送钉钉消息', category: 'notify', icon: '💬', color: '#0075FF',
      timeoutMs: 15_000,
      configFields: [
        { key: 'webhook', label: '钉钉机器人 Webhook', type: 'secret', required: true },
        { key: 'secret', label: '加签密钥', type: 'secret' },
        { key: 'msgType', label: '消息类型', type: 'select', options: [{ value: 'text', label: '文本' }, { value: 'markdown', label: 'Markdown' }], default: 'text' },
        { key: 'title', label: '标题', type: 'text', onlyFor: { key: 'msgType', value: 'markdown' } },
        { key: 'body', label: '消息内容', type: 'textarea', required: true },
        { key: 'atMobiles', label: '@ 指定成员', type: 'tags' },
        { key: 'atAll', label: '@ 所有人', type: 'boolean', default: false },
      ],
      defaultConfig: { webhook: '', secret: '', msgType: 'text', title: '', body: '', atMobiles: [], atAll: false },
    }, f(() => new NotifyDingTalkMessageExecutor())),
    provider({ type: 'notify.dingtalk_bot', label: '发送钉钉群机器人消息', category: 'notify' }, f(() => new NotifyStubExecutor('钉钉机器人'))),
    provider({ type: 'notify.dingtalk_email', label: '发送钉钉邮件', category: 'notify' }, f(() => new NotifyStubExecutor('钉钉邮件'))),
    provider({ type: 'notify.feishu_message', label: '发送飞书消息', category: 'notify' }, f(() => new NotifyStubExecutor('飞书消息'))),
    provider({
      type: 'approval.human', label: '人工确认', category: 'integration', icon: '🖐️', kind: 'async',
      description: '挂起流程等待人工确认，通过 API 回调结果后继续执行',
      configFields: [{ key: 'reason', label: '等待原因', type: 'text', placeholder: '等待人工确认' }],
      outputs: [{ key: 'result', description: '回调传入的结果对象' }],
    }, f(() => new ApprovalHumanExecutor())),
    provider({ type: 'end', label: '结束', category: 'logic' }, f(() => new EndExecutor())),
    provider({ type: 'start', label: '开始（兼容旧版）', category: 'logic' }, f(() => new StartLegacyExecutor())),
  ];
}

/* ============ 工具函数 ============ */

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

/** 钉钉机器人加签：timestamp + "\n" + secret → HMAC-SHA256 → base64 → urlencode */
async function buildDingTalkWebhookUrl(webhook: string, secret?: string): Promise<string> {
  if (!secret) return webhook;
  const timestamp = Date.now();
  const stringToSign = `${timestamp}\n${secret}`;
  const { createHmac } = await import('node:crypto');
  const sign = createHmac('sha256', secret)
    .update(stringToSign, 'utf8')
    .digest()
    .toString('base64');
  const encoded = encodeURIComponent(sign);
  const sep = webhook.includes('?') ? '&' : '?';
  return `${webhook}${sep}timestamp=${timestamp}&sign=${encoded}`;
}

/** 简单模板替换：`{{record.fieldName}}`（支持中文字段名与多级路径） */
function resolveTemplate(template: unknown, scope: Record<string, unknown>): unknown {
  if (typeof template !== 'string') return template;
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, path: string) => {
    const parts = path.split('.');
    let cur: unknown = scope;
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[p];
      } else {
        return '';
      }
    }
    return cur == null ? '' : String(cur);
  });
}