/**
 * 工作流记录读写端口（Port）
 *
 * 节点执行器只面向端口编程：读/写多维表记录走这里。
 * 默认实现 WorkflowRecordService 直接操作文档 JSON；第三方可替换为其它数据源。
 */
import type { Condition } from '../entities/ai.types';

export interface WorkflowRecordPortForRow {
  userId: string;
  tenantId?: string;
}

export interface CreateRecordInput {
  docId: string;
  tableId: string;
  /** 模板解析后的字段值（fieldId/fieldName → 纯值） */
  fieldValues: Record<string, unknown>;
  user: WorkflowRecordPortForRow;
}

export interface UpdateRecordInput {
  docId: string;
  tableId: string;
  conditions: Condition[];
  /** 模板解析后的待更新字段（fieldId/fieldName → 纯值） */
  setValues: Record<string, unknown>;
  user: WorkflowRecordPortForRow;
}

export interface FindRecordInput {
  docId: string;
  tableId: string;
  conditions: Condition[];
  limit?: number;
}

export interface WorkflowRecordPort {
  /** 新增一条记录（落库），返回新记录 id 与记录对象 */
  createRecord(input: CreateRecordInput): Promise<{ recordId: string; record: Record<string, unknown> }>;
  /** 按条件更新匹配到的记录，返回命中的记录 */
  updateRecord(input: UpdateRecordInput): Promise<{ matched: number; records: Record<string, unknown>[] }>;
  /** 按条件查找记录（fieldId 与 fieldName 双键） */
  findRecords(input: FindRecordInput): Promise<Record<string, unknown>[]>;
}