import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { WorkflowEdge, WorkflowNode, WorkflowTriggerFilter, WorkflowVariable } from './ai.types';

@Entity('ai_workflow')
@Index('idx_aiwf_doc_table', ['docId', 'tableId'])
@Index('idx_aiwf_status', ['status'])
export class AIWorkflowEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ type: 'json', default: () => "'[]'" })
  nodes!: WorkflowNode[];

  @Column({ type: 'json', default: () => "'[]'" })
  edges!: WorkflowEdge[];

  @Column({ type: 'json', default: () => "'[]'" })
  variables!: WorkflowVariable[];

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status!: string;

  @Column({ name: 'tenant_id', type: 'char', length: 36, nullable: true })
  tenantId!: string | null;

  @Column({ name: 'doc_id', type: 'varchar', length: 64, nullable: true })
  docId!: string | null;

  @Column({ name: 'table_id', type: 'varchar', length: 64, nullable: true })
  tableId!: string | null;

  @Column({ name: 'trigger_type', type: 'varchar', length: 32, nullable: true })
  triggerType!: string | null;

  @Column({ name: 'trigger_filter', type: 'json', nullable: true })
  triggerFilter!: WorkflowTriggerFilter | null;

  @Column({ name: 'created_by', type: 'char', length: 36 })
  createdBy!: string;

  @Column({ name: 'updated_by', type: 'char', length: 36 })
  updatedBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
