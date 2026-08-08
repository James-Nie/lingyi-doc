import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('doc_user_visits')
export class DocUserVisitEntity {
  @PrimaryColumn({ name: 'user_id', type: 'char', length: 36 })
  userId!: string;

  @PrimaryColumn({ name: 'doc_id', type: 'varchar', length: 64 })
  docId!: string;

  @Column({ name: 'last_visited_at', type: 'timestamp' })
  lastVisitedAt!: Date;
}
