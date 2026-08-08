import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('audit_logs')
export class AuditLogEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'operator_id', type: 'char', length: 36 })
  operatorId!: string;

  @Column({ type: 'varchar', length: 100 })
  action!: string;

  @Column({ name: 'target_type', type: 'varchar', length: 50, nullable: true })
  targetType!: string | null;

  @Column({ name: 'target_id', type: 'varchar', length: 64, nullable: true })
  targetId!: string | null;

  @Column({ type: 'json', nullable: true })
  detail!: unknown | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'NOW()' })
  createdAt!: Date;
}

@Entity('system_configs')
export class SystemConfigEntity {
  @PrimaryColumn({ name: 'config_key', type: 'varchar', length: 100 })
  configKey!: string;

  @Column({ name: 'config_value', type: 'json' })
  configValue!: unknown;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ name: 'updated_by', type: 'char', length: 36, nullable: true })
  updatedBy!: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}

@Entity('auth_sessions')
export class AuthSessionEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'user_id', type: 'char', length: 36 })
  userId!: string;

  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 64 })
  refreshTokenHash!: string;

  @Column({ name: 'client_type', type: 'varchar', length: 20 })
  clientType!: string;

  @Column({ name: 'session_context', type: 'json', nullable: true })
  sessionContext!: unknown | null;

  @Column({ name: 'device_info', type: 'varchar', length: 500, nullable: true })
  deviceInfo!: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip!: string | null;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamp', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'NOW()' })
  createdAt!: Date;
}

@Entity('demo_requests')
export class DemoRequestEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 20 })
  phone!: string;

  @Column({ type: 'varchar', length: 200 })
  company!: string;

  @Column({ name: 'company_size', type: 'varchar', length: 50 })
  companySize!: string;

  @Column({ type: 'varchar', length: 100 })
  scenario!: string;

  @Column({ type: 'json' })
  products!: unknown;

  @Column({ type: 'text' })
  questions!: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;

  @Column({ name: 'submitted_by', type: 'char', length: 36, nullable: true })
  submittedBy!: string | null;

  @Column({ name: 'contacted_at', type: 'timestamp', nullable: true })
  contactedAt!: Date | null;

  @Column({ name: 'admin_note', type: 'text', nullable: true })
  adminNote!: string | null;

  @Column({ name: 'processed_by', type: 'char', length: 36, nullable: true })
  processedBy!: string | null;

  @Column({ name: 'processed_at', type: 'timestamp', nullable: true })
  processedAt!: Date | null;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'NOW()' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'NOW()' })
  updatedAt!: Date;
}
