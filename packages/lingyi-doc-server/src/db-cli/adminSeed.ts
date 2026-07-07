import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { ADMIN_ROLE_CODES } from '../constants/rbac';
import { closePool, query, execute } from './pool';
import { assignAdminRole, seedRbacDefaults, seedSystemConfigDefaults } from './rbac-seed';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'admin123456';
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || '超级管理员';

async function adminSeed(): Promise<void> {
  await seedRbacDefaults();
  await seedSystemConfigDefaults();

  const existing = await query<Array<{ id: string; user_type: string } & import('mysql2').RowDataPacket>>(
    'SELECT id, user_type FROM users WHERE email = ? LIMIT 1',
    [ADMIN_EMAIL],
  );

  let userId: string;
  if (!existing[0]) {
    userId = uuidv4();
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await execute(
      `INSERT INTO users (id, email, password_hash, display_name, user_type, status)
       VALUES (?, ?, ?, ?, 'admin', 'active')`,
      [userId, ADMIN_EMAIL, passwordHash, ADMIN_NAME],
    );
    console.log('[AdminSeed] Super admin created');
  } else {
    userId = existing[0].id;
    if (existing[0].user_type !== 'admin') {
      await execute(`UPDATE users SET user_type = 'admin' WHERE id = ?`, [userId]);
      console.log(`[AdminSeed] Upgraded ${ADMIN_EMAIL} to admin`);
    } else {
      console.log(`[AdminSeed] Admin already exists: ${ADMIN_EMAIL}`);
    }
  }

  await assignAdminRole(userId, ADMIN_ROLE_CODES.SUPER_ADMIN, userId);

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
