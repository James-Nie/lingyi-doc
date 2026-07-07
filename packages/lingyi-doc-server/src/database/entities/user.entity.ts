import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 100 })
  displayName!: string;

  @Column({ name: 'avatar_url', type: 'varchar', length: 500, nullable: true })
  avatarUrl!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 10, default: 'zh-CN' })
  locale!: string;

  @Column({ name: 'is_active', type: 'tinyint', width: 1, default: 1 })
  isActive!: number;

  @Column({ name: 'user_type', type: 'varchar', length: 20, default: 'consumer' })
  userType!: string;

  @Column({ name: 'user_source', type: 'tinyint', default: 1 })
  userSource!: number;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: string;

  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ name: 'login_fail_count', type: 'tinyint', default: 0 })
  loginFailCount!: number;

  @Column({ name: 'locked_until', type: 'timestamp', nullable: true })
  lockedUntil!: Date | null;

  @Column({ name: 'oauth_union_id', type: 'varchar', length: 128, nullable: true })
  oauthUnionId!: string | null;

  @Column({ name: 'ldap_uuid', type: 'varchar', length: 128, nullable: true })
  ldapUuid!: string | null;

  @Column({ name: 'personal_setting', type: 'json', nullable: true })
  personalSetting!: Record<string, unknown> | null;

  @Column({ name: 'personal_plan', type: 'tinyint', default: 1 })
  personalPlan!: number;

  @Column({ name: 'personal_vip_expire_at', type: 'timestamp', nullable: true })
  personalVipExpireAt!: Date | null;

  @Column({ name: 'can_create_team', type: 'tinyint', default: 0 })
  canCreateTeam!: number;

  @Column({ name: 'personal_space_slug', type: 'varchar', length: 64, nullable: true })
  personalSpaceSlug!: string | null;

  @Column({ name: 'default_book_slug', type: 'varchar', length: 32, nullable: true })
  defaultBookSlug!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
