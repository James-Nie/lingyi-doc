-- 知识库 / Wiki P0：租户隔离目录容器
USE lingyi_doc_db;

-- 知识库主表
CREATE TABLE IF NOT EXISTS knowledge_bases (
    id              CHAR(36)     NOT NULL PRIMARY KEY,
    scope           TINYINT      NOT NULL DEFAULT 2 COMMENT '1=个人 2=企业',
    owner_id        CHAR(36)     DEFAULT NULL COMMENT '个人 scope 必填',
    tenant_id       CHAR(36)     DEFAULT NULL COMMENT '企业 scope 必填',
    org_id          CHAR(36)     DEFAULT NULL COMMENT '可选组织归属',
    name            VARCHAR(200) NOT NULL,
    description     TEXT         DEFAULT NULL,
    emoji           VARCHAR(16)  DEFAULT '📘',
    cover           VARCHAR(20)  NOT NULL DEFAULT 'blue' COMMENT 'blue|sunset',
    visibility      VARCHAR(20)  NOT NULL DEFAULT 'members' COMMENT 'members|organization',
    created_by      CHAR(36)     NOT NULL,
    updated_by      CHAR(36)     NOT NULL,
    is_deleted      TINYINT(1)   NOT NULL DEFAULT 0,
    deleted_at      TIMESTAMP    NULL DEFAULT NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    KEY idx_kb_tenant (tenant_id, is_deleted, updated_at),
    KEY idx_kb_owner (owner_id, is_deleted, updated_at),
    KEY idx_kb_scope (scope, is_deleted),
    CONSTRAINT fk_kb_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_kb_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_kb_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL,
    CONSTRAINT fk_kb_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_kb_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT,
    -- scope/owner_id/tenant_id 组合规则由应用层校验（MySQL 不允许 FK ON DELETE SET NULL 列参与 CHECK）
    CONSTRAINT chk_kb_visibility CHECK (visibility IN ('members', 'organization'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 目录节点
CREATE TABLE IF NOT EXISTS kb_nodes (
    id              CHAR(36)     NOT NULL PRIMARY KEY,
    kb_id           CHAR(36)     NOT NULL,
    parent_id       CHAR(36)     DEFAULT NULL COMMENT 'NULL=根级',
    title           VARCHAR(500) NOT NULL,
    node_type       VARCHAR(20)  NOT NULL COMMENT 'page|doc_ref|folder',
    doc_id          VARCHAR(64)  DEFAULT NULL COMMENT 'doc_ref 时关联 documents.id',
    sort_order      INT          NOT NULL DEFAULT 0,
    is_home         TINYINT(1)   NOT NULL DEFAULT 0,
    created_by      CHAR(36)     NOT NULL,
    is_deleted      TINYINT(1)   NOT NULL DEFAULT 0,
    deleted_at      TIMESTAMP    NULL DEFAULT NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    KEY idx_kb_nodes_kb (kb_id, parent_id, sort_order, is_deleted),
    KEY idx_kb_nodes_doc (doc_id),
    CONSTRAINT fk_kb_nodes_kb FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    CONSTRAINT fk_kb_nodes_parent FOREIGN KEY (parent_id) REFERENCES kb_nodes(id) ON DELETE SET NULL,
    CONSTRAINT fk_kb_nodes_doc FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE SET NULL,
    CONSTRAINT fk_kb_nodes_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_kb_node_type CHECK (node_type IN ('page', 'doc_ref', 'folder'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 成员表（visibility=members 的企业知识库）
CREATE TABLE IF NOT EXISTS kb_members (
    id              CHAR(36)     NOT NULL PRIMARY KEY,
    kb_id           CHAR(36)     NOT NULL,
    user_id         CHAR(36)     NOT NULL,
    role            VARCHAR(20)  NOT NULL DEFAULT 'viewer' COMMENT 'owner|admin|editor|viewer',
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uk_kb_member (kb_id, user_id),
    KEY idx_kb_member_user (user_id),
    CONSTRAINT fk_kb_members_kb FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    CONSTRAINT fk_kb_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_kb_member_role CHECK (role IN ('owner', 'admin', 'editor', 'viewer'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version) VALUES ('20260701_knowledge_base');
