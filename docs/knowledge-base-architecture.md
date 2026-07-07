# 知识库模块整体技术方案

> **版本**：v1.0  
> **日期**：2026-07-01  
> **状态**：设计稿（P0 待实施）  
> **前提约束**：租户为最高数据隔离边界，对齐现有 `scope + tenant_id/owner_id` 文档隔离模型  
> **关联文档**：[tenant-org-architecture.md](./tenant-org-architecture.md)、[server-database-design.md](./server-database-design.md)、[knowledge-base-api.openapi.yaml](./knowledge-base-api.openapi.yaml)

---

## 1. 背景与目标

### 1.1 现状

| 层级 | 状态 |
|------|------|
| 前端 UI | 知识库列表、空间页、目录侧栏、新建弹窗已基本完成 |
| 前端数据 | `knowledgeBaseStore` 纯 `localStorage`，无 `tenantId`、无身份切换隔离 |
| 后端 | 无 KB/Wiki 表、API、权限 |
| 文档体系 | 已通过 JWT + `DocumentAccessContext` 实现个人/企业双空间隔离 |

### 1.2 设计目标

1. **租户隔离优先**：知识库数据归属与访问控制与文档模块一致，不信任客户端传入的 `tenantId`
2. **身份一致**：个人身份 / 企业身份切换后，知识库列表与空间内容自动切换
3. **文档复用**：知识库目录节点引用已有 `documents` 表，不重复存储文档内容
4. **渐进落地**：分阶段替换 `localStorage`，不阻塞现有文档能力
5. **一套代码**：SaaS 逻辑隔离 + 私有化物理隔离，复用 `DeployService` 分支

### 1.3 非目标（P0 不做）

- 跨租户知识库共享 / 联邦
- 全文检索 / AI 问答（仅预留扩展点）
- LDAP / 独立本地用户表
- 知识库版本历史、协同编辑冲突解决（复用文档层能力）

---

## 2. 领域模型

```
租户 Tenant ──< 知识库 KnowledgeBase ──< 目录节点 KbNode ──> 文档 Document
                      │
                      └──< 成员 KbMember（members 可见性）
```

### 2.1 核心概念

| 概念 | 说明 |
|------|------|
| **知识库 KnowledgeBase** | 独立协作空间（对标飞书「知识空间」），租户内或用户个人下创建 |
| **目录节点 KbNode** | 树形目录项，可为首页（`page`）、文档引用（`doc_ref`）、文件夹（`folder`） |
| **文档引用** | 节点通过 `doc_id` 关联 `documents` 表，内容仍走文档编辑/存储链路 |
| **可见范围** | `members`（成员可见）/ `organization`（企业内公开） |

### 2.2 与文档模块的关系

- 知识库负责：**组织、导航、权限边界**
- 文档负责：**内容、版本、编辑、回收站**
- 创建文档时若带 `kbId` + `parentNodeId`，服务端原子创建文档并挂载节点

---

## 3. 租户数据隔离设计

### 3.1 隔离原则（与文档模块对齐）

沿用 `documentAccessContext.ts` 同一套模式，扩展为 `kbAccessContext`：

| 身份 | JWT 上下文 | 知识库 SQL 过滤条件 |
|------|-----------|-------------------|
| 个人 | `identityType=personal`, `tenantId=null` | `scope=1 AND owner_id=:userId` |
| 企业 | `identityType=tenant`, `tenantId=xxx` | `scope=2 AND tenant_id=:tenantId` |

**硬性规则：**

1. 创建/查询/更新/删除的 `tenant_id`、`scope` **一律从 JWT 推导**，忽略 Body/Query 中的租户字段
2. 企业身份访问前走 `TenantContextGuard`，校验 `tenant_members` 活跃成员关系
3. 私有化环境拦截非预置 `tenantId` 的请求
4. 跨租户 ID 猜测访问 → 404（不暴露存在性）

### 3.2 身份与功能边界

| 规则 | 说明 |
|------|------|
| 个人知识库 | 仅 `scope=1`，`tenant_id=NULL`，仅所有者可管理 |
| 企业知识库 | 仅 `scope=2`，`tenant_id` 必填，支持成员权限 |
| 节点引用文档 | `doc_ref` 节点的 `doc_id` 必须与知识库 **同 scope、同 tenant/owner** |
| 身份切换 | 切换后前端 `workspaceRevision` 刷新，后端 JWT 变更自动过滤 |

### 3.3 可见性与成员权限

**`visibility=organization`（企业公开）**

- 租户内任意活跃成员可读
- 创建者 / 显式 `admin` 成员可写

**`visibility=members`（成员可见）**

- 仅 `kb_members` 表中成员可访问
- 创建者自动成为 `owner`

**权限矩阵（企业知识库）**

| 操作 | owner | admin | editor | viewer |
|------|-------|-------|--------|--------|
| 查看 | ✓ | ✓ | ✓ | ✓ |
| 编辑目录 | ✓ | ✓ | ✓ | ✗ |
| 新建文档 | ✓ | ✓ | ✓ | ✗ |
| 成员管理 | ✓ | ✓ | ✗ | ✗ |
| 删除知识库 | ✓ | ✗ | ✗ | ✗ |
| 修改可见范围 | ✓ | ✗ | ✗ | ✗ |

个人知识库不建 `kb_members`，所有者拥有全部权限。

---

## 4. 数据库设计

详见迁移脚本：`packages/lingyi-doc-server/scripts/migrations/20260701_knowledge_base.sql`

### 4.1 表清单

| 表 | 说明 |
|----|------|
| `knowledge_bases` | 知识库主表（scope / tenant_id / owner_id 隔离） |
| `kb_nodes` | 目录节点树 |
| `kb_members` | 成员与角色（members 可见性） |

### 4.2 默认数据

创建知识库时服务端种子：

- 1 个 `is_home=true` 的 `page` 节点（首页）

---

## 5. API 设计

Base：`/api/v1/c/knowledge-bases`  
Guard：`JwtAuthGuard` + `TenantContextGuard`

OpenAPI 草案：[knowledge-base-api.openapi.yaml](./knowledge-base-api.openapi.yaml)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/knowledge-bases` | 列表 |
| POST | `/knowledge-bases` | 创建 |
| GET | `/knowledge-bases/:kbId` | 详情 |
| PATCH | `/knowledge-bases/:kbId` | 更新元数据 |
| DELETE | `/knowledge-bases/:kbId` | 软删除 |
| GET | `/knowledge-bases/:kbId/nodes` | 目录树 |
| POST | `/knowledge-bases/:kbId/nodes` | 新增节点 |
| PATCH | `/knowledge-bases/:kbId/nodes/:nodeId` | 重命名 / 移动 |
| DELETE | `/knowledge-bases/:kbId/nodes/:nodeId` | 删除节点 |
| POST | `/knowledge-bases/:kbId/nodes/:parentNodeId/doc` | 创建文档并挂载节点 |
| GET | `/knowledge-bases/:kbId/members` | 成员列表 |
| POST | `/knowledge-bases/:kbId/members` | 添加成员 |
| DELETE | `/knowledge-bases/:kbId/members/:userId` | 移除成员 |

### 5.1 关键约束

- 请求 Body **不含** `tenantId` / `scope`
- 跨租户或无权限访问返回 **404**
- `doc_ref` 引用跨 scope 文档返回 **400**

---

## 6. 后端模块架构

```
src/modules/knowledge-base/
  knowledge-base.controller.ts
  knowledge-base.service.ts
  kb-node.service.ts
  kb-permission.service.ts
src/database/entities/
  knowledge-base.entity.ts
  kb-node.entity.ts
  kb-member.entity.ts
src/repositories/
  knowledge-base.repository.ts
  kb-node.repository.ts
src/utils/
  kbAccessContext.ts
```

**校验顺序（每次写操作）**

1. JWT 有效 → 解析 `DocumentAccessContext`
2. `TenantContextGuard`（企业身份）
3. KB 存在且 `buildKbAccessClause` 匹配
4. `KbPermissionService.can(user, kb, action)`
5. 节点操作额外校验 `kb_id` 归属
6. `doc_ref` 操作额外校验 `documents` 同 scope 归属

---

## 7. 前端架构

前端 API 客户端：`packages/lingyi-doc-web/src/api/knowledgeBase.ts`

### 7.1 分层改造

| 阶段 | 方案 |
|------|------|
| **P0** | 新增 `KnowledgeBaseApi`；`knowledgeBaseStore` 改为 API 代理 + 内存缓存 |
| **P1** | 删除 localStorage 读写；切换身份时清空缓存 |
| **P2** | 可选 React Query / SWR |

### 7.2 路由扩展

| 路由 | 说明 |
|------|------|
| `/workspace/wiki` | 知识库列表 |
| `/workspace/wiki/:kbId` | 空间首页 |
| `/workspace/wiki/:kbId/n/:nodeId` | P1 节点级 URL |
| `/workspace/wiki/:kbId/doc/:docId` | P1 空间内打开文档 |

### 7.3 创建文档流程

```
目录「+」→ 选类型 → openTemplatePicker({ kbId, parentNodeId })
  → POST .../nodes/:parentId/doc
  → navigate(wikiSpaceDocPath(kbId, docId))
```

---

## 8. 分阶段实施计划

### P0 — 租户隔离 MVP

- DB 迁移 + CRUD API
- 前端 `KnowledgeBaseApi` 替换 localStorage
- 空间内创建文档并自动挂载节点
- 身份切换后列表刷新
- 跨租户隔离单测

### P1 — 完整交互

- 节点级路由、空间内嵌编辑
- 成员管理 UI
- 目录拖拽排序、迁入已有云文档
- 管理端租户视角

### P2 — 增强能力

- 全文搜索、问问知识库（RAG）
- 知识库模板、复制空间
- 首页 page 可编辑、审计日志

---

## 9. 测试与验收标准

### 9.1 租户隔离测试矩阵

| 用例 | 预期 |
|------|------|
| 租户 A 用户访问租户 B 的 `kbId` | 404 |
| 个人身份创建 KB，切换企业身份后不可见 | 列表为空 |
| 企业 KB `members` 模式，非成员访问 | 404 |
| `doc_ref` 引用个人文档到企业 KB | 400 拒绝 |
| 私有化实例访问其他 tenantId | 403 |
| JWT 篡改 `tenantId` | Guard 拒绝 / 404 |

### 9.2 性能基线

| 接口 | 目标 |
|------|------|
| GET 知识库列表 | P95 < 200ms（< 100 条） |
| GET 目录树 | P95 < 300ms（< 500 节点） |
| POST 创建文档+节点 | P95 < 500ms（含事务） |

---

## 10. 风险与决策点

| 决策 | 建议 | 备选 |
|------|------|------|
| 个人身份是否开放知识库 | **开放**（`scope=1`） | 仅企业身份可用 |
| 删除 KB 是否删引用文档 | **默认不删** | 提供「连同文档删除」选项 |
| 节点树存储 | P0 邻接表 + `sort_order` | P2 物化路径 |
| 首页 `page` 内容 | P0 静态模板 | P1 独立 `page_content` JSON |

---

## 11. 相关文件索引

| 文件 | 说明 |
|------|------|
| [knowledge-base-api.openapi.yaml](./knowledge-base-api.openapi.yaml) | OpenAPI 3.0 草案 |
| [../packages/lingyi-doc-server/scripts/migrations/20260701_knowledge_base.sql](../packages/lingyi-doc-server/scripts/migrations/20260701_knowledge_base.sql) | 数据库迁移 |
| [../packages/lingyi-doc-web/src/api/knowledgeBase.ts](../packages/lingyi-doc-web/src/api/knowledgeBase.ts) | 前端 API 客户端 |
