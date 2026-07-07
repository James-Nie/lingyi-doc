-- 自研表格系统 — 数据库初始化脚本

-- 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    display_name    VARCHAR(100) NOT NULL,
    avatar_url      VARCHAR(500),
    phone           VARCHAR(20),
    locale          VARCHAR(10) DEFAULT 'zh-CN',
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 团队表
CREATE TABLE IF NOT EXISTS teams (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    avatar_url      VARCHAR(500),
    owner_id        UUID NOT NULL REFERENCES users(id),
    member_count    INTEGER DEFAULT 1,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 团队成员关系
CREATE TABLE IF NOT EXISTS team_members (
    team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(20) NOT NULL DEFAULT 'member',
    joined_at       TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (team_id, user_id)
);

-- 文档表
CREATE TABLE IF NOT EXISTS documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    doc_type        VARCHAR(20) NOT NULL DEFAULT 'standard',
    team_id         UUID REFERENCES teams(id),
    owner_id        UUID NOT NULL REFERENCES users(id),
    current_version INTEGER NOT NULL DEFAULT 0,
    sheet_count     INTEGER NOT NULL DEFAULT 1,
    row_count       INTEGER DEFAULT 0,
    col_count       INTEGER DEFAULT 0,
    cell_count      INTEGER DEFAULT 0,
    storage_size    BIGINT DEFAULT 0,
    is_deleted      BOOLEAN DEFAULT FALSE,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_documents_team ON documents(team_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents(updated_at DESC);

-- 文档权限表
CREATE TABLE IF NOT EXISTS document_permissions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_id          UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),
    team_id         UUID REFERENCES teams(id),
    role            VARCHAR(20) NOT NULL,
    granted_by      UUID NOT NULL REFERENCES users(id),
    granted_at      TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    CONSTRAINT perm_unique UNIQUE (doc_id, user_id, team_id),
    CONSTRAINT perm_target CHECK (
        (user_id IS NOT NULL AND team_id IS NULL) OR
        (user_id IS NULL AND team_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_permissions_doc_user ON document_permissions(doc_id, user_id);
CREATE INDEX IF NOT EXISTS idx_permissions_doc_team ON document_permissions(doc_id, team_id);

-- 文档快照表
CREATE TABLE IF NOT EXISTS document_snapshots (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_id          UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version         INTEGER NOT NULL,
    snapshot_type   VARCHAR(20) NOT NULL,
    snapshot_data   JSONB,
    binary_ref      VARCHAR(500),
    binary_size     BIGINT,
    compressed      BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (doc_id, version)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_doc_version ON document_snapshots(doc_id, version DESC);

-- 文档 Sheet 表
CREATE TABLE IF NOT EXISTS document_sheets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_id          UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    sheet_id        VARCHAR(50) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    sheet_type      VARCHAR(20) NOT NULL DEFAULT 'grid',
    sort_order      INTEGER NOT NULL DEFAULT 0,
    row_count       INTEGER DEFAULT 0,
    col_count       INTEGER DEFAULT 0,
    is_hidden       BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (doc_id, sheet_id)
);

-- 评论表
CREATE TABLE IF NOT EXISTS comments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_id          UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    sheet_id        VARCHAR(50) NOT NULL,
    cell_ref        VARCHAR(50),
    content         TEXT NOT NULL,
    author_id       UUID NOT NULL REFERENCES users(id),
    parent_id       UUID REFERENCES comments(id),
    is_resolved     BOOLEAN DEFAULT FALSE,
    resenabled_by   UUID REFERENCES users(id),
    resenabled_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_doc_cell ON comments(doc_id, sheet_id, cell_ref);
CREATE INDEX IF NOT EXISTS idx_comments_thread ON comments(parent_id);
