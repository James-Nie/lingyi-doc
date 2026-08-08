import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('document_contents')
export class DocumentContentEntity {
  @PrimaryColumn({ name: 'doc_id', type: 'varchar', length: 64 })
  docId!: string;

  @Column({ name: 'content_json', type: 'json' })
  contentJson!: unknown;

  @Column({ name: 'storage_size', type: 'bigint', default: 0 })
  storageSize!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
