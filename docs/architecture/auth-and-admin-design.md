# 零一文档 注册登录与双端身份体系设计

> **版本**：v1.0  
> **日期**：2026-06-29  
> **状态**：已实现 M1（认证基础）+ M2（管理端骨架）

---

## 1. 设计目标

| 目标 | 说明 |
|------|------|
| 身份隔离 | C 端用户（产品使用者）与管理端用户（运营者）账号、登录入口、Token 完全分离 |
| 安全优先 | 管理端禁止公开注册；Token 按 `aud` 隔离；敏感操作写审计日志 |
| 复用现有基建 | 延续 `lingyi-doc-server` + MySQL + JWT + `{ code, data }` API 契约 |
| 渐进演进 | 在现有 `users` 表扩展，文档 API 逐步强制鉴权 |
| 独立管理端 | `@lingyi-doc/admin` 独立 Vite 应用，与 `@lingyi-doc/web` 平行部署 |

**核心原则**：一个自然人一个 `users` 记录，通过 `user_type` + RBAC 区分端与权限；C 端可自助注册，管理端账号仅由超级管理员创建。

---

## 2. 总体架构

```
┌─────────────────────┐     ┌─────────────────────┐
│  @lingyi-doc/web     │     │  @lingyi-doc/admin       │
│  (C端 · 文档/表格)   │     │  (管理端 · 运营台)   │
│  :5173              │     │  :5174              │
└──────────┬──────────┘     └──────────┬──────────┘
           │  Bearer JWT (aud=consumer) │  Bearer JWT (aud=admin)
           └─────────────┬──────────────┘
                         ▼
              ┌──────────────────────┐
              │    lingyi-doc-server      │
              │  /api/v1/c/auth/*    │
              │  /api/v1/c/docs/*    │
              │  /api/v1/admin/*     │
              │  /api/v1/auth/* (废弃)│
              └──────────┬───────────┘
                         ▼
                    MySQL lingyi_doc_db
```

---

## 3. 用户模型

### 3.1 用户类型

| 类型 | `user_type` | 注册方式 | 登录入口 |
|------|-------------|----------|----------|
| C 端用户 | `consumer` | 邮箱自助注册 | desktop `/login` |
| 管理端用户 | `admin` | 仅后台创建 | admin `/login` |

### 3.2 数据库表

**users 扩展字段**：`user_type`、`status`、`last_login_at`、`login_fail_count`、`locked_until`

**RBAC 表**：`admin_roles`、`admin_permissions`、`admin_role_permissions`、`user_admin_roles`

**运营表**：`audit_logs`、`system_configs`、`auth_sessions`

详见迁移脚本 `packages/lingyi-doc-server/scripts/migrations/20260629_auth_admin.sql`。

### 3.3 预置角色

| 角色 code | 说明 |
|-----------|------|
| `super_admin` | 全部权限 |
| `operator` | 用户管理、配置、内容治理 |
| `support` | 用户只读 |
| `auditor` | 审计日志、统计只读 |

---

## 4. API 设计

### 4.1 C 端认证 `/api/v1/c/auth`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/register` | 注册（`user_type=consumer`） |
| POST | `/login` | 登录，签发 `aud=consumer` Token |
| POST | `/refresh` | 刷新 access token |
| POST | `/logout` | 吊销 refresh token |
| GET | `/me` | 当前用户信息 |
| PUT | `/profile` | 修改昵称/头像 |
| PUT | `/password` | 修改密码（需旧密码，用户自助） |

### 4.2 管理端认证 `/api/v1/admin/auth`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/login` | 仅 `user_type=admin` 可登录 |
| POST | `/refresh` | 刷新 token |
| POST | `/logout` | 吊销 session |
| GET | `/me` | 当前管理员 + 角色权限 |

**无 `/register` 接口。**

### 4.3 管理端业务 `/api/v1/admin`

| 模块 | 路径前缀 | 权限 |
|------|----------|------|
| 工作台 | `/dashboard/stats` | `dashboard:read` |
| C 端用户 | `/users` | `user:read` / `user:write` |
| 管理员 | `/admins` | `admin_user:read` / `admin_user:write` |
| 角色 | `/roles` | `admin_user:read` |
| 系统配置 | `/configs` | `config:read` / `config:write` |
| 审计日志 | `/audit-logs` | `audit:read` |

### 4.4 JWT Payload

```typescript
// C 端
{ sub, email, aud: 'consumer', userType: 'consumer' | 'admin' }

// 管理端
{ sub, email, aud: 'admin', userType: 'admin', roles: string[], permissions: string[] }
```

| Token | TTL |
|-------|-----|
| C 端 access | 2h |
| C 端 refresh | 30d |
| 管理端 access | 30min |
| 管理端 refresh | 7d |

### 4.5 文档 API

- 路径：`/api/v1/c/docs`（别名 `/api/v1/docs` 保持兼容）
- 强制 `aud=consumer` 鉴权
- 列表/操作严格按 `owner_id = 当前用户` 过滤，用户仅能访问自己创建的文档

---

## 5. 前端工程

### 5.1 C 端 `@lingyi-doc/web`

```
src/
├── pages/auth/LoginPage.tsx, RegisterPage.tsx
├── pages/account/AccountSettingsPage.tsx  # 昵称、修改密码
├── stores/authStore.ts
└── components/AuthGuard.tsx
```

- Token 存储 key 前缀：`lingyi_doc_c_`
- C 端用户密码在「账号设置 → 修改密码」自助完成，管理端不提供重置

### 5.2 管理端 `@lingyi-doc/admin`

```
src/
├── pages/auth/LoginPage.tsx
├── pages/dashboard/DashboardPage.tsx
├── pages/users/ConsumerUsersPage.tsx
├── pages/admins/AdminUsersPage.tsx
├── pages/configs/SystemConfigsPage.tsx
├── pages/audit/AuditLogPage.tsx
├── layouts/AdminLayout.tsx
├── stores/authStore.ts
└── services/adminApi.ts
```

- Token 存储 key 前缀：`lingyi_doc_admin_`
- 独立端口 `5174`

---

## 6. 安全策略

| 项 | 方案 |
|----|------|
| 密码 | bcrypt cost=12，≥8 位 |
| 暴力破解 | C 端：连续 5 次密码错误锁定 10 分钟，锁定期满自动解锁；管理端账号不参与锁定 |
| Token | `aud` 隔离；refresh token SHA-256 哈希入库 |
| 审计 | 管理端写操作记录 `audit_logs` |

---

## 7. 初始化与迁移

```bash
# 数据库迁移
npm run db:migrate

# 创建默认 C 端测试用户
npm run db:seed

# 创建超级管理员
npm run admin:seed
```

默认账号见 `.env.example` 与 seed 脚本输出。

---

## 8. 实施分期

| 阶段 | 范围 | 状态 |
|------|------|------|
| M1 | DB 迁移、双端 auth API、中间件、desktop 登录注册、文档鉴权 | ✅ |
| M2 | `@lingyi-doc/admin` 工程、Dashboard、用户/管理员/配置/审计 | ✅ |
| M3 | 内容治理、模板管理、公告、运营报表 | 待做 |
| M4 | OAuth、MFA、配额、监控 | 待做 |

租户 / 组织 / 多环境隔离架构见 [tenant-org-architecture.md](./tenant-org-architecture.md)。
