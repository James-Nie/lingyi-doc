import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * 租户级外发与安全管控策略（P0-2）
 *
 * `doc_share` 已具备单文档级 allowDownload / allowCopy / allowPrint / watermarkEnabled 等开关；
 * 本表提供租户级「上限 / 下限」策略，由服务端在写入分享配置时做钳制，用户不可绕过。
 *
 * 缺行即取默认值，不强制预置（私有化单租户与 SaaS 多租户共用）。
 * 关联：docs/design/admin-console-p0-p1-design.md §4
 */
@Entity('tenant_security_policies')
export class TenantSecurityPolicyEntity {
  @PrimaryColumn({ name: 'tenant_id', type: 'char', length: 36 })
  tenantId!: string;

  @Column({ name: 'link_share_enabled', type: 'boolean', default: true })
  linkShareEnabled!: boolean;

  @Column({ name: 'allow_external_share', type: 'boolean', default: true })
  allowExternalShare!: boolean;

  /** 链接最长有效期（天），0 = 不限 */
  @Column({ name: 'max_expire_days', type: 'int', default: 0 })
  maxExpireDays!: number;

  @Column({ name: 'force_disable_download', type: 'boolean', default: false })
  forceDisableDownload!: boolean;

  @Column({ name: 'force_disable_copy', type: 'boolean', default: false })
  forceDisableCopy!: boolean;

  @Column({ name: 'force_disable_print', type: 'boolean', default: false })
  forceDisablePrint!: boolean;

  @Column({ name: 'force_watermark', type: 'boolean', default: false })
  forceWatermark!: boolean;

  @Column({ name: 'watermark_text', type: 'varchar', length: 200, nullable: true })
  watermarkText!: string | null;

  @Column({ name: 'require_password', type: 'boolean', default: false })
  requirePassword!: boolean;

  @Column({ name: 'updated_by', type: 'char', length: 36, nullable: true })
  updatedBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}

/**
 * 管理组（P0-3）
 *
 * 模型：权限点 → 角色 → 管理组（成员 + 角色 + 管理范围）
 * `user_admin_roles`（直接授角色）保留，语义等价于「范围 = 全平台」的管理组。
 * 对标飞书/钉钉「管理组」，同时满足等保三级 8.1.4.2 d) 最小权限与权限分离。
 */
@Entity('admin_groups')
export class AdminGroupEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /** all = 全平台范围；org = 按部门范围 */
  @Column({ name: 'scope_type', type: 'varchar', length: 10, default: 'org' })
  scopeType!: 'all' | 'org';

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem!: boolean;

  @Column({ name: 'created_by', type: 'char', length: 36, nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}

@Entity('admin_group_roles')
export class AdminGroupRoleEntity {
  @PrimaryColumn({ name: 'group_id', type: 'char', length: 36 })
  groupId!: string;

  @PrimaryColumn({ name: 'role_id', type: 'char', length: 36 })
  roleId!: string;
}

@Entity('admin_group_members')
export class AdminGroupMemberEntity {
  @PrimaryColumn({ name: 'group_id', type: 'char', length: 36 })
  groupId!: string;

  @PrimaryColumn({ name: 'user_id', type: 'char', length: 36 })
  userId!: string;

  @Column({ name: 'granted_by', type: 'char', length: 36, nullable: true })
  grantedBy!: string | null;

  @Column({ name: 'granted_at', type: 'timestamp', default: () => 'NOW()' })
  grantedAt!: Date;
}

@Entity('admin_group_orgs')
export class AdminGroupOrgEntity {
  @PrimaryColumn({ name: 'group_id', type: 'char', length: 36 })
  groupId!: string;

  @PrimaryColumn({ name: 'org_id', type: 'char', length: 36 })
  orgId!: string;

  @Column({ name: 'include_children', type: 'boolean', default: true })
  includeChildren!: boolean;
}
