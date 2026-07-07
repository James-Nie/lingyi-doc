-- 文档分享语雀风格路径 + 协作者申请加入
USE lingyi_doc_db;

-- 空间 / 知识库 / 文档 slug
ALTER TABLE users
  ADD COLUMN personal_space_slug VARCHAR(64) NULL DEFAULT NULL COMMENT '个人空间标识' AFTER personal_setting,
  ADD COLUMN default_book_slug VARCHAR(32) NULL DEFAULT NULL COMMENT '个人默认知识库标识' AFTER personal_space_slug;

ALTER TABLE tenants
  ADD COLUMN space_slug VARCHAR(64) NULL DEFAULT NULL COMMENT '组织空间标识' AFTER name,
  ADD COLUMN default_book_slug VARCHAR(32) NULL DEFAULT NULL COMMENT '组织默认知识库标识' AFTER space_slug;

ALTER TABLE knowledge_bases
  ADD COLUMN kb_slug VARCHAR(32) NULL DEFAULT NULL COMMENT '知识库路径标识' AFTER name;

ALTER TABLE documents
  ADD COLUMN doc_slug VARCHAR(64) NULL DEFAULT NULL COMMENT '文档路径标识' AFTER title;

CREATE UNIQUE INDEX uk_users_personal_space_slug ON users (personal_space_slug);
CREATE UNIQUE INDEX uk_tenants_space_slug ON tenants (space_slug);
CREATE UNIQUE INDEX uk_documents_doc_slug ON documents (doc_slug);
CREATE UNIQUE INDEX uk_kb_slug ON knowledge_bases (kb_slug);

-- 同一文档可同时存在 link / member 两种分享
ALTER TABLE doc_share DROP INDEX uk_doc_share_doc;
ALTER TABLE doc_share ADD UNIQUE KEY uk_doc_share_doc_type (doc_id, share_type);

CREATE TABLE IF NOT EXISTS doc_share_join_request (
    id                  CHAR(36)     NOT NULL PRIMARY KEY,
    doc_id              VARCHAR(64)  NOT NULL,
    applicant_id        CHAR(36)     NOT NULL,
    permission_level    VARCHAR(20)  NOT NULL DEFAULT 'read',
    status              VARCHAR(20)  NOT NULL DEFAULT 'pending' COMMENT 'pending|approved|rejected',
    message             VARCHAR(500) NULL DEFAULT NULL,
    reviewed_by         CHAR(36)     NULL DEFAULT NULL,
    reviewed_at         TIMESTAMP    NULL DEFAULT NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    KEY idx_doc_share_join_doc (doc_id, status, created_at),
    KEY idx_doc_share_join_applicant (applicant_id, status),
    UNIQUE KEY uk_doc_share_join_pending (doc_id, applicant_id, status),
    CONSTRAINT fk_doc_share_join_doc FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE,
    CONSTRAINT fk_doc_share_join_applicant FOREIGN KEY (applicant_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_doc_share_join_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_doc_share_join_status CHECK (status IN ('pending', 'approved', 'rejected')),
    CONSTRAINT chk_doc_share_join_permission CHECK (permission_level IN ('none', 'read', 'comment', 'edit', 'manage'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version) VALUES ('20260703_document_share_slug_join');
