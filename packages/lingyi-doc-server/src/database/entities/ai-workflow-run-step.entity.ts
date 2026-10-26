import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';
import type { NodeExecution } from '../../modules/ai/entities/ai.types';

/**
 * 工作流运行明细日志（子表，1:N 于 ai_workflow_instance）
 *
 * history 的明细从实例 JSONB 迁出到此表：
 * - 实例行只保留轻量摘要，避免「每步全量重写不断增长的 JSONB」的写放大；
 * - 读取路径（getRun / listRuns）按 seq 聚合回 NodeExecution 保持前端契约。
 */
@Entity('ai_workflow_run_step')
@Index('idx_wfstep_instance_seq', ['instanceId', 'seq'])
export class AIWorkflowRunStepEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'instance_id', type: 'char', length: 36 })
  instanceId!: string;

  /** 实例内执行序号（从 1 递增） */
  @Column({ type: 'int' })
  seq!: number;

  @Column({ name: 'node_id', type: 'varchar', length: 255 })
  nodeId!: string;

  @Column({ name: 'node_type', type: 'varchar', length: 64, nullable: true })
  nodeType!: string | null;

  @Column({ type: 'varchar', length: 20 })
  status!: NodeExecution['status'];

  @Column({ name: 'branch_output', type: 'varchar', length: 64, nullable: true })
  branchOutput!: string | null;

  @Column({ type: 'json', default: () => "'{}'" })
  input!: Record<string, unknown>;

  @Column({ type: 'json', nullable: true })
  output!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: string;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: string | null;

  @Column({ type: 'int', nullable: true })
  duration!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}