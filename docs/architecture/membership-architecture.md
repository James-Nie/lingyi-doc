# 零一文档 会员权限与配额体系

> **版本**：v1.0  
> **日期**：2026-07-06  
> **状态**：P0 实施中  
> **关联文档**：[tenant-org-architecture.md](./tenant-org-architecture.md)、[auth-and-admin-design.md](./auth-and-admin-design.md)、[server-database-design.md](./server-database-design.md)

---

## 1. 方案概述

### 1.1 设计目标

在现有「个人空间 / 团队空间」租户隔离架构之上，搭建**可扩展、可灰度、可兜底**的会员权限与配额体系，覆盖四档核心账号版本：

| 版本 | 归属租户 | 空间范围 | 团队创建 |
|------|----------|----------|----------|
| **个人免费版** | 个人租户（`users`） | 仅个人空间 `scope=1` | ❌ |
| **个人会员版** | 个人租户 | 仅个人空间 | ❌ |
| **团队免费版** | 团队租户（`tenants`） | 对应团队空间 `scope=2` | 见 §4.3 |
| **团队会员版** | 团队租户 | 对应团队空间 | 见 §4.3 |

**核心隔离规则**（与 [tenant-org-architecture.md](./tenant-org-architecture.md) 一致）：

- 个人账号无论是否会员，**默认不可创建团队**（`users.can_create_team=0`）
- 个人仅可通过「被邀请加入」进入团队空间
- 团队空间内的权限、配额**完全由团队版本决定**，与个人会员身份无关
- 配额按**空间维度**独立计算，个人与团队互不占用

### 1.2 与现有架构的关系

本方案**不新建「团队表」**，在现有表上扩展：

| 方案概念 | 现有实现 | 扩展方式 |
|----------|----------|----------|
| 个人版本身份 | `users` | `personal_plan` / `personal_vip_expire_at` |
| 团队版本身份 | `tenants` | `team_plan` / `team_vip_expire_at` |
| 空间归属 | `documents.scope` + `owner_id` / `tenant_id` | 不另建空间表 |
| 团队成员 | `tenant_members` | 人数配额校验 |
| 租户配置 / 灰度 | `tenants.private_config` | 白名单、功能灰度 |
| 身份上下文 | JWT `currentIdentityType` + `currentTenantId` | 推导 MembershipContext |

### 1.3 五层管控模型

```
租户隔离层  →  scope + tenant_id / owner_id（已有）
版本身份层  →  personal_plan / team_plan + 过期时间
配额规则层  →  存储 / 文档数 / 团队人数 / 日导出（P0：前三项）
功能开关层  →  高级编辑 / 导出 / AI / 企业安全（P0：静态配置 + 装饰器）
安全协作层  →  水印 / 审计 / 外链（P1+，仅团队会员）
```

---

## 2. 数据模型

### 2.1 `users` 扩展

```sql
ALTER TABLE users
  ADD COLUMN personal_plan TINYINT NOT NULL DEFAULT 1
    COMMENT '1=免费 2=会员 3=试用' AFTER personal_setting,
  ADD COLUMN personal_vip_expire_at TIMESTAMP NULL
    COMMENT '会员/试用到期时间，NULL=永久' AFTER personal_plan,
  ADD COLUMN can_create_team TINYINT NOT NULL DEFAULT 0
    COMMENT '0=禁止创建团队 1=允许（运营白名单）' AFTER personal_vip_expire_at;
```

### 2.2 `tenants` 扩展

```sql
ALTER TABLE tenants
  ADD COLUMN team_plan TINYINT NOT NULL DEFAULT 1
    COMMENT '1=免费 2=会员 3=试用' AFTER private_config,
  ADD COLUMN team_vip_expire_at TIMESTAMP NULL AFTER team_plan;
```

### 2.3 配额流水表（P1）

```sql
-- quota_daily_log：按空间维度记录日导出、API 调用等（P1 实现）
```

迁移脚本：`scripts/migrations/20260706_membership.sql`

---

## 3. 四档默认配额（P0 静态配置）

配置位置：`packages/lingyi-doc-server/src/modules/membership/membership-policy.ts`

### 3.1 个人空间

| 指标 | 免费 | 会员 / 试用 |
|------|------|-------------|
| 存储 | 10 GB | 无限制 |
| 文档数 | 500 | 无限制 |
| 日导出 | 20（P1） | 无限制 |

### 3.2 团队空间

| 指标 | 免费 | 会员 / 试用 |
|------|------|-------------|
| 成员数 | 10 | 无限制 |
| 存储 | 50 GB | 无限制 |
| 文档数 | 2000 | 无限制 |
| 日导出 | 100（P1） | 无限制 |

### 3.3 功能开关（节选）

| 功能键 | 个人免费 | 个人会员 | 团队免费 | 团队会员 |
|--------|----------|----------|----------|----------|
| `export_hd` | ❌ | ✅ | ❌ | ✅ |
| `version_unlimited` | ❌ | ✅ | ❌ | ✅ |
| `ai_assist` | ❌ | ✅ | ❌ | ✅ |
| `audit_log` | ❌ | ❌ | ❌ | ✅ |
| `watermark` | ❌ | ❌ | ❌ | ✅ |

---

## 4. 业务规则

### 4.1 版本过期降级

- **不删除数据**；过期后按免费版配额与功能限制生效
- `personal_vip_expire_at` / `team_vip_expire_at` 过期 → 有效版本降为 `free`
- 存储/文档超限 → 只读（P1：`MembershipService.assertWritable`）

### 4.2 试用体系（P0 已接入注册 / 建团队）

| 场景 | 规则 |
|------|------|
| SaaS 新用户注册 | `personal_plan=3`（试用），到期 +7 天 |
| 首次创建团队（需 `can_create_team=1`） | `team_plan=3`，到期 +15 天 |
| 试用到期 | 自动按免费版配额降级 |

### 4.3 团队创建权限

**默认**：`can_create_team=0`，后端 `POST /api/v1/c/tenants` 返回 `120005`。

**例外**（运营 / 产品配置）：

- 后台将用户 `can_create_team` 置为 `1`
- 或写入 `tenants.private_config.membershipWhitelist`

> 与「首次创建团队送 15 天试用」兼容：仅对**已授权创建团队**的用户生效。

### 4.4 权限互斥与叠加

```
最终能力 = 当前空间有效版本的功能开关
         ∧ 租户内角色权限（tenant_role）
         ∧ 文档级 ACL（分享 / 协作者）
```

个人会员**不继承**到团队空间；团队内个人会员用户的团队文档仍受团队版本限制。

### 4.5 私有化部署

- `DeployService.isPrivate()` 为 true 时，团队空间默认视为**团队会员**（全量无限制）
- 个人空间仍可按配置限制或放开（默认免费配额）
- 授权证书表列入 P2

---

## 5. 后端模块

### 5.1 目录结构

```
packages/lingyi-doc-server/src/modules/membership/
├── membership.module.ts
├── membership.controller.ts      # GET /api/v1/c/membership/summary
├── membership.service.ts           # 上下文解析、配额校验、功能开关
├── membership-policy.ts            # 四档默认配额与功能表
└── membership.errors.ts            # 120001~120005 错误码
```

### 5.2 校验链（P0）

```
JwtAuthGuard → TenantContextGuard → Controller
                                      ↓
                            MembershipService.assert*
```

P1 可升级为全局 `MembershipInterceptor` + `@RequireFeature()` 装饰器。

### 5.3 已接入拦截点（P0）

| 接口 | 校验 |
|------|------|
| `POST /api/v1/c/docs` | 当前空间文档数配额 |
| `POST /api/v1/c/tenants` | `can_create_team` + `ERR_TEAM_CREATE_DENY` |

P1：`POST tenant members`、`POST export`、上传附件存储配额。

### 5.4 API

#### `GET /api/v1/c/membership/summary`

返回当前身份对应空间的版本与用量摘要，供个人中心 / 团队顶栏展示。

```json
{
  "spaceKind": "personal",
  "plan": "trial",
  "planLabel": "个人试用",
  "planExpired": false,
  "expireAt": "2026-07-13T00:00:00.000Z",
  "canCreateTeam": false,
  "quotas": {
    "documents": { "used": 12, "limit": null, "percent": null },
    "storageBytes": { "used": 1048576, "limit": null, "percent": null },
    "members": null
  },
  "features": {
    "export_hd": true,
    "ai_assist": true
  }
}
```

---

## 6. 错误码

| 码 | 常量 | HTTP | 说明 |
|----|------|------|------|
| 120001 | `ERR_QUOTA_LIMIT` | 403 | 配额超限（文档 / 存储 / 导出） |
| 120002 | `ERR_VIP_PERMISSION_DENY` | 403 | 功能无权限 |
| 120003 | `ERR_VIP_EXPIRED` | 403 | 会员已过期 |
| 120004 | `ERR_TEAM_MEMBER_LIMIT` | 403 | 团队人数超限 |
| 120005 | `ERR_TEAM_CREATE_DENY` | 403 | 无团队创建权限 |

---

## 7. 前端接入（P0）

| 位置 | 行为 |
|------|------|
| `api/membership.ts` | 封装 summary 接口 |
| 用户菜单 / 选空间页 | `canCreateTeam === false` 时隐藏「创建团队」 |
| 受限功能按钮 | 读 `features.*`，置灰 + 升级引导（P1） |
| 配额 80% | 温和提醒弹窗（P1） |

---

## 8. 分阶段路线图

| 阶段 | 范围 | 状态 |
|------|------|------|
| **P0** | DB 迁移、MembershipService、summary API、文档创建 / 团队创建拦截、注册试用 | 实施中 |
| **P1** | 存储配额、日导出流水、功能装饰器、只读降级、80% 提醒 |
| **P2** | Admin 会员配置、白名单、私有化授权证书、审计 / 水印 |
| **P3** | 计费对接、会员页、升级支付 |

---

## 9. 与 tenant 文档的索引关系

| 主题 | 文档 |
|------|------|
| 个人 / 企业空间隔离 | [tenant-org-architecture.md §2.4、§6](./tenant-org-architecture.md) |
| `scope` / `tenant_id` 语义 | [tenant-org-architecture.md §4.5](./tenant-org-architecture.md) |
| JWT 身份切换 | [tenant-org-architecture.md §5](./tenant-org-architecture.md) |
| 私有化 `deploy_type` | [tenant-org-architecture.md §2.1](./tenant-org-architecture.md) |
| 会员配额与功能 | **本文档** |

---

## 10. 方案总结

本方案在现有租户隔离底座上增量扩展会员字段与校验服务，**不推倒重来**。个人与团队空间配额独立、权限边界清晰，P0 聚焦高频拦截（建文档、建团队）与 summary 接口，后续按 P1~P3 逐步补齐存储、功能开关、商业化与私有化授权。
