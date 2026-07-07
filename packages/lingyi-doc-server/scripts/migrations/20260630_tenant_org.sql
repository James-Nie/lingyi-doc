-- 租户 / 组织 / 多身份 P0
USE lingyi_doc_db;

-- users 扩展
ALTER TABLE users
  ADD COLUMN user_source TINYINT NOT NULL DEFAULT 1 COMMENT '1=global(SaaS) 2=local(私有化)' AFTER user_type,
  ADD COLUMN oauth_union_id VARCHAR(128) DEFAULT NULL COMMENT '云端 OAuth，私有化 NULL' AFTER phone,
  ADD COLUMN ldap_uuid VARCHAR(128) DEFAULT NULL COMMENT 'LDAP UUID，P0 预留' AFTER oauth_union_id,
  ADD COLUMN personal_setting JSON DEFAULT NULL COMMENT '个人全局配置' AFTER ldap_uuid;

-- documents 扩展：个人 / 企业互斥
ALTER TABLE documents
  ADD COLUMN tenant_id CHAR(36) DEFAULT NULL COMMENT '企业文档必填' AFTER owner_id,
  ADD COLUMN org_id CHAR(36) DEFAULT NULL COMMENT '归属组织' AFTER tenant_id,
  ADD COLUMN scope TINYINT NOT NULL DEFAULT 1 COMMENT '1=个人 2=企业' AFTER doc_type;

ALTER TABLE documents
  ADD KEY idx_documents_tenant (tenant_id, is_deleted),
  ADD KEY idx_documents_scope (scope, owner_id);

UPDATE documents SET scope = 1 WHERE scope IS NULL OR scope = 0;

-- auth_sessions 存储登录身份上下文
ALTER TABLE auth_sessions
  ADD COLUMN session_context JSON DEFAULT NULL COMMENT '身份/租户上下文' AFTER client_type;

-- 租户主表
CREATE TABLE IF NOT EXISTS tenants (
    id                      CHAR(36)     NOT NULL PRIMARY KEY,
    name                    VARCHAR(128) NOT NULL COMMENT '企业名称',
    status                  TINYINT      NOT NULL DEFAULT 1 COMMENT '0禁用 1正常',
    admin_user_id           CHAR(36)     DEFAULT NULL COMMENT '租户超管',
    deploy_type             TINYINT      NOT NULL DEFAULT 1 COMMENT '1=SaaS 2=本地私有化 3=专属私有化',
    is_physical_isolate     TINYINT      NOT NULL DEFAULT 0,
    account_mode            TINYINT      NOT NULL DEFAULT 1 COMMENT '1=云端 2=本地离线',
    is_allow_multi_switch   TINYINT      NOT NULL DEFAULT 1,
    db_instance_id          VARCHAR(64)  DEFAULT NULL,
    storage_cluster_id      VARCHAR(64)  DEFAULT NULL,
    private_config          JSON         DEFAULT NULL,
    created_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_tenants_status (status),
    CONSTRAINT fk_tenants_admin FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenant_members (
    id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tenant_id       CHAR(36)     NOT NULL,
    user_id         CHAR(36)     NOT NULL,
    user_source     TINYINT      NOT NULL DEFAULT 1,
    org_id          CHAR(36)     DEFAULT NULL,
    tenant_role     TINYINT      NOT NULL DEFAULT 3 COMMENT '1超管 2管理员 3成员',
    status          TINYINT      NOT NULL DEFAULT 1 COMMENT '0禁用 1正常',
    joined_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_tenant_user (tenant_id, user_id),
    KEY idx_tenant_members_user (user_id),
    KEY idx_tenant_members_org (tenant_id, org_id),
    CONSTRAINT fk_tm_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_tm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS organizations (
    id              CHAR(36)     NOT NULL PRIMARY KEY,
    tenant_id       CHAR(36)     NOT NULL,
    parent_id       CHAR(36)     DEFAULT NULL,
    name            VARCHAR(128) NOT NULL,
    sort_order      INT          NOT NULL DEFAULT 0,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_org_tenant (tenant_id),
    KEY idx_org_parent (tenant_id, parent_id),
    CONSTRAINT fk_org_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version) VALUES ('20260630_tenant_org');
