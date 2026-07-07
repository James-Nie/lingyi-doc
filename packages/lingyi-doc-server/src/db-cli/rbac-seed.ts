import { v4 as uuidv4 } from 'uuid';
import {
  ADMIN_ROLE_CODES,
  ALL_PERMISSIONS,
  DEFAULT_SYSTEM_CONFIGS,
  ROLE_PERMISSION_MAP,
} from '../constants/rbac';
import { execute, query } from './pool';

export async function seedRbacDefaults(): Promise<void> {
  const roleDefs = [
    { code: ADMIN_ROLE_CODES.SUPER_ADMIN, name: '超级管理员', description: '拥有全部权限' },
    { code: ADMIN_ROLE_CODES.OPERATOR, name: '运营', description: '用户与配置管理' },
    { code: ADMIN_ROLE_CODES.SUPPORT, name: '客服', description: '用户支持与密码重置' },
    { code: ADMIN_ROLE_CODES.AUDITOR, name: '审计员', description: '只读审计与报表' },
  ];

  const roleIdByCode = new Map<string, string>();

  for (const role of roleDefs) {
    const rows = await query<Array<{ id: string } & import('mysql2').RowDataPacket>>(
      'SELECT id FROM admin_roles WHERE code = ? LIMIT 1',
      [role.code],
    );
    if (rows[0]) {
      roleIdByCode.set(role.code, rows[0].id);
      continue;
    }
    const id = uuidv4();
    await execute(
      `INSERT INTO admin_roles (id, code, name, description, is_system)
       VALUES (?, ?, ?, ?, 1)`,
      [id, role.code, role.name, role.description],
    );
    roleIdByCode.set(role.code, id);
  }

  const permIdByCode = new Map<string, string>();
  for (const perm of ALL_PERMISSIONS) {
    const rows = await query<Array<{ id: string } & import('mysql2').RowDataPacket>>(
      'SELECT id FROM admin_permissions WHERE code = ? LIMIT 1',
      [perm.code],
    );
    if (rows[0]) {
      permIdByCode.set(perm.code, rows[0].id);
      continue;
    }
    const id = uuidv4();
    await execute(
      `INSERT INTO admin_permissions (id, code, name, module)
       VALUES (?, ?, ?, ?)`,
      [id, perm.code, perm.name, perm.module],
    );
    permIdByCode.set(perm.code, id);
  }

  for (const [roleCode, permCodes] of Object.entries(ROLE_PERMISSION_MAP)) {
    const roleId = roleIdByCode.get(roleCode);
    if (!roleId) continue;
    for (const permCode of permCodes) {
      const permId = permIdByCode.get(permCode);
      if (!permId) continue;
      await execute(
        `INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
         VALUES (?, ?)`,
        [roleId, permId],
      );
    }
  }
}

export async function seedSystemConfigDefaults(): Promise<void> {
  for (const item of DEFAULT_SYSTEM_CONFIGS) {
    const rows = await query<Array<{ config_key: string } & import('mysql2').RowDataPacket>>(
      'SELECT config_key FROM system_configs WHERE config_key = ? LIMIT 1',
      [item.key],
    );
    if (rows[0]) continue;
    await execute(
      `INSERT INTO system_configs (config_key, config_value, description)
       VALUES (?, ?, ?)`,
      [item.key, JSON.stringify(item.value), item.description],
    );
  }
}

export async function assignAdminRole(userId: string, roleCode: string, grantedBy: string): Promise<void> {
  const rows = await query<Array<{ id: string } & import('mysql2').RowDataPacket>>(
    'SELECT id FROM admin_roles WHERE code = ? LIMIT 1',
    [roleCode],
  );
  const roleId = rows[0]?.id;
  if (!roleId) throw new Error(`角色不存在: ${roleCode}`);
  await execute(
    `INSERT IGNORE INTO user_admin_roles (user_id, role_id, granted_by)
     VALUES (?, ?, ?)`,
    [userId, roleId, grantedBy],
  );
}
