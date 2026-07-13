# 协同编辑技术方案设计

> **版本**：v1.0  
> **日期**：2026-07-08  
> **状态**：设计稿（待实现）  
> **关联文档**：[自研表格系统-技术方案设计](./自研表格系统-技术方案设计.md) §4/§10.3、[server-database-design](./server-database-design.md) Phase 2、[document-share-architecture](./document-share-architecture.md)

---

## 1. 背景与目标

### 1.1 现状

| 能力 | 状态 | 说明 |
|------|------|------|
| 文档 JSON 快照持久化 | ✅ 已实现 | `documents.content_json` + `current_version` |
| HTTP 增量 Patch | ✅ 已实现 | `SaveManager` → `POST /api/v1/docs/:docId/patch`，乐观锁 `baseVersion` |
| 分享/协作者 ACL | ✅ 已实现 | 控制「谁可编辑」，非实时同步 |
| `crdt_oplog` 表 | ✅ 已建表 | Entity 已注册，**无读写逻辑** |
| WebSocket 协同服务 | ❌ 未实现 | `main.ts` 仅 HTTP |
| Redis 业务集成 | ❌ 未实现 | docker-compose 有 Redis，服务端未连接 |
| CRDT 引擎 / SyncManager | ❌ 未实现 | 仅有 `packages/lingyi-doc-core/src/collab/index.ts` 类型草图 |
| Awareness（光标/选区/在线用户） | ❌ 未实现 | — |

**当前多人编辑行为**：各自 debounce 保存，版本冲突时 `SaveManager` 静默 fallback 全量保存，**无实时合并、无冲突提示**。

### 1.2 目标

1. **实时协同**：多用户同时编辑同一文档，操作延迟 P95 < 200ms（局域网/同城）。
2. **最终一致**：以 CRDT 为主、服务端半中心化仲裁，支持断线重连与增量同步。
3. **平滑演进**：复用现有 `DocumentPatchOp` / `SaveManager`，分阶段接入 WebSocket，不破坏现有 REST API。
4. **本地可跑**：Redis `127.0.0.1:6379`，单实例 NestJS 即可验证完整链路。

### 1.3 非目标（本期）

- 富文本字符级 CRDT（见 [自研文档编辑器-设计方案](./自研文档编辑器-设计方案.md)）
- Yjs / Hocuspocus 第三方库集成
- Rust 公式重算 sidecar（与协同正交，后续独立）

---

## 2. 总体架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         lingyi-doc-web / lingyi-doc-editor               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ Editor Store │  │ CrdtEngine   │  │ SyncManager  │  │ Awareness   │ │
│  │ (业务状态)    │◀─│ (本地合并)    │◀─│ WS↔HTTP↔IDB │  │ (光标/选区)  │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘ │
│         │                 │                  │                  │         │
│         │    SaveManager（降级/快照落盘）     │                  │         │
└─────────┼─────────────────┼──────────────────┼──────────────────┼─────────┘
          │                 │                  │                  │
          │ HTTP REST       │ WebSocket        │                  │
          ▼                 ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      lingyi-doc-server (NestJS)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │ Document    │  │ Collab      │  │ Collab      │  │ Collab          │ │
│  │ Controller  │  │ Gateway     │  │ Service     │  │ RoomManager     │ │
│  │ (现有 REST) │  │ (WS 入口)   │  │ (op 处理)   │  │ (房间/广播)     │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘ │
│         │                │                │                   │          │
│  ┌──────▼────────────────▼────────────────▼───────────────────▼──────┐ │
│  │ CrdtOplogRepository · DocumentRepository · DocumentShare 权限校验    │ │
│  └──────────────────────────────┬────────────────────────────────────┘ │
└───────────────────────────────────┼──────────────────────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          ▼                         ▼                         ▼
   ┌─────────────┐          ┌─────────────┐          ┌─────────────┐
   │ MySQL 8.0   │          │ Redis 7     │          │ (可选 OSS)  │
   │ documents   │          │ 127.0.0.1   │          │ 大快照归档   │
   │ crdt_oplog  │          │ :6379       │          │             │
   │ snapshots   │          │             │          │             │
   └─────────────┘          └─────────────┘          └─────────────┘
```

### 2.1 设计原则

| 原则 | 说明 |
|------|------|
| **半中心化 CRDT** | 客户端可离线合并；在线时服务端分配 `global_version` 并持久化 oplog，保证全序 |
| **双写通道** | 实时路径走 WebSocket；`SaveManager` 保留为断线降级与周期性快照 |
| **Patch 即 Op** | Phase 1 将 `DocumentPatchOp` 适配为 `CrdtOperation`，避免重复 diff 逻辑 |
| **Redis 做加速，MySQL 做真相** | Redis 丢数据可重建；`crdt_oplog` 为持久化来源 |
| **权限复用** | WS 连接鉴权复用 JWT + `document-share` / 租户 ACL |

---

## 3. 协同算法

### 3.1 CRDT（主） + OT 桥接（辅）

与 [自研表格系统-技术方案设计](./自研表格系统-技术方案设计.md) §4 保持一致：

```
协同引擎
├── CRDT（90%+ 操作）
│   ├── LWW-Register     — 单元格值、字段值、元素属性
│   ├── RGA              — 行列/块/节点顺序
│   ├── OR-Set           — 多选集合字段
│   └── PN-Counter       — 计数器
├── OT 桥接（复杂冲突兜底）
│   ├── merge_cells 与 set 冲突
│   └── sort_range / set_filter 与并发写入
└── HLC 逻辑时钟
    └── opId = `${physical}:${logical}:${nodeId}`
```

### 3.2 操作类型

以 `packages/lingyi-doc-core/src/collab/index.ts` 为权威定义，按文档类型扩展：

| 文档类型 | Patch 来源 | CRDT 映射策略 |
|----------|-----------|---------------|
| `standard` / `freeform` | `WorkbookPatchOp` | `set_cell`→`set`；`add_sheet`→`add_sheet`；行列类→RGA |
| `richtext` | `RichTextPatchOp` | 块级 RGA + 块内 LWW（Phase 1）；字符级延后 |
| `mindnote` | `MindNotePatchOp` | 节点树 RGA + 属性 LWW |
| `whiteboard` | `WhiteboardPatchOp` | 元素 OR-Set + 属性 LWW |

```typescript
// packages/lingyi-doc-core/src/collab/index.ts（已有，作为共享契约）
export interface CrdtOperation {
  opId: string;
  type: CrdtOpType;
  target: string;        // 如 "sheet1!A1" / "node:abc" / "element:xyz"
  value?: unknown;
  clock: number;
  dependencies: string[];
  position?: { index: number; count?: number };
  // ...
}
```

### 3.3 版本模型

| 字段 | 归属 | 说明 |
|------|------|------|
| `documents.current_version` | 文档快照版本 | 每次快照合并或批量落盘时递增 |
| `crdt_oplog.global_version` | 操作序号 | 每个 `crdt_op` 单调递增，**(doc_id, global_version)** 唯一 |
| `opId` | 客户端 HLC | 幂等去重，防止重放 |

**冲突策略**：
- 同 target 并发 `set`：LWW（`clock` 大者胜）
- 结构冲突（合并单元格等）：OT 桥接 → 服务端生成 `conflict_resolved` 广播
- HTTP Patch 与 WS 并发：以 `global_version` 为准；Patch 请求若 `baseVersion` 落后，返回 `409` + 最新版本，客户端走 `sync_request`

---

## 4. Redis 设计（本地：127.0.0.1:6379）

### 4.1 连接配置

```bash
# packages/lingyi-doc-server/.env
REDIS_URL=redis://127.0.0.1:6379
REDIS_KEY_PREFIX=lingyi_doc:
REDIS_CONNECT_TIMEOUT_MS=5000

# 协同
FEATURE_COLLAB_ENABLED=true
WS_PORT=3001
WS_PATH=/api/v1/collab/ws
COLLAB_ROOM_MAX_USERS=50
COLLAB_HEARTBEAT_INTERVAL_MS=30000
COLLAB_PRESENCE_TTL_SEC=90
```

```typescript
// packages/lingyi-doc-server/src/config/configuration.ts（待新增）
collab: {
  enabled: process.env.FEATURE_COLLAB_ENABLED === 'true',
  wsPort: Number(process.env.WS_PORT || 3001),
  wsPath: process.env.WS_PATH || '/api/v1/collab/ws',
  roomMaxUsers: Number(process.env.COLLAB_ROOM_MAX_USERS || 50),
  heartbeatIntervalMs: Number(process.env.COLLAB_HEARTBEAT_INTERVAL_MS || 30000),
  presenceTtlSec: Number(process.env.COLLAB_PRESENCE_TTL_SEC || 90),
},
redis: {
  url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'lingyi_doc:',
},
```

**本地启动**：

```bash
# 方式一：docker-compose
docker compose up -d redis

# 方式二：本机 Redis
redis-server
redis-cli -h 127.0.0.1 -p 6379 ping   # 期望 PONG
```

### 4.2 Key 设计

所有 key 带前缀 `lingyi_doc:`。

| 类型 | Key 模式 | 用途 | TTL |
|------|----------|------|-----|
| Hash | `collab:room:{docId}` | 房间元数据 `{ version, instanceId, createdAt }` | 无（房间空时 DEL） |
| Hash | `collab:presence:{docId}` | `{ userId → JSON(OnlineUser) }` 在线用户 | 成员心跳续期 |
| String | `collab:cursor:{docId}:{userId}` | 光标/选区 JSON | `COLLAB_PRESENCE_TTL_SEC` |
| Pub/Sub | `collab:channel:{docId}` | 跨实例广播 `crdt_op` / `user_joined` 等 | — |
| Stream | `collab:oplog:{docId}` | 热操作流（可选，减轻 DB 读压） | `MAXLEN ~ 10000` |
| String | `collab:perm:{docId}` | 文档权限缓存 `{ userId: role }` | 300s |
| ZSet | `collab:ratelimit:{userId}` | WS 消息滑动窗口限流 | 窗口时间 |

### 4.3 Pub/Sub 跨实例广播

单实例开发时 RoomManager 进程内广播即可。多实例部署时：

```
Client ──WS──▶ Instance A (Room doc_x)
                    │
                    │ PUBLISH collab:channel:doc_x
                    ▼
              Redis 127.0.0.1:6379
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
Instance A      Instance B      Instance C
(本房间转发)    (订阅转发)       (订阅转发)
```

**消息信封**：

```typescript
interface CollabPubSubEnvelope {
  originInstanceId: string;
  docId: string;
  payload: ServerMessage;
  excludeUserId?: string;
}
```

### 4.4 Presence（在线状态）

```
用户加入:
  HSET collab:presence:{docId} {userId} {displayName, avatar, color, joinedAt}
  EXPIRE collab:presence:{docId} COLLAB_PRESENCE_TTL_SEC（每次心跳续期）

用户离开 / 超时:
  HDEL collab:presence:{docId} {userId}
  DEL  collab:cursor:{docId}:{userId}
```

光标/选区走独立 key，避免频繁序列化整个 presence Hash。

---

## 5. WebSocket 协议

### 5.1 连接

```
URL: ws://localhost:3001/api/v1/collab/ws?docId={docId}
     （生产经 Nginx 代理：wss://host/api/v1/collab/ws?docId=...）

Headers:
  Authorization: Bearer {access_token}

或首帧 auth 消息（兼容浏览器 WebSocket 无法自定义 Header 的场景）
```

**鉴权流程**：

1. 解析 JWT，获取 `userId`、`tenantId`
2. 调用现有 `documentAccessContext` / `document-share` 校验 `docId` 读权限
3. 无写权限：仅允许 `sync_request`、presence 订阅，拒绝 `crdt_op`
4. 租户过滤：`ENFORCE_TENANT_FILTER` 开启时校验文档归属

### 5.2 消息类型

```typescript
// ─── 客户端 → 服务端 ───
type ClientMessage =
  | { type: 'auth'; token: string; docId: string }
  | { type: 'heartbeat'; ts: number }
  | { type: 'crdt_op'; operation: CrdtOperation }
  | { type: 'sync_request'; fromVersion: number }
  | { type: 'cursor_move'; docKind: DocumentPatchKind; payload: CursorPayload }
  | { type: 'selection_change'; docKind: DocumentPatchKind; payload: SelectionPayload };

// ─── 服务端 → 客户端 ───
type ServerMessage =
  | { type: 'connected'; docVersion: number; globalVersion: number; onlineUsers: OnlineUser[] }
  | { type: 'heartbeat_ack'; serverTime: number }
  | { type: 'crdt_op'; operation: CrdtOperation; globalVersion: number; senderId: string }
  | { type: 'user_joined'; user: OnlineUser }
  | { type: 'user_left'; userId: string }
  | { type: 'cursor_update'; userId: string; payload: CursorPayload }
  | { type: 'selection_update'; userId: string; payload: SelectionPayload }
  | { type: 'sync_response'; operations: CrdtOperation[]; currentVersion: number }
  | { type: 'snapshot_updated'; version: number }   // 服务端周期性快照完成
  | { type: 'conflict_resolved'; target: string; resolution: CrdtOperation }
  | { type: 'error'; code: number; message: string; requestId?: string };
```

### 5.3 典型时序

```
Client A                    Server                     Client B
   │                          │                           │
   │──── WS Connect ─────────▶│                           │
   │◀─── connected ───────────│                           │
   │     v=42, gv=1280        │                           │
   │                          │◀──── WS Connect ──────────│
   │◀─── user_joined B ───────│──── connected ───────────▶│
   │                          │                           │
   │──── crdt_op (set C3) ───▶│                           │
   │                          │ 1. 幂等检查 opId          │
   │                          │ 2. INSERT crdt_oplog       │
   │                          │ 3. INCR room version       │
   │                          │ 4. PUBLISH redis channel   │
   │◀─── crdt_op ack ─────────│──── crdt_op (remote) ────▶│
   │                          │                           │
   │──── cursor_move ────────▶│──── cursor_update ───────▶│
   │                          │                           │
   │──── sync_request(1270) ─▶│                           │
   │◀─── sync_response ───────│  (fromVersion+1..gv)     │
```

### 5.4 错误码

| Code | 名称 | 说明 |
|------|------|------|
| 210001 | `COLLAB_OP_INVALID` | 操作格式非法 |
| 210002 | `COLLAB_OP_DUPLICATE` | opId 重复（幂等，客户端忽略） |
| 210003 | `COLLAB_VERSION_GAP` | fromVersion 过旧，需全量 sync |
| 210004 | `COLLAB_ROOM_FULL` | 房间人数超限 |
| 210005 | `COLLAB_FORBIDDEN` | 无写权限 |
| 210006 | `COLLAB_DOC_NOT_FOUND` | 文档不存在或已删除 |

与 `packages/lingyi-doc-server` 现有错误码体系对齐（21xxxx 段）。

---

## 6. 服务端模块设计

### 6.1 目录结构

```
packages/lingyi-doc-server/src/
├── modules/
│   └── collab/
│       ├── collab.module.ts
│       ├── collab.gateway.ts          # @nestjs/websockets 或 ws 适配
│       ├── collab.service.ts          # handleOperation / sync / snapshot
│       ├── room.manager.ts            # 进程内房间
│       ├── collab-auth.guard.ts       # JWT + 文档权限
│       └── dto/
│           └── collab-message.dto.ts
├── repositories/
│   └── crdt-oplog.repository.ts       # 新增
├── redis/
│   ├── redis.module.ts
│   └── redis.service.ts               # ioredis 封装
└── config/configuration.ts              # 新增 redis / collab 段
```

### 6.2 核心接口

```typescript
// CollabService
interface CollabService {
  /** 接收客户端操作，返回分配的全局版本 */
  handleOperation(
    docId: string,
    userId: string,
    op: CrdtOperation,
  ): Promise<{ globalVersion: number; duplicate: boolean }>;

  /** 增量拉取 */
  getOperationsSince(docId: string, fromVersion: number, limit?: number): Promise<CrdtOperation[]>;

  /** 断线重连：返回快照版本 + 增量 ops */
  syncDocument(docId: string, clientVersion: number): Promise<{
    snapshotVersion: number;
    snapshot?: unknown;
    operations: CrdtOperation[];
    globalVersion: number;
  }>;

  /** 周期性：oplog 重放合并写回 documents（可 debounce 30s） */
  scheduleSnapshotMerge(docId: string): void;
}

// CrdtOplogRepository
interface CrdtOplogRepository {
  insert(entry: CrdtOplogEntry): Promise<number>;
  findByOpId(docId: string, opId: string): Promise<CrdtOplogEntry | null>;
  findSince(docId: string, fromVersion: number, limit: number): Promise<CrdtOplogEntry[]>;
  getLatestGlobalVersion(docId: string): Promise<number>;
}
```

### 6.3 `handleOperation` 处理流程

```
1. 校验 op  schema（type / target / opId）
2. SELECT crdt_oplog WHERE doc_id=? AND op_id=? → 若存在，返回 duplicate=true
3. 事务开始
   a. SELECT MAX(global_version) FROM crdt_oplog WHERE doc_id=? FOR UPDATE
   b. global_version = max + 1
   c. INSERT crdt_oplog (...)
   d. （可选）XADD collab:oplog:{docId}
4. 事务提交
5. 更新 Redis room version
6. 进程内 broadcast + Redis PUBLISH
7. scheduleSnapshotMerge(docId)  // 异步，不阻塞广播
8. 返回 { globalVersion, duplicate: false }
```

### 6.4 与现有 REST Patch 的关系

| 场景 | 路径 | 行为 |
|------|------|------|
| 协同开启 + 在线 | WebSocket `crdt_op` | 主路径，实时广播 |
| 协同开启 + 离线 | SaveManager → HTTP Patch | 降级；服务端将 patch ops 转为 crdt_op 写入 oplog |
| 协同关闭 | 仅 HTTP Patch | 与现网一致 |
| 周期性快照 | CollabService 后台任务 | oplog 重放 → 更新 `documents.content_json` + `current_version` |

**Patch → CRDT 适配器**（`packages/lingyi-doc-core/src/collab/patchToCrdt.ts`）：

```typescript
function patchOpsToCrdtOps(
  ops: DocumentPatchOp[],
  ctx: { nodeId: string; baseClock: number },
): CrdtOperation[];
```

---

## 7. 客户端模块设计

### 7.1 目录结构

```
packages/lingyi-doc-core/src/collab/
├── index.ts                 # 类型导出（已有）
├── HybridLogicalClock.ts
├── CrdtEngine.ts            # 本地 apply / merge
├── SyncManager.ts             # 连接、重连、离线队列
├── patchToCrdt.ts             # Patch → CrdtOperation
├── OfflineQueue.ts            # IndexedDB 封装
└── types.ts

packages/lingyi-doc-editor/src/collab/
├── useCollaboration.ts        # React Hook
├── CollabProvider.tsx         # Context
├── RemoteCursors.tsx          # 远端光标渲染
└── collabClient.ts            # WebSocket 薄封装
```

### 7.2 SyncManager 状态机

```
                    ┌─────────┐
         connect    │ offline │
        ┌──────────▶│ (本地编辑)│
        │           └────┬────┘
        │                │ 网络恢复
        │                ▼
        │           ┌─────────┐     断线      ┌──────────┐
        └───────────│ online  │────────────▶│ reconnect │
                    │ (WS)    │◀────────────│ (退避重试) │
                    └────┬────┘   成功       └──────────┘
                         │
                         ▼
                    ┌─────────┐
                    │ syncing │  sync_request + 回放
                    └─────────┘
```

**与 SaveManager 协作**：

```typescript
// 伪代码
class CollabSaveBridge {
  constructor(
    private syncManager: SyncManager,
    private saveManager: SaveManager,
  ) {}

  onLocalEdit(patchOps: DocumentPatchOp[]) {
    if (this.syncManager.isOnline()) {
      const crdtOps = patchOpsToCrdtOps(patchOps, this.clock);
      this.syncManager.sendOps(crdtOps);
      // 不触发 SaveManager debounce（或延长到 60s 做快照备份）
    } else {
      this.syncManager.enqueueOffline(crdtOps);
      this.saveManager.markDirty(); // 降级 HTTP
    }
  }

  onRemoteOp(op: CrdtOperation) {
    this.crdtEngine.apply(op);
    this.editorStore.applyRemote(op);
    // 不 markDirty — 已由服务端持久化
  }
}
```

### 7.3 前端代理配置

```typescript
// packages/lingyi-doc-web/vite.config.ts（待新增）
proxy: {
  '/api': { target: 'http://localhost:3000', changeOrigin: true },
  '/api/v1/collab/ws': {
    target: 'ws://localhost:3001',
    ws: true,
    changeOrigin: true,
  },
},
```

---

## 8. 数据库

### 8.1 `crdt_oplog`（已存在）

```sql
-- packages/lingyi-doc-server/scripts/init-db-mysql.sql
CREATE TABLE crdt_oplog (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    doc_id          VARCHAR(64)  NOT NULL,
    global_version  INT          NOT NULL,
    op_id           VARCHAR(100) NOT NULL,
    user_id         CHAR(36)     NOT NULL,
    op_type         VARCHAR(30)  NOT NULL,
    op_target       VARCHAR(200) NOT NULL,
    op_data         JSON         NOT NULL,
    dependencies    JSON,
    server_ts       TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
    client_ts       BIGINT,
    UNIQUE KEY uk_oplog_doc_version (doc_id, global_version),
    KEY idx_oplog_doc (doc_id, global_version)
);
```

**待补充索引**（高并发时）：

```sql
ALTER TABLE crdt_oplog ADD UNIQUE KEY uk_oplog_doc_opid (doc_id, op_id);
```

### 8.2 快照策略

| 触发条件 | 动作 |
|----------|------|
| 每累计 500 条 op 或 5 分钟 | 后台重放 oplog → 更新 `documents.content_json` |
| 用户手动保存 | 现有 `PUT /docs/:id` 全量快照 |
| 导出 / 版本历史 | 读 `document_snapshots` |

---

## 9. 分阶段实施计划

### Phase 0 — 基础设施（1 周）

- [ ] `ioredis` 接入，`REDIS_URL=redis://127.0.0.1:6379`
- [ ] `CrdtOplogRepository` CRUD
- [ ] `configuration.ts` / `.env.example` 补充 collab / redis 配置
- [ ] 健康检查：`GET /api/v1/health` 增加 `redis: ok|fail`

### Phase 1 — MVP 协同（2–3 周）

**范围**：表格（`standard`）+ 画板（`whiteboard`）

- [ ] NestJS WebSocket Gateway，`connected` / `heartbeat` / `crdt_op` / `sync_request`
- [ ] `RoomManager` + Redis Pub/Sub
- [ ] 客户端 `SyncManager` + `patchToCrdt` 适配
- [ ] 在线用户列表（presence）
- [ ] `feature.collab_enabled` 开关联动

**验收**：两浏览器同文档，一方改单元格/元素，另一方 < 200ms 看到；刷新后数据一致。

### Phase 2 — Awareness + 离线（2 周）

- [ ] 远端光标 / 选区（`cursor_move` / `selection_change`）
- [ ] IndexedDB 离线队列 + 重连回放
- [ ] `conflict_resolved` UI 提示
- [ ] Admin Dashboard 协同连接数真实数据

### Phase 3 — 全文档类型 + 生产加固（2–3 周）

- [ ] 富文本块级、思维导图节点级协同
- [ ] OT 桥接（合并单元格等）
- [ ] Nginx sticky session + 多实例
- [ ] oplog 归档 / 分区表（按 `doc_id` HASH 32）

---

## 10. 安全与限流

| 项 | 策略 |
|----|------|
| 鉴权 | JWT + 文档 ACL；写操作需 `edit` 权限 |
| 消息大小 | 单条 WS 消息 ≤ 64KB；超大 op 走 HTTP 分片上传后引用 |
| 频率限制 | 每用户每文档 ≤ 100 ops/s（Redis ZSet 滑动窗口） |
| 房间人数 | 默认 50，可租户配置 |
| 幂等 | `opId` 唯一约束，重复提交不二次广播 |

---

## 11. 监控与运维

| 指标 | 来源 |
|------|------|
| `collab_connections_active` | Gateway 连接数 |
| `collab_rooms_active` | RoomManager |
| `collab_ops_per_second` | CollabService |
| `collab_sync_latency_ms` | sync_request 耗时 |
| `redis_pubsub_lag` | 订阅端延迟 |

日志：每条 `crdt_op` 记录 `docId, opId, userId, globalVersion, durationMs`（debug 级）。

---

## 12. 本地开发清单

```bash
# 1. 启动 Redis
docker compose up -d redis
# 或本机 redis-server

# 2. 配置环境变量
cat >> packages/lingyi-doc-server/.env <<'EOF'
REDIS_URL=redis://127.0.0.1:6379
FEATURE_COLLAB_ENABLED=true
WS_PORT=3001
EOF

# 3. 启动后端
cd packages/lingyi-doc-server && npm run start:dev

# 4. 启动前端
cd packages/lingyi-doc-web && npm run dev

# 5. 验证 Redis
redis-cli -h 127.0.0.1 -p 6379 ping

# 6. 验证协同（Phase 1 完成后）
# 浏览器 A/B 打开同一文档，观察 WS 连接与操作同步
```

---

## 13. 风险与对策

| 风险 | 对策 |
|------|------|
| CRDT 与 Patch 双轨逻辑不一致 | 统一 `patchToCrdt` 转换层 + 集成测试对照 |
| oplog 无限增长 | 定期快照 + 归档冷存储 |
| Redis 单点 | 生产用 Redis Sentinel/Cluster；开发单实例即可 |
| 富文本字符级协同复杂 | Phase 1 仅块级，字符级单用户编辑 + 块级协同 |
| 与现有 SaveManager 冲突 | `CollabSaveBridge` 明确在线/离线分支，协同关闭时零影响 |

---

## 14. 参考

- 现有类型：`packages/lingyi-doc-core/src/collab/index.ts`
- 现有保存：`packages/lingyi-doc-core/src/io/SaveManager.ts`
- 现有 Patch：`packages/lingyi-doc-core/src/io/patch/types.ts`
- 表结构：`packages/lingyi-doc-server/scripts/init-db-mysql.sql`
- 算法详述：[自研表格系统-技术方案设计](./自研表格系统-技术方案设计.md) §4、§10.3、§11.2
- 就绪性评估：[自研表格系统-编码就绪性评估报告](./自研表格系统-编码就绪性评估报告.md)
