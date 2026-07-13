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

async function tableExists(pool: Pool, table: string): Promise<boolean> {
  const [rows] = await pool.query<Array<{ cnt: number } & import('mysql2').RowDataPacket>>(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [env.db.database, table],
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

  if (!(await tableExists(db, 'tenant_position_groups'))) {
    await db.query(`
      CREATE TABLE tenant_position_groups (
        id              CHAR(36)     NOT NULL PRIMARY KEY,
        tenant_id       CHAR(36)     NOT NULL,
        name            VARCHAR(64)  NOT NULL,
        sort_order      INT          NOT NULL DEFAULT 0,
        created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_tpg_tenant (tenant_id),
        CONSTRAINT fk_tpg_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[Schema] Created table tenant_position_groups');
  }

  if (!(await tableExists(db, 'tenant_positions'))) {
    await db.query(`
      CREATE TABLE tenant_positions (
        id              CHAR(36)     NOT NULL PRIMARY KEY,
        tenant_id       CHAR(36)     NOT NULL,
        group_id        CHAR(36)     NOT NULL,
        name            VARCHAR(64)  NOT NULL,
        avatar_key      VARCHAR(32)  NOT NULL DEFAULT 'avatar_0',
        sort_order      INT          NOT NULL DEFAULT 0,
        created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_tp_tenant (tenant_id),
        KEY idx_tp_group (group_id),
        CONSTRAINT fk_tp_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT fk_tp_group FOREIGN KEY (group_id) REFERENCES tenant_position_groups(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[Schema] Created table tenant_positions');
  }

  if (await tableExists(db, 'organizations') && !(await columnExists(db, 'organizations', 'leader_user_id'))) {
    await db.query(
      `ALTER TABLE organizations
       ADD COLUMN leader_user_id CHAR(36) DEFAULT NULL COMMENT '部门负责人' AFTER sort_order`,
    );
    console.log('[Schema] Added column organizations.leader_user_id');
  }

  if (await tableExists(db, 'tenant_members') && !(await columnExists(db, 'tenant_members', 'position_id'))) {
    await db.query(
      `ALTER TABLE tenant_members
       ADD COLUMN position_id CHAR(36) DEFAULT NULL COMMENT '职位' AFTER org_id`,
    );
    console.log('[Schema] Added column tenant_members.position_id');
  }

  if (await tableExists(db, 'tenant_members') && !(await columnExists(db, 'tenant_members', 'employee_id'))) {
    await db.query(
      `ALTER TABLE tenant_members
       ADD COLUMN employee_id VARCHAR(64) DEFAULT NULL COMMENT '工号' AFTER position_id`,
    );
    console.log('[Schema] Added column tenant_members.employee_id');
  }

  if (await tableExists(db, 'tenant_members') && !(await columnExists(db, 'tenant_members', 'gender'))) {
    await db.query(
      `ALTER TABLE tenant_members
       ADD COLUMN gender TINYINT DEFAULT NULL COMMENT '1男 2女' AFTER employee_id`,
    );
    console.log('[Schema] Added column tenant_members.gender');
  }

  if (!(await tableExists(db, 'tenant_roles'))) {
    await db.query(`
      CREATE TABLE tenant_roles (
        id              CHAR(36)     NOT NULL PRIMARY KEY,
        tenant_id       CHAR(36)     NOT NULL,
        name            VARCHAR(64)  NOT NULL,
        description     VARCHAR(512) DEFAULT NULL,
        permissions     JSON         DEFAULT NULL,
        is_system       TINYINT      NOT NULL DEFAULT 0,
        system_role     TINYINT      DEFAULT NULL,
        sort_order      INT          NOT NULL DEFAULT 0,
        created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_tr_tenant (tenant_id),
        CONSTRAINT fk_tr_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[Schema] Created table tenant_roles');
  }

  if (await tableExists(db, 'tenant_members') && !(await columnExists(db, 'tenant_members', 'role_id'))) {
    await db.query(
      `ALTER TABLE tenant_members
       ADD COLUMN role_id CHAR(36) DEFAULT NULL COMMENT '租户角色' AFTER position_id`,
    );
    console.log('[Schema] Added column tenant_members.role_id');
  }

  if (await tableExists(db, 'crdt_oplog') && !(await indexExists(db, 'crdt_oplog', 'uk_oplog_doc_opid'))) {
    await db.query(
      `ALTER TABLE crdt_oplog
       ADD UNIQUE KEY uk_oplog_doc_opid (doc_id, op_id)`,
    );
    console.log('[Schema] Added index uk_oplog_doc_opid on crdt_oplog');
  }

  if (!(await tableExists(db, 'doc_comment_threads'))) {
    await db.query(`
      CREATE TABLE doc_comment_threads (
        id              VARCHAR(64)   NOT NULL PRIMARY KEY,
        doc_id          VARCHAR(64)   NOT NULL,
        block_id        VARCHAR(64)   NOT NULL,
        anchor_start    INT           NOT NULL,
        anchor_end      INT           NOT NULL,
        quote           VARCHAR(500)  NOT NULL DEFAULT '',
        resolved        TINYINT(1)    NOT NULL DEFAULT 0,
        created_by      CHAR(36)      NOT NULL,
        created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_dct_doc (doc_id),
        KEY idx_dct_doc_resolved (doc_id, resolved)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[Schema] Created table doc_comment_threads');
  }

  if (!(await tableExists(db, 'doc_comment_replies'))) {
    await db.query(`
      CREATE TABLE doc_comment_replies (
        id              VARCHAR(64)   NOT NULL PRIMARY KEY,
        thread_id       VARCHAR(64)   NOT NULL,
        author_id       CHAR(36)      NOT NULL,
        author_name     VARCHAR(100)  NOT NULL,
        author_avatar   VARCHAR(500)  DEFAULT NULL,
        text            TEXT          NOT NULL,
        created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_dcr_thread (thread_id),
        CONSTRAINT fk_dcr_thread FOREIGN KEY (thread_id) REFERENCES doc_comment_threads(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[Schema] Created table doc_comment_replies');
  }

  if (await tableExists(db, 'doc_comment_threads') && !(await columnExists(db, 'doc_comment_threads', 'anchor_meta'))) {
    await db.query(`
      ALTER TABLE doc_comment_threads
      ADD COLUMN anchor_meta TEXT NULL AFTER quote
    `);
    console.log('[Schema] Added column anchor_meta on doc_comment_threads');
  }

  if (await tableExists(db, 'doc_comment_replies') && !(await columnExists(db, 'doc_comment_replies', 'updated_at'))) {
    await db.query(`
      ALTER TABLE doc_comment_replies
      ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL AFTER created_at
    `);
    console.log('[Schema] Added column updated_at on doc_comment_replies');
  }

  if (!(await tableExists(db, 'doc_comment_reply_likes'))) {
    await db.query(`
      CREATE TABLE doc_comment_reply_likes (
        reply_id        VARCHAR(64)   NOT NULL,
        user_id         CHAR(36)      NOT NULL,
        created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (reply_id, user_id),
        KEY idx_dcrl_user (user_id),
        CONSTRAINT fk_dcrl_reply FOREIGN KEY (reply_id) REFERENCES doc_comment_replies(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[Schema] Created table doc_comment_reply_likes');
  }
}
