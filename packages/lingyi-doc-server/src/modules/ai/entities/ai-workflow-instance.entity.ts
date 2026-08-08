import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { NodeExecution } from './ai.types';

@Entity('ai_workflow_instance')
export class AIWorkflowInstanceEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'workflow_id', type: 'char', length: 36 })
  workflowId!: string;

  @Column({ type: 'json', default: () => "'{}'" })
  variables!: Record<string, unknown>;

  @Column({ name: 'current_node_id', type: 'varchar', length: 255, nullable: true })
  currentNodeId!: string | null;

  @Column({ type: 'json', default: () => "'[]'" })
  history!: NodeExecution[];

  @Column({ type: 'varchar', length: 20, default: 'running' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
