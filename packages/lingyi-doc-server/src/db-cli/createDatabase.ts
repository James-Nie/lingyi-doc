import { prepareDatabase } from './ensureDatabase';
import { env } from './env';

async function run(): Promise<void> {
  await prepareDatabase();
  const mode = process.env.DB_CREATE_IF_MISSING === 'true' ? 'created/verified' : 'verified';
  console.log(`[CreateDB] Database ${mode}: ${env.db.database}@${env.db.host}:${env.db.port}`);
}

run()
  .catch((err: NodeJS.ErrnoException) => {
    const hint =
      err.code === 'ER_ACCESS_DENIED_ERROR'
        ? '（请核对 .env 中 DB_USER/DB_PASSWORD；密码含 # 等特殊字符需加引号）'
        : '';
    console.error(`[CreateDB] Failed: ${err.message}${hint}`);
    process.exit(1);
  });
