import fs from 'fs';
import path from 'path';
import type { Pool } from 'pg';
import { ensureSchemaPatches } from './ensureSchema';

function resolveMigrationsDir(): string {
  return path.join(__dirname, '../../scripts/migrations');
}

async function hasSchemaMigrationsTable(pool: Pool): Promise<boolean> {
  const result = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.TABLES
     WHERE table_schema = 'public' AND table_name = 'schema_migrations'`,
  );
  return Number(result.rows[0]?.cnt ?? 0) > 0;
}

async function isMigrationRecorded(pool: Pool, version: string): Promise<boolean> {
  if (!(await hasSchemaMigrationsTable(pool))) {
    return false;
  }
  const result = await pool.query<{ cnt: string }>(
    'SELECT COUNT(*) AS cnt FROM schema_migrations WHERE version = $1',
    [version],
  );
  return Number(result.rows[0]?.cnt ?? 0) > 0;
}

async function recordMigration(pool: Pool, version: string): Promise<void> {
  if (!(await hasSchemaMigrationsTable(pool))) {
    throw new Error('schema_migrations 表不存在，请先执行 npm run db:init');
  }
  await pool.query('INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING', [version]);
}

function isSkippableMigrationError(message: string): boolean {
  return (
    message.includes('Duplicate column') ||
    message.includes('Duplicate key name') ||
    message.includes('already exists') ||
    message.includes('already exists') ||
    message.includes('already exists') ||
    /Can't DROP/i.test(message) ||
    /column .* of relation .* already exists/i.test(message) ||
    /constraint .* already exists/i.test(message) ||
    /index .* already exists/i.test(message) ||
    /relation .* already exists/i.test(message)
  );
}

/** 应用增量迁移脚本与程序化 schema 补丁（已有库升级用；新库 db:init 已含完整 schema） */
export async function applyMigrations(pool: Pool): Promise<void> {
  const migrationsDir = resolveMigrationsDir();
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      if (await isMigrationRecorded(pool, version)) {
        console.log(`[Migrate] Skipped (already recorded): ${file}`);
        continue;
      }

      const migrationSql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      try {
        await pool.query(migrationSql);
        console.log(`[Migrate] Applied: ${file}`);
      } catch (err) {
        const message = (err as Error).message || '';
        if (isSkippableMigrationError(message)) {
          console.log(`[Migrate] Skipped (already applied): ${file}`);
          await recordMigration(pool, version);
        } else {
          throw err;
        }
      }
    }
  }

  await ensureSchemaPatches(pool);
}
