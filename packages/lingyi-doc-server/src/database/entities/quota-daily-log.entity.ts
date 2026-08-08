import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

@Entity('quota_daily_log')
export class QuotaDailyLogEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'space_kind', type: 'smallint' })
  spaceKind!: number;

  @Column({ name: 'space_id', type: 'char', length: 36 })
  spaceId!: string;

  @Column({ type: 'varchar', length: 32 })
  metric!: string;

  @Column({ name: 'log_date', type: 'date' })
  logDate!: string;

  @Column({ name: 'count_value', type: 'int', default: 0 })
  countValue!: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
