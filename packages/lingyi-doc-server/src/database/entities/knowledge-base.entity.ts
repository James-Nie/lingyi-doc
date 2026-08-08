import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('knowledge_bases')
export class KnowledgeBaseEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ type: 'smallint', default: 2 })
  scope!: number;

  @Column({ name: 'owner_id', type: 'char', length: 36, nullable: true })
  ownerId!: string | null;

  @Column({ name: 'tenant_id', type: 'char', length: 36, nullable: true })
  tenantId!: string | null;

  @Column({ name: 'org_id', type: 'char', length: 36, nullable: true })
  orgId!: string | null;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ name: 'kb_slug', type: 'varchar', length: 32, nullable: true })
  kbSlug!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 16, default: '📘' })
  emoji!: string;

  @Column({ type: 'varchar', length: 20, default: 'blue' })
  cover!: string;

  @Column({ type: 'varchar', length: 20, default: 'members' })
  visibility!: string;

  @Column({ name: 'invite_token', type: 'varchar', length: 64, nullable: true })
  inviteToken!: string | null;

  @Column({ name: 'invite_role', type: 'varchar', length: 20, default: 'editor' })
  inviteRole!: string;

  @Column({ name: 'invite_enabled', type: 'boolean', default: true })
  inviteEnabled!: boolean;

  @Column({ name: 'created_by', type: 'char', length: 36 })
  createdBy!: string;

  @Column({ name: 'updated_by', type: 'char', length: 36 })
  updatedBy!: string;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted!: boolean;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}

@Entity('kb_nodes')
export class KbNodeEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'kb_id', type: 'char', length: 36 })
  kbId!: string;

  @Column({ name: 'parent_id', type: 'char', length: 36, nullable: true })
  parentId!: string | null;

  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @Column({ name: 'node_type', type: 'varchar', length: 20 })
  nodeType!: string;

  @Column({ name: 'doc_id', type: 'varchar', length: 64, nullable: true })
  docId!: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_home', type: 'boolean', default: false })
  isHome!: boolean;

  @Column({ name: 'created_by', type: 'char', length: 36 })
  createdBy!: string;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted!: boolean;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}

@Entity('kb_members')
export class KbMemberEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'kb_id', type: 'char', length: 36 })
  kbId!: string;

  @Column({ name: 'user_id', type: 'char', length: 36 })
  userId!: string;

  @Column({ type: 'varchar', length: 20, default: 'viewer' })
  role!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
