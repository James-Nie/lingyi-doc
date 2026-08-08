/**
 * 多维表工作流触发器分发器
 *
 * 入口：base 记录写路径完成后调用 dispatchRecordChange()；
 * 行为：取本表所有 published 工作流 → 匹配 trigger_filter → runAsync 执行
 *
 * 调用约定（fire-and-forget）：
 *   await this.triggers.dispatchRecordChange({ ... }).catch(() => void 0);
 *
 * MVP 阶段先做最简实现：同步匹配 + 异步执行；后续可对接 BullMQ 解耦。
 */
import { Injectable, Logger } from '@nestjs/common';
import { WorkflowEngine } from './workflow.engine';
import { DocumentRepository } from '../../../repositories/document.repository';

export interface RecordChangePayload {
  action: 'added' | 'updated' | 'deleted';
  docId: string;
  tableId: string;
  record: Record<string, unknown>;
  userId: string;
  tenantId?: string;
}

/** 随保存请求携带的行级变更历史条目（与 document.repository 同构） */
export interface RecordHistoryDispatchEntry {
  id: string;
  recordId: string;
  sheetId?: string;
  at?: number;
  by?: string;
  action: 'create' | 'update';
  fieldId?: string;
  before?: unknown;
  after?: unknown;
}

/** 单元格值：只做判别，值体用 any 承接 DB 反序列化结果 */
interface DispatchCellValue {
  type?: string;
  text?: string;
  value?: unknown;
  timestamp?: number;
  format?: unknown;
  formula?: string;
  cached?: DispatchCellValue | null;
  error?: unknown;
  segments?: Array<{ text?: string }>;
  url?: string;
  images?: unknown[];
}

/** CellValue → 纯值（filter 用 === 比较、模板用 String() 渲染） */
function cellToPlain(value: unknown): unknown {
  if (value == null) return '';
  if (typeof value !== 'object') return value;
  const v = value as DispatchCellValue;
  switch (v.type) {
    case 'empty':
      return '';
    case 'text':
      return v.text ?? '';
    case 'number':
      return v.value;
    case 'boolean':
      return v.value;
    case 'date':
      return v.timestamp;
    case 'formula':
      return v.cached ? cellToPlain(v.cached) : '#CALC!';
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
export class WorkflowTriggerDispatcher {
  private readonly logger = new Logger(WorkflowTriggerDispatcher.name);

  constructor(
    private readonly engine: WorkflowEngine,
    private readonly documentRepository: DocumentRepository,
  ) {}

  /** 触发（不阻塞调用方） */
  dispatch(payload: RecordChangePayload): void {
    this.engine
      .dispatchRecordChange(payload)
      .then((instances) => {
        if (instances.length > 0) {
          this.logger.log(
            `dispatched ${instances.length} workflow(s) for table=${payload.tableId} action=${payload.action}`,
          );
        }
      })
      .catch((err) => {
        this.logger.error(
          `dispatch failed for table=${payload.tableId}: ${(err as Error).message}`,
        );
      });
  }

  /**
   * 从文档保存路径的 recordHistory 中识别「新建记录」，逐条分发。
   * 仅在存在 action === 'create' 的条目时触发，避免把普通字段更新也当作新记录。
   * record 同时以 fieldId（filter 匹配）与 fieldName（模板 {{record.字段名}}）为键，
   * 值为 CellValue 转纯值后的结果。
   */
  async dispatchRecordChanges(
    docId: string,
    entries: RecordHistoryDispatchEntry[] | undefined,
    user: { userId: string; tenantId?: string | null },
  ): Promise<void> {
    if (!entries || entries.length === 0) return;
    const creates = entries.filter((e) => e.action === 'create');
    if (creates.length === 0) return;

    // 收集涉及的表，读取 columnDefs 以映射 fieldId → fieldName
    const sheetIds = new Set<string>();
    for (const e of entries) if (e.sheetId) sheetIds.add(e.sheetId);
    const columnDefs = await this.loadColumnDefsBySheet(docId, Array.from(sheetIds));

    const byRecord = new Map<string, RecordHistoryDispatchEntry[]>();
    for (const e of entries) {
      if (!e.recordId) continue;
      const list = byRecord.get(e.recordId) ?? [];
      list.push(e);
      byRecord.set(e.recordId, list);
    }

    for (const [recordId, group] of byRecord) {
      const create = group.find((e) => e.action === 'create');
      if (!create) continue;
      const sheetId = create.sheetId ?? group.find((e) => e.sheetId)?.sheetId;
      if (!sheetId) continue;
      const nameById = columnDefs.get(sheetId) ?? {};
      const record: Record<string, unknown> = { _id: recordId };
      for (const e of group) {
        if (!e.fieldId) continue;
        const plain = cellToPlain(e.after);
        record[e.fieldId] = plain;
        const name = nameById[e.fieldId];
        if (name) record[name] = plain;
      }
      this.dispatch({
        action: 'added',
        docId,
        tableId: sheetId,
        record,
        userId: user.userId,
        tenantId: user.tenantId ?? undefined,
      });
    }
  }

  /** 读取文档内容，解析各 sheet 的 columnDefs id→name 映射 */
  private async loadColumnDefsBySheet(
    docId: string,
    sheetIds: string[],
  ): Promise<Map<string, Record<string, string>>> {
    const result = new Map<string, Record<string, string>>();
    if (sheetIds.length === 0) return result;
    try {
      const doc = await this.documentRepository.findMetaAndRawContent(docId);
      if (!doc?.contentJsonRaw) return result;
      const content = JSON.parse(doc.contentJsonRaw) as {
        sheets?: Array<{ id?: string; data?: { sheetId?: string; columnDefs?: Array<{ id?: string; name?: string }> } }>;
      };
      for (const s of content.sheets ?? []) {
        const sheetId = s.id ?? s.data?.sheetId;
        if (!sheetId || !sheetIds.includes(sheetId)) continue;
        const nameById: Record<string, string> = {};
        for (const col of s.data?.columnDefs ?? []) {
          if (col.id && col.name) nameById[col.id] = col.name;
        }
        result.set(sheetId, nameById);
      }
    } catch (err) {
      this.logger.warn(
        `loadColumnDefsBySheet failed for ${docId}: ${(err as Error).message}`,
      );
    }
    return result;
  }
}
