import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('crdt_oplog')
export class CrdtOplogEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'doc_id', type: 'varchar', length: 64 })
  docId!: string;

  @Column({ name: 'global_version', type: 'int' })
  globalVersion!: number;

  @Column({ name: 'op_id', type: 'varchar', length: 100 })
  opId!: string;

  @Column({ name: 'user_id', type: 'char', length: 36 })
  userId!: string;

  @Column({ name: 'op_type', type: 'varchar', length: 30 })
  opType!: string;

  @Column({ name: 'op_target', type: 'varchar', length: 200 })
  opTarget!: string;

  @Column({ name: 'op_data', type: 'json' })
  opData!: unknown;

  @Column({ type: 'json', nullable: true })
  dependencies!: unknown | null;

  @Column({ name: 'server_ts', type: 'timestamp', precision: 3, default: () => 'CURRENT_TIMESTAMP(3)' })
  serverTs!: Date;

  @Column({ name: 'client_ts', type: 'bigint', nullable: true })
  clientTs!: string | null;
}
