import { dbConnectionLabel, env } from './env';
import { applyBaseSchema } from './applyBaseSchema';
import { checkDatabaseHasData, prepareDatabaseForInit } from './ensureDatabase';
import { closePool, getPool } from './pool';
import { confirmWithStdin } from './confirm';

const FORCE_FLAG = process.argv.includes('--yes') || process.env.DB_INIT_FORCE === 'true';

async function runInit(): Promise<void> {
  const state = await checkDatabaseHasData();

  if (state.hasData) {
    console.warn(`[Init] 目标数据库 ${dbConnectionLabel()} 已存在数据，初始化将清空全部数据！`);
    if (!FORCE_FLAG) {
      if (!process.stdin.isTTY) {
        console.error('[Init] 检测到非交互式终端，已中止。如需跳过确认请执行: DB_INIT_FORCE=true npm run db:init');
        process.exit(1);
      }
      const ok = await confirmWithStdin('确认清空并重建数据库？(y/N): ');
      if (!ok) {
        console.log('[Init] 已取消，未对数据库做任何改动');
        process.exit(0);
      }
    } else {
      console.log('[Init] 检测到 --yes / DB_INIT_FORCE=true，跳过确认');
    }
  } else {
    console.log(`[Init] 目标数据库 ${dbConnectionLabel()} 不存在或为空，直接初始化`);
  }

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
    console.error('[Init] 请确认 PostgreSQL 可连接，且账号具备 CREATE DATABASE 权限');
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });
