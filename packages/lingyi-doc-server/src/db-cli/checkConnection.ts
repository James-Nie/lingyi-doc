import mysql from 'mysql2/promise';
import { dbConnectionLabel, env, loadEnvFiles } from './env';

async function checkConnection(): Promise<void> {
  loadEnvFiles();

  const { host, port, user, password, database } = env.db;
  console.log(`[DB] 检测连接: ${dbConnectionLabel()} (user=${user})`);

  try {
    const conn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database,
      connectTimeout: 10_000,
    });
    await conn.query('SELECT 1');
    await conn.end();
    console.log('[DB] 连接成功');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[DB] 连接失败: ${message}`);
    console.error('');
    console.error('dev 环境未使用 Docker 本机 MySQL 时，请在 deploy/dev/.env 配置可访问的数据库：');
    console.error('  DB_HOST=rm-xxxxxxxx.mysql.rds.aliyuncs.com   # 阿里云 RDS 内网/公网地址');
    console.error('  DB_PORT=3306');
    console.error('  DB_USER=your_rds_user');
    console.error('  DB_PASSWORD=your_rds_password');
    console.error('  DB_NAME=lingyi_doc_db');
    console.error('  DB_CREATE_IF_MISSING=false                   # RDS 已在控制台建库');
    console.error('');
    console.error('若仍使用 ECS 本机 MySQL（非 Docker），请先安装并启动 MySQL 服务。');
    process.exit(1);
  }
}

checkConnection();
