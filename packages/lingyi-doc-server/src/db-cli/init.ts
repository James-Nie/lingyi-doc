import { dbConnectionLabel, env } from './env';
import { applyBaseSchema } from './applyBaseSchema';
import { prepareDatabaseForInit } from './ensureDatabase';
import { closePool, getPool } from './pool';

async function runInit(): Promise<void> {
  await prepareDatabaseForInit();

  const pool = getPool();
  await applyBaseSchema(pool);

  console.log('[Init] Full schema initialized successfully');
  console.log(`[Init] Database: ${env.db.database}@${env.db.host}:${env.db.port}`);
  console.log('[Init] 新环境无需再执行 db:migrate；已有库升级请单独运行 db:migrate');
}

runInit()
  .catch((err) => {
    console.error('[Init] Failed:', err.message);
    console.error(`[Init] 目标: ${dbConnectionLabel()}`);
    console.error('[Init] 请确认 MySQL 可连接，且账号具备 CREATE DATABASE 权限');
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });
