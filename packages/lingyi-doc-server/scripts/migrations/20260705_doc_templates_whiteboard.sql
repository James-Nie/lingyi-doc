-- 模板库支持画板文档类型

ALTER TABLE doc_templates DROP CHECK chk_doc_templates_doc_type;

ALTER TABLE doc_templates
  ADD CONSTRAINT chk_doc_templates_doc_type
  CHECK (doc_type IN ('richtext', 'freeform', 'base', 'mindnote', 'slides', 'whiteboard'));

INSERT INTO doc_templates (id, title, subtitle, doc_type, document_title, categories, is_blank, status, sort_order, thumb_gradient)
VALUES
  ('blank-whiteboard', '空白画板', '无限画布协作', 'whiteboard', '未命名画板', JSON_ARRAY('recommended'), 1, 'published', 960, 'linear-gradient(135deg, #e6f4ea 0%, #c8e6c9 100%)')
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  subtitle = VALUES(subtitle),
  doc_type = VALUES(doc_type),
  document_title = VALUES(document_title),
  thumb_gradient = VALUES(thumb_gradient);

INSERT IGNORE INTO schema_migrations (version) VALUES ('20260705_doc_templates_whiteboard');
