import mysql, { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { env } from './env';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: env.db.database,
      connectionLimit: env.db.connectionLimit,
      waitForConnections: true,
      queueLimit: 0,
      charset: 'utf8mb4',
      timezone: '+00:00',
      multipleStatements: true,
    });
  }
  return pool;
}

type SqlParams = (string | number | boolean | null | Date | Buffer)[];

export async function query<T extends RowDataPacket[]>(
  sql: string,
  params?: SqlParams,
): Promise<T> {
  const [rows] = await getPool().query<T>(sql, params);
  return rows;
}

export async function execute(
  sql: string,
  params?: SqlParams,
): Promise<ResultSetHeader> {
  const [result] = await getPool().execute<ResultSetHeader>(sql, params);
  return result;
}

export async function withTransaction<T>(
  fn: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
