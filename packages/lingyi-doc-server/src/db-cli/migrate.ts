import { dbConnectionLabel, env } from './env';
import { applyMigrations } from './applyMigrations';
import { verifyDatabaseConnection } from './ensureDatabase';
import { closePool, getPool } from './pool';

async function runMigration(): Promise<void> {
  await verifyDatabaseConnection();

  const pool = getPool();
  await applyMigrations(pool);

  console.log('[Migrate] Incremental migrations applied successfully');
  console.log(`[Migrate] Database: ${env.db.database}@${env.db.host}:${env.db.port}`);
}

runMigration()
  .catch((err) => {
    const message = (err as Error).message || String(err);
    console.error('[Migrate] Failed:', message);
    console.error(`[Migrate] 目标: ${dbConnectionLabel()}`);
    if (message.includes('ECONNREFUSED') || message.includes('Access denied') || message.includes('Unknown database')) {
      console.error('[Migrate] 请确认 MySQL 已启动且 .env 中数据库配置正确');
    } else if (message.includes('schema_migrations')) {
      console.error('[Migrate] 请先执行: npm run db:init');
    } else {
      console.error('[Migrate] 若为全新库，可先执行 npm run db:init；已有库请检查上方 SQL 错误');
    }
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });
