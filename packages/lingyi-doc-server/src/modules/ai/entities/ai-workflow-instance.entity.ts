import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { NodeExecution, WorkflowEdge, WorkflowNode } from './ai.types';

/** 发布时刻冻结的工作流定义快照（resume 续跑不再读活定义） */
export interface WorkflowDefinitionSnapshot {
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: Array<{ name: string; type: string; defaultValue?: unknown }>;
}

@Entity('ai_workflow_instance')
export class AIWorkflowInstanceEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'workflow_id', type: 'char', length: 36 })
  workflowId!: string;

  /** 触发源物化列：便于按记录/表/文档级排查，无需解析 variables JSON */
  @Column({ name: 'doc_id', type: 'varchar', length: 64, nullable: true })
  docId!: string | null;

  @Column({ name: 'table_id', type: 'varchar', length: 64, nullable: true })
  tableId!: string | null;

  @Column({ name: 'record_id', type: 'varchar', length: 64, nullable: true })
  recordId!: string | null;

  @Column({ name: 'trigger_type', type: 'varchar', length: 32, nullable: true })
  triggerType!: string | null;

  /** 发布时刻冻结的流程定义快照；缺失时（旧实例）回退读活定义 */
  @Column({ name: 'definition_snapshot', type: 'json', nullable: true })
  definitionSnapshot!: WorkflowDefinitionSnapshot | null;

  @Column({ type: 'json', default: () => "'{}'" })
  variables!: Record<string, unknown>;

  @Column({ name: 'current_node_id', type: 'varchar', length: 255, nullable: true })
  currentNodeId!: string | null;

  /** 运行摘要（仅保留统计口径；明细日志在 ai_workflow_run_step 子表） */
  @Column({ type: 'json', default: () => "'[]'" })
  history!: NodeExecution[];

  @Column({ type: 'varchar', length: 20, default: 'running' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  /** async 节点挂起凭据（结果回调 resume 需携带） */
  @Column({ name: 'wait_token', type: 'varchar', length: 64, nullable: true })
  waitToken!: string | null;

  /** 最近一个等待外部结果的节点 id */
  @Column({ name: 'wait_node_id', type: 'varchar', length: 255, nullable: true })
  waitNodeId!: string | null;

  /** 等待超时截止时间 */
  @Column({ name: 'wait_expires_at', type: 'timestamp', nullable: true })
  waitExpiresAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
