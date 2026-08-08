import { Client } from 'pg';
import { env } from './env';

function connectionConfig(database?: string) {
  return {
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    ...(database ? { database } : {}),
  };
}

async function dropDatabaseIfExists(): Promise<void> {
  const client = new Client(connectionConfig('postgres'));
  await client.connect();
  try {
    // Terminate existing connections
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [env.db.database],
    );
    await client.query(`DROP DATABASE IF EXISTS "${env.db.database}"`);
  } finally {
    await client.end();
  }
}

async function createDatabaseIfMissing(): Promise<void> {
  const client = new Client(connectionConfig('postgres'));
  await client.connect();
  try {
    const res = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [env.db.database],
    );
    if (res.rowCount === 0) {
      // PG 标识符不能参数化，使用双引号包裹（已做白名单校验）
      await client.query(`CREATE DATABASE "${env.db.database}"`);
    }
  } finally {
    await client.end();
  }
}

export async function verifyDatabaseConnection(): Promise<void> {
  const client = new Client(connectionConfig(env.db.database));
  await client.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    await client.end();
  }
}

export async function prepareDatabase(): Promise<void> {
  const createIfMissing = process.env.DB_CREATE_IF_MISSING === 'true';
  if (createIfMissing) {
    await createDatabaseIfMissing();
  }
  await verifyDatabaseConnection();
}

/** 初始化流程：删除旧库 → 重建 → 应用完整 schema（幂等，适合开发环境重置） */
export async function prepareDatabaseForInit(): Promise<void> {
  await dropDatabaseIfExists();
  await createDatabaseIfMissing();
  await verifyDatabaseConnection();
}

export interface DatabaseState {
  exists: boolean;
  hasData: boolean;
}

/** 检查目标数据库状态：是否存在、是否已有数据（供 db:init 清除前确认） */
export async function checkDatabaseHasData(): Promise<DatabaseState> {
  const client = new Client(connectionConfig(env.db.database));
  try {
    await client.connect();
  } catch (err) {
    const message = (err as Error).message || '';
    if (message.includes('does not exist')) {
      return { exists: false, hasData: false };
    }
    throw err;
  }
  try {
    const tablesRes = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    if ((tablesRes.rowCount ?? 0) === 0) {
      return { exists: true, hasData: false };
    }
    for (const row of tablesRes.rows) {
      const tableName = row.table_name as string;
      const countRes = await client.query(`SELECT 1 FROM "${tableName}" LIMIT 1`);
      if ((countRes.rowCount ?? 0) > 0) {
        return { exists: true, hasData: true };
      }
    }
    return { exists: true, hasData: false };
  } finally {
    await client.end();
  }
}

export async function ensureDatabaseExists(): Promise<void> {
  await prepareDatabase();
}
