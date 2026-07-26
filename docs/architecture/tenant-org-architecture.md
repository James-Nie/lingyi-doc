# 零一文档 用户-组织-租户多级架构设计

> **版本**：v2.0  
> **日期**：2026-06-30  
> **状态**：P0 已实施（2026-06-30）  
> **对标产品**：飞书、钉钉、语雀文档协作体系  
> **关联文档**：[auth-and-admin-design.md](./auth-and-admin-design.md)、[server-database-design.md](./server-database-design.md)、[membership-architecture.md](./membership-architecture.md)

---

## 1. 方案概述

### 1.1 设计背景

协作类产品主流采用「全局用户 → 多企业租户 → 租户内组织」三层模型，支持**个人私有空间**与**企业团队空间**身份切换。零一文档 需同时交付两类形态：

| 形态 | 说明 |
|------|------|
| **公有 SaaS 线上服务** | 统一集群承载大量企业租户，库内通过 `tenant_id` 逻辑隔离 |
| **私有化部署**（本地机房 / 专属集群） | 单实例仅运行单一企业租户，离线运行，满足数据不出域、等保、内网对接等合规要求 |

**核心前置约束**

- 一套统一业务代码底座，SaaS 集群与各私有化客户实例**存储资源完全物理隔离**
- 环境之间**无实时数据互通**，仅支持离线文件导入导出迁移
- 源码、镜像统一；差异化逻辑通过环境配置 + `deploy_type` 运行时分支，**无 SaaS / 私有化双分支维护**

**与现有代码库的关系**

当前项目（M1/M2）已实现：C 端 / 管理端双 JWT、`users` 单表、`documents.owner_id` 个人隔离。本方案在现有基建上**最小侵入扩展**，不推倒重来。

### 1.2 已确认设计决策（v2.0 落地约束）

| 决策项 | 结论 |
|--------|------|
| **主键类型** | 全链路统一 **UUID**（`CHAR(36)`），与现有 `users.id`、`documents.owner_id` 一致；**不使用 BIGINT**，避免混用 |
| **管理端分层** | `@lingyi-doc/admin` 保留**平台超管**视角；租户管理员在同一 admin 应用内增加**「租户视角」**模块，不另建租户端应用 |
| **P0 范围** | **不包含** LDAP/AD 登录、**不包含** 独立 `local_sys_user` 分表；P0 仅标准单表 `users` + 环境分支 |
| **用户表命名** | 沿用现有 `users` 表，扩展字段；概念上对应方案中的 `sys_user`，不做表重命名 |

### 1.3 核心需求

1. 同一自然人支持**个人身份**、**租户组织身份**两种登录形态，支持一键切换
2. 租户为最高数据隔离边界，跨租户数据严格隔离，禁止越权访问
3. 租户内支持树形组织架构，用于权限、通讯录、资源分组
4. 单套代码同时支撑 SaaS 与私有化，无多分支维护成本
5. 分层数据隔离：SaaS 共享库逻辑隔离，私有化独立资源物理隔离
6. 区分个人私有资源、企业团队资源，数据归属完全割裂
7. 差异化管控计费、云端登录、多租户切换、外部协作、离线运维等功能

### 1.4 设计目标

1. 架构对齐飞书 / 钉钉 / 语雀成熟协作模型
2. 通过 `deploy_type` 环境配置自动适配业务逻辑
3. 存储、中间件、数据库全环境物理隔离，从底层杜绝跨环境数据泄露
4. 完整适配 SaaS 线上运营、私有化离线交付、离线数据备份审计等场景

---

## 2. 核心领域概念

### 2.1 租户 Tenant（最高数据隔离单元）

租户对应独立企业 / 机构。各环境数据库独立隔离，不存在多环境数据混存。

| `deploy_type` | 名称 | 说明 |
|---------------|------|------|
| `1` | 公有 SaaS 租户 | 共享集群，库内多租户 `tenant_id` 逻辑隔离；用户可加入多家企业并切换 |
| `2` | 本地私有化租户 | 独立服务器与数据库，实例预置 **1 条**租户，禁止新建；离线运行 |
| `3` | 专属私有化集群 | 厂商独占资源，服务单一客户；内部可多层级组织，不支持外部租户入驻 |

关键字段：

- `is_physical_isolate`：是否分配独立数据库 / 存储（私有化标配）
- `is_allow_multi_switch`：是否展示多租户切换（SaaS=`1`，私有化=`0`）

### 2.2 组织 Organization

租户内部树形架构，所有组织必须绑定唯一 `tenant_id`，不可跨租户。

- **根组织**：租户初始化自动生成
- **子组织**：部门、分公司、虚拟项目小组
- 用于批量分配文档权限、部门通讯录、部门管理员权限

### 2.3 用户 User（标准单表 `users`）

统一采用现有 `users` 表，通过 `user_source` 区分账号来源。因 SaaS 与私有化**分库物理隔离**，两类账号不会出现在同一库中：

| `user_source` | 名称 | 存在环境 |
|---------------|------|----------|
| `1` | global 云端账号 | 仅 SaaS 公有集群库 |
| `2` | local 本地私有化账号 | 仅私有化客户独立库 |

SaaS 库：`UNIQUE(email)` / `UNIQUE(phone)` 保证云端账号全局唯一。  
私有化库：同一实例内手机号 / 邮箱不重复即可。

用户自带**个人私有空间**：资源仅绑定 `owner_id`（对应 `user_id`），`tenant_id` 为空，与企业团队数据完全隔离。

> **P0 不包含**：`enable_separate_local_user_table` 独立本地用户表（等保涉密场景，列入 P2 可选增强）。

### 2.4 两种登录身份模式

| 模式 | 会话上下文 | 数据范围 |
|------|------------|----------|
| **个人身份** | `currentIdentityType=personal`，`currentTenantId=null` | 仅当前用户的个人私有文档与配置 |
| **租户组织身份** | `currentIdentityType=tenant`，携带有效 `tenant_id` | 当前租户内有权限的团队资源 |

差异化：

- **SaaS**：下拉展示全部已加入租户，自由切换
- **私有化**：固定唯一租户，隐藏多租户切换；后端拦截跨租户请求

---

## 3. 整体架构分层

```
┌─────────────────────────────────────────────────────────────────┐
│  @lingyi-doc/web (C 端)          @lingyi-doc/admin (管理端)            │
│  个人空间 / 企业空间切换          平台超管视角 + 租户视角          │
└────────────────────────────┬────────────────────────────────────┘
                             │ Bearer JWT（扩展 tenant / identity claims）
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     lingyi-doc-server 统一网关层                       │
│  requireAuth · 会话上下文注入 · 租户 SQL 过滤 · 跨租户拦截       │
├─────────────────────────────────────────────────────────────────┤
│  全局账号层    users + 个人私有数据 + auth_sessions              │
│  租户管控层    tenants + tenant_members + 租户配置               │
│  组织权限层    organizations + 租户内角色                        │
│  业务资源层    documents（个人 / 企业互斥隔离）                   │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
              MySQL（SaaS 共享库 / 私有化独立库，物理隔离）
```

**全局强制规则**

1. 企业资源必须携带 `tenant_id`；个人资源 `tenant_id` 为空；二者互斥
2. 所有接口透传会话上下文（部署类型、账号来源、当前租户、身份模式）
3. 篡改非法 `tenant_id`、跨租户访问统一返回 403
4. 私有化实例禁用云端依赖：在线支付、云端短信、互联网 OAuth、跨企业邀请

---

## 4. 与现有表结构的映射

### 4.1 ID 规范（全链路 UUID）

| 实体 | 类型 | 生成方式 | 示例 |
|------|------|----------|------|
| 用户 `users.id` | `CHAR(36)` | UUID v4 | `550e8400-e29b-41d4-a716-446655440000` |
| 租户 `tenants.id` | `CHAR(36)` | UUID v4 | 同上 |
| 组织 `organizations.id` | `CHAR(36)` | UUID v4 | 同上 |
| 文档 `documents.id` | `VARCHAR(64)` | 沿用现有 | `doc_a1b2c3d4` |
| 关联表自增主键 | `BIGINT AUTO_INCREMENT` | 仅内部关联表 | `tenant_members.id` |

**原则**：业务实体主键一律 UUID 字符串；仅纯关联表（如 `tenant_members`）可使用自增 `BIGINT` 作为行主键，外键仍指向 UUID。

### 4.2 用户表 `users`（扩展，非新建 `sys_user`）

在现有表上增量扩展：

```sql
ALTER TABLE users
  ADD COLUMN user_source TINYINT NOT NULL DEFAULT 1
    COMMENT '1=global(SaaS) 2=local(私有化)' AFTER user_type,
  ADD COLUMN oauth_union_id VARCHAR(128) DEFAULT NULL
    COMMENT '云端第三方登录 ID，私有化恒 NULL' AFTER phone,
  ADD COLUMN ldap_uuid VARCHAR(128) DEFAULT NULL
    COMMENT 'LDAP 唯一标识，P0 预留字段，暂不启用' AFTER oauth_union_id,
  ADD COLUMN personal_setting JSON DEFAULT NULL
    COMMENT '个人全局配置' AFTER ldap_uuid;
```

索引（按部署环境初始化脚本二选一）：

- **SaaS**：保留 `UNIQUE(email)`；有手机号时 `UNIQUE(phone)`
- **私有化**：`UNIQUE KEY uk_source_phone (user_source, phone)`（email 同理可选）

### 4.3 租户主表 `tenants`（新建）

```sql
CREATE TABLE IF NOT EXISTS tenants (
    id                      CHAR(36)     NOT NULL PRIMARY KEY,
    name                    VARCHAR(128) NOT NULL COMMENT '企业名称',
    status                  TINYINT      NOT NULL DEFAULT 1 COMMENT '0禁用 1正常',
    admin_user_id           CHAR(36)     DEFAULT NULL COMMENT '租户超级管理员 users.id',
    deploy_type             TINYINT      NOT NULL DEFAULT 1 COMMENT '1=SaaS 2=本地私有化 3=专属私有化',
    is_physical_isolate     TINYINT      NOT NULL DEFAULT 0 COMMENT '0逻辑隔离 1独立库/存储',
    account_mode            TINYINT      NOT NULL DEFAULT 1 COMMENT '1=云端全局账号 2=本地离线账号',
    is_allow_multi_switch   TINYINT      NOT NULL DEFAULT 1 COMMENT 'SaaS=1 私有化=0',
    db_instance_id          VARCHAR(64)  DEFAULT NULL COMMENT '物理隔离专属库实例 ID',
    storage_cluster_id      VARCHAR(64)  DEFAULT NULL COMMENT '专属存储集群 ID',
    private_config          JSON         DEFAULT NULL COMMENT '私有化定制配置',
    created_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_tenants_status (status),
    CONSTRAINT fk_tenants_admin FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 4.4 租户成员关联表 `tenant_members`（新建）

```sql
CREATE TABLE IF NOT EXISTS tenant_members (
    id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tenant_id       CHAR(36)     NOT NULL,
    user_id         CHAR(36)     NOT NULL,
    user_source     TINYINT      NOT NULL DEFAULT 1 COMMENT '1=global 2=local',
    org_id          CHAR(36)     DEFAULT NULL COMMENT '所属组织',
    tenant_role     TINYINT      NOT NULL DEFAULT 3 COMMENT '1超管 2管理员 3普通成员',
    status          TINYINT      NOT NULL DEFAULT 1 COMMENT '0离职禁用 1正常',
    joined_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_tenant_user (tenant_id, user_id),
    KEY idx_tenant_members_user (user_id),
    KEY idx_tenant_members_org (tenant_id, org_id),
    CONSTRAINT fk_tm_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_tm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 4.5 组织架构表 `organizations`（新建）

```sql
CREATE TABLE IF NOT EXISTS organizations (
    id              CHAR(36)     NOT NULL PRIMARY KEY,
    tenant_id       CHAR(36)     NOT NULL,
    parent_id       CHAR(36)     DEFAULT NULL COMMENT '父组织 ID，根组织为 NULL',
    name            VARCHAR(128) NOT NULL,
    sort_order      INT          NOT NULL DEFAULT 0,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_org_tenant (tenant_id),
    KEY idx_org_parent (tenant_id, parent_id),
    CONSTRAINT fk_org_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 4.6 文档表 `documents`（扩展）

在现有 `owner_id` 模型上扩展企业与个人互斥字段：

```sql
ALTER TABLE documents
  ADD COLUMN tenant_id   CHAR(36) DEFAULT NULL COMMENT '企业文档必填，个人文档 NULL',
  ADD COLUMN org_id      CHAR(36) DEFAULT NULL COMMENT '归属组织，仅企业文档',
  ADD COLUMN scope       TINYINT  NOT NULL DEFAULT 1
    COMMENT '1=个人私有 2=企业团队' AFTER doc_type,
  ADD KEY idx_documents_tenant (tenant_id, is_deleted),
  ADD KEY idx_documents_scope (scope, owner_id);
```

| `scope` | `owner_id` | `tenant_id` | 说明 |
|---------|------------|-------------|------|
| `1` 个人 | 必填 | `NULL` | 个人私有文档（**现有行为**） |
| `2` 企业 | 创建人 ID | 必填 | 团队文档，按租户 + 组织 + 权限访问 |

**兼容策略**：历史数据默认 `scope=1`，行为与现网一致；迁移脚本对存量行补 `scope=1`。

---

## 5. 登录与会话上下文

### 5.1 JWT / 请求上下文结构

在现有 C 端 JWT Payload 上扩展（`aud=consumer`）：

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@lingyidoc.com",
  "aud": "consumer",
  "userType": "consumer",
  "userSource": 1,
  "currentIdentityType": "personal",
  "currentTenantId": null,
  "tenantRole": null,
  "deployType": 1,
  "accountMode": 1
}
```

服务端 `req.auth` / `RequestContext` 统一挂载上述字段，Repository 层只读上下文，**禁止信任客户端 Body 中的 `tenant_id`**。

### 5.2 个人身份登录

1. 校验 `users` 表（邮箱 / 密码或后续 OAuth）
2. 默认 `currentIdentityType=personal`，`currentTenantId=null`
3. 文档列表：`scope=1 AND owner_id = userId`

### 5.3 租户组织身份

1. 校验 `tenant_members` 中用户与目标租户的有效关联
2. 注入 `currentTenantId`、`tenantRole`
3. 文档列表：`scope=2 AND tenant_id = currentTenantId`（叠加组织 / 权限过滤）

### 5.4 身份切换

| 场景 | 前端 | 后端 |
|------|------|------|
| **SaaS** | 顶栏「个人空间 + 已加入企业」下拉，切换刷新 JWT claims | 校验 `tenant_members`，重签 Token |
| **私有化** | 仅「个人 / 当前企业」两个入口，无企业列表 | 拦截切换到非预置租户的请求 → 403 |

---

## 6. 管理端分层：平台超管 + 租户视角

`@lingyi-doc/admin` 保持单一应用，通过**视角切换**区分职责（非两套登录系统）。

### 6.1 平台超管视角（现有能力扩展）

| 能力 | 权限 | 说明 |
|------|------|------|
| 全平台租户列表 | `platform:tenant:read` | SaaS 环境可见全部租户 |
| 租户创建 / 禁用 | `platform:tenant:write` | 私有化环境隐藏创建入口 |
| 全平台用户 / 审计 | 现有 RBAC | 跨租户运营、合规审计 |
| 系统配置 | 现有 `system_configs` | 含 `deploy_type` 只读展示 |

适用角色：`super_admin`、`operator`（平台侧）。

### 6.2 租户视角（P0 新增模块）

租户管理员登录 admin 后，可进入**「当前租户管理」**子空间：

| 模块 | 能力 |
|------|------|
| 组织管理 | 树形部门 CRUD、排序 |
| 成员管理 | 邀请 / 移除成员、分配组织、设置租户角色 |
| 团队文档治理 | 本租户 `scope=2` 文档列表、转移所有权、归档 |
| 租户配置 | 企业名称、Logo、功能黑白名单（读 `tenants.private_config`） |

**权限模型**：在现有 `admin_permissions` 上新增租户域权限码，例如：

- `tenant:org:read` / `tenant:org:write`
- `tenant:member:read` / `tenant:member:write`
- `tenant:document:read` / `tenant:document:write`

租户超管（`tenant_role=1`）自动拥有上述权限；平台 `super_admin` 可 impersonate 任意租户视角。

### 6.3 路由与 UI 示意

```
/admin                          → 平台 Dashboard（超管）
/admin/platform/tenants         → 租户列表（SaaS）
/admin/platform/users           → 全平台用户（现有）
/admin/tenant                   → 租户视角入口（需已选 tenantId）
/admin/tenant/organizations     → 组织架构
/admin/tenant/members           → 成员管理
/admin/tenant/documents         → 团队文档
```

租户视角顶栏展示当前企业名称；SaaS 超管可通过租户选择器切换所管理的租户。

---

## 7. 租户分层数据隔离

### 7.1 逻辑隔离（SaaS 默认）

- 共享 MySQL 实例，所有企业资源查询自动附加 `AND tenant_id = :currentTenantId`
- 缓存 Key、对象存储路径增加 `tenant:{tenantId}:` 前缀
- 全局搜索、列表 API 强制租户维度过滤

### 7.2 物理隔离（私有化标配）

- 独立 MySQL、Redis、MinIO / 对象存储，与 SaaS 及其他客户网络不通
- 库内仅 **1 条** `tenants` 记录；拦截器可配置为「单租户模式」省略部分过滤
- 支持全量离线导出、脱敏备份（P1）

### 7.3 网关统一拦截规则

| 规则 | SaaS | 私有化 |
|------|------|--------|
| 鉴权 | 校验 `tenant_members` | 校验请求租户 = 实例唯一租户 |
| 参数篡改 | Body/Query 中 `tenant_id` 与上下文不一致 → 403 | 同左 |
| 资源创建 | 企业资源服务端写入 `ctx.currentTenantId` | 同左，且禁止指定其他租户 |
| 新建租户 API | 允许（个人身份下） | **禁用**，返回 403 |
| 外部邀请 | 允许 | **禁用** |

实现位置：`packages/lingyi-doc-server/src/middleware/auth.ts` 扩展 + 新建 `middleware/tenantContext.ts`。

---

## 8. 环境配置

### 8.1 服务端环境变量（P0）

```bash
# 部署形态：1=SaaS 2=本地私有化 3=专属私有化
DEPLOY_TYPE=1

# 账号模式：1=云端全局 2=本地离线
ACCOUNT_MODE=1

# 私有化：预置租户 ID（DEPLOY_TYPE=2|3 时必填，启动校验）
DEFAULT_TENANT_ID=

# 是否允许多租户切换 UI（SaaS=1，私有化=0）
ALLOW_MULTI_TENANT_SWITCH=1

# 是否启用租户 SQL 过滤（私有化单租户可设为 0 简化查询）
ENFORCE_TENANT_FILTER=1
```

### 8.2 启动初始化

| `DEPLOY_TYPE` | 启动行为 |
|---------------|----------|
| `1` SaaS | 不预置租户；用户可自行创建 |
| `2` / `3` 私有化 | 若 `tenants` 为空，seed 1 条租户 + 根组织；`user_source` 默认 `2` |

---

## 9. 核心业务流程

### 9.1 用户注册

| 环境 | 流程 |
|------|------|
| SaaS | 邮箱注册 → `user_source=1` → 空白个人空间，无默认租户 |
| 私有化 | 本地注册 → `user_source=2` → 自动关联预置唯一租户 |

### 9.2 创建租户

| 环境 | 流程 |
|------|------|
| SaaS | 个人身份下可创建；创建人 → `tenant_role=1` + 根组织 |
| 私有化 | 前端隐藏；后端拦截 `POST /tenants` |

### 9.3 加入 / 退出租户

- **加入**：SaaS 支持邀请链接；私有化仅管理员在租户视角内添加成员
- **退出 / 移除**：删除或禁用 `tenant_members` 记录；**个人私有文档不受影响**

### 9.4 文档创建（扩展后）

```
个人文档：scope=1, owner_id=userId, tenant_id=NULL
企业文档：scope=2, owner_id=创建人, tenant_id=ctx.currentTenantId, org_id=可选
```

现有 `DocumentRepository` 由 `owner_id = ?` 扩展为「个人 owner 匹配 **或** 企业 tenant 成员权限匹配」。

---

## 10. SaaS 与私有化能力对照

| 能力维度 | 公有 SaaS | 私有化部署 |
|----------|-----------|------------|
| 租户数量 | 多租户动态创建 | 仅 1 条预置租户 |
| 账号存储 | `users`，`user_source=1` | `users`，`user_source=2` |
| 底层存储 | 共享资源池，逻辑隔离 | 独立库 / 中间件，物理隔离 |
| 身份切换 | 个人 + 多企业自由切换 | 个人 + 唯一企业 |
| 外部互通 | 跨租户邀请、外部分享（P1+） | 禁止 |
| 登录方式 | 邮箱密码 + 后续 OAuth（M4） | 邮箱密码；LDAP **P1**，P0 不做 |
| 计费 | 完整套餐（M4） | 无计费，配额本地配置 |
| 管理端 | 平台超管 + 租户视角 | 租户视角为主，平台菜单精简 |

---

## 11. 落地实施优先级

### P0 必做（双场景基础底座）

| # | 任务 | 涉及模块 |
|---|------|----------|
| 1 | 环境变量 `DEPLOY_TYPE` / `ACCOUNT_MODE` / 私有化 seed | `config/env.ts`、启动脚本 |
| 2 | 迁移：`tenants`、`tenant_members`、`organizations`；扩展 `users`、`documents` | `scripts/migrations/` |
| 3 | JWT / 会话上下文扩展（identity、tenantId、deployType） | `authService.ts`、`middleware/auth.ts` |
| 4 | 文档 API 租户过滤 + 个人 / 企业 scope | `documentRepository.ts`、`routes/docs.ts` |
| 5 | C 端身份切换 UI（个人 / 企业） | `@lingyi-doc/web` |
| 6 | Admin 租户视角骨架（组织 / 成员 / 团队文档列表） | `@lingyi-doc/admin` |
| 7 | 私有化：隐藏建租户、多租户切换、外部邀请入口 | 前后端 feature flag |

### P1 私有化安全合规

- 物理隔离部署模板（独立 MySQL / MinIO）
- LDAP/AD 登录（启用 `users.ldap_uuid`）
- 离线全量导出、审计日志
- WebSocket 协同鉴权 + 文档权限校验

### P2 体验与可选增强

- 前端屏蔽 SaaS 无用入口 / 私有化运维面板
- `enable_separate_local_user_table` 高合规分表（**非 P0**）
- 跨租户文档分享、计费模块

---

## 12. 兼容与迁移策略

1. **存量数据**：所有已有文档补 `scope=1`，查询逻辑兼容现网「仅 owner 可见」
2. **存量用户**：补 `user_source`（SaaS 环境默认 `1`）
3. **API 契约**：`/api/v1/c/docs/*` 路径不变；企业文档新增可选 Query `scope=team`
4. **离线迁移**：SaaS 导出包导入私有化时，脚本批量 `user_source: 1 → 2`，保留 UUID 主键
5. **与 auth 设计文档关系**：C 端 / 管理端双 JWT、`aud` 隔离、RBAC 表结构**继续有效**；本方案在其上增加租户维度

---

## 13. 方案总结

本方案在**一套统一代码、多环境物理数据隔离**前提下，将 零一文档 从「单用户个人文档」演进为「个人 + 企业协作」双空间模型：

1. **UUID 全链路统一**，与现有 `users` / `documents` 主键策略一致，避免 BIGINT 混用
2. **沿用 `users` 单表**，通过 `user_source` 与环境分库解决 SaaS / 私有化账号隔离
3. **`@lingyi-doc/admin` 双视角**：平台超管 + 租户管理，不增加独立租户端应用
4. **P0 聚焦底座**：租户 / 组织 / 成员 / 文档 scope + 上下文 + 网关拦截；LDAP 与分表延后
5. **最小侵入**：保留 `owner_id` 个人隔离语义，企业能力为增量扩展

---

## 附录 A：与 V2.0 通用方案差异对照

| 通用方案 V2.0 | 零一文档 落地版 |
|---------------|-----------------|
| `sys_user` BIGINT | `users` CHAR(36) UUID |
| `sys_tenant` BIGINT | `tenants` CHAR(36) UUID |
| 独立 `local_sys_user` | P0 不做；P2 可选 |
| 独立租户管理端 | admin 内「租户视角」 |
| `document.doc_id` BIGINT | `documents.id` VARCHAR(64) 沿用 `doc_*` |

## 附录 B：关键代码路径（实施参考）

| 模块 | 路径 |
|------|------|
| 认证中间件 | `packages/lingyi-doc-server/src/middleware/auth.ts` |
| JWT 签发 | `packages/lingyi-doc-server/src/services/authService.ts` |
| 文档 Repository | `packages/lingyi-doc-server/src/repositories/documentRepository.ts` |
| 文档路由 | `packages/lingyi-doc-server/src/routes/docs.ts` |
| MySQL 主 Schema | `packages/lingyi-doc-server/scripts/init-db-mysql.sql` |
| C 端 Auth Store | `packages/lingyi-doc-web/src/stores/authStore.ts` |
| 管理端 | `packages/lingyi-doc-admin/src/` |
| 现有认证设计 | `docs/auth-and-admin-design.md` |
