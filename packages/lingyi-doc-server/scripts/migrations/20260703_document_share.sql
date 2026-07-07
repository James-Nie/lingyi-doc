-- 文档分享模块 V1.0
USE lingyi_doc_db;

CREATE TABLE IF NOT EXISTS doc_share (
    id                  CHAR(36)     NOT NULL PRIMARY KEY,
    doc_id              VARCHAR(64)  NOT NULL COMMENT 'documents.id',
    share_type          VARCHAR(20)  NOT NULL DEFAULT 'link' COMMENT 'link|member',
    share_token         VARCHAR(64)  NOT NULL COMMENT '公开链接 Token',
    permission_level    VARCHAR(20)  NOT NULL DEFAULT 'read' COMMENT 'read|comment|edit|manage|none',
    expire_time         TIMESTAMP    NULL DEFAULT NULL COMMENT 'NULL=永久有效',
    password_hash       VARCHAR(255) NULL DEFAULT NULL,
    ip_whitelist        JSON         NULL DEFAULT NULL COMMENT 'V1.2 IP 白名单',
    allow_download      TINYINT(1)   NOT NULL DEFAULT 1,
    allow_print         TINYINT(1)   NOT NULL DEFAULT 1,
    allow_copy          TINYINT(1)   NOT NULL DEFAULT 1,
    allow_reshare       TINYINT(1)   NOT NULL DEFAULT 0,
    watermark_enabled   TINYINT(1)   NOT NULL DEFAULT 0,
    status              TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '1=开启 0=关闭',
    created_by          CHAR(36)     NOT NULL,
    updated_by          CHAR(36)     NOT NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_doc_share_doc (doc_id),
    UNIQUE KEY uk_doc_share_token (share_token),
    KEY idx_doc_share_status (status, expire_time),
    CONSTRAINT fk_doc_share_doc FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE,
    CONSTRAINT fk_doc_share_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_doc_share_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_doc_share_type CHECK (share_type IN ('link', 'member')),
    CONSTRAINT chk_doc_share_permission CHECK (permission_level IN ('none', 'read', 'comment', 'edit', 'manage'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS doc_share_user (
    id                  CHAR(36)     NOT NULL PRIMARY KEY,
    doc_id              VARCHAR(64)  NOT NULL,
    subject_type        VARCHAR(20)  NOT NULL DEFAULT 'user' COMMENT 'user|dept|group',
    subject_id          CHAR(36)     NOT NULL,
    permission_level    VARCHAR(20)  NOT NULL DEFAULT 'read',
    granted_by          CHAR(36)     NOT NULL,
    expire_time         TIMESTAMP    NULL DEFAULT NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uk_doc_share_user (doc_id, subject_type, subject_id),
    KEY idx_doc_share_user_subject (subject_id, subject_type),
    CONSTRAINT fk_doc_share_user_doc FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE,
    CONSTRAINT fk_doc_share_user_granted_by FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_doc_share_user_type CHECK (subject_type IN ('user', 'dept', 'group')),
    CONSTRAINT chk_doc_share_user_permission CHECK (permission_level IN ('none', 'read', 'comment', 'edit', 'manage'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS doc_share_visit_log (
    id                  CHAR(36)     NOT NULL PRIMARY KEY,
    doc_id              VARCHAR(64)  NOT NULL,
    share_token         VARCHAR(64)  NULL DEFAULT NULL,
    visitor_id          CHAR(36)     NULL DEFAULT NULL COMMENT '登录用户 ID，匿名 NULL',
    visitor_ip          VARCHAR(64)  NULL DEFAULT NULL,
    device_info         VARCHAR(500) NULL DEFAULT NULL,
    visit_status        VARCHAR(30)  NOT NULL COMMENT 'success|denied|password_error|expired|closed',
    operate_content     VARCHAR(500) NULL DEFAULT NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    KEY idx_doc_share_visit_doc (doc_id, created_at),
    KEY idx_doc_share_visit_token (share_token, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS doc_share_audit_log (
    id                  CHAR(36)     NOT NULL PRIMARY KEY,
    doc_id              VARCHAR(64)  NOT NULL,
    operator_id         CHAR(36)     NOT NULL,
    operator_ip         VARCHAR(64)  NULL DEFAULT NULL,
    action              VARCHAR(50)  NOT NULL COMMENT 'create|update|close|add_collaborator|remove_collaborator',
    before_json         JSON         NULL DEFAULT NULL,
    after_json          JSON         NULL DEFAULT NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    KEY idx_doc_share_audit_doc (doc_id, created_at),
    KEY idx_doc_share_audit_operator (operator_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version) VALUES ('20260703_document_share');
