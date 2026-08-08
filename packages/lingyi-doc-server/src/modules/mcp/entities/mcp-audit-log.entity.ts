import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
} from 'typeorm';

@Entity('mcp_audit_logs')
export class McpAuditLogEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'token_id', type: 'char', length: 36 })
  tokenId!: string;

  @Column({ name: 'user_id', type: 'char', length: 36 })
  userId!: string;

  @Column({ name: 'tenant_id', type: 'char', length: 36, nullable: true })
  tenantId!: string | null;

  @Column({ type: 'varchar', length: 64 })
  method!: string;

  @Column({ name: 'tool_name', type: 'varchar', length: 64, nullable: true })
  toolName!: string | null;

  @Column({ name: 'request_summary', type: 'json', nullable: true })
  requestSummary!: unknown;

  @Column({ type: 'varchar', length: 20 })
  status!: string;

  @Column({ name: 'latency_ms', type: 'int', default: 0 })
  latencyMs!: number;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
