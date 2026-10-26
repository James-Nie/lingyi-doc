/**
 * 工作流记录读写实现（WorkflowRecordPort 默认适配器）
 *
 * - 直接操作 document_contents 的 workbook JSON（多维表 sheet），不经过常规保存链路，
 *   因此不会给工作流自身写入产生 outbox 触发事件，天然防止 record.* 自循环。
 * - 系统字段（createdBy/createdTime/updatedBy/updatedTime）随写入自动维护。
 * - 版本号在悲观锁事务内 +1，保证并发一致性。
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type {
  CreateRecordInput,
  UpdateRecordInput,
  FindRecordInput,
  WorkflowRecordPort,
} from './workflow-record.port';
import { evaluateCondition } from './node-registry';
import type { Condition } from '../entities/ai.types';

interface SheetDataJson {
  type?: string;
  rowCount?: number;
  columnDefs?: Array<{ id: string; name: string; type?: string }>;
  rows?: Record<string, unknown>[];
  cells?: Record<string, unknown>;
  rowHeights?: Record<string, number>;
  defaultRowHeight?: number;
}

const SYSTEM_COLUMN_TYPES = new Set(['createdBy', 'updatedBy', 'createdTime', 'updatedTime']);

function cellKey(row: number, col: number): string {
  return `R${row}C${col}`;
}

function createRecordRow(order: number, submitterName: string): Record<string, unknown> {
  const now = Date.now();
  const by = submitterName.trim() || '工作流';
  return {
    _id: `rec_${now}_${Math.random().toString(36).slice(2, 9)}`,
    _createdAt: now,
    _createdBy: by,
    _updatedAt: now,
    _updatedBy: by,
    _order: order,
    _parentId: null,
  };
}

/** 纯值 → 单元格 JSON（复用前端 CellValue 结构） */
function toCellJson(value: unknown): { value: Record<string, unknown> } | null {
  if (value == null || value === '') return null;
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v.type === 'string') return { value: v };
    return { value: { type: 'text', text: JSON.stringify(value) } };
  }
  if (typeof value === 'boolean') return { value: { type: 'boolean', value } };
  if (typeof value === 'number') return { value: { type: 'number', value } };
  if (typeof value === 'string') return { value: { type: 'text', text: value } };
  return { value: { type: 'text', text: String(value) } };
}

@Injectable()
export class WorkflowRecordService implements WorkflowRecordPort {
  private readonly logger = new Logger(WorkflowRecordService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async createRecord(
    input: CreateRecordInput,
  ): Promise<{ recordId: string; record: Record<string, unknown> }> {
    return this.dataSource.transaction(async (manager) => {
      const row = await manager.query<Array<{ id: string }>>(
        `SELECT id FROM documents WHERE id = $1 AND is_deleted = false FOR UPDATE`,
        [input.docId],
      );
      if (!row?.[0]) throw new Error(`record.create: 文档不存在 ${input.docId}`);

      const { content, sheet } = await this.readSheet(manager, input.docId, input.tableId);
      const cells = sheet.cells as Record<string, unknown>;
      const rows = sheet.rows as Record<string, unknown>[];
      const columnDefs = sheet.columnDefs ?? [];
      const rowIndex = rows.length;
      const rec = createRecordRow(rowIndex, input.user.userId);
      rec._updatedBy = input.user.userId;
      rec._createdBy = input.user.userId;
      rows.push(rec);
      sheet.rowCount = rowIndex + 1;
      if (!sheet.rowHeights) sheet.rowHeights = {};
      sheet.rowHeights[String(rowIndex)] = sheet.defaultRowHeight ?? 36;

      const resolvable = new Map<string, number>();
      columnDefs.forEach((c, ci) => {
        resolvable.set(c.id, ci);
        if (c.name) resolvable.set(c.name, ci);
      });

      for (const [key, raw] of Object.entries(input.fieldValues)) {
        const colIndex = resolvable.get(key);
        if (colIndex == null) continue;
        const cell = toCellJson(raw);
        if (cell) cells[cellKey(rowIndex, colIndex)] = cell;
      }
      this.writeSystemCells(cells, columnDefs, rowIndex, rec);

      const record = this.toRecordMap(sheet, rowIndex);
      await this.persist(manager, input.docId, content);
      return { recordId: String(rec._id), record };
    });
  }

  async updateRecord(
    input: UpdateRecordInput,
  ): Promise<{ matched: number; records: Record<string, unknown>[] }> {
    return this.dataSource.transaction(async (manager) => {
      const lrow = await manager.query<Array<{ id: string }>>(
        `SELECT id FROM documents WHERE id = $1 AND is_deleted = false FOR UPDATE`,
        [input.docId],
      );
      if (!lrow?.[0]) throw new Error(`record.update: 文档不存在 ${input.docId}`);

      const { content, sheet } = await this.readSheet(manager, input.docId, input.tableId);
      const cells = sheet.cells as Record<string, unknown>;
      const rows = sheet.rows as Record<string, unknown>[];
      const columnDefs = sheet.columnDefs ?? [];
      const resolver = new Map<string, number>();
      columnDefs.forEach((c, ci) => {
        resolver.set(c.id, ci);
        if (c.name) resolver.set(c.name, ci);
      });

      const matchedRows: number[] = [];
      rows.forEach((rec, ri) => {
        const record = this.toRecordMap(sheet, ri);
        if (input.conditions.every((c) => evaluateCondition(c, record[c.field]))) {
          matchedRows.push(ri);
        }
      });

      for (const ri of matchedRows) {
        for (const [key, raw] of Object.entries(input.setValues)) {
          const colIndex = resolver.get(key);
          if (colIndex == null) continue;
          const cell = toCellJson(raw);
          if (cell) cells[cellKey(ri, colIndex)] = cell;
        }
        const rec = rows[ri];
        if (rec) {
          rec._updatedAt = Date.now();
          rec._updatedBy = input.user.userId;
        }
        this.writeSystemCells(cells, columnDefs, ri, rows[ri] ?? {});
      }

      if (matchedRows.length > 0) await this.persist(manager, input.docId, content);
      return {
        matched: matchedRows.length,
        records: matchedRows.map((ri) => this.toRecordMap(sheet, ri)),
      };
    });
  }

  async findRecords(input: FindRecordInput): Promise<Record<string, unknown>[]> {
    const rows = await this.dataSource.query<Array<{ content_json: string | object }>>(
      `SELECT dc.content_json FROM document_contents dc WHERE dc.doc_id = $1`,
      [input.docId],
    );
    const content = parseContent(rows?.[0]?.content_json);
    const sheet = findSheet(content, input.tableId);
    if (!sheet) return [];
    const rowCount = typeof sheet.rowCount === 'number' ? sheet.rowCount : (sheet.rows?.length ?? 0);
    const result: Record<string, unknown>[] = [];
    for (let ri = 0; ri < rowCount; ri += 1) {
      const record = this.toRecordMap(sheet, ri);
      if (input.conditions.every((c) => evaluateCondition(c, record[c.field]))) {
        result.push(record);
        if (input.limit != null && result.length >= input.limit) break;
      }
    }
    return result;
  }

  /* ---------- 内部 ---------- */

  private async readSheet(
    manager: EntityManager,
    docId: string,
    tableId: string,
  ): Promise<{ content: Record<string, unknown>; sheet: SheetDataJson }> {
    const rows = await manager.query<Array<{ content_json: string | object }>>(
      `SELECT dc.content_json FROM document_contents dc WHERE dc.doc_id = $1`,
      [docId],
    );
    const content = parseContent(rows?.[0]?.content_json);
    const sheet = findSheet(content, tableId);
    if (!sheet) throw new Error(`record: 数据表不存在 ${tableId}`);
    if (sheet.type !== 'base') throw new Error(`record: ${tableId} 不是多维表`);
    if (!Array.isArray(sheet.rows)) sheet.rows = [];
    if (!sheet.cells || typeof sheet.cells !== 'object') sheet.cells = {};
    if (typeof sheet.rowCount !== 'number') sheet.rowCount = sheet.rows.length;
    return { content, sheet };
  }

  private toRecordMap(sheet: SheetDataJson, rowIndex: number): Record<string, unknown> {
    const cells = (sheet.cells ?? {}) as Record<string, unknown>;
    const columnDefs = sheet.columnDefs ?? [];
    const record: Record<string, unknown> = {};
    const rec = sheet.rows?.[rowIndex];
    if (rec && typeof rec === 'object') {
      for (const [key, val] of Object.entries(rec)) record[key] = val;
    }
    for (let ci = 0; ci < columnDefs.length; ci += 1) {
      const col = columnDefs[ci];
      const entry = cells[cellKey(rowIndex, ci)] as { type?: string; text?: string; value?: unknown; timestamp?: number; cached?: unknown; error?: unknown } | undefined;
      const plain = cellToPlain(entry?.value ?? entry);
      if (col.id) record[col.id] = plain;
      if (col.name) record[col.name] = plain;
    }
    return record;
  }

  private writeSystemCells(
    cells: Record<string, unknown>,
    columnDefs: NonNullable<SheetDataJson['columnDefs']>,
    rowIndex: number,
    rec: Record<string, unknown>,
  ): void {
    for (let ci = 0; ci < columnDefs.length; ci += 1) {
      const col = columnDefs[ci];
      if (!col.type || !SYSTEM_COLUMN_TYPES.has(col.type)) continue;
      let value: Record<string, unknown>;
      switch (col.type) {
        case 'createdBy':
          value = { type: 'text', text: String(rec._createdBy ?? '') };
          break;
        case 'updatedBy':
          value = { type: 'text', text: String(rec._updatedBy ?? '') };
          break;
        case 'createdTime':
          value = { type: 'date', timestamp: typeof rec._createdAt === 'number' ? rec._createdAt : Date.now(), format: { kind: 'datetime' } };
          break;
        case 'updatedTime':
          value = { type: 'date', timestamp: typeof rec._updatedAt === 'number' ? rec._updatedAt : Date.now(), format: { kind: 'datetime' } };
          break;
        default:
          continue;
      }
      cells[cellKey(rowIndex, ci)] = { value };
    }
  }

  private async persist(manager: EntityManager, docId: string, content: Record<string, unknown>): Promise<void> {
    const contentStr = JSON.stringify(content);
    const storageSize = Buffer.byteLength(contentStr, 'utf8');
    await manager.query(
      `UPDATE documents SET current_version = current_version + 1, content_version = content_version + 1, updated_at = now() WHERE id = $1`,
      [docId],
    );
    const upserted = await manager.query(
      `UPDATE document_contents SET content_json = $2, storage_size = $3 WHERE doc_id = $1 RETURNING doc_id`,
      [docId, contentStr, storageSize],
    );
    if (!upserted?.[0]) {
      await manager.query(
        `INSERT INTO document_contents (doc_id, content_json, storage_size, created_at, updated_at)
         VALUES ($1, $2, $3, now(), now())`,
        [docId, contentStr, storageSize],
      );
    }
  }
}

/* ---------- 纯函数 ---------- */

function parseContent(raw: string | object | undefined | null): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return raw as Record<string, unknown>;
}

function findSheet(content: Record<string, unknown>, tableId: string): SheetDataJson | undefined {
  const sheets = Array.isArray(content.sheets) ? (content.sheets as Array<{ id?: string; data?: SheetDataJson }>) : [];
  const entry = sheets.find((s) => s.id === tableId);
  if (!entry?.data) return undefined;
  return entry.data;
}

function cellToPlain(value: unknown): unknown {
  if (value == null) return '';
  if (typeof value !== 'object') return value;
  const v = value as { type?: string; text?: string; value?: unknown; timestamp?: number; format?: unknown; cached?: unknown; error?: unknown; segments?: Array<{ text?: string }>; url?: string; images?: unknown[] };
  switch (v.type) {
    case 'empty': return '';
    case 'text': return v.text ?? '';
    case 'number':
    case 'boolean': return v.value;
    case 'date': return v.timestamp;
    case 'formula': return v.cached ? cellToPlain(v.cached) : '#CALC!';
    case 'error': return v.error ?? '';
    case 'richtext': return (v.segments ?? []).map((s) => s.text ?? '').join('');
    case 'link': return v.text || v.url || '';
    case 'image': return (v.images ?? []).length > 0 ? `[${(v.images ?? []).length}张图片]` : '';
    default: return String(value);
  }
}