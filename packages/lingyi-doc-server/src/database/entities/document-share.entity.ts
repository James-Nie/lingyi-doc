import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('doc_share')
export class DocShareEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'doc_id', type: 'varchar', length: 64 })
  docId!: string;

  @Column({ name: 'share_type', type: 'varchar', length: 20, default: 'link' })
  shareType!: string;

  @Column({ name: 'share_token', type: 'varchar', length: 64 })
  shareToken!: string;

  @Column({ name: 'permission_level', type: 'varchar', length: 20, default: 'read' })
  permissionLevel!: string;

  @Column({ name: 'expire_time', type: 'timestamp', nullable: true })
  expireTime!: Date | null;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true })
  passwordHash!: string | null;

  @Column({ name: 'ip_whitelist', type: 'json', nullable: true })
  ipWhitelist!: string[] | null;

  @Column({ name: 'allow_download', type: 'tinyint', width: 1, default: 1 })
  allowDownload!: number;

  @Column({ name: 'allow_print', type: 'tinyint', width: 1, default: 1 })
  allowPrint!: number;

  @Column({ name: 'allow_copy', type: 'tinyint', width: 1, default: 1 })
  allowCopy!: number;

  @Column({ name: 'allow_reshare', type: 'tinyint', width: 1, default: 0 })
  allowReshare!: number;

  @Column({ name: 'watermark_enabled', type: 'tinyint', width: 1, default: 0 })
  watermarkEnabled!: number;

  @Column({ type: 'tinyint', width: 1, default: 1 })
  status!: number;

  @Column({ name: 'created_by', type: 'char', length: 36 })
  createdBy!: string;

  @Column({ name: 'updated_by', type: 'char', length: 36 })
  updatedBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}

@Entity('doc_share_user')
export class DocShareUserEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'doc_id', type: 'varchar', length: 64 })
  docId!: string;

  @Column({ name: 'subject_type', type: 'varchar', length: 20, default: 'user' })
  subjectType!: string;

  @Column({ name: 'subject_id', type: 'char', length: 36 })
  subjectId!: string;

  @Column({ name: 'permission_level', type: 'varchar', length: 20, default: 'read' })
  permissionLevel!: string;

  @Column({ name: 'granted_by', type: 'char', length: 36 })
  grantedBy!: string;

  @Column({ name: 'expire_time', type: 'timestamp', nullable: true })
  expireTime!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}

@Entity('doc_share_join_request')
export class DocShareJoinRequestEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'doc_id', type: 'varchar', length: 64 })
  docId!: string;

  @Column({ name: 'applicant_id', type: 'char', length: 36 })
  applicantId!: string;

  @Column({ name: 'permission_level', type: 'varchar', length: 20, default: 'read' })
  permissionLevel!: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  message!: string | null;

  @Column({ name: 'reviewed_by', type: 'char', length: 36, nullable: true })
  reviewedBy!: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}

@Entity('doc_share_visit_log')
export class DocShareVisitLogEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'doc_id', type: 'varchar', length: 64 })
  docId!: string;

  @Column({ name: 'share_token', type: 'varchar', length: 64, nullable: true })
  shareToken!: string | null;

  @Column({ name: 'visitor_id', type: 'char', length: 36, nullable: true })
  visitorId!: string | null;

  @Column({ name: 'visitor_ip', type: 'varchar', length: 64, nullable: true })
  visitorIp!: string | null;

  @Column({ name: 'device_info', type: 'varchar', length: 500, nullable: true })
  deviceInfo!: string | null;

  @Column({ name: 'visit_status', type: 'varchar', length: 30 })
  visitStatus!: string;

  @Column({ name: 'operate_content', type: 'varchar', length: 500, nullable: true })
  operateContent!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}

@Entity('doc_share_audit_log')
export class DocShareAuditLogEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'doc_id', type: 'varchar', length: 64 })
  docId!: string;

  @Column({ name: 'operator_id', type: 'char', length: 36 })
  operatorId!: string;

  @Column({ name: 'operator_ip', type: 'varchar', length: 64, nullable: true })
  operatorIp!: string | null;

  @Column({ type: 'varchar', length: 50 })
  action!: string;

  @Column({ name: 'before_json', type: 'json', nullable: true })
  beforeJson!: Record<string, unknown> | null;

  @Column({ name: 'after_json', type: 'json', nullable: true })
  afterJson!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
