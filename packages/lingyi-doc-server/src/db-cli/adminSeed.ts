import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { ADMIN_ROLE_CODES } from '../constants/rbac';
import { closePool, query, execute } from './pool';
import { assignAdminRole, seedRbacDefaults, seedSystemConfigDefaults } from './rbac-seed';

const DEFAULT_TENANT_NAME = process.env.DEFAULT_TENANT_NAME || '默认企业';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || '';
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || '超级管理员';

async function adminSeed(): Promise<void> {
  await seedRbacDefaults();
  await seedSystemConfigDefaults();

  const existing = await query<{ id: string; user_type: string }>(
    'SELECT id, user_type FROM users WHERE email = $1 LIMIT 1',
    [ADMIN_EMAIL],
  );

  let userId: string;
  if (!existing[0]) {
    userId = uuidv4();
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await execute(
      `INSERT INTO users (id, email, password_hash, display_name, user_type, status)
       VALUES ($1, $2, $3, $4, 'admin', 'active')`,
      [userId, ADMIN_EMAIL, passwordHash, ADMIN_NAME],
    );
    console.log('[AdminSeed] Super admin created');
  } else {
    userId = existing[0].id;
    if (existing[0].user_type !== 'admin') {
      await execute(`UPDATE users SET user_type = 'admin' WHERE id = $1`, [userId]);
      console.log(`[AdminSeed] Upgraded ${ADMIN_EMAIL} to admin`);
    } else {
      console.log(`[AdminSeed] Admin already exists: ${ADMIN_EMAIL}`);
    }
  }

  await assignAdminRole(userId, ADMIN_ROLE_CODES.SUPER_ADMIN, userId);

  // 如果系统中没有任何租户，为 admin 用户创建一个默认租户，避免管理后台成员/角色页面报“租户不存在”
  const tenantRows = await query<{ id: string }>('SELECT id FROM tenants LIMIT 1');
  if (!tenantRows[0]) {
    const tenantId = uuidv4();
    const rootOrgId = uuidv4();
    await execute(
      `INSERT INTO tenants (id, name, status, admin_user_id, deploy_type, account_mode, is_allow_multi_switch)
       VALUES ($1, $2, 1, $3, 1, 1, true)`,
      [tenantId, DEFAULT_TENANT_NAME, userId],
    );
    await execute(
      `INSERT INTO organizations (id, tenant_id, parent_id, name, sort_order)
       VALUES ($1, $2, NULL, $3, 0)`,
      [rootOrgId, tenantId, DEFAULT_TENANT_NAME],
    );
    await execute(
      `INSERT INTO tenant_members (tenant_id, user_id, user_source, org_id, tenant_role, status)
       VALUES ($1, $2, 1, $3, 1, 1)
       ON CONFLICT (tenant_id, user_id) DO NOTHING`,
      [tenantId, userId, rootOrgId],
    );
    console.log(`[AdminSeed] Default tenant created: ${tenantId}`);
  }

  console.log('[AdminSeed] Credentials:');
  console.log(`  email:    ${ADMIN_EMAIL}`);
  console.log(`  password: ${ADMIN_PASSWORD}`);
  console.log(`  id:       ${userId}`);
}

adminSeed()
  .catch((err) => {
    console.error('[AdminSeed] Failed:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });
