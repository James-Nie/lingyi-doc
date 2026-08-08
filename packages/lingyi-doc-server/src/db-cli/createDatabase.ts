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
      err.code === 'ECONNREFUSED'
        ? '（请确认 PostgreSQL 已启动并监听正确端口）'
        : err.code === 'ENOTFOUND'
        ? '（请核对 .env 中 DB_HOST 是否正确）'
        : '';
    console.error(`[CreateDB] Failed: ${err.message}${hint}`);
    process.exit(1);
  });
