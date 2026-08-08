import { Pool, PoolClient, QueryResult } from 'pg';
import { env } from './env';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: env.db.database,
      max: env.db.connectionLimit,
    });
  }
  return pool;
}

type SqlParams = (string | number | boolean | null | Date | Buffer)[];

/**
 * 将 MySQL 风格的 ? 占位符转换为 PostgreSQL 的 $1, $2, ...
 * 转换时跳过引号内的 ? （字符串字面量不需要转换）
 */
export function convertPlaceholders(sql: string): string {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let paramIndex = 0;
  let result = '';

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];

    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      result += ch;
    } else if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      result += ch;
    } else if (ch === '?' && !inSingleQuote && !inDoubleQuote) {
      paramIndex++;
      result += `$${paramIndex}`;
    } else {
      result += ch;
    }
  }

  return result;
}

export async function query<T extends Record<string, any> = any>(
  sql: string,
  params?: SqlParams,
): Promise<T[]> {
  const pgSql = convertPlaceholders(sql);
  const result = await getPool().query<T>(pgSql, params);
  return result.rows;
}

export async function execute(
  sql: string,
  params?: SqlParams,
): Promise<{ rowCount: number }> {
  const pgSql = convertPlaceholders(sql);
  const result = await getPool().query(pgSql, params);
  return { rowCount: result.rowCount ?? 0 };
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
