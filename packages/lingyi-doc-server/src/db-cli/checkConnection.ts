import { Client } from 'pg';
import { dbConnectionLabel, env, loadEnvFiles } from './env';

async function checkConnection(): Promise<void> {
  loadEnvFiles();

  const { host, port, user, password, database } = env.db;
  console.log(`[DB] 检测连接: ${dbConnectionLabel()} (user=${user})`);

  try {
    const client = new Client({
      host,
      port,
      user,
      password,
      database,
      connectionTimeoutMillis: 10_000,
    });
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    console.log('[DB] 连接成功');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[DB] 连接失败: ${message}`);
    console.error('');
    console.error('请确认 PostgreSQL 已启动并可访问：');
    console.error('  DB_HOST=127.0.0.1');
    console.error('  DB_PORT=5432');
    console.error('  DB_USER=your_pg_user');
    console.error('  DB_PASSWORD=your_pg_password');
    console.error('  DB_NAME=lingyi_doc_db');
    console.error('  DB_CREATE_IF_MISSING=false');
    process.exit(1);
  }
}

checkConnection();
