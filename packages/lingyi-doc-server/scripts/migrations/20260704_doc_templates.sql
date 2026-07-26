-- 文档模板中心：管理后台 CRUD + C 端模板列表
USE lingyi_doc_db;

CREATE TABLE IF NOT EXISTS doc_templates (
    id              VARCHAR(64)   NOT NULL PRIMARY KEY COMMENT '模板 slug，如 weekly-report',
    title           VARCHAR(200)  NOT NULL,
    subtitle        VARCHAR(500)  NOT NULL DEFAULT '',
    doc_type        VARCHAR(20)   NOT NULL COMMENT 'richtext|freeform|base|mindnote|slides',
    document_title  VARCHAR(500)  NOT NULL,
    categories      JSON          NOT NULL COMMENT '分类 ID 数组',
    usage_label     VARCHAR(100)  DEFAULT NULL,
    is_new          TINYINT(1)    NOT NULL DEFAULT 0,
    is_blank        TINYINT(1)    NOT NULL DEFAULT 0,
    content_json    JSON          DEFAULT NULL COMMENT '模板内容快照',
    status          VARCHAR(20)   NOT NULL DEFAULT 'draft' COMMENT 'draft|published|archived',
    sort_order      INT           NOT NULL DEFAULT 0,
    use_count       INT           NOT NULL DEFAULT 0,
    created_by      CHAR(36)      DEFAULT NULL,
    updated_by      CHAR(36)      DEFAULT NULL,
    published_at    TIMESTAMP     NULL DEFAULT NULL,
    is_deleted      TINYINT(1)    NOT NULL DEFAULT 0,
    deleted_at      TIMESTAMP     NULL DEFAULT NULL,
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    KEY idx_doc_templates_list (status, is_deleted, sort_order DESC, updated_at DESC),
    KEY idx_doc_templates_type (doc_type, status, is_deleted),
    CONSTRAINT chk_doc_templates_status CHECK (status IN ('draft', 'published', 'archived')),
    CONSTRAINT chk_doc_templates_doc_type CHECK (doc_type IN ('richtext', 'freeform', 'base', 'mindnote', 'slides'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 空白模板种子
INSERT INTO doc_templates (id, title, subtitle, doc_type, document_title, categories, is_blank, status, sort_order)
VALUES
  ('blank-richtext', '空白文档', '从零开始撰写', 'richtext', '未命名文档', JSON_ARRAY('recommended'), 1, 'published', 1000),
  ('blank-freeform', '空白表格', '普通表格', 'freeform', '未命名表格', JSON_ARRAY('recommended'), 1, 'published', 990),
  ('blank-base', '空白多维表格', '多维表格', 'base', '未命名多维表格', JSON_ARRAY('recommended'), 1, 'published', 980),
  ('blank-mindnote', '空白思维笔记', '思维导图', 'mindnote', '未命名思维笔记', JSON_ARRAY('recommended'), 1, 'published', 970)
ON DUPLICATE KEY UPDATE updated_at = updated_at;

INSERT IGNORE INTO schema_migrations (version) VALUES ('20260704_doc_templates');
