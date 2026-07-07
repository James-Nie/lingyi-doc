import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('documents')
export class DocumentEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @Column({ name: 'doc_slug', type: 'varchar', length: 64, nullable: true })
  docSlug!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'doc_type', type: 'varchar', length: 20, default: 'freeform' })
  docType!: string;

  @Column({ type: 'tinyint', default: 1 })
  scope!: number;

  @Column({ name: 'owner_id', type: 'char', length: 36, nullable: true })
  ownerId!: string | null;

  @Column({ name: 'tenant_id', type: 'char', length: 36, nullable: true })
  tenantId!: string | null;

  @Column({ name: 'org_id', type: 'char', length: 36, nullable: true })
  orgId!: string | null;

  @Column({ name: 'current_version', type: 'int', default: 0 })
  currentVersion!: number;

  @Column({ name: 'content_json', type: 'json', nullable: true })
  contentJson!: unknown | null;

  @Column({ name: 'storage_size', type: 'bigint', default: 0 })
  storageSize!: string;

  @Column({ name: 'last_snapshot_version', type: 'int', default: 0 })
  lastSnapshotVersion!: number;

  @Column({ name: 'last_snapshot_at', type: 'timestamp', nullable: true })
  lastSnapshotAt!: Date | null;

  @Column({ name: 'is_deleted', type: 'tinyint', width: 1, default: 0 })
  isDeleted!: number;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;

  @Column({ name: 'last_visited_at', type: 'timestamp', nullable: true })
  lastVisitedAt!: Date | null;
}
