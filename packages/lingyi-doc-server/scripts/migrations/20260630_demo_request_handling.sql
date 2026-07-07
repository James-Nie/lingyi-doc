-- 预约演示：处理人、处理时间
-- 2026-06-30

USE lingyi_doc_db;

ALTER TABLE demo_requests
    ADD COLUMN processed_by CHAR(36) DEFAULT NULL COMMENT '处理人（管理员）' AFTER admin_note,
    ADD COLUMN processed_at TIMESTAMP NULL DEFAULT NULL COMMENT '处理时间' AFTER processed_by;

ALTER TABLE demo_requests
    ADD CONSTRAINT fk_demo_requests_processor FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL;

INSERT IGNORE INTO schema_migrations (version) VALUES ('20260630_demo_request_handling');
