import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('document_snapshots')
export class DocumentSnapshotEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'doc_id', type: 'varchar', length: 64 })
  docId!: string;

  @Column({ type: 'int' })
  version!: number;

  @Column({ name: 'snapshot_type', type: 'varchar', length: 20, default: 'checkpoint' })
  snapshotType!: string;

  @Column({ name: 'parent_version', type: 'int', nullable: true })
  parentVersion!: number | null;

  @Column({ name: 'snapshot_data', type: 'json', nullable: true })
  snapshotData!: unknown | null;

  @Column({ name: 'binary_ref', type: 'varchar', length: 500, nullable: true })
  binaryRef!: string | null;

  @Column({ name: 'binary_size', type: 'bigint', nullable: true })
  binarySize!: string | null;

  @Column({ name: 'is_compressed', type: 'tinyint', width: 1, default: 0 })
  isCompressed!: number;

  @Column({ name: 'content_hash', type: 'char', length: 64, nullable: true })
  contentHash!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  label!: string | null;

  @Column({ name: 'created_by', type: 'char', length: 36, nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
