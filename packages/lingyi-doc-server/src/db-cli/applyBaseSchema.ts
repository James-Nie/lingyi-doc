import fs from 'fs';
import path from 'path';
import type { Pool } from 'mysql2/promise';

export function resolveInitSqlPath(): string {
  return path.join(__dirname, '../../scripts/init-db-mysql.sql');
}

/** 应用基线表结构（init-db-mysql.sql，幂等 CREATE IF NOT EXISTS） */
export async function applyBaseSchema(pool: Pool): Promise<void> {
  const sqlPath = resolveInitSqlPath();
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`Base schema file not found: ${sqlPath}`);
  }
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  await pool.query(sql);
}
