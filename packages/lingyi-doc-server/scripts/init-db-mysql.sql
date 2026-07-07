-- 零一文档 — MySQL 完整表结构（新环境初始化，幂等）
-- 执行: npm run db:init
-- 说明: 已包含全部 migrations 的最终 DDL；已有库升级请用 npm run db:migrate

CREATE DATABASE IF NOT EXISTS lingyi_doc_db
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE lingyi_doc_db;

-- ==========================================
-- 用户表
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
    id              CHAR(36)     NOT NULL PRIMARY KEY COMMENT '主键 UUID',
    email           VARCHAR(255) NOT NULL COMMENT '登录邮箱，唯一',
    password_hash   VARCHAR(255) NOT NULL COMMENT 'bcrypt 密码哈希',
    display_name    VARCHAR(100) NOT NULL COMMENT '显示昵称',
    avatar_url      VARCHAR(500) DEFAULT NULL COMMENT '头像 URL',
    phone           VARCHAR(20)  DEFAULT NULL COMMENT '手机号',
    locale          VARCHAR(10)  DEFAULT 'zh-CN' COMMENT '界面语言',
    is_active       TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '1=启用 0=禁用',
    user_type       VARCHAR(20)  NOT NULL DEFAULT 'consumer' COMMENT 'consumer | admin',
    user_source     TINYINT      NOT NULL DEFAULT 1 COMMENT '1=global(SaaS) 2=local(私有化)',
    status          VARCHAR(20)  NOT NULL DEFAULT 'active' COMMENT 'active | suspended | pending',
    last_login_at   TIMESTAMP    NULL DEFAULT NULL COMMENT '最近登录时间',
    login_fail_count TINYINT     NOT NULL DEFAULT 0 COMMENT '连续登录失败次数',
    locked_until    TIMESTAMP    NULL DEFAULT NULL COMMENT '账号锁定截止时间',
    oauth_union_id  VARCHAR(128) DEFAULT NULL COMMENT '云端 OAuth UnionId，私有化 NULL',
    ldap_uuid       VARCHAR(128) DEFAULT NULL COMMENT 'LDAP UUID，预留',
    personal_setting JSON        DEFAULT NULL COMMENT '个人全局配置 JSON',
    personal_plan   TINYINT      NOT NULL DEFAULT 1 COMMENT '1=免费 2=会员 3=试用',
    personal_vip_expire_at TIMESTAMP NULL DEFAULT NULL COMMENT '会员/试用到期，NULL=永久',
    can_create_team TINYINT      NOT NULL DEFAULT 0 COMMENT '0=禁止 1=允许创建团队',
    personal_space_slug VARCHAR(64) DEFAULT NULL COMMENT '个人空间标识',
    default_book_slug VARCHAR(32) DEFAULT NULL COMMENT '个人默认知识库标识',
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_users_email (email),
    UNIQUE KEY uk_users_personal_space_slug (personal_space_slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 文档表（元数据 + JSON 内容）
-- ==========================================
CREATE TABLE IF NOT EXISTS documents (
    id              VARCHAR(64)  NOT NULL PRIMARY KEY COMMENT '文档 ID，如 doc_xxx',
    title           VARCHAR(500) NOT NULL COMMENT '文档标题',
    doc_slug        VARCHAR(64)  DEFAULT NULL COMMENT '文档路径标识',
    description     TEXT         DEFAULT NULL COMMENT '文档描述',
    doc_type        VARCHAR(20)  NOT NULL DEFAULT 'freeform' COMMENT 'richtext|freeform|base|mindnote|slides|whiteboard',
    scope           TINYINT      NOT NULL DEFAULT 1 COMMENT '1=个人 2=企业',
    owner_id        CHAR(36)     DEFAULT NULL COMMENT '个人文档所有者 users.id',
    tenant_id       CHAR(36)     DEFAULT NULL COMMENT '企业文档所属租户 tenants.id',
    org_id          CHAR(36)     DEFAULT NULL COMMENT '归属组织 organizations.id',
    current_version INT          NOT NULL DEFAULT 0 COMMENT '当前内容版本号',
    content_json    JSON         DEFAULT NULL COMMENT '文档内容 JSON 快照',
    storage_size           BIGINT       NOT NULL DEFAULT 0 COMMENT '内容占用字节数',
    last_snapshot_version  INT          NOT NULL DEFAULT 0 COMMENT '最近快照版本号',
    last_snapshot_at       TIMESTAMP    NULL DEFAULT NULL COMMENT '最近快照时间',
    is_deleted             TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1=已软删除',
    deleted_at             TIMESTAMP    NULL DEFAULT NULL COMMENT '软删除时间',
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    last_visited_at TIMESTAMP    NULL DEFAULT NULL COMMENT '用户最近访问时间',
    KEY idx_documents_owner (owner_id, is_deleted),
    KEY idx_documents_tenant (tenant_id, is_deleted),
    KEY idx_documents_scope (scope, owner_id),
    KEY idx_documents_updated (updated_at DESC),
    KEY idx_documents_last_visited (last_visited_at DESC),
    KEY idx_documents_type (doc_type),
    UNIQUE KEY uk_documents_doc_slug (doc_slug),
    CONSTRAINT fk_documents_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 文档快照表（版本历史）
-- ==========================================
CREATE TABLE IF NOT EXISTS document_snapshots (
    id                CHAR(36)     NOT NULL PRIMARY KEY COMMENT '主键 UUID',
    doc_id            VARCHAR(64)  NOT NULL COMMENT 'documents.id',
    version           INT          NOT NULL COMMENT '快照版本号',
    snapshot_type     VARCHAR(20)  NOT NULL DEFAULT 'checkpoint' COMMENT 'checkpoint|auto 等',
    parent_version    INT          NULL DEFAULT NULL COMMENT '父版本号（增量链）',
    snapshot_data     JSON         DEFAULT NULL COMMENT 'JSON 快照内容',
    binary_ref        VARCHAR(500) NULL DEFAULT NULL COMMENT '外部二进制存储引用',
    binary_size       BIGINT       NULL DEFAULT NULL COMMENT '二进制快照字节数',
    is_compressed     TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1=已压缩',
    content_hash      CHAR(64)     NULL DEFAULT NULL COMMENT '内容 SHA256',
    label             VARCHAR(200) NULL DEFAULT NULL COMMENT '用户标注名称',
    created_by        CHAR(36)     NULL DEFAULT NULL COMMENT '创建人 users.id',
    created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_snapshots_doc_version (doc_id, version),
    KEY idx_snapshots_doc (doc_id, version DESC),
    KEY idx_snapshots_doc_type (doc_id, snapshot_type, version DESC),
    CONSTRAINT fk_snapshots_doc FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- CRDT 操作日志（Phase 2 协同落库）
-- ==========================================
CREATE TABLE IF NOT EXISTS crdt_oplog (
    id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
    doc_id          VARCHAR(64)  NOT NULL COMMENT 'documents.id',
    global_version  INT          NOT NULL COMMENT '文档全局版本序号',
    op_id           VARCHAR(100) NOT NULL COMMENT '客户端操作 ID，幂等',
    user_id         CHAR(36)     NOT NULL COMMENT '操作用户 users.id',
    op_type         VARCHAR(30)  NOT NULL COMMENT '操作类型',
    op_target       VARCHAR(200) NOT NULL COMMENT '操作目标路径',
    op_data         JSON         NOT NULL COMMENT '操作载荷',
    dependencies    JSON         DEFAULT NULL COMMENT '依赖的前序 op_id 列表',
    server_ts       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '服务端接收时间',
    client_ts       BIGINT       DEFAULT NULL COMMENT '客户端时间戳(ms)',
    UNIQUE KEY uk_oplog_doc_version (doc_id, global_version),
    KEY idx_oplog_doc (doc_id, global_version),
    KEY idx_oplog_server_ts (server_ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 文档 Sheet 元数据（Phase 2）
-- ==========================================
CREATE TABLE IF NOT EXISTS document_sheets (
    id              CHAR(36)     NOT NULL PRIMARY KEY COMMENT '主键 UUID',
    doc_id          VARCHAR(64)  NOT NULL COMMENT 'documents.id',
    sheet_id        VARCHAR(50)  NOT NULL COMMENT 'Sheet 业务 ID',
    name            VARCHAR(200) NOT NULL COMMENT 'Sheet 名称',
    sheet_type      VARCHAR(20)  NOT NULL DEFAULT 'grid' COMMENT 'grid|base 等',
    sort_order      INT          NOT NULL DEFAULT 0 COMMENT '排序序号',
    row_count       INT          NOT NULL DEFAULT 0 COMMENT '行数缓存',
    col_count       INT          NOT NULL DEFAULT 0 COMMENT '列数缓存',
    is_hidden       TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1=隐藏',
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_doc_sheet (doc_id, sheet_id),
    KEY idx_sheets_doc (doc_id),
    CONSTRAINT fk_sheets_doc FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 多维表定义（Phase 3 预留）
-- ==========================================
CREATE TABLE IF NOT EXISTS base_tables (
    id              VARCHAR(64)  NOT NULL PRIMARY KEY COMMENT '多维表 ID',
    doc_id          VARCHAR(64)  NOT NULL COMMENT 'documents.id',
    name            VARCHAR(255) NOT NULL COMMENT '表名称',
    description     TEXT         DEFAULT NULL COMMENT '表描述',
    column_defs     JSON         NOT NULL COMMENT '列定义 JSON',
    relations       JSON         NOT NULL COMMENT '表关系 JSON',
    permissions     JSON         NOT NULL COMMENT '权限配置 JSON',
    created_by      CHAR(36)     NOT NULL COMMENT '创建人 users.id',
    updated_by      CHAR(36)     NOT NULL COMMENT '更新人 users.id',
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_base_tables_doc (doc_id),
    CONSTRAINT fk_base_tables_doc FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS base_records (
    id              VARCHAR(64)  NOT NULL PRIMARY KEY COMMENT '记录 ID',
    table_id        VARCHAR(64)  NOT NULL COMMENT 'base_tables.id',
    field_values    JSON         NOT NULL COMMENT '字段值 JSON',
    sort_order      INT          NOT NULL DEFAULT 0 COMMENT '排序序号',
    version         INT          NOT NULL DEFAULT 1 COMMENT '记录版本号',
    created_by      CHAR(36)     NOT NULL COMMENT '创建人 users.id',
    updated_by      CHAR(36)     NOT NULL COMMENT '更新人 users.id',
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted_at      TIMESTAMP    NULL DEFAULT NULL COMMENT '软删除时间',
    KEY idx_base_records_table (table_id, sort_order),
    KEY idx_base_records_active (table_id, deleted_at),
    CONSTRAINT fk_base_records_table FOREIGN KEY (table_id) REFERENCES base_tables(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS base_views (
    id              VARCHAR(64)  NOT NULL PRIMARY KEY COMMENT '视图 ID',
    table_id        VARCHAR(64)  NOT NULL COMMENT 'base_tables.id',
    name            VARCHAR(255) NOT NULL COMMENT '视图名称',
    view_type       VARCHAR(32)  NOT NULL COMMENT 'grid|kanban|form 等',
    config          JSON         NOT NULL COMMENT '视图配置 JSON',
    created_by      CHAR(36)     NOT NULL COMMENT '创建人 users.id',
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_base_views_table (table_id),
    CONSTRAINT fk_base_views_table FOREIGN KEY (table_id) REFERENCES base_tables(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 租户 / 组织 / 成员（P0）
-- ==========================================
CREATE TABLE IF NOT EXISTS tenants (
    id                      CHAR(36)     NOT NULL PRIMARY KEY COMMENT '主键 UUID',
    name                    VARCHAR(128) NOT NULL COMMENT '企业/团队名称',
    space_slug              VARCHAR(64)  DEFAULT NULL COMMENT '组织空间标识',
    default_book_slug       VARCHAR(32)  DEFAULT NULL COMMENT '组织默认知识库标识',
    status                  TINYINT      NOT NULL DEFAULT 1 COMMENT '0=禁用 1=正常',
    admin_user_id           CHAR(36)     DEFAULT NULL COMMENT '租户超级管理员 users.id',
    deploy_type             TINYINT      NOT NULL DEFAULT 1 COMMENT '1=SaaS 2=本地私有化 3=专属私有化',
    is_physical_isolate     TINYINT      NOT NULL DEFAULT 0 COMMENT '1=物理隔离部署',
    account_mode            TINYINT      NOT NULL DEFAULT 1 COMMENT '1=云端账号 2=本地离线账号',
    is_allow_multi_switch   TINYINT      NOT NULL DEFAULT 1 COMMENT '1=允许多身份切换',
    db_instance_id          VARCHAR(64)  DEFAULT NULL COMMENT '专属库实例标识',
    storage_cluster_id      VARCHAR(64)  DEFAULT NULL COMMENT '专属存储集群标识',
    private_config          JSON         DEFAULT NULL COMMENT '私有化扩展配置',
    team_plan               TINYINT      NOT NULL DEFAULT 1 COMMENT '1=免费 2=会员 3=试用',
    team_vip_expire_at      TIMESTAMP    NULL DEFAULT NULL COMMENT '团队会员/试用到期，NULL=永久',
    created_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_tenants_status (status),
    UNIQUE KEY uk_tenants_space_slug (space_slug),
    CONSTRAINT fk_tenants_admin FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenant_members (
    id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
    tenant_id       CHAR(36)     NOT NULL COMMENT 'tenants.id',
    user_id         CHAR(36)     NOT NULL COMMENT 'users.id',
    user_source     TINYINT      NOT NULL DEFAULT 1 COMMENT '1=global 2=local',
    org_id          CHAR(36)     DEFAULT NULL COMMENT 'organizations.id',
    tenant_role     TINYINT      NOT NULL DEFAULT 3 COMMENT '1=超管 2=管理员 3=成员',
    status          TINYINT      NOT NULL DEFAULT 1 COMMENT '0=禁用 1=正常',
    joined_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
    UNIQUE KEY uk_tenant_user (tenant_id, user_id),
    KEY idx_tenant_members_user (user_id),
    KEY idx_tenant_members_org (tenant_id, org_id),
    CONSTRAINT fk_tm_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_tm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS organizations (
    id              CHAR(36)     NOT NULL PRIMARY KEY COMMENT '主键 UUID',
    tenant_id       CHAR(36)     NOT NULL COMMENT 'tenants.id',
    parent_id       CHAR(36)     DEFAULT NULL COMMENT '父组织 ID，NULL=根级',
    name            VARCHAR(128) NOT NULL COMMENT '组织名称',
    sort_order      INT          NOT NULL DEFAULT 0 COMMENT '同级排序',
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_org_tenant (tenant_id),
    KEY idx_org_parent (tenant_id, parent_id),
    CONSTRAINT fk_org_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 预约演示申请
-- ==========================================
CREATE TABLE IF NOT EXISTS demo_requests (
    id              CHAR(36)      NOT NULL PRIMARY KEY COMMENT '主键 UUID',
    name            VARCHAR(100)  NOT NULL COMMENT '联系人姓名',
    phone           VARCHAR(20)   NOT NULL COMMENT '联系电话',
    company         VARCHAR(200)  NOT NULL COMMENT '公司名称',
    company_size    VARCHAR(50)   NOT NULL COMMENT '企业规模',
    scenario        VARCHAR(100)  NOT NULL COMMENT '使用场景',
    products        JSON          NOT NULL COMMENT '申请演示的产品（多选）',
    questions       TEXT          NOT NULL COMMENT '主要想了解的问题',
    status          VARCHAR(20)   NOT NULL DEFAULT 'pending' COMMENT 'pending | contacted | closed',
    ip              VARCHAR(45)   DEFAULT NULL COMMENT '提交 IP',
    user_agent      VARCHAR(500)  DEFAULT NULL COMMENT '提交 UA',
    submitted_by    CHAR(36)      DEFAULT NULL COMMENT '已登录 C 端用户 ID',
    contacted_at    TIMESTAMP     NULL DEFAULT NULL COMMENT '首次跟进时间',
    admin_note      TEXT          DEFAULT NULL COMMENT '内部备注',
    processed_by    CHAR(36)      DEFAULT NULL COMMENT '处理人（管理员）',
    processed_at    TIMESTAMP     NULL DEFAULT NULL COMMENT '处理时间',
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '提交时间',
    updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_demo_requests_status_created (status, created_at DESC),
    KEY idx_demo_requests_phone (phone),
    KEY idx_demo_requests_created (created_at DESC),
    CONSTRAINT fk_demo_requests_user FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_demo_requests_processor FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 知识库 / Wiki
-- ==========================================
CREATE TABLE IF NOT EXISTS knowledge_bases (
    id              CHAR(36)     NOT NULL PRIMARY KEY COMMENT '主键 UUID',
    scope           TINYINT      NOT NULL DEFAULT 2 COMMENT '1=个人 2=企业',
    owner_id        CHAR(36)     DEFAULT NULL COMMENT '个人 scope 所有者 users.id',
    tenant_id       CHAR(36)     DEFAULT NULL COMMENT '企业 scope 租户 tenants.id',
    org_id          CHAR(36)     DEFAULT NULL COMMENT '可选组织 organizations.id',
    name            VARCHAR(200) NOT NULL COMMENT '知识库名称',
    kb_slug         VARCHAR(32)  DEFAULT NULL COMMENT '知识库路径标识',
    description     TEXT         DEFAULT NULL COMMENT '简介',
    emoji           VARCHAR(16)  DEFAULT '📘' COMMENT '封面 emoji',
    cover           VARCHAR(20)  NOT NULL DEFAULT 'blue' COMMENT 'blue|sunset',
    visibility      VARCHAR(20)  NOT NULL DEFAULT 'members' COMMENT 'members|organization',
    created_by      CHAR(36)     NOT NULL COMMENT '创建人 users.id',
    updated_by      CHAR(36)     NOT NULL COMMENT '更新人 users.id',
    is_deleted      TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1=已软删除',
    deleted_at      TIMESTAMP    NULL DEFAULT NULL COMMENT '软删除时间',
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_kb_tenant (tenant_id, is_deleted, updated_at),
    KEY idx_kb_owner (owner_id, is_deleted, updated_at),
    KEY idx_kb_scope (scope, is_deleted),
    UNIQUE KEY uk_kb_slug (kb_slug),
    CONSTRAINT fk_kb_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_kb_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_kb_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL,
    CONSTRAINT fk_kb_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_kb_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_kb_visibility CHECK (visibility IN ('members', 'organization'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kb_nodes (
    id              CHAR(36)     NOT NULL PRIMARY KEY COMMENT '主键 UUID',
    kb_id           CHAR(36)     NOT NULL COMMENT 'knowledge_bases.id',
    parent_id       CHAR(36)     DEFAULT NULL COMMENT '父节点 ID，NULL=根级',
    title           VARCHAR(500) NOT NULL COMMENT '节点标题',
    node_type       VARCHAR(20)  NOT NULL COMMENT 'page|doc_ref|folder',
    doc_id          VARCHAR(64)  DEFAULT NULL COMMENT 'doc_ref 时关联 documents.id',
    sort_order      INT          NOT NULL DEFAULT 0 COMMENT '同级排序',
    is_home         TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1=知识库首页节点',
    created_by      CHAR(36)     NOT NULL COMMENT '创建人 users.id',
    is_deleted      TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1=已软删除',
    deleted_at      TIMESTAMP    NULL DEFAULT NULL COMMENT '软删除时间',
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_kb_nodes_kb (kb_id, parent_id, sort_order, is_deleted),
    KEY idx_kb_nodes_doc (doc_id),
    CONSTRAINT fk_kb_nodes_kb FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    CONSTRAINT fk_kb_nodes_parent FOREIGN KEY (parent_id) REFERENCES kb_nodes(id) ON DELETE SET NULL,
    CONSTRAINT fk_kb_nodes_doc FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE SET NULL,
    CONSTRAINT fk_kb_nodes_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_kb_node_type CHECK (node_type IN ('page', 'doc_ref', 'folder'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kb_members (
    id              CHAR(36)     NOT NULL PRIMARY KEY COMMENT '主键 UUID',
    kb_id           CHAR(36)     NOT NULL COMMENT 'knowledge_bases.id',
    user_id         CHAR(36)     NOT NULL COMMENT 'users.id',
    role            VARCHAR(20)  NOT NULL DEFAULT 'viewer' COMMENT 'owner|admin|editor|viewer',
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
    UNIQUE KEY uk_kb_member (kb_id, user_id),
    KEY idx_kb_member_user (user_id),
    CONSTRAINT fk_kb_members_kb FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    CONSTRAINT fk_kb_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_kb_member_role CHECK (role IN ('owner', 'admin', 'editor', 'viewer'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 文档分享
-- ==========================================
CREATE TABLE IF NOT EXISTS doc_share (
    id                  CHAR(36)     NOT NULL PRIMARY KEY COMMENT '主键 UUID',
    doc_id              VARCHAR(64)  NOT NULL COMMENT 'documents.id',
    share_type          VARCHAR(20)  NOT NULL DEFAULT 'link' COMMENT 'link|member',
    share_token         VARCHAR(64)  NOT NULL COMMENT '公开链接 Token',
    permission_level    VARCHAR(20)  NOT NULL DEFAULT 'read' COMMENT 'read|comment|edit|manage|none',
    expire_time         TIMESTAMP    NULL DEFAULT NULL COMMENT 'NULL=永久有效',
    password_hash       VARCHAR(255) NULL DEFAULT NULL COMMENT '访问密码 bcrypt 哈希',
    ip_whitelist        JSON         NULL DEFAULT NULL COMMENT 'V1.2 IP 白名单',
    allow_download      TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '1=允许下载',
    allow_print         TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '1=允许打印',
    allow_copy          TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '1=允许复制',
    allow_reshare       TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1=允许再分享',
    watermark_enabled   TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1=启用水印',
    status              TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '1=开启 0=关闭',
    created_by          CHAR(36)     NOT NULL COMMENT '创建人 users.id',
    updated_by          CHAR(36)     NOT NULL COMMENT '更新人 users.id',
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_doc_share_doc_type (doc_id, share_type),
    UNIQUE KEY uk_doc_share_token (share_token),
    KEY idx_doc_share_status (status, expire_time),
    CONSTRAINT fk_doc_share_doc FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE,
    CONSTRAINT fk_doc_share_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_doc_share_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_doc_share_type CHECK (share_type IN ('link', 'member')),
    CONSTRAINT chk_doc_share_permission CHECK (permission_level IN ('none', 'read', 'comment', 'edit', 'manage'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS doc_share_user (
    id                  CHAR(36)     NOT NULL PRIMARY KEY COMMENT '主键 UUID',
    doc_id              VARCHAR(64)  NOT NULL COMMENT 'documents.id',
    subject_type        VARCHAR(20)  NOT NULL DEFAULT 'user' COMMENT 'user|dept|group',
    subject_id          CHAR(36)     NOT NULL COMMENT '授权主体 ID',
    permission_level    VARCHAR(20)  NOT NULL DEFAULT 'read' COMMENT 'read|comment|edit|manage|none',
    granted_by          CHAR(36)     NOT NULL COMMENT '授权人 users.id',
    expire_time         TIMESTAMP    NULL DEFAULT NULL COMMENT '授权到期，NULL=永久',
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_doc_share_user (doc_id, subject_type, subject_id),
    KEY idx_doc_share_user_subject (subject_id, subject_type),
    CONSTRAINT fk_doc_share_user_doc FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE,
    CONSTRAINT fk_doc_share_user_granted_by FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_doc_share_user_type CHECK (subject_type IN ('user', 'dept', 'group')),
    CONSTRAINT chk_doc_share_user_permission CHECK (permission_level IN ('none', 'read', 'comment', 'edit', 'manage'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS doc_share_visit_log (
    id                  CHAR(36)     NOT NULL PRIMARY KEY COMMENT '主键 UUID',
    doc_id              VARCHAR(64)  NOT NULL COMMENT 'documents.id',
    share_token         VARCHAR(64)  NULL DEFAULT NULL COMMENT '访问使用的 share_token',
    visitor_id          CHAR(36)     NULL DEFAULT NULL COMMENT '登录用户 ID，匿名 NULL',
    visitor_ip          VARCHAR(64)  NULL DEFAULT NULL COMMENT '访客 IP',
    device_info         VARCHAR(500) NULL DEFAULT NULL COMMENT '设备 UA 摘要',
    visit_status        VARCHAR(30)  NOT NULL COMMENT 'success|denied|password_error|expired|closed',
    operate_content     VARCHAR(500) NULL DEFAULT NULL COMMENT '操作摘要',
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '访问时间',
    KEY idx_doc_share_visit_doc (doc_id, created_at),
    KEY idx_doc_share_visit_token (share_token, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS doc_share_audit_log (
    id                  CHAR(36)     NOT NULL PRIMARY KEY COMMENT '主键 UUID',
    doc_id              VARCHAR(64)  NOT NULL COMMENT 'documents.id',
    operator_id         CHAR(36)     NOT NULL COMMENT '操作人 users.id',
    operator_ip         VARCHAR(64)  NULL DEFAULT NULL COMMENT '操作 IP',
    action              VARCHAR(50)  NOT NULL COMMENT 'create|update|close|add_collaborator|remove_collaborator',
    before_json         JSON         NULL DEFAULT NULL COMMENT '变更前快照',
    after_json          JSON         NULL DEFAULT NULL COMMENT '变更后快照',
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
    KEY idx_doc_share_audit_doc (doc_id, created_at),
    KEY idx_doc_share_audit_operator (operator_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS doc_share_join_request (
    id                  CHAR(36)     NOT NULL PRIMARY KEY COMMENT '主键 UUID',
    doc_id              VARCHAR(64)  NOT NULL COMMENT 'documents.id',
    applicant_id        CHAR(36)     NOT NULL COMMENT '申请人 users.id',
    permission_level    VARCHAR(20)  NOT NULL DEFAULT 'read' COMMENT 'read|comment|edit|manage|none',
    status              VARCHAR(20)  NOT NULL DEFAULT 'pending' COMMENT 'pending|approved|rejected',
    message             VARCHAR(500) NULL DEFAULT NULL COMMENT '申请留言',
    reviewed_by         CHAR(36)     NULL DEFAULT NULL COMMENT '审批人 users.id',
    reviewed_at         TIMESTAMP    NULL DEFAULT NULL COMMENT '审批时间',
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '申请时间',
    KEY idx_doc_share_join_doc (doc_id, status, created_at),
    KEY idx_doc_share_join_applicant (applicant_id, status),
    UNIQUE KEY uk_doc_share_join_pending (doc_id, applicant_id, status),
    CONSTRAINT fk_doc_share_join_doc FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE,
    CONSTRAINT fk_doc_share_join_applicant FOREIGN KEY (applicant_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_doc_share_join_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_doc_share_join_status CHECK (status IN ('pending', 'approved', 'rejected')),
    CONSTRAINT chk_doc_share_join_permission CHECK (permission_level IN ('none', 'read', 'comment', 'edit', 'manage'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 文档模板中心
-- ==========================================
CREATE TABLE IF NOT EXISTS doc_templates (
    id              VARCHAR(64)   NOT NULL PRIMARY KEY COMMENT '模板 slug，如 weekly-report',
    title           VARCHAR(200)  NOT NULL COMMENT '模板展示标题',
    subtitle        VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '副标题',
    doc_type        VARCHAR(20)   NOT NULL COMMENT 'richtext|freeform|base|mindnote|slides|whiteboard',
    document_title  VARCHAR(500)  NOT NULL COMMENT '用模板创建时的默认文档标题',
    categories      JSON          NOT NULL COMMENT '分类 ID 数组',
    usage_label     VARCHAR(100)  DEFAULT NULL COMMENT '使用量展示文案',
    is_new          TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '1=标新',
    is_blank        TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '1=空白模板',
    thumb_gradient  VARCHAR(500)  NOT NULL DEFAULT 'linear-gradient(135deg, #e3f2fd 0%, #90caf9 100%)' COMMENT '缩略图渐变 CSS',
    content_json    JSON          DEFAULT NULL COMMENT '模板内容快照',
    status          VARCHAR(20)   NOT NULL DEFAULT 'draft' COMMENT 'draft|published|archived',
    sort_order      INT           NOT NULL DEFAULT 0 COMMENT '列表排序，越大越靠前',
    use_count       INT           NOT NULL DEFAULT 0 COMMENT '使用次数统计',
    created_by      CHAR(36)      DEFAULT NULL COMMENT '创建人 users.id',
    updated_by      CHAR(36)      DEFAULT NULL COMMENT '更新人 users.id',
    published_at    TIMESTAMP     NULL DEFAULT NULL COMMENT '发布时间',
    is_deleted      TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '1=已软删除',
    deleted_at      TIMESTAMP     NULL DEFAULT NULL COMMENT '软删除时间',
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_doc_templates_list (status, is_deleted, sort_order DESC, updated_at DESC),
    KEY idx_doc_templates_deleted_sort (is_deleted, sort_order, updated_at),
    KEY idx_doc_templates_type (doc_type, status, is_deleted),
    CONSTRAINT chk_doc_templates_status CHECK (status IN ('draft', 'published', 'archived')),
    CONSTRAINT chk_doc_templates_doc_type CHECK (doc_type IN ('richtext', 'freeform', 'base', 'mindnote', 'slides', 'whiteboard'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO doc_templates (id, title, subtitle, doc_type, document_title, categories, is_blank, status, sort_order, thumb_gradient)
VALUES
  ('blank-richtext', '空白文档', '从零开始撰写', 'richtext', '未命名文档', JSON_ARRAY('recommended'), 1, 'published', 1000, 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)'),
  ('blank-freeform', '空白表格', '普通表格', 'freeform', '未命名表格', JSON_ARRAY('recommended'), 1, 'published', 990, 'linear-gradient(135deg, #e8f5e9 0%, #a5d6a7 100%)'),
  ('blank-base', '空白多维表格', '多维表格', 'base', '未命名多维表格', JSON_ARRAY('recommended'), 1, 'published', 980, 'linear-gradient(135deg, #e3f2fd 0%, #90caf9 100%)'),
  ('blank-mindnote', '空白思维笔记', '思维导图', 'mindnote', '未命名思维笔记', JSON_ARRAY('recommended'), 1, 'published', 970, 'linear-gradient(135deg, #fff3e0 0%, #ffcc80 100%)'),
  ('blank-slides', '空白幻灯片', '幻灯片', 'slides', '未命名幻灯片', JSON_ARRAY('recommended'), 1, 'published', 960, 'linear-gradient(135deg, #fce4ec 0%, #f48fb1 100%)'),
  ('blank-whiteboard', '空白画板', '无限画布协作', 'whiteboard', '未命名画板', JSON_ARRAY('recommended'), 1, 'published', 950, 'linear-gradient(135deg, #e6f4ea 0%, #c8e6c9 100%)')
ON DUPLICATE KEY UPDATE updated_at = updated_at;

-- ==========================================
-- 会员配额流水
-- ==========================================
CREATE TABLE IF NOT EXISTS quota_daily_log (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
    space_kind  TINYINT      NOT NULL COMMENT '1=个人 2=团队',
    space_id    CHAR(36)     NOT NULL COMMENT '个人=userId 团队=tenantId',
    metric      VARCHAR(32)  NOT NULL COMMENT '配额指标，如 export',
    log_date    DATE         NOT NULL COMMENT '统计日期',
    count_value INT          NOT NULL DEFAULT 0 COMMENT '当日累计次数',
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    UNIQUE KEY uk_quota_daily (space_kind, space_id, metric, log_date),
    KEY idx_quota_daily_date (log_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 迁移版本记录
-- ==========================================
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     VARCHAR(100) NOT NULL PRIMARY KEY COMMENT '迁移脚本版本号',
    applied_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '应用时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 管理端 RBAC 与审计
-- ==========================================
CREATE TABLE IF NOT EXISTS admin_roles (
    id          CHAR(36)     NOT NULL PRIMARY KEY COMMENT '主键 UUID',
    code        VARCHAR(50)  NOT NULL COMMENT '角色编码，唯一',
    name        VARCHAR(100) NOT NULL COMMENT '角色名称',
    description TEXT         DEFAULT NULL COMMENT '角色描述',
    is_system   TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1=系统内置不可删',
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_admin_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_permissions (
    id          CHAR(36)     NOT NULL PRIMARY KEY COMMENT '主键 UUID',
    code        VARCHAR(100) NOT NULL COMMENT '权限编码，唯一',
    name        VARCHAR(100) NOT NULL COMMENT '权限名称',
    module      VARCHAR(50)  NOT NULL COMMENT '所属模块',
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_admin_permissions_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_role_permissions (
    role_id       CHAR(36) NOT NULL COMMENT 'admin_roles.id',
    permission_id CHAR(36) NOT NULL COMMENT 'admin_permissions.id',
    PRIMARY KEY (role_id, permission_id),
    CONSTRAINT fk_arp_role FOREIGN KEY (role_id) REFERENCES admin_roles(id) ON DELETE CASCADE,
    CONSTRAINT fk_arp_perm FOREIGN KEY (permission_id) REFERENCES admin_permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_admin_roles (
    user_id     CHAR(36) NOT NULL COMMENT 'users.id',
    role_id     CHAR(36) NOT NULL COMMENT 'admin_roles.id',
    granted_by  CHAR(36) NOT NULL COMMENT '授权人 users.id',
    granted_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '授权时间',
    PRIMARY KEY (user_id, role_id),
    CONSTRAINT fk_uar_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_uar_role FOREIGN KEY (role_id) REFERENCES admin_roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
    operator_id CHAR(36)     NOT NULL COMMENT '操作人 users.id',
    action      VARCHAR(100) NOT NULL COMMENT '操作动作编码',
    target_type VARCHAR(50)  DEFAULT NULL COMMENT '目标类型',
    target_id   VARCHAR(64)  DEFAULT NULL COMMENT '目标 ID',
    detail      JSON         DEFAULT NULL COMMENT '操作详情 JSON',
    ip          VARCHAR(45)  DEFAULT NULL COMMENT '操作 IP',
    user_agent  VARCHAR(500) DEFAULT NULL COMMENT '操作 UA',
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
    KEY idx_audit_operator (operator_id, created_at),
    KEY idx_audit_target (target_type, target_id),
    KEY idx_audit_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_configs (
    config_key   VARCHAR(100) NOT NULL PRIMARY KEY COMMENT '配置键',
    config_value JSON         NOT NULL COMMENT '配置值 JSON',
    description  VARCHAR(500) DEFAULT NULL COMMENT '配置说明',
    updated_by   CHAR(36)     DEFAULT NULL COMMENT '最后更新人 users.id',
    updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_sessions (
    id                 CHAR(36)     NOT NULL PRIMARY KEY COMMENT '主键 UUID',
    user_id            CHAR(36)     NOT NULL COMMENT 'users.id',
    refresh_token_hash VARCHAR(64)  NOT NULL COMMENT 'Refresh Token SHA256',
    client_type        VARCHAR(20)  NOT NULL COMMENT 'consumer | admin',
    session_context    JSON         DEFAULT NULL COMMENT '身份/租户上下文',
    device_info        VARCHAR(500) DEFAULT NULL COMMENT '设备信息',
    ip                 VARCHAR(45)  DEFAULT NULL COMMENT '登录 IP',
    expires_at         TIMESTAMP    NOT NULL COMMENT 'Refresh Token 过期时间',
    revoked_at         TIMESTAMP    NULL DEFAULT NULL COMMENT '吊销时间',
    created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    KEY idx_sessions_user (user_id, client_type),
    KEY idx_sessions_token (refresh_token_hash),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version) VALUES ('20260623_init');
INSERT IGNORE INTO schema_migrations (version) VALUES ('20260623_last_visited');
INSERT IGNORE INTO schema_migrations (version) VALUES ('20260626_scheme3_versioning');
INSERT IGNORE INTO schema_migrations (version) VALUES ('20260629_auth_admin');
INSERT IGNORE INTO schema_migrations (version) VALUES ('20260629_demo_requests');
INSERT IGNORE INTO schema_migrations (version) VALUES ('20260629_document_owner_isolation');
INSERT IGNORE INTO schema_migrations (version) VALUES ('20260629_login_lock_policy');
INSERT IGNORE INTO schema_migrations (version) VALUES ('20260630_demo_request_handling');
INSERT IGNORE INTO schema_migrations (version) VALUES ('20260630_tenant_org');
INSERT IGNORE INTO schema_migrations (version) VALUES ('20260701_knowledge_base');
INSERT IGNORE INTO schema_migrations (version) VALUES ('20260703_document_share');
INSERT IGNORE INTO schema_migrations (version) VALUES ('20260703_document_share_slug_join');
INSERT IGNORE INTO schema_migrations (version) VALUES ('20260704_doc_templates');
INSERT IGNORE INTO schema_migrations (version) VALUES ('20260704_doc_templates_sort_index');
INSERT IGNORE INTO schema_migrations (version) VALUES ('20260705_doc_templates_whiteboard');
INSERT IGNORE INTO schema_migrations (version) VALUES ('20260706_membership');
INSERT IGNORE INTO schema_migrations (version) VALUES ('20260706_membership_p1');
INSERT IGNORE INTO schema_migrations (version) VALUES ('20260706_column_comments');
