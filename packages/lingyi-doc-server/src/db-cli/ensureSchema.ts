import { Pool } from 'pg';
import { env } from './env';
import { getPool } from './pool';

async function columnExists(pool: Pool, table: string, column: string): Promise<boolean> {
  const result = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return Number(result.rows[0]?.cnt ?? 0) > 0;
}

async function indexExists(pool: Pool, table: string, index: string): Promise<boolean> {
  const result = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt
     FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = $1 AND indexname = $2`,
    [table, index],
  );
  return Number(result.rows[0]?.cnt ?? 0) > 0;
}

async function tableExists(pool: Pool, table: string): Promise<boolean> {
  const result = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.TABLES
     WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return Number(result.rows[0]?.cnt ?? 0) > 0;
}

export async function ensureSchemaPatches(pool?: Pool): Promise<void> {
  const db = pool ?? getPool();

  if (!(await columnExists(db, 'documents', 'last_visited_at'))) {
    await db.query(
      `ALTER TABLE documents
       ADD COLUMN last_visited_at TIMESTAMPTZ DEFAULT NULL`,
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
        id              VARCHAR(36)  NOT NULL PRIMARY KEY,
        tenant_id       VARCHAR(36)  NOT NULL,
        name            VARCHAR(64)  NOT NULL,
        sort_order      INTEGER      NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await db.query(
      `CREATE INDEX idx_tpg_tenant ON tenant_position_groups (tenant_id)`,
    );
    await db.query(
      `ALTER TABLE tenant_position_groups
       ADD CONSTRAINT fk_tpg_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE`,
    );
    console.log('[Schema] Created table tenant_position_groups');
  }

  if (!(await tableExists(db, 'tenant_positions'))) {
    await db.query(`
      CREATE TABLE tenant_positions (
        id              VARCHAR(36)  NOT NULL PRIMARY KEY,
        tenant_id       VARCHAR(36)  NOT NULL,
        group_id        VARCHAR(36)  NOT NULL,
        name            VARCHAR(64)  NOT NULL,
        avatar_key      VARCHAR(32)  NOT NULL DEFAULT 'avatar_0',
        sort_order      INTEGER      NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX idx_tp_tenant ON tenant_positions (tenant_id)`);
    await db.query(`CREATE INDEX idx_tp_group ON tenant_positions (group_id)`);
    await db.query(
      `ALTER TABLE tenant_positions
       ADD CONSTRAINT fk_tp_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE`,
    );
    await db.query(
      `ALTER TABLE tenant_positions
       ADD CONSTRAINT fk_tp_group FOREIGN KEY (group_id) REFERENCES tenant_position_groups(id) ON DELETE CASCADE`,
    );
    console.log('[Schema] Created table tenant_positions');
  }

  if (await tableExists(db, 'organizations') && !(await columnExists(db, 'organizations', 'leader_user_id'))) {
    await db.query(
      `ALTER TABLE organizations
       ADD COLUMN leader_user_id VARCHAR(36) DEFAULT NULL`,
    );
    console.log('[Schema] Added column organizations.leader_user_id');
  }

  if (await tableExists(db, 'tenant_members') && !(await columnExists(db, 'tenant_members', 'position_id'))) {
    await db.query(
      `ALTER TABLE tenant_members
       ADD COLUMN position_id VARCHAR(36) DEFAULT NULL`,
    );
    console.log('[Schema] Added column tenant_members.position_id');
  }

  if (await tableExists(db, 'tenant_members') && !(await columnExists(db, 'tenant_members', 'employee_id'))) {
    await db.query(
      `ALTER TABLE tenant_members
       ADD COLUMN employee_id VARCHAR(64) DEFAULT NULL`,
    );
    console.log('[Schema] Added column tenant_members.employee_id');
  }

  if (await tableExists(db, 'tenant_members') && !(await columnExists(db, 'tenant_members', 'gender'))) {
    await db.query(
      `ALTER TABLE tenant_members
       ADD COLUMN gender SMALLINT DEFAULT NULL`,
    );
    console.log('[Schema] Added column tenant_members.gender');
  }

  if (!(await tableExists(db, 'tenant_roles'))) {
    await db.query(`
      CREATE TABLE tenant_roles (
        id              VARCHAR(36)  NOT NULL PRIMARY KEY,
        tenant_id       VARCHAR(36)  NOT NULL,
        name            VARCHAR(64)  NOT NULL,
        description     VARCHAR(512) DEFAULT NULL,
        permissions     JSONB        DEFAULT NULL,
        is_system       BOOLEAN      NOT NULL DEFAULT false,
        system_role     SMALLINT     DEFAULT NULL,
        sort_order      INTEGER      NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX idx_tr_tenant ON tenant_roles (tenant_id)`);
    await db.query(
      `ALTER TABLE tenant_roles
       ADD CONSTRAINT fk_tr_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE`,
    );
    console.log('[Schema] Created table tenant_roles');
  }

  if (await tableExists(db, 'tenant_members') && !(await columnExists(db, 'tenant_members', 'role_id'))) {
    await db.query(
      `ALTER TABLE tenant_members
       ADD COLUMN role_id VARCHAR(36) DEFAULT NULL`,
    );
    console.log('[Schema] Added column tenant_members.role_id');
  }

  if (await tableExists(db, 'users') && !(await columnExists(db, 'users', 'need_change_password'))) {
    await db.query(
      `ALTER TABLE users
       ADD COLUMN need_change_password BOOLEAN NOT NULL DEFAULT false`,
    );
    console.log('[Schema] Added column users.need_change_password');
  }

  if (await tableExists(db, 'crdt_oplog') && !(await indexExists(db, 'crdt_oplog', 'uk_oplog_doc_opid'))) {
    await db.query(
      `CREATE UNIQUE INDEX uk_oplog_doc_opid ON crdt_oplog (doc_id, op_id)`,
    );
    console.log('[Schema] Added index uk_oplog_doc_opid on crdt_oplog');
  }

  if (!(await tableExists(db, 'doc_comment_threads'))) {
    await db.query(`
      CREATE TABLE doc_comment_threads (
        id              VARCHAR(64)   NOT NULL PRIMARY KEY,
        doc_id          VARCHAR(64)   NOT NULL,
        block_id        VARCHAR(128)  NOT NULL,
        anchor_start    INTEGER       NOT NULL,
        anchor_end      INTEGER       NOT NULL,
        quote           VARCHAR(500)  NOT NULL DEFAULT '',
        anchor_meta     TEXT          NULL,
        resolved        BOOLEAN       NOT NULL DEFAULT false,
        created_by      VARCHAR(36)   NOT NULL,
        created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX idx_dct_doc ON doc_comment_threads (doc_id)`);
    await db.query(`CREATE INDEX idx_dct_doc_resolved ON doc_comment_threads (doc_id, resolved)`);
    console.log('[Schema] Created table doc_comment_threads');
  }

  if (!(await tableExists(db, 'doc_comment_replies'))) {
    await db.query(`
      CREATE TABLE doc_comment_replies (
        id              VARCHAR(64)   NOT NULL PRIMARY KEY,
        thread_id       VARCHAR(64)   NOT NULL,
        author_id       VARCHAR(36)   NOT NULL,
        author_name     VARCHAR(100)  NOT NULL,
        author_avatar   VARCHAR(500)  DEFAULT NULL,
        text            TEXT          NOT NULL,
        created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ   NULL DEFAULT NULL
      )
    `);
    await db.query(`CREATE INDEX idx_dcr_thread ON doc_comment_replies (thread_id)`);
    await db.query(
      `ALTER TABLE doc_comment_replies
       ADD CONSTRAINT fk_dcr_thread FOREIGN KEY (thread_id) REFERENCES doc_comment_threads(id) ON DELETE CASCADE`,
    );
    console.log('[Schema] Created table doc_comment_replies');
  }

  if (await tableExists(db, 'doc_comment_threads') && !(await columnExists(db, 'doc_comment_threads', 'anchor_meta'))) {
    await db.query(`
      ALTER TABLE doc_comment_threads
      ADD COLUMN anchor_meta TEXT NULL
    `);
    console.log('[Schema] Added column anchor_meta on doc_comment_threads');
  }

  if (await tableExists(db, 'doc_comment_threads')) {
    const result = await db.query<{ len: string }>(
      `SELECT character_maximum_length AS len
       FROM information_schema.COLUMNS
       WHERE table_schema = 'public'
         AND table_name = 'doc_comment_threads'
         AND column_name = 'block_id'`,
    );
    const len = Number(result.rows?.[0]?.len ?? 0);
    if (len > 0 && len < 128) {
      await db.query(`ALTER TABLE doc_comment_threads ALTER COLUMN block_id TYPE VARCHAR(128)`);
      console.log('[Schema] Widened doc_comment_threads.block_id to VARCHAR(128)');
    }
  }

  if (await tableExists(db, 'doc_comment_replies') && !(await columnExists(db, 'doc_comment_replies', 'updated_at'))) {
    await db.query(`
      ALTER TABLE doc_comment_replies
      ADD COLUMN updated_at TIMESTAMPTZ NULL DEFAULT NULL
    `);
    console.log('[Schema] Added column updated_at on doc_comment_replies');
  }

  if (!(await tableExists(db, 'doc_comment_reply_likes'))) {
    await db.query(`
      CREATE TABLE doc_comment_reply_likes (
        reply_id        VARCHAR(64)   NOT NULL,
        user_id         VARCHAR(36)   NOT NULL,
        created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        PRIMARY KEY (reply_id, user_id)
      )
    `);
    await db.query(`CREATE INDEX idx_dcrl_user ON doc_comment_reply_likes (user_id)`);
    await db.query(
      `ALTER TABLE doc_comment_reply_likes
       ADD CONSTRAINT fk_dcrl_reply FOREIGN KEY (reply_id) REFERENCES doc_comment_replies(id) ON DELETE CASCADE`,
    );
    console.log('[Schema] Created table doc_comment_reply_likes');
  }

  if (!(await tableExists(db, 'base_dashboards'))) {
    await db.query(`
      CREATE TABLE base_dashboards (
        id                   VARCHAR(64)  NOT NULL PRIMARY KEY,
        doc_id               VARCHAR(64)  NOT NULL,
        name                 VARCHAR(255) NOT NULL,
        source_sheet_id      VARCHAR(64)  NOT NULL,
        layout               JSONB        NOT NULL,
        widgets              JSONB        NOT NULL,
        global_filters       JSONB        DEFAULT NULL,
        version              INTEGER      NOT NULL DEFAULT 1,
        sort_order           INTEGER      NOT NULL DEFAULT 0,
        created_by           VARCHAR(36)  NOT NULL,
        updated_by           VARCHAR(36)  NOT NULL,
        is_deleted           BOOLEAN      NOT NULL DEFAULT false,
        deleted_at           TIMESTAMPTZ  NULL DEFAULT NULL,
        created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX idx_base_dashboards_doc ON base_dashboards (doc_id, is_deleted, sort_order)`);
    await db.query(`CREATE INDEX idx_base_dashboards_sheet ON base_dashboards (doc_id, source_sheet_id, is_deleted)`);
    await db.query(
      `ALTER TABLE base_dashboards
       ADD CONSTRAINT fk_base_dashboards_doc FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE`,
    );
    console.log('[Schema] Created table base_dashboards');
  }

  if (!(await tableExists(db, 'base_dashboard_prefs'))) {
    await db.query(`
      CREATE TABLE base_dashboard_prefs (
        doc_id               VARCHAR(64)  NOT NULL PRIMARY KEY,
        active_dashboard_id  VARCHAR(64)  DEFAULT NULL,
        updated_by           VARCHAR(36)  DEFAULT NULL,
        updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await db.query(
      `ALTER TABLE base_dashboard_prefs
       ADD CONSTRAINT fk_base_dashboard_prefs_doc FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE`,
    );
    console.log('[Schema] Created table base_dashboard_prefs');
  }
}
