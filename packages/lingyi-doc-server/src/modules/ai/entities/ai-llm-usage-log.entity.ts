import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
} from 'typeorm';

@Entity('ai_llm_usage_log')
export class AILLMUsageLogEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'user_id', type: 'char', length: 36, nullable: true })
  userId!: string | null;

  @Column({ name: 'tenant_id', type: 'char', length: 36, nullable: true })
  tenantId!: string | null;

  @Column({ name: 'agent_id', type: 'char', length: 36, nullable: true })
  agentId!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'chat' })
  source!: string;

  @Column({ type: 'varchar', length: 100 })
  model!: string;

  @Column({ name: 'input_tokens', type: 'int', default: 0 })
  inputTokens!: number;

  @Column({ name: 'output_tokens', type: 'int', default: 0 })
  outputTokens!: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, default: 0 })
  cost!: string;

  @Column({ type: 'int', default: 0 })
  latency!: number;

  @Column({ type: 'varchar', length: 20, default: 'success' })
  status!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
