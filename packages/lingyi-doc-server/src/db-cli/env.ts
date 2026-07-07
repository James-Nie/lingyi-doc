import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

/** 部署时 cwd 可能变化，按优先级加载 .env */
export function loadEnvFiles(): void {
  const candidates = [
    process.env.ENV_FILE,
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../.env'),
  ].filter((p): p is string => Boolean(p));

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      dotenv.config({ path: file });
      return;
    }
  }

  dotenv.config();
}

loadEnvFiles();

export const env = {
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'lingyi_doc_db',
    connectionLimit: Number(process.env.DB_CONN_LIMIT || 10),
  },
};

export function dbConnectionLabel(): string {
  return `${env.db.host}:${env.db.port}/${env.db.database}`;
}
