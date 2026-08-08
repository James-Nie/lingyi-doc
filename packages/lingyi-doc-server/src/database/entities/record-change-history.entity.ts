import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('record_change_history')
@Index('idx_rch_doc_record_at', ['docId', 'recordId', 'at'])
export class RecordChangeHistoryEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ name: 'doc_id', type: 'varchar', length: 64 })
  docId!: string;

  @Column({ name: 'record_id', type: 'varchar', length: 64 })
  recordId!: string;

  @Column({ name: 'sheet_id', type: 'varchar', length: 64, nullable: true })
  sheetId!: string | null;

  @Column({ type: 'bigint' })
  at!: string;

  @Column({ type: 'varchar', length: 255 })
  by!: string;

  @Column({ type: 'varchar', length: 20 })
  action!: string;

  @Column({ name: 'field_id', type: 'varchar', length: 64, nullable: true })
  fieldId!: string | null;

  @Column({ name: 'before_value', type: 'json', nullable: true })
  beforeValue!: Record<string, unknown> | null;

  @Column({ name: 'after_value', type: 'json', nullable: true })
  afterValue!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
