import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('schema_migrations')
export class SchemaMigrationEntity {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  version!: string;

  @Column({ name: 'applied_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  appliedAt!: Date;
}

@Entity('admin_roles')
export class AdminRoleEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'is_system', type: 'tinyint', width: 1, default: 0 })
  isSystem!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}

@Entity('admin_permissions')
export class AdminPermissionEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  code!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 50 })
  module!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}

@Entity('admin_role_permissions')
export class AdminRolePermissionEntity {
  @PrimaryColumn({ name: 'role_id', type: 'char', length: 36 })
  roleId!: string;

  @PrimaryColumn({ name: 'permission_id', type: 'char', length: 36 })
  permissionId!: string;
}

@Entity('user_admin_roles')
export class UserAdminRoleEntity {
  @PrimaryColumn({ name: 'user_id', type: 'char', length: 36 })
  userId!: string;

  @PrimaryColumn({ name: 'role_id', type: 'char', length: 36 })
  roleId!: string;

  @Column({ name: 'granted_by', type: 'char', length: 36 })
  grantedBy!: string;

  @Column({ name: 'granted_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  grantedAt!: Date;
}
