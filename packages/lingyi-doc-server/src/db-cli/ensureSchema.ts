import type { Pool } from 'mysql2/promise';
import { env } from './env';
import { getPool } from './pool';

async function columnExists(pool: Pool, table: string, column: string): Promise<boolean> {
  const [rows] = await pool.query<Array<{ cnt: number } & import('mysql2').RowDataPacket>>(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [env.db.database, table, column],
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function indexExists(pool: Pool, table: string, index: string): Promise<boolean> {
  const [rows] = await pool.query<Array<{ cnt: number } & import('mysql2').RowDataPacket>>(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [env.db.database, table, index],
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

export async function ensureSchemaPatches(pool?: Pool): Promise<void> {
  const db = pool ?? getPool();

  if (!(await columnExists(db, 'documents', 'last_visited_at'))) {
    await db.query(
      `ALTER TABLE documents
       ADD COLUMN last_visited_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at`,
    );
    console.log('[Schema] Added column documents.last_visited_at');
  }

  if (!(await indexExists(db, 'documents', 'idx_documents_last_visited'))) {
    await db.query(
      `CREATE INDEX idx_documents_last_visited ON documents (last_visited_at DESC)`,
    );
    console.log('[Schema] Added index idx_documents_last_visited');
  }
}
