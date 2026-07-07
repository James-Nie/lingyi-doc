-- 模板列表分页排序索引（避免 filesort 读取 content_json 等大列）
USE lingyi_doc_db;

ALTER TABLE doc_templates
  ADD INDEX idx_doc_templates_deleted_sort (is_deleted, sort_order, updated_at);

INSERT IGNORE INTO schema_migrations (version) VALUES ('20260704_doc_templates_sort_index');
