-- 职位 / 成员扩展字段
USE lingyi_doc_db;

CREATE TABLE IF NOT EXISTS tenant_position_groups (
    id              CHAR(36)     NOT NULL PRIMARY KEY,
    tenant_id       CHAR(36)     NOT NULL,
    name            VARCHAR(64)  NOT NULL,
    sort_order      INT          NOT NULL DEFAULT 0,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_tpg_tenant (tenant_id),
    CONSTRAINT fk_tpg_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenant_positions (
    id              CHAR(36)     NOT NULL PRIMARY KEY,
    tenant_id       CHAR(36)     NOT NULL,
    group_id        CHAR(36)     NOT NULL,
    name            VARCHAR(64)  NOT NULL,
    avatar_key      VARCHAR(32)  NOT NULL DEFAULT 'avatar_0',
    sort_order      INT          NOT NULL DEFAULT 0,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_tp_tenant (tenant_id),
    KEY idx_tp_group (group_id),
    CONSTRAINT fk_tp_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_tp_group FOREIGN KEY (group_id) REFERENCES tenant_position_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE organizations
  ADD COLUMN leader_user_id CHAR(36) DEFAULT NULL COMMENT '部门负责人' AFTER sort_order;

ALTER TABLE tenant_members
  ADD COLUMN position_id CHAR(36) DEFAULT NULL COMMENT '职位' AFTER org_id,
  ADD COLUMN employee_id VARCHAR(64) DEFAULT NULL COMMENT '工号' AFTER position_id,
  ADD COLUMN gender TINYINT DEFAULT NULL COMMENT '1男 2女' AFTER employee_id;

INSERT IGNORE INTO schema_migrations (version) VALUES ('20260708_tenant_positions');
