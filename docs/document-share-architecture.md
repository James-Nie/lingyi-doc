# 文档分享模块技术方案

> **版本**：v1.0  
> **日期**：2026-07-03  
> **状态**：V1.0 已实现；V1.1 指定成员分享 UI + 与我共享列表已实现  
> **前提约束**：租户为最高数据隔离边界，对齐现有 `scope + tenant_id/owner_id` 文档隔离模型  
> **关联文档**：[auth-and-admin-design.md](./auth-and-admin-design.md)、[server-database-design.md](./server-database-design.md)、[tenant-org-architecture.md](./tenant-org-architecture.md)、[document-share-api.openapi.yaml](./document-share-api.openapi.yaml)

---

## 1. 方案总则

### 1.1 设计目标

对标**飞书文档、语雀**企业级分享能力，构建权限分层、内外隔离、安全可控、可审计的文档分享体系。支持组织内协同、外部访客交付、公开知识分发三大场景，适配自研协同文档产品全业务流程。

### 1.2 核心能力对标

| 能力 | 飞书/语雀 | 本方案 |
|------|-----------|--------|
| 双模式分享 | 指定成员 / 公开链接 | ✅ 同构设计，V1.0 落地链接模式 |
| 五级权限 | 只读/评论/编辑/管理/禁止 | ✅ `read/comment/edit/manage/none` |
| 内外隔离 | 组织内/外/匿名差异化 | ✅ scope 校验 + 外部分享开关（V1.2） |
| 安全风控 | 时效/密码/IP/水印/下载限制 | V1.0 时效+密码；V1.2 IP/水印/功能限制 |
| 审计追溯 | 分享/访问/权限变更日志 | V1.0 操作审计；V1.3 访问统计 |
| 多渠道 | 链接/二维码/iframe | V1.0 链接；V1.4 二维码/iframe |

### 1.3 适用范围

在线文档、表格、多维表、思维笔记等 `documents` 表内所有 `doc_type`，以及知识库内 `doc_ref` 挂载文档的分享授权。

### 1.4 非目标（V1.0 不做）

- IP 白名单、动态水印、下载/打印拦截（V1.2）
- 外部总开关、异常 IP 告警（V1.2）
- 二维码、iframe 内嵌、分享看板（V1.4）
- 跨租户联邦分享

---

## 2. 整体架构

### 2.1 分层架构

```
┌─────────────────────────────────────────────────────────┐
│ 前端：DocShareModal / ShareAccessPage / 顶栏分享入口      │
├─────────────────────────────────────────────────────────┤
│ 业务：DocumentShareService                               │
│   · 分享配置 CRUD · 协作者管理 · 公开鉴权 · 审计写入      │
├─────────────────────────────────────────────────────────┤
│ 数据：doc_share / doc_share_user / doc_share_*_log       │
│ 复用：documents · users · tenant_members                 │
├─────────────────────────────────────────────────────────┤
│ 基础设施：JWT 鉴权 · bcrypt 密码 · Redis 缓存（V1.3）     │
└─────────────────────────────────────────────────────────┘
```

### 2.2 核心业务模型（资源-主体-权限）

| 维度 | 说明 |
|------|------|
| **Resource** | `documents.id`（doc_xxx） |
| **Subject** | 用户 / 部门 / 群组（V1.1）/ 匿名访客（链接 Token） |
| **Permission** | `none` < `read` < `comment` < `edit` < `manage` |

### 2.3 与现有模块关系

- **文档模块**：分享不改变 `documents` 内容存储；公开访问经独立 `/api/v1/share/:token` 链路
- **知识库模块**：KB 成员权限与文档分享权限独立；后续可推导「KB 可读 → 挂载 doc 可读」
- **租户模块**：企业文档分享前校验 `tenant_members`；协作者添加限租户内成员

---

## 3. 权限体系

### 3.1 五级权限

| 级别 | 枚举 | 能力 |
|------|------|------|
| 禁止访问 | `none` | 链接/授权无效 |
| 只读 | `read` | 查看、预览 |
| 可评论 | `comment` | 只读 + 评论（预留） |
| 可编辑 | `edit` | 编辑内容 |
| 可管理 | `manage` | 编辑 + 修改分享/协作者 |

### 3.2 权限优先级

个人/协作者单独授权 > 公开链接权限 > 目录继承（文档 owner scope）> 默认无权限

### 3.3 内外网规则

| 身份 | 规则 |
|------|------|
| 组织内用户 | 默认继承 owner/tenant scope；可叠加 `doc_share_user` |
| 组织外用户 | 仅公开链接或外部协作者授权生效 |
| 匿名访客 | 仅公开链接 + `read/comment` |

---

## 4. 分享模式

### 4.1 指定成员分享（V1.1）

- 表：`doc_share_user`
- API：`POST/DELETE /api/v1/c/docs/:docId/share/collaborators`
- 支持按用户差异化权限、单独回收

### 4.2 公开链接分享（V1.0）

- 表：`doc_share`（`share_type=link`）
- 唯一 `share_token`（32 位 hex）
- 统一权限 + 可选密码 + 可选过期时间
- 链接格式：`{origin}/share/{token}`

---

## 5. 安全风控（分阶段）

| 机制 | 版本 |
|------|------|
| Share-Token 随机 32 位 | V1.0 |
| 过期自动失效 | V1.0 |
| 访问密码 bcrypt | V1.0 |
| 手动关闭分享 | V1.0 |
| IP 白名单 | V1.2 |
| 下载/打印/复制/二次分享限制 | V1.2 |
| 动态水印 | V1.2 |
| 单链接限流 | V1.3 |

---

## 6. 审计体系

### 6.1 操作审计（`doc_share_audit_log`）

记录：开启/关闭分享、修改权限、密码/时效变更、协作者增删。

### 6.2 访问日志（`doc_share_visit_log`）

记录：访客 IP、设备、访问结果（成功/密码错误/过期/无权）。

---

## 7. API 设计

C 端 authenticated：`/api/v1/c/docs/:docId/share/*`  
公开访客：`/api/v1/share/:token/*`

详见 [document-share-api.openapi.yaml](./document-share-api.openapi.yaml)。

---

## 8. 数据库设计

### 8.1 doc_share（分享主表）

| 字段 | 说明 |
|------|------|
| doc_id | 文档 ID，UNIQUE |
| share_token | 公开链接 Token |
| share_type | link / member |
| permission_level | read/comment/edit/manage |
| expire_time | 过期时间，NULL=永久 |
| password_hash | bcrypt，NULL=无密码 |
| status | 1=开启 0=关闭 |

### 8.2 doc_share_user（协作者）

| 字段 | 说明 |
|------|------|
| doc_id + subject_type + subject_id | UNIQUE |
| permission_level | 单独授权级别 |

### 8.3 日志表

`doc_share_visit_log`、`doc_share_audit_log`

迁移脚本：`packages/lingyi-doc-server/scripts/migrations/20260703_document_share.sql`

---

## 9. 缓存设计（V1.3）

- Redis Key：`share:token:{token}` → 分享配置 JSON，TTL 5min
- 鉴权结果短期缓存，减少 DB 压力

---

## 10. 异常场景

| 场景 | 处理 |
|------|------|
| 文档删除 | 软删除文档 → 分享 status=0，链接失效 |
| 转移所有者 | 新 owner 继承 share 配置 |
| 链接过期 | 鉴权返回 410，前端展示过期页 |
| 密码错误 | 401，记录 visit_log |

---

## 11. 落地迭代

| 版本 | 范围 |
|------|------|
| **V1.0** | 公开链接、五级权限、时效/密码、ShareModal、ShareAccessPage |
| **V1.1** | 指定用户分享、与我共享列表、协作者读写权限 ✅ |
| V1.2 | IP 白名单、水印、下载限制、外部总开关 |
| V1.3 | 全量审计、访问统计、Redis 缓存、限流 |
| V1.4 | 二维码、iframe、分享看板 |

---

## 12. 代码落点

| 层级 | 路径 |
|------|------|
| 迁移 | `scripts/migrations/20260703_document_share.sql` |
| 实体 | `src/database/entities/document-share.entity.ts` |
| 仓库 | `src/repositories/document-share.repository.ts` |
| 模块 | `src/modules/document-share/` |
| 前端 API | `packages/lingyi-doc-web/src/api/documentShare.ts` |
| 分享弹窗 | `packages/lingyi-doc-web/src/components/share/DocShareModal.tsx` |
| 访客页 | `packages/lingyi-doc-web/src/pages/ShareAccessPage.tsx` |
