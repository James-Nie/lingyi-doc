import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('doc_templates')
export class DocTemplateEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  subtitle!: string;

  @Column({ name: 'doc_type', type: 'varchar', length: 20 })
  docType!: string;

  @Column({ name: 'document_title', type: 'varchar', length: 500 })
  documentTitle!: string;

  @Column({ type: 'json' })
  categories!: unknown;

  @Column({ name: 'usage_label', type: 'varchar', length: 100, nullable: true })
  usageLabel!: string | null;

  @Column({ name: 'is_new', type: 'tinyint', width: 1, default: 0 })
  isNew!: number;

  @Column({ name: 'is_blank', type: 'tinyint', width: 1, default: 0 })
  isBlank!: number;

  @Column({ name: 'thumb_gradient', type: 'varchar', length: 500 })
  thumbGradient!: string;

  @Column({ name: 'content_json', type: 'json', nullable: true })
  contentJson!: unknown | null;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'use_count', type: 'int', default: 0 })
  useCount!: number;

  @Column({ name: 'created_by', type: 'char', length: 36, nullable: true })
  createdBy!: string | null;

  @Column({ name: 'updated_by', type: 'char', length: 36, nullable: true })
  updatedBy!: string | null;

  @Column({ name: 'published_at', type: 'timestamp', nullable: true })
  publishedAt!: Date | null;

  @Column({ name: 'is_deleted', type: 'tinyint', width: 1, default: 0 })
  isDeleted!: number;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
