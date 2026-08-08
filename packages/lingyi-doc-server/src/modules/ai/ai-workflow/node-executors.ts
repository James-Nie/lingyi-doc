/**
 * 多维表工作流节点执行器集合（MVP）
 *
 * 设计原则：
 * - trigger 节点：把 record 注入 variables，并校验 filter
 * - condition.if：按 condition 评估，branchOutput 决定下一节点
 * - record.* 节点：调用 base 服务执行实际数据变更
 * - end 节点：终止流程
 * - ai.* / notify.* 节点：占位/后续实现
 */
import { Injectable } from '@nestjs/common';
import type {
  NodeExecContext,
  NodeExecResult,
  NodeExecutor,
} from './node-registry';
import {
  evaluateCondition,
  evaluateConditionGroup,
} from './node-registry';
import type { Condition, ConditionGroup } from '../entities/ai.types';

/** 触发器节点：把 record 注入 variables（来自 input） */
@Injectable()
export class TriggerRecordAddedExecutor implements NodeExecutor {
  type = 'trigger.record_added';
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    const record = ctx.record ?? (ctx.input.record as Record<string, unknown> | undefined);
    return {
      output: { record: record ?? null },
    };
  }
}

@Injectable()
export class TriggerRecordUpdatedExecutor implements NodeExecutor {
  type = 'trigger.record_updated';
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    const record = ctx.record ?? (ctx.input.record as Record<string, unknown> | undefined);
    return { output: { record: record ?? null } };
  }
}

@Injectable()
export class TriggerRecordMatchExecutor implements NodeExecutor {
  type = 'trigger.record_match';
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    const record = ctx.record ?? (ctx.input.record as Record<string, unknown> | undefined);
    return { output: { record: record ?? null } };
  }
}

@Injectable()
export class TriggerManualExecutor implements NodeExecutor {
  type = 'trigger.manual';
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    const record = ctx.input.record as Record<string, unknown> | undefined;
    return { output: { record: record ?? null } };
  }
}

/** 表单提交触发：把提交数据注入 variables */
@Injectable()
export class TriggerFormSubmittedExecutor implements NodeExecutor {
  type = 'trigger.form_submitted';
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    const record = ctx.input.record as Record<string, unknown> | undefined;
    return { output: { record: record ?? null } };
  }
}

/** 待办完成触发：把关联记录注入 variables */
@Injectable()
export class TriggerTodoCompletedExecutor implements NodeExecutor {
  type = 'trigger.todo_completed';
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    const record = ctx.input.record as Record<string, unknown> | undefined;
    return { output: { record: record ?? null } };
  }
}

/** 删除记录触发：把被删记录注入 variables */
@Injectable()
export class TriggerRecordDeletedExecutor implements NodeExecutor {
  type = 'trigger.record_deleted';
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    const record = ctx.record ?? (ctx.input.record as Record<string, unknown> | undefined);
    return { output: { record: record ?? null } };
  }
}

/** 到达记录时间触发：把关联记录注入 variables */
@Injectable()
export class TriggerRecordDatetimeExecutor implements NodeExecutor {
  type = 'trigger.record_datetime';
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    const record = ctx.record ?? (ctx.input.record as Record<string, unknown> | undefined);
    return { output: { record: record ?? null } };
  }
}

/** 点击按钮触发：把当前记录注入 variables */
@Injectable()
export class TriggerButtonClickedExecutor implements NodeExecutor {
  type = 'trigger.button_clicked';
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    const record = ctx.record ?? (ctx.input.record as Record<string, unknown> | undefined);
    return { output: { record: record ?? null } };
  }
}

/** 收到评论触发：把记录与评论注入 variables */
@Injectable()
export class TriggerCommentReceivedExecutor implements NodeExecutor {
  type = 'trigger.comment_received';
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    const record = ctx.record ?? (ctx.input.record as Record<string, unknown> | undefined);
    return { output: { record: record ?? null } };
  }
}

/** 定时触发：无输入，直接放行 */
@Injectable()
export class TriggerScheduledExecutor implements NodeExecutor {
  type = 'trigger.scheduled';
  async execute(_ctx: NodeExecContext): Promise<NodeExecResult> {
    return { output: {} };
  }
}

/** Webhook 触发：把推送数据注入 variables */
@Injectable()
export class TriggerWebhookExecutor implements NodeExecutor {
  type = 'trigger.webhook';
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    const record = ctx.input.record as Record<string, unknown> | undefined;
    return { output: { record: record ?? null } };
  }
}

/** 条件判断：单组 AND/OR 组合；返回 'true' / 'false' */
@Injectable()
export class ConditionIfExecutor implements NodeExecutor {
  type = 'condition.if';
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

/** 条件判断（向后兼容旧 type='condition'） */
@Injectable()
export class ConditionLegacyExecutor implements NodeExecutor {
  type = 'condition';
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    return new ConditionIfExecutor().execute(ctx);
  }
}

/** 新增记录：调用 base 服务 */
@Injectable()
export class RecordCreateExecutor implements NodeExecutor {
  type = 'record.create';
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    const cfg = ctx.node.config ?? {};
    const targetTableId = (cfg.tableId as string) || ctx.tableId;
    if (!targetTableId) {
      throw new Error('record.create: 缺少目标 tableId');
    }
    // 字段映射：config.fields = { targetField: '{{record.sourceField}}' | 静态值 }
    const fieldMap = (cfg.fields as Record<string, unknown> | undefined) ?? {};
    const record = (ctx.variables.record ?? {}) as Record<string, unknown>;
    const fieldValues: Record<string, unknown> = {};
    for (const [target, src] of Object.entries(fieldMap)) {
      fieldValues[target] = resolveTemplate(src, { record });
    }
    return {
      output: {
        action: 'create',
        targetTableId,
        fieldValues,
        // 实际写入由 WorkflowEngine 在事务里执行；此处只产出 payload
      },
    };
  }
}

/** 修改记录：按条件定位记录并更新字段 */
@Injectable()
export class RecordUpdateExecutor implements NodeExecutor {
  type = 'record.update';
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    const cfg = ctx.node.config ?? {};
    const targetTableId = (cfg.tableId as string) || ctx.tableId;
    if (!targetTableId) {
      throw new Error('record.update: 缺少目标 tableId');
    }
    const conditions = (cfg.conditions as Condition[] | undefined) ?? [];
    const fieldMap = (cfg.fields as Record<string, unknown> | undefined) ?? {};
    const record = (ctx.variables.record ?? {}) as Record<string, unknown>;
    const setValues: Record<string, unknown> = {};
    for (const [target, src] of Object.entries(fieldMap)) {
      setValues[target] = resolveTemplate(src, { record });
    }
    return {
      output: {
        action: 'update',
        targetTableId,
        conditions,
        setValues,
      },
    };
  }
}

/** 查找记录：占位实现，返回空数组；待对接 base 服务 */
@Injectable()
export class RecordFindExecutor implements NodeExecutor {
  type = 'record.find';
  async execute(_ctx: NodeExecContext): Promise<NodeExecResult> {
    return { output: { records: [] } };
  }
}

/** Switch 多分支：根据字段值返回 case:<value> */
@Injectable()
export class ConditionSwitchExecutor implements NodeExecutor {
  type = 'condition.switch';
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    const cfg = ctx.node.config ?? {};
    const field = String(cfg.field ?? '');
    const cases = (cfg.cases as Array<{ value: string; label?: string }> | undefined) ?? [];
    const record = (ctx.variables.record ?? {}) as Record<string, unknown>;
    const value = record[field];
    const matched = cases.find((c) => String(c.value) === String(value));
    return {
      output: { value, branch: matched?.value ?? null },
      branchOutput: matched ? `case:${matched.value}` : 'default',
    };
  }
}

/** 循环：占位（MVP 未启用循环） */
@Injectable()
export class LoopEachRecordExecutor implements NodeExecutor {
  type = 'loop.each_record';
  async execute(_ctx: NodeExecContext): Promise<NodeExecResult> {
    return { output: { skipped: true } };
  }
}

/** AI 节点：MVP 占位，统一返回空文本（待 LLM 网关打通后接入） */
@Injectable()
export class AiAnalyzeExecutor implements NodeExecutor {
  type = 'ai.analyze';
  async execute(_ctx: NodeExecContext): Promise<NodeExecResult> {
    return { output: { content: '' } };
  }
}

@Injectable()
export class AiClassifyExecutor implements NodeExecutor {
  type = 'ai.classify';
  async execute(_ctx: NodeExecContext): Promise<NodeExecResult> {
    return { output: { category: '' } };
  }
}

@Injectable()
export class AiGenerateTextExecutor implements NodeExecutor {
  type = 'ai.generate_text';
  async execute(_ctx: NodeExecContext): Promise<NodeExecResult> {
    return { output: { content: '' } };
  }
}

@Injectable()
export class AiAgentExecutor implements NodeExecutor {
  type = 'ai.agent';
  async execute(_ctx: NodeExecContext): Promise<NodeExecResult> {
    return { output: { content: '' } };
  }
}

/** 通知节点：MVP 占位 */
@Injectable()
export class NotifyDingTalkBotExecutor implements NodeExecutor {
  type = 'notify.dingtalk_bot';
  async execute(_ctx: NodeExecContext): Promise<NodeExecResult> {
    return { output: { sent: false, skipped: true } };
  }
}

/** 通知节点：发送钉钉消息（自定义机器人 Webhook，支持加签） */
@Injectable()
export class NotifyDingTalkMessageExecutor implements NodeExecutor {
  type = 'notify.dingtalk_message';
  async execute(ctx: NodeExecContext): Promise<NodeExecResult> {
    const cfg = (ctx.node.config ?? {}) as {
      webhook?: string;
      secret?: string;
      msgType?: 'text' | 'markdown';
      title?: string;
      body?: string;
      atMobiles?: string[];
      atAll?: boolean;
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
      payload = {
        msgtype: 'text',
        text: { content: body },
        at: { atMobiles, isAtAll: atAll },
      };
    }

    try {
      const url = await buildDingTalkWebhookUrl(webhook, cfg.secret);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const ok = res.ok && data.errcode === 0;
      return { output: { sent: ok, msgType, body, data, status: res.status } };
    } catch (err) {
      return { output: { sent: false, msgType, error: (err as Error).message } };
    }
  }
}

/** 通知节点：发送钉钉邮件（待实现） */
@Injectable()
export class NotifyDingTalkEmailExecutor implements NodeExecutor {
  type = 'notify.dingtalk_email';
  async execute(_ctx: NodeExecContext): Promise<NodeExecResult> {
    return { output: { sent: false, skipped: true } };
  }
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

@Injectable()
export class NotifyFeishuMessageExecutor implements NodeExecutor {
  type = 'notify.feishu_message';
  async execute(_ctx: NodeExecContext): Promise<NodeExecResult> {
    return { output: { sent: false, skipped: true } };
  }
}

/** 终止节点：返回分支出口 'default'，引擎据此结束 */
@Injectable()
export class EndExecutor implements NodeExecutor {
  type = 'end';
  async execute(_ctx: NodeExecContext): Promise<NodeExecResult> {
    return { output: { ended: true }, branchOutput: 'default' };
  }
}

/** 兼容旧 start 节点 */
@Injectable()
export class StartLegacyExecutor implements NodeExecutor {
  type = 'start';
  async execute(_ctx: NodeExecContext): Promise<NodeExecResult> {
    return { output: {} };
  }
}

/** 简单模板替换：`{{record.fieldName}}` */
function resolveTemplate(template: unknown, scope: Record<string, unknown>): unknown {
  if (typeof template !== 'string') return template;
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
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
