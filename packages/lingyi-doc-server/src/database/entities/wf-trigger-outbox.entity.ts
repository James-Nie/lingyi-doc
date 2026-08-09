import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('wf_trigger_outbox')
@Index('idx_wfoutbox_status_retry', ['status', 'nextRetryAt'])
export class WfTriggerOutboxEntity {
  @PrimaryGeneratedColumn('identity', { type: 'bigint' })
  id!: number;

  @Column({ name: 'doc_id', type: 'varchar', length: 64 })
  docId!: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: string;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'next_retry_at', type: 'timestamp', nullable: true })
  nextRetryAt!: Date | null;

  @Column({ name: 'entries', type: 'jsonb' })
  entries!: Record<string, unknown>[];

  @Column({ name: 'user_id', type: 'varchar', length: 64, nullable: true })
  userId!: string | null;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64, nullable: true })
  tenantId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @Column({ name: 'processed_at', type: 'timestamp', nullable: true })
  processedAt!: Date | null;
}
