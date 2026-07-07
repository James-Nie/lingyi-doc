-- 会员权限与配额 P0
USE lingyi_doc_db;

ALTER TABLE users
  ADD COLUMN personal_plan TINYINT NOT NULL DEFAULT 1
    COMMENT '1=免费 2=会员 3=试用' AFTER personal_setting,
  ADD COLUMN personal_vip_expire_at TIMESTAMP NULL
    COMMENT '会员/试用到期，NULL=永久' AFTER personal_plan,
  ADD COLUMN can_create_team TINYINT NOT NULL DEFAULT 0
    COMMENT '0=禁止 1=允许创建团队' AFTER personal_vip_expire_at;

ALTER TABLE tenants
  ADD COLUMN team_plan TINYINT NOT NULL DEFAULT 1
    COMMENT '1=免费 2=会员 3=试用' AFTER private_config,
  ADD COLUMN team_vip_expire_at TIMESTAMP NULL
    COMMENT '团队会员/试用到期，NULL=永久' AFTER team_plan;

INSERT IGNORE INTO schema_migrations (version) VALUES ('20260706_membership');
