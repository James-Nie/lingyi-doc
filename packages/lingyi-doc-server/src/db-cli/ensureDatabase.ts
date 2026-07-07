import mysql from 'mysql2/promise';
import { env } from './env';

function connectionConfig(database?: string) {
  return {
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    ...(database ? { database } : {}),
    multipleStatements: true,
  };
}

async function createDatabaseIfMissing(): Promise<void> {
  const conn = await mysql.createConnection(connectionConfig());
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${env.db.database}\`
       DEFAULT CHARACTER SET utf8mb4
       DEFAULT COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await conn.end();
  }
}

export async function verifyDatabaseConnection(): Promise<void> {
  const conn = await mysql.createConnection(connectionConfig(env.db.database));
  try {
    await conn.query('SELECT 1');
  } finally {
    await conn.end();
  }
}

export async function prepareDatabase(): Promise<void> {
  const createIfMissing = process.env.DB_CREATE_IF_MISSING === 'true';
  if (createIfMissing) {
    await createDatabaseIfMissing();
  }
  await verifyDatabaseConnection();
}

/** 初始化流程：确保数据库存在（可创建） */
export async function prepareDatabaseForInit(): Promise<void> {
  await createDatabaseIfMissing();
  await verifyDatabaseConnection();
}

export async function ensureDatabaseExists(): Promise<void> {
  await prepareDatabase();
}
