import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ChatMessage } from './ai.types';

@Entity('ai_agent_session')
export class AIAgentSessionEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'user_id', type: 'char', length: 36 })
  userId!: string;

  @Column({ name: 'agent_id', type: 'char', length: 36 })
  agentId!: string;

  @Column({ name: 'document_id', type: 'varchar', length: 64, nullable: true })
  documentId!: string | null;

  @Column({ type: 'json', default: () => "'[]'" })
  messages!: ChatMessage[];

  @Column({ type: 'json', default: () => "'{}'" })
  metadata!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
