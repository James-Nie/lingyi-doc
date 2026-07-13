# 零一文档 服务端与数据库设计（MySQL）

> **版本**：v1.0  
> **日期**：2026-06-23  
> **数据库**：MySQL 8.0+  
> **服务框架**：Node.js + Express + mysql2  

---

## 1. 设计目标

| 目标 | 说明 |
|------|------|
| 持久化 | 文档、用户数据落库，替代文件系统与内存存储 |
| 兼容现有 API | 保持 `/api/v1/docs`、`/api/v1/auth` 契约不变 |
| 可演进 | 预留 CRDT 操作日志、多维表（Base）扩展表结构 |
| 本地开发友好 | 支持 `npm run db:migrate` 一键初始化 |

---

## 2. 总体架构

```
┌─────────────────────────────────────────────────────────┐
│                    lingyi-doc-web (Vite)                    │
│              DocumentManager → HTTP REST                   │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP / WS
┌──────────────────────────▼──────────────────────────────┐
│                   lingyi-doc-server (Express)                 │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ authRoutes  │  │  docRoutes   │  │  wsServer       │ │
│  └──────┬──────┘  └──────┬───────┘  └────────┬────────┘ │
│         │                │                    │           │
│  ┌──────▼────────────────▼────────────────────▼────────┐ │
│  │              Repository Layer                        │ │
│  │   UserRepository  ·  DocumentRepository             │ │
│  └──────────────────────────┬──────────────────────────┘ │
│                             │ mysql2 Pool                │
└─────────────────────────────┼───────────────────────────┘
                              ▼
                    ┌──────────────────┐
                    │   MySQL 8.0      │
                    │   lingyi_doc_db       │
                    └──────────────────┘
```

### 2.1 分阶段实现范围

| 阶段 | 范围 | 状态 |
|------|------|------|
| **Phase 1（当前）** | 用户认证、文档 CRUD、JSON 快照存储 | 本次实现 |
| Phase 2 | CRDT 操作日志持久化、WebSocket 协同落库 | 预留表结构 |
| Phase 3 | 多维表 Base（base_tables / base_records） | 预留表结构 |
| Phase 4 | 租户 / 组织 / 成员、团队文档 scope、Redis 缓存 | 设计稿见 [tenant-org-architecture.md](./tenant-org-architecture.md) |
| Phase 5 | 会员权限与配额体系 | 设计稿见 [membership-architecture.md](./membership-architecture.md) |

---

## 3. 数据库 ER 关系

```
users ──────────────┐
  │                 │
  │ owner_id        │ granted_by
  ▼                 ▼
documents ◄── document_permissions
  │
  ├── document_snapshots (版本快照)
  ├── document_sheets (Sheet 元数据，Phase 2)
  ├── crdt_oplog (协同操作日志，Phase 2)
  ├── doc_comment_threads (文档评论线程)
  │     └── doc_comment_replies (评论回复)
  └── ...

base_tables ── base_records
     │
     └── base_views
```

---

## 4. 核心表结构（MySQL）

### 4.1 users — 用户

| 字段 | 类型 | 说明 |
|------|------|------|
| id | CHAR(36) PK | UUID |
| email | VARCHAR(255) UNIQUE | 登录邮箱 |
| password_hash | VARCHAR(255) | bcrypt 哈希 |
| display_name | VARCHAR(100) | 显示名 |
| avatar_url | VARCHAR(500) | 头像 |
| is_active | TINYINT(1) | 是否启用 |
| created_at / updated_at | TIMESTAMP | 时间戳 |

### 4.2 documents — 文档元数据 + 内容

Phase 1 采用 **文档级 JSON 快照** 存储完整 Workbook，与现有 `Workbook.toJSON()` 格式一致。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(64) PK | 如 `doc_a1b2c3d4` |
| title | VARCHAR(500) | 标题 |
| doc_type | VARCHAR(20) | `standard` / `freeform` / `base` |
| owner_id | CHAR(36) NULL | 所属用户，可空（匿名创建） |
| current_version | INT | 单调递增版本号 |
| content_json | JSON | Workbook 完整 JSON |
| storage_size | BIGINT | 内容字节数 |
| is_deleted | TINYINT(1) | 软删除 |
| created_at / updated_at | TIMESTAMP | 时间戳 |

**索引**：`idx_documents_owner`、`idx_documents_updated`

### 4.3 document_snapshots — 版本历史

每次保存可写入快照（Phase 1 可选，表结构预留）。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | CHAR(36) PK | UUID |
| doc_id | VARCHAR(64) FK | 文档 ID |
| version | INT | 版本号 |
| snapshot_type | VARCHAR(20) | `base` / `auto` |
| snapshot_data | JSON | 快照内容 |
| created_at | TIMESTAMP | 创建时间 |

**唯一约束**：`(doc_id, version)`

### 4.4 crdt_oplog — 协同操作日志（Phase 2 预留）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT AUTO_INCREMENT PK | 全局序号 |
| doc_id | VARCHAR(64) | 文档 ID |
| global_version | INT | 文档版本 |
| op_id | VARCHAR(100) | HLC 操作 ID |
| user_id | CHAR(36) | 操作用户 |
| op_type | VARCHAR(30) | 操作类型 |
| op_target | VARCHAR(200) | 目标坐标 |
| op_data | JSON | 操作载荷 |
| server_ts | TIMESTAMP(3) | 服务端时间 |

**索引**：`(doc_id, global_version)`

### 4.5 多维表扩展（Phase 3 预留）

- `base_tables`：列定义、关联、权限 JSON
- `base_records`：行存储 `{ fieldId: value }`
- `base_views`：视图配置（grid/kanban/gantt 等）

### 4.6 文档评论（`FEATURE_COMMENTS_ENABLED`）

评论数据独立存储，正文高亮锚点通过 `block_id + anchor_start/end` 关联；加载文档时由服务端评论列表重建 mark。

**doc_comment_threads — 评论线程**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(64) PK | 如 `cmt_xxx` |
| doc_id | VARCHAR(64) | 所属文档 |
| block_id | VARCHAR(64) | 锚定块 ID |
| anchor_start / anchor_end | INT | 文本区间 |
| quote | VARCHAR(500) | 引用摘要 |
| resolved | TINYINT(1) | 是否已解决 |
| created_by | CHAR(36) | 创建人 |
| created_at / updated_at | TIMESTAMP | 时间戳 |

**索引**：`(doc_id)`、`(doc_id, resolved)`

**doc_comment_replies — 评论回复**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(64) PK | 回复 ID |
| thread_id | VARCHAR(64) FK | 所属线程 |
| author_id | CHAR(36) | 作者 |
| author_name | VARCHAR(100) | 显示名 |
| author_avatar | VARCHAR(500) | 头像 |
| text | TEXT | 回复内容 |
| created_at | TIMESTAMP | 创建时间 |

**索引**：`(thread_id)`；外键 `thread_id → doc_comment_threads(id)` ON DELETE CASCADE

迁移脚本：`scripts/migrations/20260709_doc_comments.sql`

---

## 5. REST API（Phase 1 已实现）

基础路径：`/api/v1`

### 5.1 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/register` | 注册 |
| POST | `/auth/login` | 登录 |
| POST | `/auth/refresh` | 刷新 Token |

### 5.2 文档

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/docs` | 创建文档 `{ title, docType, data }` |
| GET | `/docs` | 文档列表 |
| GET | `/docs/:docId` | 获取文档（含 content） |
| POST | `/docs/:docId/save` | 保存文档 |
| DELETE | `/docs/:docId` | 软删除 |
| GET | `/docs/:docId/export` | 导出 JSON |
| POST | `/docs/import` | 导入 JSON |

### 5.3 系统

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查（含 DB 状态） |
| GET | `/system/stats` | 运行统计 |
| GET | `/system/features` | 功能开关（协同、评论等） |

### 5.4 文档评论（需 `FEATURE_COMMENTS_ENABLED=true`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/c/docs/:docId/comments` | 评论列表 |
| POST | `/c/docs/:docId/comments` | 创建评论线程 `{ id?, anchor, text? }` |
| POST | `/c/docs/:docId/comments/:threadId/replies` | 回复 `{ text }` |
| PATCH | `/c/docs/:docId/comments/:threadId/resolve` | 解决评论 |

协同广播：评论变更通过 WebSocket `comment_update` 消息同步（依赖 `FEATURE_COLLAB_ENABLED`）。

### 5.5 响应格式

```json
{ "code": 0, "data": { ... } }
{ "code": 200001, "message": "文档不存在" }
```

---

## 6. 环境变量

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=******
DB_NAME=lingyi_doc_db
DB_CONN_LIMIT=10

JWT_SECRET=dev-secret-change-in-production
JWT_ACCESS_TTL=900
JWT_REFRESH_TTL=604800
API_PORT=3000
CORS_ORIGIN=*

# 功能开关
FEATURE_COMMENTS_ENABLED=true
FEATURE_COLLAB_ENABLED=true
```

---

## 7. 目录结构

```
packages/lingyi-doc-server/
├── scripts/
│   └── init-db-mysql.sql      # DDL 初始化脚本
├── src/
│   ├── config/env.ts          # 环境变量
│   ├── database/
│   │   ├── pool.ts            # MySQL 连接池
│   │   ├── migrate.ts         # 迁移入口
│   │   └── seed.ts            # 种子数据
│   ├── repositories/
│   │   ├── userRepository.ts
│   │   └── documentRepository.ts
│   ├── routes/
│   │   ├── auth.ts
│   │   └── docs.ts
│   └── services/
│       └── storage.ts         # 文档存储门面（委托 Repository）
└── .env
```

---

## 8. 迁移与启动

```bash
# 1. 配置 .env（MySQL 连接信息）
# 2. 初始化数据库
npm run db:migrate -w @lingyi-doc/server

# 3. （可选）写入测试用户
npm run db:seed -w @lingyi-doc/server

# 4. 启动服务
npm run server
```

---

## 9. 与 PostgreSQL 原方案的差异

| 项 | 原方案 (PG) | 当前方案 (MySQL) |
|----|-------------|------------------|
| JSON 类型 | JSONB + GIN 索引 | JSON（8.0 原生） |
| UUID | gen_random_uuid() | 应用层 uuid v4 |
| 分区表 | crdt_oplog HASH 32 分区 | 单表 + 索引，后续按需分区 |
| 全文检索 | Elasticsearch | Phase 4 再引入 |

---

## 10. 后续演进路线

1. **协同落库**：WebSocket `crdt_op` 写入 `crdt_oplog`，`sync_request` 从 DB 拉取增量
2. **版本管理**：保存时写入 `document_snapshots`，支持版本回滚 API
3. **Base 拆分**：大文档按 Sheet/Record 拆表，降低单次读写体积
4. **文档分享**：`doc_share` / `doc_share_user` 表 + 公开链接鉴权（见 [document-share-architecture.md](./document-share-architecture.md)）；legacy `document_permissions` 由新分享表替代
