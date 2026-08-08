import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { closePool, query, execute } from './pool';

const SEED_EMAIL = process.env.SEED_CONSUMER_EMAIL || 'user@lingyidoc.com';
const SEED_PASSWORD = process.env.SEED_CONSUMER_PASSWORD || 'user123456';
const SEED_NAME = process.env.SEED_CONSUMER_NAME || '测试用户';

async function seed(): Promise<void> {
  const existing = await query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1 LIMIT 1',
    [SEED_EMAIL],
  );
  if (existing[0]) {
    console.log(`[Seed] Consumer already exists: ${SEED_EMAIL}`);
    return;
  }

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
  const id = uuidv4();
  await execute(
    `INSERT INTO users (id, email, password_hash, display_name, user_type, status)
     VALUES ($1, $2, $3, $4, 'consumer', 'active')`,
    [id, SEED_EMAIL, passwordHash, SEED_NAME],
  );

  console.log('[Seed] Default consumer created:');
  console.log(`  email:    ${SEED_EMAIL}`);
  console.log(`  password: ${SEED_PASSWORD}`);
  console.log(`  id:       ${id}`);
}

seed()
  .catch((err) => {
    console.error('[Seed] Failed:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });
