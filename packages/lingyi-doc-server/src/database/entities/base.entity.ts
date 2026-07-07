import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('base_tables')
export class BaseTableEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ name: 'doc_id', type: 'varchar', length: 64 })
  docId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'column_defs', type: 'json' })
  columnDefs!: unknown;

  @Column({ type: 'json' })
  relations!: unknown;

  @Column({ type: 'json' })
  permissions!: unknown;

  @Column({ name: 'created_by', type: 'char', length: 36 })
  createdBy!: string;

  @Column({ name: 'updated_by', type: 'char', length: 36 })
  updatedBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}

@Entity('base_records')
export class BaseRecordEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ name: 'table_id', type: 'varchar', length: 64 })
  tableId!: string;

  @Column({ name: 'field_values', type: 'json' })
  fieldValues!: unknown;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ name: 'created_by', type: 'char', length: 36 })
  createdBy!: string;

  @Column({ name: 'updated_by', type: 'char', length: 36 })
  updatedBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt!: Date | null;
}

@Entity('base_views')
export class BaseViewEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ name: 'table_id', type: 'varchar', length: 64 })
  tableId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'view_type', type: 'varchar', length: 32 })
  viewType!: string;

  @Column({ type: 'json' })
  config!: unknown;

  @Column({ name: 'created_by', type: 'char', length: 36 })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
