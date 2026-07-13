import {
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('tenants')
export class TenantEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ name: 'space_slug', type: 'varchar', length: 64, nullable: true })
  spaceSlug!: string | null;

  @Column({ name: 'default_book_slug', type: 'varchar', length: 32, nullable: true })
  defaultBookSlug!: string | null;

  @Column({ type: 'tinyint', default: 1 })
  status!: number;

  @Column({ name: 'admin_user_id', type: 'char', length: 36, nullable: true })
  adminUserId!: string | null;

  @Column({ name: 'deploy_type', type: 'tinyint', default: 1 })
  deployType!: number;

  @Column({ name: 'is_physical_isolate', type: 'tinyint', default: 0 })
  isPhysicalIsolate!: number;

  @Column({ name: 'account_mode', type: 'tinyint', default: 1 })
  accountMode!: number;

  @Column({ name: 'is_allow_multi_switch', type: 'tinyint', default: 1 })
  isAllowMultiSwitch!: number;

  @Column({ name: 'db_instance_id', type: 'varchar', length: 64, nullable: true })
  dbInstanceId!: string | null;

  @Column({ name: 'storage_cluster_id', type: 'varchar', length: 64, nullable: true })
  storageClusterId!: string | null;

  @Column({ name: 'private_config', type: 'json', nullable: true })
  privateConfig!: Record<string, unknown> | null;

  @Column({ name: 'team_plan', type: 'tinyint', default: 1 })
  teamPlan!: number;

  @Column({ name: 'team_vip_expire_at', type: 'timestamp', nullable: true })
  teamVipExpireAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}

@Entity('tenant_members')
export class TenantMemberEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'char', length: 36 })
  tenantId!: string;

  @Column({ name: 'user_id', type: 'char', length: 36 })
  userId!: string;

  @Column({ name: 'user_source', type: 'tinyint', default: 1 })
  userSource!: number;

  @Column({ name: 'org_id', type: 'char', length: 36, nullable: true })
  orgId!: string | null;

  @Column({ name: 'position_id', type: 'char', length: 36, nullable: true })
  positionId!: string | null;

  @Column({ name: 'role_id', type: 'char', length: 36, nullable: true })
  roleId!: string | null;

  @Column({ name: 'employee_id', type: 'varchar', length: 64, nullable: true })
  employeeId!: string | null;

  @Column({ type: 'tinyint', nullable: true })
  gender!: number | null;

  @Column({ name: 'tenant_role', type: 'tinyint', default: 3 })
  tenantRole!: number;

  @Column({ type: 'tinyint', default: 1 })
  status!: number;

  @Column({ name: 'joined_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  joinedAt!: Date;
}

@Entity('organizations')
export class OrganizationEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'tenant_id', type: 'char', length: 36 })
  tenantId!: string;

  @Column({ name: 'parent_id', type: 'char', length: 36, nullable: true })
  parentId!: string | null;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'leader_user_id', type: 'char', length: 36, nullable: true })
  leaderUserId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}

@Entity('tenant_position_groups')
export class TenantPositionGroupEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'tenant_id', type: 'char', length: 36 })
  tenantId!: string;

  @Column({ type: 'varchar', length: 64 })
  name!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}

@Entity('tenant_positions')
export class TenantPositionEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'tenant_id', type: 'char', length: 36 })
  tenantId!: string;

  @Column({ name: 'group_id', type: 'char', length: 36 })
  groupId!: string;

  @Column({ type: 'varchar', length: 64 })
  name!: string;

  @Column({ name: 'avatar_key', type: 'varchar', length: 32, default: 'avatar_0' })
  avatarKey!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}

@Entity('tenant_roles')
export class TenantRoleEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'tenant_id', type: 'char', length: 36 })
  tenantId!: string;

  @Column({ type: 'varchar', length: 64 })
  name!: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  description!: string | null;

  @Column({ type: 'json', nullable: true })
  permissions!: string[] | null;

  @Column({ name: 'is_system', type: 'tinyint', default: 0 })
  isSystem!: number;

  @Column({ name: 'system_role', type: 'tinyint', nullable: true })
  systemRole!: number | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
