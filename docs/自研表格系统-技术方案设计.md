# 自研表格系统 — 技术方案设计

> **版本**：v3.0  
> **日期**：2026-06-15  
> **作者**：技术架构组  
> **参考基准**：飞书多维表（Lark Base）& 语雀数据表（Yuque Table）底层原理对比
> 
> **变更记录**：
> - v1.0：总体技术方案（渲染/数据模型/协同/计算/存储/Excel兼容）
> - v2.0：新增前端详细设计（9章）、后端详细设计（10章）、数据库详细设计（11章）
> - v3.0：补全编码就绪性缺失项：核心类型定义/CRDT操作类型/Command接口/Formula AST/错误码体系/离线合并算法/自动化引擎/多视图方案/开发环境/API Schema/登录注册/Rust通信协议/WS sticky/分片上传/Canvas交互细节

---

## 结论先行

| 维度 | 语雀 | 飞书 | **自研系统（建议）** |
|---|---|---|---|
| 数据模型 | 异构（合并单元格） | 同构强类型（禁止合并） | **双模：标准表 + 自由表** |
| 协同算法 | OT + Command | CRDT + OT | **CRDT 主 + OT 辅助** |
| 计算模式 | 客户端优先（25万） | 混合架构（50万） | **三级计算：客户端 → Worker → 服务端** |
| 渲染 | Canvas 自由排版 | Canvas 结构化 | **Canvas 双模式自适应** |
| Excel 兼容 | 强兼容 | 有限兼容 | **分区策略：强兼容 + 智能降级** |
| 目标规模 | ≤50 人 | ≤2000 人 | **≤500 人（按需扩展）** |

**核心定位**：兼顾 **Excel 级兼容性** 与 **数据库级结构化能力**，适用于企业级报表协同与轻量数据管理场景。

---

## 一、总体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      接入层（Gateway）                        │
│              WebSocket 长连接 / HTTP REST / gRPC             │
├─────────────────────────────────────────────────────────────┤
│                      业务逻辑层                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ 协同引擎  │  │ 计算引擎  │  │ 权限控制  │  │  自动化引擎  │  │
│  │ CRDT+OT  │  │ 三级调度  │  │  RBAC    │  │  Workflow  │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                      数据存储层                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Postgres │  │  Redis   │  │  MinIO   │  │Elasticsearch│  │
│  │（结构化） │  │（缓存/队列│  │（对象存储）│  │ （全文检索） │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                      客户端                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │       React Shell（UI 框架/工具栏/侧边栏）               │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │        Canvas Engine（自研渲染引擎）               │  │   │
│  │  │   · 标准表模式（按列对齐）                          │  │   │
│  │  │   · 自由表模式（支持合并单元格、不规则布局）          │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │        Web Worker（本地计算线程）                  │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、渲染引擎设计

### 2.1 设计目标

| 目标 | 指标 |
|---|---|
| 最大渲染单元格 | 100 万+ |
| 滚动帧率 | 60fps |
| 首屏渲染时间 | < 500ms（10万单元格） |
| 支持的复杂样式 | 边框、背景色、字体、条件格式、数据条、图标集 |

### 2.2 核心技术方案

#### 双模式 Canvas 渲染

```
CanvasEngine
├── StandardMode（标准表模式）
│   ├── 列对齐、固定行高、网格化渲染
│   ├── 虚拟滚动（仅渲染可视区域 + 1屏缓冲区）
│   ├── 脏区域局部重绘（dirty rect）
│   └── 适用场景：数据表、清单、台账
│
└── FreeformMode（自由表模式）
    ├── 支持合并单元格、跨行跨列、浮动图片
    ├── 四叉树空间索引（快速定位点击）
    ├── 分层绘制（背景层 → 边框层 → 内容层 → 选区层）
    └── 适用场景：报表、排版表格、知识库嵌入
```

#### 关键优化策略

```typescript
// 1. 虚拟滚动 + 对象池
class ViewportManager {
  private visibleRange: { startRow: number; endRow: number; startCol: number; endCol: number };
  private cellPool: Pool<CellRenderer>; // 复用单元格渲染对象

  onScroll(scrollTop: number, scrollLeft: number) {
    const newRange = this.calculateVisibleRange(scrollTop, scrollLeft);
    if (!this.isSameRange(newRange)) {
      this.recycleInvisible(newRange);   // 回收不可见单元格
      this.renderVisible(newRange);       // 渲染新可见单元格
    }
  }
}

// 2. 脏区域追踪
class DirtyTracker {
  private dirtyRects: Rect[] = [];

  markDirty(cellRange: CellRange) {
    this.dirtyRects.push(cellRange.toRect());
  }

  render() {
    const merged = this.mergeOverlapping(this.dirtyRects);
    for (const rect of merged) {
      ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
      this.renderRange(rect); // 只重绘脏区域
    }
    this.dirtyRects = [];
  }
}

// 3. 分层渲染（避免频繁全量重绘）
const LAYERS = {
  BACKGROUND:  0,  // 背景色、斑马纹
  GRIDLINES:   1,  // 网格线
  MERGE_CELLS: 2,  // 合并单元格区域
  CONTENT:     3,  // 文本内容
  SELECTION:   4,  // 选区高亮
  CURSOR:      5,  // 编辑光标
  OVERLAY:     6,  // 浮动元素（图片、图表）
};
```

### 2.3 与语雀/飞书的差异设计

| 维度 | 语雀 | 飞书 | **自研系统** |
|---|---|---|---|
| 渲染模式 | 自由排版 | 结构化 | **双模式自适应（智能切换）** |
| 合并单元格 | ✓ 原生支持 | ✗ 不支持 | **✓ 自由表模式支持** |
| 混合内容 | 文档内嵌 | 独立应用 | **独立应用 + SDK 嵌入** |
| 渲染引擎 | 单一 Canvas | 单一 Canvas | **Canvas + OffscreenCanvas（Worker）** |

**亮点**：利用 OffscreenCanvas API，将非交互渲染任务（打印、导出缩略图、后台分页计算）放到 Web Worker 中执行，主线程零阻塞。

---

## 三、数据模型设计

### 3.1 核心设计：双模数据模型

```
TableModel
├── StandardTable（标准表 — 类飞书）
│   ├── ColumnDef[] — 列定义（强类型：文本/数字/日期/人员/单选/公式...）
│   ├── Row[] — 行记录（每行 = 一条完整记录）
│   └── Views[] — 多视图（表格/看板/日历/甘特/画廊）
│
└── FreeTable（自由表 — 类语雀）
    ├── SparseMatrix — 稀疏矩阵（Map[coord] → CellData）
    ├── MergeMap — 合并单元格映射
    ├── RowStyles / ColStyles — 行列样式
    └── NamedRanges — 命名区域
```

### 3.2 存储结构设计

#### 标准表（列式存储）

```json
// 文档级别元数据
{
  "docId": "doc_abc123",
  "type": "standard",
  "version": 42,
  "columns": [
    { "id": "col_1", "name": "任务名称", "type": "text", "required": true },
    { "id": "col_2", "name": "负责人",   "type": "user", "multiple": false },
    { "id": "col_3", "name": "截止日期", "type": "date" },
    { "id": "col_4", "name": "状态",     "type": "select", "options": ["待处理","进行中","已完成"] },
    { "id": "col_5", "name": "金额",     "type": "number", "format": "currency" }
  ],
  "rows": [
    { "_id": "row_1", "col_1": "需求评审", "col_2": ["user_zhang"], "col_3": "2026-06-20", "col_4": "进行中", "col_5": 5000 },
    { "_id": "row_2", "col_1": "技术方案", "col_2": ["user_li"],   "col_3": "2026-06-25", "col_4": "待处理", "col_5": null }
  ],
  "views": [
    { "id": "view_1", "type": "grid", "name": "全部任务", "filter": {}, "sort": [{"col": "col_3", "order": "asc"}] },
    { "id": "view_2", "type": "kanban", "name": "看板", "groupBy": "col_4" }
  ]
}
```

#### 自由表（稀疏矩阵 + 增量快照）

```json
// 基线（全量快照，每 N 个版本一次）
{
  "docId": "doc_xyz789",
  "type": "freeform",
  "baseVersion": 40,
  "rowCount": 500,
  "colCount": 26,
  "mergedCells": [
    { "range": "A1:C1", "content": "2026年度报表" },
    { "range": "A2:A5", "content": "部门A" }
  ],
  "columnWidths": { "A": 120, "B": 200, "C": 150 },
  "rowHeights": { "1": 40, "2": 30 },
  "cells": {                              // 稀疏 — 只存有内容的单元格
    "B3": { "v": "营收", "fmt": "bold" },
    "C3": { "v": 1234567, "fmt": "currency" },
    "B4": { "v": "成本", "fmt": "bold" },
    "C4": { "v": 987654, "fmt": "currency" },
    "B5": { "v": "利润", "fmt": "bold" },
    "C5": { "v": "=C3-C4", "fmt": "currency", "formula": "C3-C4" }
  }
}

// 增量 diff（版本 41–50）
{
  "version": 41,
  "changes": [
    { "op": "set", "cell": "D3", "value": { "v": "备注", "fmt": "italic" } },
    { "op": "set", "cell": "C5", "value": { "v": "=C3-C4*1.1", "formula": "C3-C4*1.1" } }
  ]
}
```

### 3.3 与语雀/飞书模型对比

| 特性 | 语雀 | 飞书 | **自研系统** |
|---|---|---|---|
| 基础模型 | 异构（Excel 式） | 同构强类型（DB 式） | **双模：创建时选定，支持转换** |
| 合并单元格 | ✓ | ✗ | **✓（自由表）** |
| 字段类型约束 | 弱（自由输入） | 强（列级类型） | **按模式分类** |
| 多视图 | 有限 | 丰富 | **标准表完整支持 5 种视图** |
| 存储效率 | 稀疏矩阵（优） | 列式（优） | **按模式选择最优方案** |

---

## 四、协同算法设计

### 4.1 核心选择：CRDT（主） + OT（辅助）

```
协同引擎架构
├── CRDT 引擎（主力 — 90%+ 操作）
│   ├── RGA（Replicated Growable Array） — 列表操作（插入/删除行列）
│   ├── LWW-Register（Last-Write-Wins）  — 单元格值覆盖
│   ├── Counter（PN-Counter）            — 计数器（投票、评分）
│   └── OR-Set（Observed-Remove Set）    — 集合操作（多选字段）
│
├── OT 桥接层（辅助 — 复杂操作兜底）
│   ├── 跨表公式引用冲突
│   ├── 合并单元格范围冲突
│   └── 条件格式/数据验证规则冲突
│
└── 同步层
    ├── WebSocket 长连接
    ├── 心跳保活（30s）
    ├── 断线重连 + 增量同步
    └── 离线编辑队列（IndexedDB 暂存）
```

### 4.2 关键数据结构

```typescript
// CRDT 操作单元
interface CrdtOperation {
  opId: string;           // 全局唯一操作ID（HLC 生成：timestamp + nodeId + counter）
  type: 'set' | 'insert' | 'delete' | 'move' | 'counter_inc' | 'counter_dec';
  target: CellRef;        // 目标位置（sheet!A1 格式）
  value?: any;            // 操作值
  clock: number;          // 逻辑时钟
  dependencies: string[]; // 因果依赖（上一操作的 opId）
}

// HLC（Hybrid Logical Clock）— 混合逻辑时钟
class HybridLogicalClock {
  private physicalTime: number;   // 物理时间戳
  private logicalCounter: number; // 逻辑计数器
  private nodeId: string;         // 节点标识

  next(): string {
    const now = Date.now();
    this.logicalCounter = (now > this.physicalTime) ? 0 : this.logicalCounter + 1;
    this.physicalTime = Math.max(now, this.physicalTime);
    return `${this.physicalTime}:${this.logicalCounter}:${this.nodeId}`;
  }
}
```

### 4.3 冲突解决策略

```
冲突处理流程：
┌──────────┐     ┌──────────┐     ┌──────────────┐
│ 客户端A  │────▶│ CRDT合并  │────▶│ 本地即时应用  │  离线/在线均可用
│修改C3=100│     │ (LWW:取   │     │ C3: 100       │
└──────────┘     │  最新写入)│     └──────────────┘
                 │           │
┌──────────┐     │ 时间戳大   │     ┌──────────────┐
│ 客户端B  │────▶│ 的胜出... │────▶│ 服务端仲裁    │  在线时服务端确认
│修改C3=200│     │           │     │ C3: 200 ✓     │
└──────────┘     └──────────┘     └──────────────┘

特殊场景 — 合并单元格冲突：
- 用户A 将 A1:B2 合并
- 用户B 在 B2 写入内容
→ OT 桥接层处理：先展开合并 → 写入内容 → 服务端通知 A 合并已变更
```

### 4.4 离线编辑流程

```
┌─────────────────────────────────────────────────────┐
│                    离线编辑流程                        │
├─────────────────────────────────────────────────────┤
│  1. 检测网络断开                                      │
│     └─▶ 切换到 offline 模式                          │
│                                                     │
│  2. 用户继续编辑                                      │
│     └─▶ 操作存入 IndexedDB 离线队列                   │
│     └─▶ CRDT 本地合并，即时更新 UI                     │
│                                                     │
│  3. 网络恢复                                          │
│     └─▶ WebSocket 重连                                │
│     └─▶ 拉取服务端最新快照（版本差）                     │
│     └─▶ 本地 CRDT 合并离线操作 + 远端操作               │
│     └─▶ 推送离线操作到服务端                            │
│     └─▶ 切换到 online 模式                            │
│                                                     │
│  4. 冲突处理                                          │
│     └─▶ LWW 自动解决（以时间戳为准）                     │
│     └─▶ 无法自动解决的 → OT 桥接 → 服务端裁决          │
│     └─▶ 极端情况 → 标记冲突区域 → 通知用户手动处理       │
└─────────────────────────────────────────────────────┘
```

### 4.5 与语雀/飞书协同对比

| 维度 | 语雀 | 飞书 | **自研系统** |
|---|---|---|---|
| 主力算法 | OT | CRDT | **CRDT** |
| 辅助算法 | Command | OT | **OT** |
| 架构 | 中心化 | 去中心化 | **半中心化（服务端兜底）** |
| 离线编辑 | 弱 | 强 | **强（CRDT 天然支持）** |
| 协同人数 | ≤50 | ≤2000 | **≤500** |
| 一致性模型 | 强一致（服务端裁决） | 最终一致 | **最终一致 + 关键操作强一致** |

---

## 五、计算引擎设计

### 5.1 三级计算架构

```
                 ┌──────────────┐
                 │   用户操作    │
                 └──────┬───────┘
                        │
           ┌────────────▼────────────┐
           │  L1: 客户端（主线程）      │  < 1000 个公式
           │  · 单单元格公式           │  延迟: < 10ms
           │  · SUM/AVG 简单聚合      │
           │  · 排序/筛选（小数据集）   │
           └────────────┬────────────┘
                        │ 超出阈值
           ┌────────────▼────────────┐
           │  L2: Web Worker（后台）   │  1000–100000 个公式
           │  · 中等规模计算           │  延迟: 50–500ms
           │  · 全表排序/筛选          │
           │  · 依赖图解析             │
           └────────────┬────────────┘
                        │ 超出阈值
           ┌────────────▼────────────┐
           │  L3: 服务端（集群）        │  > 100000 个公式
           │  · 大规模计算             │  延迟: 1–5s
           │  · 跨表公式/引用          │
           │  · 复杂聚合/透视          │
           └─────────────────────────┘
```

### 5.2 公式引擎核心设计

```typescript
// 公式依赖图（DAG）
class DependencyGraph {
  private graph: Map<CellRef, Set<CellRef>>; // cell → 它的依赖

  // 拓扑排序计算顺序
  topologicalOrder(changedCell: CellRef): CellRef[] {
    // BFS 从变更单元格出发，按依赖链传播计算
    const order: CellRef[] = [];
    const visited = new Set<CellRef>();
    const queue: CellRef[] = [changedCell];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      order.push(current);
      for (const dependent of this.getDependents(current)) {
        queue.push(dependent);
      }
    }
    return order; // 返回按依赖顺序排列的需要重算的单元格列表
  }
}

// 公式函数库（按需注册，避免超大 bundle）
const BUILTIN_FUNCTIONS = {
  // 数学
  SUM, AVERAGE, COUNT, MAX, MIN, ROUND, ABS, MOD, POWER, SQRT,
  // 逻辑
  IF, AND, OR, NOT, SWITCH, IFERROR, IFNA,
  // 文本
  CONCAT, LEFT, RIGHT, MID, LEN, FIND, REPLACE, TRIM, UPPER, LOWER,
  // 日期
  TODAY, NOW, YEAR, MONTH, DAY, DATEDIF, WORKDAY, WEEKDAY,
  // 查找
  VLOOKUP, HLOOKUP, XLOOKUP, INDEX, MATCH, FILTER, SORT, UNIQUE,
  // 聚合（数据库式 — 飞书风格）
  COUNTIF, SUMIF, AVERAGEIF, COUNTIFS, SUMIFS, AVERAGEIFS,
  // 自定义函数
  REGISTER_CUSTOM_FUNCTION,
};
```

### 5.3 计算性能目标

| 场景 | 数据量 | 延迟目标 | 执行层 |
|---|---|---|---|
| 单单元格编辑 | 1 单元格 | < 10ms | L1（客户端主线程） |
| 整列 SUM | 10 万行 | < 100ms | L2（Web Worker） |
| 全表排序 | 5 万行 × 50 列 | < 500ms | L2（Web Worker） |
| 多表 VLOOKUP | 跨 5 张表 | < 3s | L3（服务端） |
| 数据透视表刷新 | 50 万行 | < 5s | L3（服务端） |
| Excel 公式兼容 | 支持 200+ 函数 | - | L1 + L2 联合 |

---

## 六、存储架构设计

### 6.1 分层存储

```
┌─────────────────────────────────────────┐
│            存储分层架构                    │
├─────────────────────────────────────────┤
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  PostgreSQL（核心数据）              │  │
│  │  · 文档元数据（doc_id, version,     │  │
│  │    created_at, updated_at, owners） │  │
│  │  · 用户权限（RBAC）                │  │
│  │  · 操作日志（审计留痕）             │  │
│  │  · 协作会话（在线用户、光标位置）    │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  MinIO / S3（文档快照 + 附件）      │  │
│  │  · 基线快照（完整文档，每 50 版）    │  │
│  │  · 增量 Diff（版间差异）            │  │
│  │  · 附件（图片、文件）               │  │
│  │  · 导出文件缓存（xlsx/pdf）         │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  Redis（热数据缓存 + 实时状态）      │  │
│  │  · 活跃文档缓存（最近 30 天）       │  │
│  │  · 协同操作队列（pub/sub）          │  │
│  │  · 计算结果缓存                    │  │
│  │  · 会话状态 / 在线用户             │  │
│  │  · 限流计数器                      │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  Elasticsearch（搜索与索引）         │  │
│  │  · 全文检索（单元格内容）           │  │
│  │  · 结构化字段索引                   │  │
│  │  · 跨表关联查询                    │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  CRDT 状态存储（可选：DynamoDB /    │  │
│  │  FoundationDB）                     │  │
│  │  · 操作日志（不可变追加）            │  │
│  │  · 向量时钟状态                    │  │
│  │  · 墓碑标记（已删除操作追踪）        │  │
│  └───────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

### 6.2 版本管理策略

```
版本演化模型：
Version 1 ──▶ Version 2 ──▶ ... ──▶ Version 50 ──▶ Version 51 ──▶ ...
   │              │                    │               │
   │         增量 diff             基线快照        增量 diff
   │       (patch_1_2)          (snapshot_v50)   (patch_50_51)
   │                                │
   │              ┌─────────────────┘
   │              ▼
   └────── 合并为 snapshot_v50（全量 + 裁剪旧 diff）

快照策略：
- 基线快照：每 50 个版本生成一次
- 增量 diff：每个版本存储一次
- 保留策略：最近 10 个基线 + 期间所有 diff（约 500 个版本）
  超出的 diff 与旧基线合并后归档冷存储
- 读取流程：
  1. 找到最近的基线快照（≤ 目标版本）
  2. 依次应用目标版本之前的增量 diff
  3. 返回完整文档内容
```

### 6.3 存储效率估算

| 项目 | 语雀（基线+Diff） | 飞书（类 Protobuf） | **自研系统（基线+Diff + 列式）** |
|---|---|---|---|
| 10 万单元格 | ~2.5 MB | ~3.0 MB | ~2.0 MB（标准表）、~2.5 MB（自由表） |
| 版本增量 | 节省 90%+ | 节省 85%+ | **节省 90%+** |
| 检索性能 | 中等 | 高（ES 加持） | **高（ES 多维索引）** |

---

## 七、Excel 兼容方案

### 7.1 分区策略

```
Excel 兼容分区策略
├── 强兼容区（标准 Excel 功能 — 100% 保留）
│   ├── 单元格数据（文本/数字/日期/布尔）
│   ├── 字体样式（粗体/斜体/下划线/颜色/大小）
│   ├── 边框/背景色
│   ├── 合并单元格（仅自由表）
│   ├── 行列宽高
│   ├── 数字格式（货币/百分比/日期/自定义）
│   ├── 条件格式（数据条/色阶/图标集）
│   └── 基础公式（200+ 函数映射）
│
├── 智能降级区（Excel 特有 → 自研等价转换）
│   ├── 数据透视表 → 标准表 + 分组视图
│   ├── 图表 → 独立图表插件
│   ├── 数据验证 → 列类型约束
│   ├── 宏/VBA → 自动化规则（有限转换）
│   └── 外部数据连接 → API 连接器
│
└── 增强区（自研独有 — 导出 Excel 时丢弃）
    ├── 多视图（表格/看板/日历/甘特/画廊）
    ├── 关联字段（跨表引用）
    ├── 自动化规则
    └── 协同批注/讨论
```

### 7.2 导入流程

```
Excel 导入流程：
┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ 上传文件  │───▶│ SheetJS 解析  │───▶│ 智能模型映射   │───▶│ 冲突检测      │
│ .xlsx    │    │ · 单元格数据   │    │ · 检测合并单元格│    │ · 格式冲突    │
│ .xls     │    │ · 样式信息     │    │ · 判断模型类型  │    │ · 数据冲突    │
│ .csv     │    │ · 公式表达式   │    │ · 字段类型推断  │    │ · 公式冲突    │
└──────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                                          │
                          ┌───────────────┴───────────────┐
                          ▼                               ▼
                  ┌──────────────┐                ┌──────────────┐
                  │ 自由表       │                │ 标准表        │
                  │（有合并单元格）│                │（无合并单元格）│
                  │ 保留所有格式  │                │ 智能类型转换  │
                  └──────────────┘                └──────────────┘
```

### 7.3 导出流程

```
Excel 导出流程：
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ 自研格式      │───▶│ 中间层转换     │───▶│ ExcelJS 生成  │───▶│ 下载 .xlsx   │
│ · 标准表      │    │ · 自由表 →    │    │ · 单元格写入   │    │              │
│ · 自由表      │    │   Excel 兼容  │    │ · 样式应用     │    │              │
│ · 视图数据    │    │ · 标准表 →    │    │ · 合并单元格   │    │              │
│               │    │   平铺表格    │    │ · 公式写入     │    │              │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘

导出选项：
- 标准表导出：可选择导出当前视图（受筛选/排序影响）或全部数据
- 自由表导出：完整保留格式、合并单元格、公式
- 增强特性提示：导出前警告用户哪些功能会丢失（视图/关联/自动化）
```

### 7.4 与语雀/飞书 Excel 兼容对比

| 能力 | 语雀 | 飞书 | **自研系统** |
|---|---|---|---|
| xlsx 解析引擎 | SheetJS | 自研 | **SheetJS（社区成熟，减少自研成本）** |
| 合并单元格 | 完整保留 | 抹平丢弃 | **自由表完整保留** |
| 样式保真度 | 高 | 中 | **高（自由表）/ 中（标准表，类型化损失）** |
| 公式兼容数 | 200+ | 150+ | **200+（分阶段）** |
| 宏/VBA | 部分支持 | 不支持 | **不支持（转换为自动化规则）** |
| 数据透视表 | 有限支持 | 不支持（用多维表替代） | **拆分为标准表视图** |
| 大文件支持 | 50MB | 100MB | **100MB（分片上传+流式解析）** |

---

## 八、技术栈选型

### 8.1 前端

| 层级 | 技术选型 | 理由 |
|---|---|---|
| UI 框架 | React 18 + TypeScript | 生态成熟、社区活跃、飞书/语雀均用 React |
| 状态管理 | Zustand / Jotai | 轻量、原子化、适合高频更新场景 |
| Canvas 渲染 | 自研引擎（基于 Canvas 2D + OffscreenCanvas） | 双模渲染需求，无现成方案完全匹配 |
| Web Worker | Comlink | 简化主线程-Worker 通信 |
| 公式引擎 | 自研（基于 HyperFormula 参考） | 需兼容 Excel + 自定义函数 |
| 构建工具 | Vite | 快速 HMR、ESM 原生支持 |
| 测试框架 | Vitest + Playwright（E2E） | 单元测试 + 可视化回归测试 |

### 8.2 后端

| 层级 | 技术选型 | 理由 |
|---|---|---|
| 服务框架 | Node.js（TypeScript）+ 关键路径 Rust | Node 前后端同构公式引擎；Rust 处理高 CPU 计算 |
| API 网关 | Kong / 自研 Nginx+Lua | 限流、认证、路由 |
| 实时通信 | WebSocket（Socket.IO / 自研 ws） | 长连接协同推送 |
| 计算服务 | Rust（Actix-web）+ 公式 WASM 运行时 | 高性能、内存安全 |
| 消息队列 | Redis Streams / RabbitMQ | 协同操作异步分发 |
| 任务调度 | BullMQ（基于 Redis） | 定时任务、导入导出批处理 |

### 8.3 数据存储

| 层级 | 技术选型 | 理由 |
|---|---|---|
| 主数据库 | PostgreSQL 15+ | JSONB 支持灵活文档模型、强事务 |
| 缓存 | Redis 7+（Cluster 模式） | 热数据、会话、pub/sub |
| 对象存储 | MinIO（自建）/ 阿里云 OSS | S3 兼容、低成本 |
| 搜索引擎 | Elasticsearch 8+ | 全文检索、聚合分析 |
| CRDT 日志 | PostgreSQL（WAL 模式） | 复用现有设施，减少运维复杂度 |

### 8.4 基础设施

| 层级 | 技术选型 | 理由 |
|---|---|---|
| 容器编排 | Kubernetes | 弹性伸缩、服务发现 |
| CI/CD | GitHub Actions / Jenkins | 自动化测试与部署 |
| 监控 | Prometheus + Grafana | 指标采集与可视化 |
| 日志 | ELK（Elastic + Logstash + Kibana） | 集中日志分析 |
| 链路追踪 | OpenTelemetry + Jaeger | 分布式追踪 |

---

## 八-附：核心类型与接口契约定义

> **说明**：本章补全编码就绪性评估报告中识别的 P0/P1 缺失项，定义所有核心类型、接口契约和错误码体系。开发团队拿到本章后即可开始编码。

### 附8.1 核心数据模型类型（P0-2 补全）

```typescript
// ==========================================
// 单元格坐标引用
// ==========================================

/** 单元格引用 — "sheet!A1" 格式，跨表时必含 sheetId */
type CellRef = string;  // 例: "A1" / "Sheet1!A1" / "doc_abc:Sheet1!A1"

/** 单元格坐标（行/列数字表示，0-based） */
interface CellCoord {
  row: number;  // 0-based
  col: number;  // 0-based
}

/** 单元格范围 */
interface CellRange {
  sheetId: string;
  start: CellCoord;
  end: CellCoord;
}

// ==========================================
// 单元格数据（最低层数据结构）
// ==========================================

interface CellData {
  /** 原始值 */
  v: string | number | boolean | Date | null;

  /** 显示值（公式计算结果、格式化后文本） */
  displayValue?: string;

  /** 数据类型 */
  type: 'string' | 'number' | 'boolean' | 'date' | 'formula' | 'error' | 'empty';

  /** 公式表达式（仅 type='formula' 时有值） */
  formula?: string;

  /** 错误信息（仅 type='error' 时有值） */
  error?: FormulaError;

  /** 样式信息 */
  style?: CellStyle;

  /** 数字格式（如 "0.00%"、"yyyy-mm-dd"） */
  numberFormat?: string;

  /** 数据验证结果 */
  validationResult?: ValidationResult;

  /** 最后修改者 */
  lastModifiedBy?: string;

  /** 最后修改时间 */
  lastModifiedAt?: number;
}

// ==========================================
// 单元格样式
// ==========================================

interface CellStyle {
  // 字体
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  fontColor?: string;         // #RRGGBB

  // 填充
  backgroundColor?: string;   // #RRGGBB
  backgroundPattern?: 'solid' | 'none';

  // 边框
  borderTop?: BorderStyle;
  borderRight?: BorderStyle;
  borderBottom?: BorderStyle;
  borderLeft?: BorderStyle;

  // 对齐
  horizontalAlign?: 'left' | 'center' | 'right' | 'justify';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  textWrap?: boolean;
  textRotation?: number;      // 0 / 90 / -90

  // 数字格式
  numberFormat?: string;
}

interface BorderStyle {
  color: string;
  style: 'thin' | 'medium' | 'thick' | 'dashed' | 'dotted' | 'double' | 'none';
}

// ==========================================
// 公式引擎相关
// ==========================================

/** 公式错误值 */
type FormulaError =
  | '#REF!'       // 引用无效
  | '#VALUE!'     // 值类型错误
  | '#DIV/0!'     // 除零
  | '#N/A'        // 值不可用
  | '#NAME?'      // 未识别的函数名
  | '#NUM!'       // 数字溢出/无效
  | '#NULL!'      // 范围交集为空
  | '#ERROR!'     // 通用错误
  | '#CYCLE!';    // 循环引用（自研扩展）

// ==========================================
// 列定义（标准表）
// ==========================================

type ColumnType =
  | 'text'         // 单行文本
  | 'multiline'    // 多行文本
  | 'number'       // 数字
  | 'currency'     // 货币
  | 'percent'      // 百分比
  | 'date'         // 日期
  | 'datetime'     // 日期时间
  | 'boolean'      // 复选框
  | 'select'       // 单选
  | 'multiSelect'  // 多选
  | 'user'         // 人员
  | 'attachment'   // 附件
  | 'link'         // 链接
  | 'email'        // 邮箱
  | 'phone'        // 电话
  | 'formula'      // 公式列
  | 'rollup'       // 汇总列（关联表聚合）
  | 'lookup'       // 查找列（关联表引用）
  | 'autoNumber'   // 自动编号
  | 'rating'       // 评分
  | 'progress';    // 进度条

interface ColumnDef {
  id: string;                    // 列唯一标识
  name: string;                  // 列显示名称
  type: ColumnType;              // 列类型
  required?: boolean;            // 是否必填
  defaultValue?: any;            // 默认值
  description?: string;          // 列描述
  width?: number;                // 列宽（像素）
  hidden?: boolean;              // 是否隐藏
  frozen?: boolean;              // 是否冻结

  // 类型相关配置
  options?: SelectOption[];      // select/multiSelect 选项
  format?: string;               // number/date 格式化
  precision?: number;            // number 小数位数
  currencySymbol?: string;       // currency 币种符号
  formula?: string;              // formula 公式表达式
  rollupConfig?: RollupConfig;   // rollup 配置
  lookupConfig?: LookupConfig;   // lookup 配置
  validation?: ColumnValidation; // 数据验证规则
}

interface SelectOption {
  id: string;
  name: string;
  color: string;
}

interface ColumnValidation {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;             // 正则验证
  unique?: boolean;             // 唯一性约束
}

interface RollupConfig {
  linkedTableId: string;        // 关联表
  linkedFieldId: string;        // 关联字段
  targetFieldId: string;        // 目标字段
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'concat' | 'unique';
}

interface LookupConfig {
  linkedTableId: string;
  linkedFieldId: string;
  targetFieldId: string;
}

// ==========================================
// SheetModel — 核心模型（P0-2 补全）
// ==========================================

interface SheetModel {
  // ─── 元数据 ───
  sheetId: string;
  name: string;
  type: 'standard' | 'freeform';
  rowCount: number;
  colCount: number;
  isHidden: boolean;

  // ─── 标准表专用 ───
  columnDefs: ColumnDef[];
  rows: RecordRow[];              // 行记录列表
  linkedTables: LinkedTable[];    // 关联表引用

  // ─── 自由表专用 ───
  cells: Map<string, CellData>;   // key: "R<row>C<col>", 如 "R0C0"
  mergeMap: Map<string, CellRange>; // key: 主单元格坐标, value: 合并范围
  columnWidths: Map<number, number>;
  rowHeights: Map<number, number>;

  // ─── 共用 ───
  namedRanges: Map<string, CellRange>;
  conditionalFormats: ConditionalFormat[];
  validations: DataValidation[];
  defaultStyle: CellStyle;
  freezeState?: FreezeState;      // 冻结行列

  // ─── 运行时状态（不持久化） ───
  formulaDirty?: boolean;
  selectedRange?: CellRange;
}

interface RecordRow {
  _id: string;                    // 行唯一 ID
  _createdAt: number;
  _createdBy: string;
  _updatedAt: number;
  _updatedBy: string;
  _order: number;                 // 排序序号
  [fieldId: string]: any;         // 动态字段值
}

interface LinkedTable {
  tableId: string;
  linkFieldId: string;            // 本表中的关联字段
  targetTableId: string;          // 目标表
  targetFieldId?: string;         // 目标表中的匹配字段
}

interface FreezeState {
  frozenRows: number;
  frozenCols: number;
}

interface DataValidation {
  id: string;
  range: CellRange;
  type: 'list' | 'number' | 'date' | 'textLength' | 'custom';
  criteria: {
    operator: 'between' | 'equal' | 'greaterThan' | 'lessThan' | 'notBetween';
    value1: any;
    value2?: any;
  };
  errorMessage?: string;
  showDropdown?: boolean;
}

interface ConditionalFormat {
  id: string;
  range: CellRange;
  type: 'cellValue' | 'formula' | 'duplicate' | 'topBottom' | 'dataBar' | 'colorScale' | 'iconSet';
  rules: ConditionalRule[];
  format: Partial<CellStyle>;
}

interface ConditionalRule {
  operator: 'greaterThan' | 'lessThan' | 'equal' | 'between' | 'contains' | 'startsWith' | 'isEmpty';
  value: any;
}

// ==========================================
// 版本快照（用于持久化与同步）
// ==========================================

interface SheetSnapshot {
  docId: string;
  version: number;
  sheets: Record<string, SheetModel>;
  sortedSheetIds: string[];       // Sheet 排序
  activeSheetId: string;
  createdAt: number;
}

// ==========================================
// 验证结果
// ==========================================

interface ValidationResult {
  valid: boolean;
  message?: string;
}
```

### 附8.2 CRDT 完整操作类型（P0-1 补全）

```typescript
// ==========================================
// CRDT 操作类型完整定义
// ==========================================

type CrdtOpType =
  // ─── 单元格值操作 ───
  | 'set'              // 设置单元格值
  | 'clear'            // 清除单元格内容

  // ─── 行列操作（RGA 算法管理） ───
  | 'insert_row'       // 插入行
  | 'delete_row'       // 删除行
  | 'insert_column'    // 插入列
  | 'delete_column'    // 删除列
  | 'move_row'         // 移动行
  | 'move_column'      // 移动列
  | 'resize_row'       // 调整行高
  | 'resize_column'    // 调整列宽

  // ─── 合并单元格操作 ───
  | 'merge_cells'      // 合并单元格
  | 'unmerge_cells'    // 取消合并

  // ─── 样式操作 ───
  | 'set_style'        // 设置单元格样式
  | 'format_range'     // 区域格式化（格式刷）

  // ─── 范围操作 ───
  | 'sort_range'       // 区域排序
  | 'set_filter'       // 设置筛选器
  | 'clear_filter'     // 清除筛选器

  // ─── 标准表操作 ───
  | 'create_record'    // 创建行记录
  | 'delete_record'    // 删除行记录
  | 'update_field'     // 更新字段值（标准表）
  | 'add_field'        // 添加列字段
  | 'remove_field'     // 删除列字段
  | 'update_field_def' // 修改列定义

  // ─── 结构操作 ───
  | 'add_sheet'        // 添加 Sheet
  | 'remove_sheet'     // 删除 Sheet
  | 'rename_sheet'     // 重命名 Sheet
  | 'reorder_sheet'    // 排序 Sheet

  // ─── 高级操作 ───
  | 'set_validation'       // 设置数据验证
  | 'remove_validation'    // 删除数据验证
  | 'set_conditional_format'    // 设置条件格式
  | 'remove_conditional_format' // 删除条件格式
  | 'set_named_range'      // 设置命名区域
  | 'remove_named_range'   // 删除命名区域

  // ─── 计数器（PN-Counter） ───
  | 'counter_inc'      // 计数器自增
  | 'counter_dec';     // 计数器自减


// 各类型操作的载荷定义
interface CrdtOperation {
  opId: string;                    // 全局唯一操作 ID（HLC）
  type: CrdtOpType;
  target: CellRef;                 // 主目标位置
  value?: any;                     // 操作值
  clock: number;                   // 逻辑时钟
  dependencies: string[];          // 因果依赖（上一操作的 opId）

  // ─── 行列操作的扩展字段 ───
  position?: {                      // 插入/删除/移动位置
    index: number;
    count?: number;
  };

  // ─── 合并单元格的扩展字段 ───
  mergeRange?: CellRange;          // 合并范围

  // ─── 样式操作的扩展字段 ───
  style?: Partial<CellStyle>;      // 样式变更

  // ─── 筛选/排序的扩展字段 ───
  sortConfig?: SortConfig;         // 排序配置
  filterConfig?: FilterConfig;     // 筛选配置

  // ─── 字段操作的扩展字段 ───
  fieldDef?: ColumnDef;            // 字段定义
}

interface SortConfig {
  criteria: { fieldId: string; order: 'asc' | 'desc' }[];
}

interface FilterConfig {
  conditions: FilterCondition[];
  conjunction: 'and' | 'or';
}

interface FilterCondition {
  fieldId: string;
  operator: 'equals' | 'notEquals' | 'contains' | 'notContains' |
            'greaterThan' | 'lessThan' | 'isEmpty' | 'isNotEmpty';
  value: any;
}
```

### 附8.3 Command 接口体系（P0-3 补全）

```typescript
// ==========================================
// Command 模式 — 前端数据流核心抽象
// ==========================================

/** Command 基类接口 */
interface Command {
  /** 命令类型标识 */
  readonly type: string;

  /** 目标 Sheet */
  readonly sheetId: string;

  /** 执行命令：直接修改 SheetModel */
  execute(model: SheetModel): void;

  /** 撤销命令：通过逆向操作恢复 */
  undo(model: SheetModel): void;

  /** 生成对应的 CRDT 操作，用于网络同步 */
  toCrdtOp(): CrdtOperation;

  /** 生成对应的逆向 CRDT 操作（用于协同场景的 OT 变换） */
  toInverseOp(): CrdtOperation;

  /** 是否可合并到批量操作中 */
  canMerge(other: Command): boolean;

  /** 合并两个相同类型的命令 */
  merge(other: Command): Command;
}

// ─── 具体命令实现 ───

class SetCellCommand implements Command {
  readonly type = 'set_cell';

  constructor(
    public readonly sheetId: string,
    public readonly coord: CellCoord,
    public readonly oldValue: CellData,
    public readonly newValue: CellData,
  ) {}

  execute(model: SheetModel): void {
    const key = `R${this.coord.row}C${this.coord.col}`;
    model.cells!.set(key, this.newValue);
    model.formulaDirty = true;
  }

  undo(model: SheetModel): void {
    const key = `R${this.coord.row}C${this.coord.col}`;
    model.cells!.set(key, this.oldValue);
    model.formulaDirty = true;
  }

  toCrdtOp(): CrdtOperation {
    return {
      opId: HLC.next(),
      type: 'set',
      target: `${this.sheetId}!R${this.coord.row}C${this.coord.col}`,
      value: this.newValue,
      clock: Date.now(),
      dependencies: [],
    };
  }

  toInverseOp(): CrdtOperation {
    return { ...this.toCrdtOp(), value: this.oldValue };
  }

  canMerge(other: Command): boolean {
    return other instanceof SetCellCommand &&
           this.sheetId === other.sheetId &&
           this.coord.row === other.coord.row &&
           this.coord.col === other.coord.col;
  }

  merge(other: Command): Command {
    const o = other as SetCellCommand;
    return new SetCellCommand(this.sheetId, this.coord, this.oldValue, o.newValue);
  }
}

class MergeCellsCommand implements Command {
  readonly type = 'merge_cells';

  constructor(
    public readonly sheetId: string,
    public readonly range: CellRange,
    public readonly revertData: Map<string, CellData>,  // 合并前的原始数据
  ) {}

  execute(model: SheetModel): void {
    const key = `R${this.range.start.row}C${this.range.start.col}`;
    model.mergeMap!.set(key, this.range);
    // 清除被合并区域的单元格数据（除主单元格）
    for (const [cellKey] of this.revertData) {
      if (cellKey !== key) {
        model.cells!.delete(cellKey);
      }
    }
  }

  undo(model: SheetModel): void {
    const key = `R${this.range.start.row}C${this.range.start.col}`;
    model.mergeMap!.delete(key);
    // 恢复被合并区域的数据
    for (const [cellKey, cellData] of this.revertData) {
      model.cells!.set(cellKey, cellData);
    }
  }

  toCrdtOp(): CrdtOperation {
    return {
      opId: HLC.next(),
      type: 'merge_cells',
      target: `${this.sheetId}!R${this.range.start.row}C${this.range.start.col}`,
      mergeRange: this.range,
      clock: Date.now(),
      dependencies: [],
    };
  }

  toInverseOp(): CrdtOperation {
    return {
      ...this.toCrdtOp(),
      type: 'unmerge_cells',
    };
  }

  canMerge(): boolean { return false; }
  merge(other: Command): Command { return this; }
}


// ─── CommandExecutor — 统一执行入口 ───

class CommandExecutor {
  private undoManager: UndoManager;
  private crdtEngine: CrdtEngine;

  execute(command: Command, model: SheetModel): void {
    // 1. 执行命令
    command.execute(model);

    // 2. 入栈撤销
    this.undoManager.push(command);

    // 3. 生成 CRDT 操作并同步
    const op = command.toCrdtOp();
    this.crdtEngine.applyAndSync(op);

    // 4. 标记脏区域
    this.dirtyTracker.markDirty(this.getAffectedRange(command));
  }

  // 批量执行（事务语义）
  executeBatch(commands: Command[], model: SheetModel): void {
    for (const cmd of commands) {
      cmd.execute(model);
    }
    this.undoManager.pushBatch(commands);
    const ops = commands.map(c => c.toCrdtOp());
    this.crdtEngine.applyAndSyncBatch(ops);
  }

  // 应用远端操作（无需入栈撤销）
  applyRemote(op: CrdtOperation, model: SheetModel): void {
    this.crdtEngine.applyRemote(op, model);
    this.dirtyTracker.markDirty(this.getOpRange(op));
  }
}
```

### 附8.4 Formula AST 节点定义（P0-4 补全）

```typescript
// ==========================================
// 公式引擎 AST 节点类型
// ==========================================

type ASTNode =
  // 字面量
  | NumberLiteralNode
  | StringLiteralNode
  | BooleanLiteralNode
  | EmptyLiteralNode

  // 引用
  | CellReferenceNode
  | RangeReferenceNode
  | NamedRangeNode
  | TableReferenceNode      // 标准表引用（如 [任务表].[负责人]）

  // 表达式
  | BinaryOpNode
  | UnaryOpNode
  | FunctionCallNode
  | ArrayExpressionNode     // {1,2,3}
  | ErrorNode;              // 解析错误


interface NumberLiteralNode {
  type: 'number_literal';
  value: number;
  raw: string;              // 原始文本，如 "1e6"
}

interface StringLiteralNode {
  type: 'string_literal';
  value: string;
  raw: string;
}

interface BooleanLiteralNode {
  type: 'boolean_literal';
  value: boolean;
}

interface EmptyLiteralNode {
  type: 'empty_literal';    // 空单元格 = ""
}

interface CellReferenceNode {
  type: 'cell_reference';
  ref: CellRef;
  isAbsolute: boolean;      // $A$1 vs A1
}

interface RangeReferenceNode {
  type: 'range_reference';
  start: CellRef;
  end: CellRef;
  isAbsolute: boolean;
}

interface NamedRangeNode {
  type: 'named_range';
  name: string;
  resolvedRange?: CellRange;
}

interface TableReferenceNode {
  type: 'table_reference';
  tableName: string;
  fieldName?: string;
  rowFilter?: ExpressionNode;
}

interface BinaryOpNode {
  type: 'binary_op';
  operator: '+' | '-' | '*' | '/' | '^' | '&' | '=' | '<>' | '<' | '<=' | '>' | '>=';
  left: ASTNode;
  right: ASTNode;
  position: SourcePosition;  // 源码位置（用于错误提示）
}

interface UnaryOpNode {
  type: 'unary_op';
  operator: '-' | '+' | '%';
  operand: ASTNode;
  position: SourcePosition;
}

interface FunctionCallNode {
  type: 'function_call';
  name: string;              // 函数名（SUM, VLOOKUP 等）
  arguments: ASTNode[];
  position: SourcePosition;
}

interface ErrorNode {
  type: 'error';
  error: FormulaError;
  message: string;
  position: SourcePosition;
}

interface SourcePosition {
  line: number;
  column: number;
  offset: number;
}


// ─── 公式求值器接口 ───

interface FormulaEvaluator {
  evaluate(node: ASTNode, context: EvaluationContext): CalcValue;
  evaluateString(formula: string, context: EvaluationContext): CalcValue;
}

type CalcValue = number | string | boolean | Date | CalcValue[] | FormulaError;

interface EvaluationContext {
  /** 当前 Sheet ID */
  sheetId: string;

  /** 获取单元格当前值 */
  getCellValue(ref: CellRef): CellData;

  /** 获取单元格范围的值（二维数组） */
  getCellRange(start: CellRef, end: CellRef): CellData[][];

  /** 获取命名区域 */
  getNamedRange(name: string): CellRange | null;

  /** 获取表引用（标准表） */
  getTableRef(tableName: string, fieldName?: string): any;

  /** 循环引用检测栈 */
  evalStack: CellRef[];

  /** 当前重算策略 */
  recalcMode: 'incremental' | 'full';

  /** 最大迭代深度（防止死循环） */
  maxIterations?: number;
}
```

### 附8.5 全局错误码体系（P1-7 补全）

```typescript
// ==========================================
// 错误码枚举（6位数字：前2位=模块，后4位=具体错误）
// ==========================================

enum ErrorCode {
  // ─── 通用 (10xxxx) ───
  SUCCESS              = 0,
  UNKNOWN_ERROR        = 100001,
  INVALID_PARAMETER    = 100002,  // 参数校验失败
  RATE_LIMITED         = 100003,  // 触发限流
  SERVICE_UNAVAILABLE  = 100004,  // 服务不可用
  INTERNAL_ERROR       = 100005,  // 内部错误
  NOT_IMPLEMENTED      = 100006,  // 功能未实现

  // ─── 认证/授权 (11xxxx) ───
  UNAUTHORIZED         = 110001,  // 未登录
  TOKEN_EXPIRED        = 110002,  // Token 过期
  TOKEN_INVALID        = 110003,  // Token 无效
  FORBIDDEN            = 110004,  // 无权访问
  INSUFFICIENT_ROLE    = 110005,  // 角色权限不足

  // ─── 用户 (12xxxx) ───
  USER_NOT_FOUND       = 120001,
  USER_ALREADY_EXISTS  = 120002,  // 邮箱已注册
  PASSWORD_TOO_WEAK    = 120003,
  PASSWORD_MISMATCH    = 120004,

  // ─── 文档 (20xxxx) ───
  DOC_NOT_FOUND        = 200001,
  DOC_DELETED          = 200002,
  DOC_TOO_LARGE        = 200003,  // 超出大小限制
  DOC_VERSION_CONFLICT = 200004,  // 版本冲突
  DOC_SHEET_NOT_FOUND  = 200005,
  DOC_IMPORT_FAILED    = 200006,
  DOC_EXPORT_FAILED    = 200007,
  DOC_LOCKED           = 200008,  // 文档被锁定/维护中

  // ─── 协同 (21xxxx) ───
  COLLAB_OP_INVALID    = 210001,  // 无效的协同操作
  COLLAB_VERSION_MISMATCH = 210002, // 版本号不匹配
  COLLAB_OP_TOO_LARGE  = 210003,  // 单次操作数据过大
  COLLAB_ROOM_FULL     = 210004,  // 协同房间人数已满
  COLLAB_OP_REJECTED   = 210005,  // 操作被服务端拒绝

  // ─── 计算 (30xxxx) ───
  FORMULA_PARSE_ERROR  = 300001,  // 公式解析失败
  FORMULA_CYCLE        = 300002,  // 循环引用
  FORMULA_REF_INVALID  = 300003,  // 无效引用
  FORMULA_TYPE_ERROR   = 300004,  // 类型错误
  FORMULA_DIV_ZERO     = 300005,  // 除零错误
  FORMULA_TIMEOUT      = 300006,  // 计算超时

  // ─── 存储 (40xxxx) ───
  STORAGE_FULL         = 400001,  // 存储空间不足
  STORAGE_UPLOAD_FAILED = 400002, // 文件上传失败
  STORAGE_FILE_TOO_LARGE = 400003, // 文件过大

  // ─── 自动化 (50xxxx) ───
  AUTOMATION_NOT_FOUND = 500001,
  AUTOMATION_LIMIT_EXCEEDED = 500002,  // 规则数量超限
  AUTOMATION_RUN_FAILED    = 500003,
  AUTOMATION_TRIGGER_INVALID = 500004,
}

// 错误响应格式
interface ErrorResponse {
  code: ErrorCode;
  message: string;
  details?: Record<string, any>;
  requestId: string;
  timestamp: number;
}
```

### 附8.6 离线三方合并算法（P1-1 补全）

```typescript
// ==========================================
// 离线重连三方合并算法
// ==========================================

interface MergeResult {
  /** 合并后的操作集（按因果序排列） */
  resolvedOps: CrdtOperation[];
  /** 无法自动解决的冲突 */
  conflicts: MergeConflict[];
  /** 合并后的文档版本号 */
  finalVersion: number;
}

interface MergeConflict {
  type: 'cell_value' | 'row_conflict' | 'merge_conflict' | 'style_conflict';
  localOp: CrdtOperation;
  remoteOp: CrdtOperation;
  cellRef: CellRef;
  resolution: 'auto' | 'local_wins' | 'remote_wins' | 'manual_required';
  resolvedValue?: any;
}

class ThreeWayMerger {
  /**
   * 三方合并
   * @param baseSnapshot  离线前的文档快照（Base）
   * @param localOps      离线期间本地产生的操作（Local）
   * @param remoteSnapshot 服务端当前最新快照（Remote）
   */
  merge(
    baseSnapshot: SheetSnapshot,
    localOps: CrdtOperation[],
    remoteSnapshot: SheetSnapshot,
  ): MergeResult {
    const conflicts: MergeConflict[] = [];
    const resolvedOps: CrdtOperation[] = [];

    // 1. 获取服务端在离线期间产生的操作
    const remoteOps = this.getRemoteOpsSince(
      baseSnapshot.version,
      remoteSnapshot.version,
    );

    // 2. 按时间线合并操作
    const allOps = [...localOps, ...remoteOps]
      .sort((a, b) => a.clock - b.clock);

    // 3. 逐操作处理
    for (const op of allOps) {
      const isLocal = localOps.includes(op);
      const conflicting = this.findConflictingOp(op, allOps, isLocal);

      if (!conflicting) {
        resolvedOps.push(op);
        continue;
      }

      // 4. 尝试自动解决
      const resolution = this.autoResolve(op, conflicting);

      if (resolution.type === 'auto') {
        resolvedOps.push(resolution.resolvedOp);
      } else {
        // 5. 标记为需手动处理
        conflicts.push({
          type: this.classifyConflict(op, conflicting),
          localOp: isLocal ? op : conflicting,
          remoteOp: isLocal ? conflicting : op,
          cellRef: op.target,
          resolution: 'manual_required',
        });
      }
    }

    // 6. 对于需手动处理的冲突，默认策略：最新写入胜出
    for (const conflict of conflicts) {
      const winner = conflict.localOp.clock > conflict.remoteOp.clock
        ? conflict.localOp
        : conflict.remoteOp;
      conflict.resolution = conflict.localOp.clock > conflict.remoteOp.clock
        ? 'local_wins'
        : 'remote_wins';
      conflict.resolvedValue = winner.value;
      resolvedOps.push(winner);
    }

    return {
      resolvedOps,
      conflicts,
      finalVersion: remoteSnapshot.version,
    };
  }

  private autoResolve(
    op: CrdtOperation,
    conflicting: CrdtOperation,
  ): { type: 'auto' | 'manual'; resolvedOp?: CrdtOperation } {

    // LWW: 同单元格写入，时间戳大的胜出
    if (op.type === 'set' && conflicting.type === 'set' && op.target === conflicting.target) {
      return {
        type: 'auto',
        resolvedOp: op.clock > conflicting.clock ? op : conflicting,
      };
    }

    // 插入行 → 偏移量补偿
    if (op.type === 'insert_row' && conflicting.type === 'insert_row') {
      return {
        type: 'auto',
        resolvedOp: {
          ...op,
          position: {
            index: op.position!.index + conflicting.position!.count!,
          },
        },
      };
    }

    // 无法自动解决
    return { type: 'manual' };
  }

  // 离线操作队列大小上限
  static readonly MAX_OFFLINE_OPS = 10000;
  // 超上限处理：放弃旧操作，仅保留最近 5000 个
  static readonly KEEP_RECENT = 5000;
}
```

---

## 八-二：自动化引擎设计（P1-3 补全）

### 附8.7 自动化触发链路

```
┌─────────────────────────────────────────────────────────────┐
│                    自动化引擎架构                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  触发器源                   执行引擎              动作执行     │
│  ┌──────────┐           ┌──────────────┐     ┌────────────┐ │
│  │ CRDT事件  │──────────▶│              │────▶│ 更新字段    │ │
│  │(记录创建/ │           │ Automation   │     │ 发送通知    │ │
│  │ 字段变更) │           │ Engine       │     │ 调用Webhook │ │
│  └──────────┘           │              │     │ 创建任务    │ │
│                         │ ┌──────────┐ │     └────────────┘ │
│  ┌──────────┐           │ │ Rule     │ │                    │
│  │ 定时调度  │──────────▶│ │ Matcher  │ │                    │
│  │(cron)    │           │ └──────────┘ │                    │
│  └──────────┘           │ ┌──────────┐ │                    │
│                         │ │ Rate     │ │                    │
│  ┌──────────┐           │ │ Limiter  │ │                    │
│  │ Webhook  │──────────▶│ └──────────┘ │                    │
│  │ 回调     │           └──────────────┘                    │
│  └──────────┘                                              │
│                                                             │
│  安全机制:                                                   │
│  · 单规则最大 100 次/小时（防死循环）                           │
│  · 执行超时 30 秒强制终止                                     │
│  · 失败自动重试 3 次（指数退避: 1s/2s/4s）                     │
│  · 执行日志完整记录                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

```typescript
// 自动化规则接口
interface AutomationRule {
  id: string;
  docId: string;
  name: string;
  enabled: boolean;

  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];

  // 运行时统计
  runCount: number;
  lastTriggered: number;
  errorCount: number;
}

type AutomationTrigger =
  | { type: 'on_record_create'; sheetId: string }
  | { type: 'on_record_update'; sheetId: string; watchFields?: string[] }
  | { type: 'on_field_change'; sheetId: string; fieldId: string }
  | { type: 'on_schedule'; cron: string; timezone: string }  // "0 9 * * 1"
  | { type: 'on_webhook'; webhookUrl: string; secret?: string };

interface AutomationCondition {
  fieldId: string;
  operator: 'equals' | 'notEquals' | 'greaterThan' | 'lessThan' | 'contains' | 'isEmpty';
  value: any;
}

type AutomationAction =
  | { type: 'update_field'; sheetId: string; fieldId: string; value: string | number; mode: 'set' | 'increment' }
  | { type: 'send_notification'; channels: ('in_app' | 'email' | 'webhook')[]; template: string }
  | { type: 'call_webhook'; url: string; method: 'GET' | 'POST'; headers?: Record<string, string>; body?: any }
  | { type: 'create_record'; sheetId: string; values: Record<string, any> };
```

---

## 八-三：多视图渲染方案（P1-4 补全）

### 附8.8 五种视图渲染策略

```
视图类型          渲染方式                 复杂度      Phase
────────────────────────────────────────────────────────────
Grid (表格视图)   Canvas 标准表模式         ★★★        P1
Kanban (看板)     DOM + react-beautiful-dnd  ★★☆☆      P2
Calendar (日历)   DOM (react-big-calendar)   ★★☆☆      P2
Gantt (甘特图)    Canvas/SVG 独立渲染器      ★★★★      P3
Gallery (画廊)    DOM (CSS Grid + Lazyload) ★☆☆☆       P2
```

```
看板视图数据流:
  SheetModel.rows
    └─▶ groupBy字段 → 分组
        └─▶ 每组 = 一列
            └─▶ 拖拽排序 → create CrdtOperation(type: 'move_record')
                └─▶ 同步回 Grid 视图的 _order 字段

日历视图数据流:
  SheetModel.rows
    └─▶ 日期字段解析 → 事件列表
        └─▶ 月/周/日布局算法 → DOM 渲染
            └─▶ 点击事件 → 打开行详情卡片

甘特图视图数据流:
  SheetModel.rows
    └─▶ 开始日期 + 结束日期 + 进度 → 任务条
        └─▶ 依赖关系(父任务字段) → 连线
            └─▶ Canvas 渲染（独立 GanttEngine）
```

---

## 八-四：开发环境与部署指南（P2-7/8 补全）

### 附8.9 本地开发环境

```yaml
# docker-compose.yml — 一键启动本地基础设施
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: lingyi_doc_dev
      POSTGRES_PASSWORD: lingyi_doc_dev_pwd
      POSTGRES_DB: lingyi_doc_db
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes

  minio:
    image: minio/minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data

  elasticsearch:
    image: elasticsearch:8.10.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    ports:
      - "9200:9200"

volumes:
  pgdata:
  minio_data:
```

```bash
# 环境变量配置模板 (.env.development)
# ─── 数据库 ───
DATABASE_URL=postgresql://lingyi_doc_dev:lingyi_doc_dev_pwd@localhost:5432/lingyi_doc_db
DATABASE_READ_REPLICA_1=postgresql://lingyi_doc_dev:lingyi_doc_dev_pwd@localhost:5432/lingyi_doc_db
DATABASE_READ_REPLICA_2=postgresql://lingyi_doc_dev:lingyi_doc_dev_pwd@localhost:5432/lingyi_doc_db

# ─── Redis ───
REDIS_URL=redis://localhost:6379
REDIS_CLUSTER_MODE=false

# ─── 对象存储 ───
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=sheet-snapshots
MINIO_USE_SSL=false

# ─── Elasticsearch ───
ES_NODE=http://localhost:9200
ES_INDEX_PREFIX=lingyi_doc_dev_

# ─── JWT ───
JWT_SECRET=dev-secret-change-in-production
JWT_ACCESS_TTL=900          # 15 分钟
JWT_REFRESH_TTL=604800      # 7 天

# ─── 服务端口 ───
API_PORT=3000
WS_PORT=3001
RUST_CALC_PORT=8080

# ─── 日志 ───
LOG_LEVEL=debug
LOG_FORMAT=json

# ─── 功能开关 ───
FEATURE_CRDT_ENABLED=true
FEATURE_AUTOMATION_ENABLED=false
FEATURE_SEARCH_ENABLED=true
```

```bash
# 项目初始化脚本 (scripts/setup.sh)
#!/bin/bash
set -e

echo "=== 1. 安装依赖 ==="
pnpm install

echo "=== 2. 启动基础设施 ==="
docker-compose up -d

echo "=== 3. 等待服务就绪 ==="
until pg_isready -h localhost -p 5432 -U lingyi_doc_dev; do sleep 1; done
until redis-cli -h localhost ping; do sleep 1; done
echo "所有服务就绪"

echo "=== 4. 运行数据库迁移 ==="
cd packages/server
pnpm run db:migrate
pnpm run db:seed        # 插入初始数据（管理员账号、示例模板等）

echo "=== 5. 构建共享类型包 ==="
cd ../sheet-core
pnpm run build

echo "=== 6. 启动开发服务器 ==="
echo "前端: cd ../lingyi-doc-web && pnpm run dev"
echo "后端: cd ../server && pnpm run dev"
echo "Rust计算: cd ../calc-engine && cargo run"
```

### 附8.10 CDN 部署策略

```
静态资源部署流程:
1. pnpm run build → 生成 dist/ 目录
2. 文件命名: [name].[contenthash:8].js → 利用 HTTP 缓存
3. 上传到 OSS/CDN: aws s3 sync dist/ s3://sheet-cdn/v{version}/
4. HTML 入口文件中替换资源路径:
   /assets/index.js → https://cdn.example.com/v1.0.0/assets/index.abc123de.js

缓存策略:
- .html:         no-cache (ETag 校验)
- .js / .css:    max-age=31536000, immutable (内容哈希保证唯一性)
- .woff2 / .png: max-age=2592000 (30天)
```

---

## 九、前端详细设计

### 9.1 项目结构与模块划分

```
ai-cloud-document/
├── packages/
│   ├── sheet-core/                  # 核心引擎（框架无关）
│   │   ├── src/
│   │   │   ├── model/               # 数据模型
│   │   │   │   ├── StandardTable.ts     # 标准表模型
│   │   │   │   ├── FreeTable.ts         # 自由表模型
│   │   │   │   ├── ColumnDef.ts         # 列定义（类型系统）
│   │   │   │   ├── CellData.ts          # 单元格数据结构
│   │   │   │   ├── MergeManager.ts      # 合并单元格管理器
│   │   │   │   └── ViewDef.ts           # 视图定义
│   │   │   ├── renderer/            # Canvas 渲染引擎
│   │   │   │   ├── CanvasEngine.ts      # 渲染主引擎
│   │   │   │   ├── StandardMode.ts      # 标准表渲染模式
│   │   │   │   ├── FreeformMode.ts      # 自由表渲染模式
│   │   │   │   ├── ViewportManager.ts   # 虚拟滚动管理
│   │   │   │   ├── DirtyTracker.ts      # 脏区域追踪
│   │   │   │   ├── LayerManager.ts      # 分层管理（7层）
│   │   │   │   ├── CellRenderer.ts      # 单元格渲染器
│   │   │   │   ├── CellRendererPool.ts  # 渲染器对象池
│   │   │   │   ├── TextStyleEngine.ts   # 文本样式引擎
│   │   │   │   └── QuadTree.ts          # 四叉树（自由表点击定位）
│   │   │   ├── formula/             # 公式引擎
│   │   │   │   ├── FormulaEngine.ts     # 公式计算引擎
│   │   │   │   ├── Parser.ts            # 公式解析器（ANTLR 生成）
│   │   │   │   ├── DependencyGraph.ts   # 依赖图（DAG）
│   │   │   │   ├── FunctionRegistry.ts  # 函数注册表
│   │   │   │   └── functions/           # 内置函数库
│   │   │   │       ├── math.ts
│   │   │   │       ├── logical.ts
│   │   │   │       ├── text.ts
│   │   │   │       ├── datetime.ts
│   │   │   │       ├── lookup.ts
│   │   │   │       └── aggregation.ts
│   │   │   ├── collab/              # 协同引擎（客户端）
│   │   │   │   ├── CrdtEngine.ts        # CRDT 客户端引擎
│   │   │   │   ├── OperationLog.ts      # 操作日志
│   │   │   │   ├── HLC.ts               # 混合逻辑时钟
│   │   │   │   ├── LocalMerge.ts        # 本地合并逻辑
│   │   │   │   └── SyncManager.ts       # 同步管理器（WS ↔ IndexedDB）
│   │   │   ├── io/                  # 导入导出
│   │   │   │   ├── XlsxImporter.ts      # xlsx 导入
│   │   │   │   ├── XlsxExporter.ts      # xlsx 导出
│   │   │   │   ├── CsvParser.ts         # CSV 解析
│   │   │   │   └── PdfExporter.ts       # PDF 导出
│   │   │   ├── selection/           # 选区管理
│   │   │   │   ├── SelectionManager.ts
│   │   │   │   └── RangeOps.ts
│   │   │   ├── clipboard/           # 剪贴板
│   │   │   │   └── ClipboardManager.ts
│   │   │   ├── undo/                # 撤销重做
│   │   │   │   └── UndoManager.ts
│   │   │   └── types/               # 核心类型定义
│   │   │       └── index.ts
│   │   └── package.json
│   │
│   ├── sheet-react/                  # React 绑定层
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── SheetContainer.tsx      # 顶层容器
│   │   │   │   ├── SheetCanvas.tsx         # Canvas 挂载
│   │   │   │   ├── Toolbar/                # 工具栏组件
│   │   │   │   │   ├── Toolbar.tsx
│   │   │   │   │   ├── FontControls.tsx
│   │   │   │   │   ├── AlignmentControls.tsx
│   │   │   │   │   ├── NumberFormatPicker.tsx
│   │   │   │   │   └── InsertMenu.tsx
│   │   │   │   ├── SheetTabs.tsx           # Sheet 标签页
│   │   │   │   ├── ColumnHeader.tsx        # 列头
│   │   │   │   ├── RowHeader.tsx           # 行头
│   │   │   │   ├── FormulaBar.tsx          # 公式栏
│   │   │   │   ├── StatusBar.tsx           # 状态栏
│   │   │   │   ├── ContextMenu.tsx         # 右键菜单
│   │   │   │   ├── CellEditor.tsx          # 单元格编辑器（HTML overlay）
│   │   │   │   ├── FilterPanel.tsx         # 筛选面板
│   │   │   │   ├── SortDialog.tsx          # 排序对话框
│   │   │   │   ├── ConditionalFormat.tsx   # 条件格式面板
│   │   │   │   ├── DataValidation.tsx      # 数据验证面板
│   │   │   │   └── Sidebar/                # 侧边栏
│   │   │   │       ├── FieldConfig.tsx     # 字段配置（标准表）
│   │   │   │       ├── ViewSwitcher.tsx    # 视图切换
│   │   │   │       └── AutomationPanel.tsx # 自动化规则
│   │   │   ├── hooks/
│   │   │   │   ├── useSheet.ts             # 主 Hook
│   │   │   │   ├── useSelection.ts         # 选区 Hook
│   │   │   │   ├── useCollaboration.ts     # 协同 Hook
│   │   │   │   ├── useUndo.ts              # 撤销重做 Hook
│   │   │   │   └── useKeyboard.ts          # 快捷键 Hook
│   │   │   ├── store/                      # Zustand 状态管理
│   │   │   │   ├── sheetStore.ts
│   │   │   │   ├── uiStore.ts
│   │   │   │   ├── collabStore.ts
│   │   │   │   └── selectionStore.ts
│   │   │   └── workers/                    # Worker 实例管理
│   │   │       ├── FormulaWorker.ts
│   │   │       ├── RenderWorker.ts
│   │   │       └── ImportWorker.ts
│   │   └── package.json
│   │
│   ├── lingyi-doc-web/                # 桌面端入口
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── main.tsx
│   │   │   └── routes.tsx
│   │   └── package.json
│   │
│   └── sheet-sdk/                    # 第三方嵌入 SDK
│       ├── src/
│       │   ├── index.ts
│       │   └── embed.ts
│       └── package.json
│
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── vite.config.ts
```

### 9.2 核心数据流架构

```
用户操作
  │
  ▼
┌─────────────────────────────────────────────────────────┐
│                    UI Event Layer                        │
│  (keyboard/mouse/clipboard → event normalization)       │
└───────────────┬─────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────┐
│                   Command Layer                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │SetCellCmd│ │MergeCmd  │ │SortCmd   │ │FormatCmd  │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘  │
│       └─────────────┴────────────┴─────────────┘        │
│                        │                                 │
│                        ▼                                 │
│              ┌──────────────────┐                       │
│              │  CommandExecutor  │                       │
│              │  (统一执行入口)    │                       │
│              └────────┬─────────┘                       │
└───────────────────────┼──────────────────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ Data Model  │ │ CRDT Engine │ │ Undo Stack  │
│ (mutation)  │ │ (sync op)   │ │ (push op)   │
└──────┬──────┘ └──────┬──────┘ └─────────────┘
       │               │
       │    ┌──────────┘
       │    │
       ▼    ▼
┌─────────────────────────────────────┐
│         Formula Engine               │
│  ┌───────────────────────────────┐  │
│  │ 1. DependencyGraph.update()   │  │
│  │ 2. topologicalOrder()         │  │
│  │ 3. recalc(dirtyChain)         │  │
│  └───────────────────────────────┘  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│         Render Pipeline              │
│  ┌───────────────────────────────┐  │
│  │ 1. DirtyTracker.markDirty()   │  │
│  │ 2. ViewportManager.check()    │  │
│  │ 3. LayerManager.render()      │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

### 9.3 Canvas 渲染引擎深度设计

#### 架构分层

```
┌──────────────────────────────────────┐
│          LayerManager（层管理器）       │
│  ┌─────────────────────────────────┐ │  Z-Index
│  │ L7: Overlay（浮动元素）           │ │    6
│  │ L6: Cursor（编辑光标）            │ │    5
│  │ L5: Selection（选区高亮）         │ │    4
│  │ L4: Content（文本 / 富文本）      │ │    3
│  │ L3: MergeCells（合并单元格区域）   │ │    2
│  │ L2: Gridlines（网格线）           │ │    1
│  │ L1: Background（背景色/斑马纹）   │ │    0
│  └─────────────────────────────────┘ │
└──────────────────────────────────────┘

层更新策略:
- L1, L2: 视图滚动时整体重绘（极低成本）
- L3: 合并单元格变更时局部重绘
- L4: 单元格内容变更 → DirtyTracker 精确标记
- L5, L6: 选区/光标变化 → 清除上一帧位置 → 绘制新位置
- L7: 独立离屏 Canvas → 合成到主 Canvas
```

#### 渲染流水线时序

```
每帧（requestAnimationFrame）:
1. processInput()          # 处理积累的输入事件（键盘/鼠标/剪贴板）
2. updateModel()           # 应用 Command → 修改数据模型
3. recalcFormula()         # 公式引擎增量重算
4. prepareRender()         # 计算可视区域 → 确定需要绘制的单元格
5. drawLayers()            # 按层序绘制各层
   ├─ drawBackground()     # 背景层
   ├─ drawGridlines()      # 网格线层
   ├─ drawMergeAreas()     # 合并区域层
   ├─ drawContent()        # 内容层（含富文本）
   ├─ drawSelection()      # 选区层
   └─ drawCursor()         # 光标层
6. compositesOverlays()    # 合成浮动层
7. present()               # 提交到屏幕（隐式，由浏览器完成）
```

#### 自由表点击命中检测（四叉树）

```typescript
// 自由表模式下，由于存在合并单元格和不规则行列，
// 不能简单用 row * col 定位，需要四叉树空间索引
class QuadTree {
  private boundary: Rect;
  private cells: CellRect[] = [];
  private divided = false;
  private ne?: QuadTree;  // 东北
  private nw?: QuadTree;  // 西北
  private se?: QuadTree;  // 东南
  private sw?: QuadTree;  // 西南

  insert(cell: CellRect): boolean {
    if (!this.boundary.contains(cell)) return false;

    if (this.cells.length < 16 && !this.divided) {
      this.cells.push(cell);
      return true;
    }

    if (!this.divided) this.subdivide();
    return (this.ne!.insert(cell) || this.nw!.insert(cell) ||
            this.se!.insert(cell) || this.sw!.insert(cell));
  }

  // O(log N) 点击命中
  query(point: Point): CellRect | null {
    if (!this.boundary.contains(point)) return null;
    for (const cell of this.cells) {
      if (cell.contains(point)) return cell;
    }
    if (!this.divided) return null;
    return this.ne!.query(point) || this.nw!.query(point) ||
           this.se!.query(point) || this.sw!.query(point);
  }
}
```

### 9.4 状态管理架构（Zustand 多 Store）

```typescript
// ─── sheetStore.ts ─── 核心数据 store（高频更新，按需拆分）
interface SheetDataState {
  // 文档元数据
  docId: string;
  docType: 'standard' | 'freeform';
  version: number;

  // 当前活动表
  activeSheetId: string;
  sheets: Record<string, SheetModel>;

  // 视口状态
  scrollTop: number;
  scrollLeft: number;
  zoomLevel: number;           // 0.5 ~ 3.0

  // Actions（同步操作，直接修改）
  setCellValue: (sheetId: string, row: number, col: number, value: any) => void;
  insertRow: (sheetId: string, index: number, count?: number) => void;
  deleteRow: (sheetId: string, index: number, count?: number) => void;
  insertColumn: (sheetId: string, index: number, count?: number) => void;
  deleteColumn: (sheetId: string, index: number, count?: number) => void;
  mergeCells: (sheetId: string, range: CellRange) => void;
  unmergeCells: (sheetId: string, range: CellRange) => void;
  applyRemoteOp: (op: CrdtOperation) => void;
  setScrollPosition: (top: number, left: number) => void;
  setZoomLevel: (level: number) => void;
}

// ─── uiStore.ts ─── UI 状态（工具栏、面板、对话框）
interface UIState {
  activeTool: 'select' | 'fill' | 'format' | 'chart';
  toolbarVisible: boolean;
  formulaBarExpanded: boolean;
  sidebarOpen: boolean;
  sidebarTab: 'fields' | 'views' | 'automation';
  contextMenu: { x: number; y: number; items: MenuItem[] } | null;
  dialogs: DialogStack;
  loading: boolean;
  error: string | null;
}

// ─── collabStore.ts ─── 协同状态
interface CollabState {
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'offline';
  onlineUsers: OnlineUser[];     // 在线协作者列表
  remoteCursors: RemoteCursor[];  // 他人光标位置
  pendingOps: CrdtOperation[];    // 待同步操作数
  lastSyncVersion: number;        // 上次同步版本号
}

// ─── selectionStore.ts ─── 选区状态
interface SelectionState {
  primary: CellRange;             // 当前位置/选区
  secondary: CellRange[];         // 多选区（Ctrl+点击）
  editing: boolean;               // 是否在编辑状态
  editText: string;               // 编辑中的文本
  caretPosition: number;          // 光标在编辑文本中的位置
}
```

**Store 订阅优化策略：**

```
高性能场景的关键：避免无关组件因 Store 更新而重新渲染。

Zustand 的 selector 机制天然支持精准订阅：

// ✅ 仅订阅 scrollTop，其余状态变更不触发重新渲染
const scrollTop = useSheetStore(s => s.scrollTop);

// ✅ 通过 shallow 比较避免对象引用变化导致的误渲染
const range = useSelectionStore(
  s => ({ start: s.primary.start, end: s.primary.end }),
  shallow
);

// ─── Canvas 渲染不走 React 渲染循环 ───
// CanvasEngine 通过订阅 Store 的 subscribe API 直接监听变化，
// 完全绕开 React 的 reconciliation 过程：
sheetStore.subscribe(
  state => state.sheets[activeSheetId].cells,  // 只监听单元格数据
  (cells) => {
    // 直接调用 Canvas 重绘，不触发 React re-render
    canvasEngine.dirtyTracker.markDirty(changedRange);
    canvasEngine.scheduleRender();
  },
  { equalityFn: shallow }
);
```

### 9.5 Web Worker 通信架构

```
        主线程                               Worker 线程
┌─────────────────────┐          ┌─────────────────────────────┐
│                     │          │                             │
│  SheetApp           │          │  FormulaWorker              │
│    │                │          │  ┌───────────────────────┐  │
│    ├─ command        │  Comlink │  │ FormulaEngine (实例)   │  │
│    │  (set cell)     │─────────▶│  │ · Parser              │  │
│    │                 │◀─────────│  │ · DependencyGraph     │  │
│    │                 │  result  │  │ · FunctionRegistry    │  │
│    │                 │          │  └───────────────────────┘  │
│    │                 │          │                             │
│    ├─ export/print   │  Comlink │  RenderWorker               │
│    │  (full render)  │─────────▶│  ┌───────────────────────┐  │
│    │                 │◀─────────│  │ OffscreenCanvas        │  │
│    │                 │  blob    │  │ · print layout         │  │
│    │                 │          │  │ · thumbnail gen        │  │
│    │                 │          │  │ · export preview       │  │
│    │                 │          │  └───────────────────────┘  │
│    │                 │          │                             │
│    └─ import         │  Comlink │  ImportWorker               │
│       (xlsx file)    │─────────▶│  ┌───────────────────────┐  │
│                      │◀─────────│  │ SheetJS parse +        │  │
│                      │  parsed  │  │  model mapping          │  │
│                      │          │  └───────────────────────┘  │
└─────────────────────┘          └─────────────────────────────┘

通信协议（基于 Comlink 的 RPC 风格）:
interface FormulaWorkerAPI {
  recalc(model: SheetSnapshot, changedCell: CellRef): Promise<RecalcResult>;
  checkCyclicRef(formula: string, context: CellContext): Promise<boolean>;
  getDependents(cell: CellRef): Promise<CellRef[]>;
}

interface RenderWorkerAPI {
  renderToImage(sheet: SheetSnapshot, range: CellRange): Promise<ImageBitmap>;
  renderPrintLayout(sheet: SheetSnapshot): Promise<PrintPage[]>;
  generateThumbnail(sheet: SheetSnapshot, size: Size): Promise<Blob>;
}
```

### 9.6 离线编辑与 IndexedDB

```typescript
// 离线操作队列 Schema
// IndexedDB: "offline_ops" object store
interface OfflineOpRecord {
  id: string;                    // 自增主键
  docId: string;                 // 文档 ID
  operation: CrdtOperation;      // CRDT 操作体
  localTimestamp: number;        // 本地时间戳
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  retryCount: number;
}

// 离线数据缓存
// IndexedDB: "doc_snapshots" object store
interface DocSnapshot {
  docId: string;                 // 主键
  version: number;
  data: SheetSnapshot;           // 上次在线时的完整快照
  cachedAt: number;              // 缓存时间
}

// ─── 离线编辑生命周期 ───
class OfflineManager {
  private db: IDBDatabase;
  private syncManager: SyncManager;

  // 在线 → 离线切换
  async onDisconnect() {
    // 1. 保存当前快照到 IndexedDB
    await this.cacheSnapshot(this.sheetStore.getSnapshot());
    // 2. 切换到慢速轮询模式（30s 间隔检测网络）
    this.startSlowPoll();
    // 3. 通知 UI 显示离线标识
    this.collabStore.setStatus('offline');
  }

  // 离线期间操作
  async onLocalOp(op: CrdtOperation) {
    // 1. 存入 IndexedDB 离线队列
    await this.enqueueOp(op);
    // 2. CRDT 本地合并（立即更新 UI）
    this.crdtEngine.applyLocal(op);
    // 3. 公式增量重算
    this.formulaEngine.recalc(op.target);
  }

  // 离线 → 在线切换
  async onReconnect() {
    this.collabStore.setStatus('connecting');
    // 1. 拉取服务端最新版本
    const remoteSnapshot = await this.syncManager.pullLatest();
    // 2. 获取离线期间积压操作
    const offlineOps = await this.dequeueAll();
    // 3. CRDT 三方合并：本地快照 + 离线操作 + 远端操作
    const merged = this.crdtEngine.threeWayMerge(
      this.cachedSnapshot, offlineOps, remoteSnapshot
    );
    // 4. 推送离线操作到服务端
    await this.syncManager.pushOperations(offlineOps);
    // 5. 应用合并结果 + 清除离线队列
    this.sheetStore.applySnapshot(merged);
    await this.clearQueue();
    this.collabStore.setStatus('connected');
  }
}
```

### 9.7 快捷键系统

```typescript
// 快捷键注册（分上下文）
const KEYBOARD_SHORTCUTS = {
  // ─── 导航 ───
  'ArrowUp':       { action: 'navigate', direction: 'up' },
  'ArrowDown':     { action: 'navigate', direction: 'down' },
  'ArrowLeft':     { action: 'navigate', direction: 'left' },
  'ArrowRight':    { action: 'navigate', direction: 'right' },
  'Tab':           { action: 'navigate', direction: 'right' },
  'Shift+Tab':     { action: 'navigate', direction: 'left' },
  'Ctrl+Home':     { action: 'navigate', target: 'A1' },
  'Ctrl+End':      { action: 'navigate', target: 'lastCell' },

  // ─── 编辑 ───
  'F2':            { action: 'edit', mode: 'cell' },
  'Enter':         { action: 'edit', mode: 'cell', commit: true },
  'Escape':        { action: 'cancelEdit' },
  'Delete':        { action: 'clearContents' },
  'Ctrl+Z':        { action: 'undo' },
  'Ctrl+Y':        { action: 'redo' },
  'Ctrl+X':        { action: 'cut' },
  'Ctrl+C':        { action: 'copy' },
  'Ctrl+V':        { action: 'paste' },

  // ─── 选区 ───
  'Shift+ArrowUp':   { action: 'extendSelection', direction: 'up' },
  'Shift+ArrowDown': { action: 'extendSelection', direction: 'down' },
  'Ctrl+A':          { action: 'selectAll' },
  'Ctrl+Space':      { action: 'selectColumn' },
  'Shift+Space':     { action: 'selectRow' },

  // ─── 格式化 ───
  'Ctrl+B':        { action: 'format', style: 'bold' },
  'Ctrl+I':        { action: 'format', style: 'italic' },
  'Ctrl+U':        { action: 'format', style: 'underline' },

  // ─── 插入/删除 ───
  'Ctrl+Shift+=':  { action: 'insert', target: 'dialog' },
  'Ctrl+-':        { action: 'delete', target: 'dialog' },
};
```

### 9.8 构建优化策略

```typescript
// vite.config.ts 关键配置
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // 手动分包，利用浏览器缓存
        manualChunks: {
          'react-vendor':   ['react', 'react-dom', 'react-router-dom'],
          'sheetjs':        ['xlsx'],
          'canvas-utils':   ['comlink'],
          'crdt-core':      ['yjs'],          // CRDT 参考库
          'sheet-core':     ['./packages/lingyi-doc-core/src/index.ts'],
        },
      },
    },
    target: 'es2020',  // 现代浏览器，减小 polyfill 体积
    minify: 'esbuild', // 比 terser 快 20-100x
  },
  // 公式引擎 WASM 预编译
  plugins: [
    wasm(),
    // 开发环境：公式函数按需加载
    {
      name: 'formula-lazy-import',
      transform(code, id) {
        if (id.includes('functions/')) {
          // 将函数注册为动态 import
          return code.replace(
            /export function (\w+)/g,
            'export function $1'
          );
        }
      },
    },
  ],
});
```

---

### 9.9 Canvas 交互细节补全（P2-1/2/3 补全）

#### 列头/行头渲染方案

```
列头与行头采用 DOM + Canvas 混合方案:

┌────────────────────────────────────────────────┐
│ 左上角选择按钮 (DOM) │  列头 (DOM, sticky)        │
│    全选按钮          │  A | B | C | D | ...      │
├──────────────────────┼───────────────────────────┤
│                      │                           │
│  行头 (DOM, sticky)  │  Canvas 单元格渲染区域     │
│  1                   │                           │
│  2                   │  (主 Canvas, 带虚拟滚动)   │
│  3                   │                           │
│  4                   │                           │
│  ...                 │                           │
└──────────────────────┴───────────────────────────┘

选择理由:
- 列头/行头: DOM 实现，因为数量极少(列头 ≤ 16384, 行头: 可见范围≤50)
  DOM 的 sticky 定位天然支持冻结行列，且有原生 tooltip/resize 交互
- 滚动同步: 主 Canvas scroll 事件 → 同步更新行列头 DOM 的 transform
- 性能: DOM 行列头渲染代价可忽略不计
```

#### CellEditor 坐标同步方案

```typescript
// CellEditor 是一个绝对定位的 HTML div，精确覆盖在 Canvas 单元格上方
class CellEditorSync {
  private editorEl: HTMLDivElement;
  private canvasEl: HTMLCanvasElement;
  private viewport: ViewportManager;

  // 编辑开始 — 将 HTML editor 精确覆盖到目标单元格
  activate(coord: CellCoord): void {
    // 1. 计算单元格在 Canvas 上的像素坐标
    const rect = this.viewport.getCellRect(coord);

    // 2. 转换为相对于容器元素的位置
    const canvasRect = this.canvasEl.getBoundingClientRect();
    const containerRect = this.containerEl.getBoundingClientRect();

    const offsetX = canvasRect.left - containerRect.left + rect.x;
    const offsetY = canvasRect.top - containerRect.top + rect.y;

    // 3. 考虑缩放级别
    const zoom = this.viewport.zoomLevel;
    const finalX = offsetX * zoom;
    const finalY = offsetY * zoom;
    const finalW = rect.width * zoom;
    const finalH = rect.height * zoom;

    // 4. 设置 editor 位置和样式
    this.editorEl.style.cssText = `
      position: absolute;
      left: ${finalX}px;
      top: ${finalY}px;
      width: ${finalW}px;
      min-height: ${finalH}px;
      z-index: 100;
      font-size: ${14 * zoom}px;
      padding: 2px 4px;
      border: 2px solid #1a73e8;
      outline: none;
      background: white;
      overflow: hidden;
    `;

    this.editorEl.focus();
  }

  // 滚动/缩放时同步更新位置
  onViewportChange(): void {
    if (!this.isActive) return;
    const newRect = this.viewport.getCellRect(this.currentCoord);
    // 增量更新 left/top，避免重新设置全部样式
    this.editorEl.style.left = `${newRect.x}px`;
    this.editorEl.style.top = `${newRect.y}px`;
  }

  // 编辑完成 → 隐藏 editor → 提交值到 Command
  commit(): void {
    const value = this.editorEl.innerText;
    this.hide();
    this.onCommit(value);
  }
}
```

#### 剪贴板数据格式

```typescript
// 剪贴板支持三种格式，按优先级写入/读取
interface ClipboardFormats {
  // 格式1: 系统内部格式（最高保真度，仅系统内互通）
  'application/x-sheet-internal': {
    sourceDocId: string;
    sourceSheetId: string;
    cells: Map<string, CellData>;    // 包含公式、样式、合并信息
    range: CellRange;
  };

  // 格式2: Tab 分隔文本（与 Excel/Google Sheets 互通）
  'text/plain': string;             // 列用 \t 分隔，行用 \n 分隔

  // 格式3: HTML 表格（富文本粘贴保留格式）
  'text/html': string;              // <table><tr><td>...</table>
}

class ClipboardManager {
  // 写入剪贴板
  async copy(range: CellRange, model: SheetModel): Promise<void> {
    const internalData = this.serializeInternal(range, model);
    const plainText = this.serializePlainText(range, model);
    const html = this.serializeHTML(range, model);

    await navigator.clipboard.write([
      new ClipboardItem({
        'application/x-sheet-internal': new Blob([JSON.stringify(internalData)], { type: 'application/x-sheet-internal' }),
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      }),
    ]);
  }

  // 读取剪贴板 → 优先使用内部格式，回退到 plain text
  async paste(target: CellCoord, model: SheetModel): Promise<void> {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      if (item.types.includes('application/x-sheet-internal')) {
        return this.pasteInternal(item, target, model);
      }
      if (item.types.includes('text/plain')) {
        return this.pastePlainText(item, target, model);
      }
    }
  }
}
```

#### 富文本单元格的 CRDT 冲突（P2-4 补充说明）

```
富文本单元格协同策略:

问题: 两个用户同时编辑同一个单元格的不同文字位置
  - 用户A: 在"Hello World"的"H"后插入"Beautiful " → "Hello Beautiful World"
  - 用户B: 在"Hello World"的"W"前插入"Amazing "   → "Hello Amazing World"

方案: 单元格内容采用 CRDT 字符级操作（Yjs/Y.Text），而非直接覆盖
  - 每个富文本单元格维护一个独立的 Y.Text 实例
  - 插入/删除操作携带位置偏移量和内容
  - 合并结果: "Hello Beautiful Amazing World" 或 "Hello Amazing Beautiful World"
    （取决于操作先后，但数据不丢失）

实现:
  import * as Y from 'yjs';

  class RichTextCell {
    private ydoc: Y.Doc;
    private ytext: Y.Text;

    insertText(index: number, text: string, attributes?: any): CrdtOperation {
      this.ytext.insert(index, text, attributes);
      return this.toCrdtOp('insert_text', { index, text });
    }

    deleteText(index: number, length: number): CrdtOperation {
      this.ytext.delete(index, length);
      return this.toCrdtOp('delete_text', { index, length });
    }

    getFormattedText(): string {
      return this.ytext.toString();
    }
  }

  注意: 纯文本单元格（非富文本）仍使用 LWW-Register，避免 overhead
```

---

## 十、后端详细设计

### 10.1 服务架构

```
                         ┌──────────────┐
                         │    CDN       │
                         │ (静态资源)    │
                         └──────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                     API Gateway（Kong / Nginx）               │
│  · 路由转发    · 限流（令牌桶 1000rps/用户）                  │
│  · JWT 验证    · CORS         · 请求日志                     │
│  · WebSocket Upgrade（Connection: Upgrade）                  │
└──────────┬────────────────────────────────────┬─────────────┘
           │                                    │
    HTTP/2 REST                           WebSocket
           │                                    │
           ▼                                    ▼
┌─────────────────────┐             ┌─────────────────────────┐
│   REST API 服务      │             │  WebSocket 协同服务       │
│   (Node.js Cluster)  │             │  (Node.js Cluster)       │
│                     │             │                         │
│  ┌───────────────┐  │             │  ┌────────────────────┐  │
│  │ 文档 CRUD      │  │             │  │ ConnectionManager   │  │
│  │ · 创建/删除    │  │             │  │ · 连接池管理         │  │
│  │ · 权限管理     │  │             │  │ · 心跳保活 (30s)    │  │
│  │ · 模板         │  │             │  │ · 断线检测           │  │
│  └───────────────┘  │             │  └────────────────────┘  │
│  ┌───────────────┐  │             │  ┌────────────────────┐  │
│  │ 用户/团队      │  │             │  │ CRDT Service        │  │
│  │ · 认证/授权    │  │             │  │ · 操作广播           │  │
│  │ · RBAC        │  │             │  │ · 冲突仲裁           │  │
│  └───────────────┘  │             │  │ · 操作日志持久化     │  │
│  ┌───────────────┐  │             │  └────────────────────┘  │
│  │ 导入导出       │  │             │  ┌────────────────────┐  │
│  │ · xlsx 解析    │  │             │  │ OT Bridge           │  │
│  │ · 异步队列     │  │             │  │ · 复杂操作冲突处理    │  │
│  └───────────────┘  │             │  └────────────────────┘  │
└─────────────────────┘             └─────────────────────────┘
           │                                    │
           ▼                                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    消息队列（Redis Streams）                   │
│  · 协同操作异步分发    · 导入导出任务                          │
│  · 通知推送           · 自动化触发                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   计算服务（Rust + Actix-web）                 │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ 公式计算引擎      │  │ 聚合查询引擎      │                 │
│  │ · 大规模重算      │  │ · 数据透视        │                 │
│  │ · 跨表引用        │  │ · 分组聚合        │                 │
│  │ · 循环依赖检测    │  │ · 多维分析        │                 │
│  └──────────────────┘  └──────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 REST API 设计

```typescript
// ─── 基础路径: /api/v1 ───

// ===== 文档管理 =====
POST   /docs                                    # 创建文档
GET    /docs/:docId                             # 获取文档元数据
PATCH  /docs/:docId                             # 更新文档属性（名称/描述）
DELETE /docs/:docId                             # 删除文档（软删除 → 回收站）
GET    /docs/:docId/versions                    # 获取版本历史列表
GET    /docs/:docId/versions/:version           # 获取指定版本的完整快照
POST   /docs/:docId/versions/:version/restore   # 恢复到指定版本

// ===== 文档内容 =====
GET    /docs/:docId/sheets                      # 获取所有 Sheet 列表
GET    /docs/:docId/sheets/:sheetId/data        # 获取 Sheet 完整数据
GET    /docs/:docId/sheets/:sheetId/rows        # 分页获取行数据
  ?offset=0&limit=100&view=view_1               #   支持视图过滤
POST   /docs/:docId/sheets/:sheetId/rows/query  # 高级查询（筛选/排序/聚合）
POST   /docs/:docId/sheets/:sheetId/calculate   # 触发服务端公式重算

// ===== 导入导出 =====
POST   /docs/import/xlsx                        # 上传 xlsx 创建文档
  Content-Type: multipart/form-data
POST   /docs/:docId/export/xlsx                 # 导出为 xlsx
POST   /docs/:docId/export/pdf                  # 导出为 PDF
GET    /docs/:docId/exports/:taskId             # 查询导出任务状态

// ===== 权限管理 =====
GET    /docs/:docId/permissions                 # 获取权限列表
POST   /docs/:docId/permissions                 # 添加权限
DELETE /docs/:docId/permissions/:permId         # 撤销权限

// ===== 用户/团队 =====
GET    /users/me                                # 当前用户信息
GET    /teams/:teamId/members                   # 团队成员列表
GET    /teams/:teamId/docs                      # 团队文档列表

// ===== 搜索 =====
GET    /search/docs?q=keyword&type=all          # 全站搜索
POST   /docs/:docId/search                      # 单文档内搜索
  Body: { "query": "...", "sheetId": "..." }

// ===== 自动化规则 =====
GET    /docs/:docId/automations                 # 获取自动化规则列表
POST   /docs/:docId/automations                 # 创建自动化规则
PATCH  /docs/:docId/automations/:autoId         # 更新规则
DELETE /docs/:docId/automations/:autoId         # 删除规则

// ===== 模板 =====
GET    /templates                               # 模板市场列表
POST   /docs/from-template/:templateId          # 从模板创建文档
```

**API 响应格式规范：**

```typescript
// 成功响应
{
  "code": 0,
  "data": { ... },
  "requestId": "req_abc123"
}

// 分页响应
{
  "code": 0,
  "data": {
    "items": [...],
    "total": 1523,
    "offset": 0,
    "limit": 100,
    "hasMore": true
  },
  "requestId": "req_abc123"
}

// 错误响应
{
  "code": 40001,           // 业务错误码
  "message": "文档不存在或已被删除",
  "details": {
    "docId": "doc_abc",
    "reason": "not_found"
  },
  "requestId": "req_abc123"
}
```

### 10.3 WebSocket 协同服务设计

#### 连接生命周期

```
客户端                              服务端
  │                                   │
  │──── WS Connect ──────────────────▶│
  │     Header: jwt_token              │
  │     Query: docId=xxx               │
  │                                   │ 1. JWT 验证
  │                                   │ 2. 权限检查（是否有文档读权限）
  │                                   │ 3. 加入文档房间（Room）
  │                                   │ 4. 获取当前版本号
  │◀──── WS Ack ─────────────────────│
  │     { type: "connected",          │
  │       docVersion: 42,             │
  │       onlineUsers: [...] }        │
  │                                   │
  │──── heartbeat ───────────────────▶│ 每 30 秒
  │◀──── heartbeat_ack ──────────────│
  │                                   │
  │──── cursor_move ─────────────────▶│ 实时广播给同房间其他人
  │     { row: 10, col: 3 }           │
  │                                   │
  │──── crdt_op ─────────────────────▶│ CRDT 操作
  │     { opId, type, target, ... }   │
  │                                   │ 1. 持久化到 oplog
  │                                   │ 2. 广播给同房间（除发送者）
  │                                   │ 3. 写入 Redis 操作流
  │                                   │
  │◀──── crdt_op (remote) ───────────│ 收到他人操作
  │                                   │
  │──── WS Disconnect ───────────────▶│
  │                                   │ 1. 清理房间成员
  │                                   │ 2. 广播用户离开
  │◀──── WS Close ───────────────────│
```

#### WebSocket 消息协议

```typescript
// 客户端 → 服务端
type ClientMessage =
  | { type: 'auth'; token: string; docId: string }
  | { type: 'heartbeat'; ts: number }
  | { type: 'crdt_op'; operation: CrdtOperation }
  | { type: 'cursor_move'; sheetId: string; row: number; col: number }
  | { type: 'sync_request'; fromVersion: number }
  | { type: 'selection_change'; sheetId: string; range: CellRange }

// 服务端 → 客户端
type ServerMessage =
  | { type: 'connected'; docVersion: number; onlineUsers: OnlineUser[] }
  | { type: 'heartbeat_ack'; serverTime: number }
  | { type: 'crdt_op'; operation: CrdtOperation; senderId: string }
  | { type: 'user_joined'; user: OnlineUser }
  | { type: 'user_left'; userId: string }
  | { type: 'cursor_update'; userId: string; sheetId: string; row: number; col: number }
  | { type: 'selection_update'; userId: string; sheetId: string; range: CellRange }
  | { type: 'sync_response'; operations: CrdtOperation[]; currentVersion: number }
  | { type: 'conflict_resolved'; cellRef: CellRef; finalValue: any }
  | { type: 'error'; code: number; message: string }
```

#### 协同房间管理

```typescript
// 服务端 Room 管理
class RoomManager {
  // docId → Room
  private rooms: Map<string, Room> = new Map();

  join(docId: string, client: WebSocket, userId: string) {
    let room = this.rooms.get(docId);
    if (!room) {
      room = new Room(docId);
      this.rooms.set(docId, room);
    }
    room.addClient(client, userId);

    // 广播用户加入
    this.broadcast(docId, {
      type: 'user_joined',
      user: { userId, ... }
    }, userId); // 排除自己
  }

  // 广播 CRDT 操作
  broadcastOp(docId: string, op: CrdtOperation, senderId: string) {
    const room = this.rooms.get(docId);
    if (!room) return;

    for (const [clientId, client] of room.clients) {
      if (client.userId !== senderId) {
        client.send({
          type: 'crdt_op',
          operation: op,
          senderId
        });
      }
    }
  }
}
```

### 10.4 CRDT 服务端设计

```typescript
// CRDT 服务端核心逻辑
class CrdtService {
  // ─── 操作接收与处理 ───
  async handleOperation(docId: string, op: CrdtOperation, userId: string) {
    // 1. 分配全局版本号（PostgreSQL 自增序列 → 全局递增，保证全序）
    const globalVersion = await this.versionSeq.nextVal();

    // 2. 持久化操作日志（不可变追加）
    await this.oplogRepo.insert({
      docId,
      globalVersion,
      opId: op.opId,
      userId,
      operation: op,
      serverTimestamp: Date.now(),
    });

    // 3. 写入 Redis Stream（用于通知异步消费者）
    await this.redis.xadd(`doc:${docId}:oplog`, '*',
      'version', String(globalVersion),
      'op', JSON.stringify(op),
      'userId', userId,
    );

    // 4. 广播给同房间其他客户端
    this.roomManager.broadcastOp(docId, op, userId);

    // 5. 异步更新最新文档缓存
    this.scheduleCacheUpdate(docId);

    return { globalVersion };
  }

  // ─── 增量同步 ───
  async getOperationsSince(docId: string, fromVersion: number): Promise<CrdtOperation[]> {
    // 从数据库拉取 fromVersion 之后的所有操作
    const ops = await this.oplogRepo.findSince(docId, fromVersion);
    return ops.map(r => r.operation);
  }

  // ─── 冲突仲裁（OT 桥接） ───
  async resolveConflict(
    docId: string,
    opA: CrdtOperation,
    opB: CrdtOperation
  ): Promise<CrdtOperation> {
    // 1. CRDT 层：LWW 自动解决（取时间戳大的）
    // 2. 如果 CRDT 无法解决（如合并单元格冲突），进入 OT 层

    if (opA.type === 'merge_cells' && opB.target.isWithin(opA.target)) {
      // 合并单元格冲突：合并优先 → 拆分后写入
      return this.otBridge.resolveMergeConflict(opA, opB);
    }

    if (opA.type === 'set' && opB.type === 'set' && opA.target === opB.target) {
      // 同单元格写入冲突：LWW
      return opA.clock > opB.clock ? opA : opB;
    }

    // 不能自动解决的 → 标记冲突区域
    await this.markConflict(docId, opA.target);
    return opA; // 暂时保留先到达的操作
  }

  // ─── 文档重建（从 oplog 重放） ───
  async rebuildDocument(docId: string, targetVersion?: number): Promise<SheetSnapshot> {
    const baseSnapshot = await this.snapshotRepo.findLatestBase(docId, targetVersion);
    const ops = await this.oplogRepo.findSince(docId, baseSnapshot.version, targetVersion);

    const model = new SheetModel(baseSnapshot);
    for (const op of ops) {
      model.applyOp(op.operation);
    }
    return model.toSnapshot();
  }
}
```

### 10.5 计算服务（Rust 实现）

```rust
// 为什么用 Rust？
// - 公式重算属于 CPU 密集型计算，Node.js 的单线程会成为瓶颈
// - Rust 零成本抽象 + 内存安全，适合长时运行的计算任务
// - 通过 WASM 可以同时用于客户端 Worker 和服务端

// src/main.rs — 计算服务入口
#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| {
        App::new()
            .app_data(web::Data::new(CalcEngine::new()))
            .route("/api/v1/calc/recalc", web::post().to(recalc_handler))
            .route("/api/v1/calc/validate", web::post().to(validate_handler))
            .route("/api/v1/calc/pivot", web::post().to(pivot_handler))
            .route("/health", web::get().to(health_handler))
    })
    .workers(num_cpus::get())  // 充分利用多核
    .bind("0.0.0.0:8080")?
    .run()
    .await
}

// src/engine.rs — 公式引擎
pub struct CalcEngine {
    fn_registry: FunctionRegistry,
    dep_graph: DependencyGraph,
}

impl CalcEngine {
    // 增量重算：只重算受影响的单元格
    pub fn recalc(&mut self, sheet: &mut Sheet, changed: &[CellRef]) -> RecalcResult {
        // 1. 构建脏链（拓扑排序）
        let dirty_chain = self.dep_graph.topological_order(changed, sheet);

        // 2. 按依赖顺序依次重算
        let mut affected = Vec::new();
        for cell_ref in &dirty_chain {
            if let Some(formula) = sheet.get_formula(cell_ref) {
                let result = self.evaluate(formula, sheet);
                sheet.set_value(cell_ref, result);
                affected.push(cell_ref.clone());
            }
        }

        RecalcResult {
            affected_cells: affected,
            elapsed_ms: 0, // 实际计算时间
        }
    }

    // 公式求值（递归下降解析 + 惰性计算）
    fn evaluate(&self, expr: &str, sheet: &Sheet) -> CalcValue {
        let ast = self.parse(expr);
        self.eval_node(&ast, sheet)
    }
}
```

### 10.5-附：Rust 计算服务通信协议（P0-5 补全）

```protobuf
// calc.proto — Node.js API 服务与 Rust 计算服务之间的通信协议

syntax = "proto3";

package sheet.calc;

service CalcService {
  // 增量重算
  rpc Recalc(RecalcRequest) returns (RecalcResponse);

  // 公式验证（检查语法+循环引用+类型）
  rpc Validate(ValidateRequest) returns (ValidateResponse);

  // 批量求值（数据透视/聚合等）
  rpc BatchEval(BatchEvalRequest) returns (BatchEvalResponse);

  // 健康检查
  rpc Health(HealthRequest) returns (HealthResponse);
}

message RecalcRequest {
  string doc_id = 1;
  int32 version = 2;

  // 完整的 Sheet 数据（序列化为 JSON → 服务端反序列化为 Rust Sheet）
  // 选择 JSON 而非 Protobuf 的理由：
  //   1. 表格数据高度动态（列数/类型/公式不确定），PB schema 难以预先定义
  //   2. JSON 在 Node.js ↔ Rust 之间序列化的开发成本最低
  //   3. 计算服务的瓶颈是 CPU 运算而非序列化
  string sheet_json = 3;

  // 变更的单元格列表
  repeated CellRef changed_cells = 4;

  // 重算模式
  RecalcMode mode = 5;
}

message CellRef {
  string sheet_id = 1;
  int32 row = 2;
  int32 col = 3;
}

enum RecalcMode {
  RECALC_INCREMENTAL = 0;  // 增量（默认）
  RECALC_FULL = 1;         // 全量
}

message RecalcResponse {
  repeated CellUpdate results = 1;
  repeated FormulaError errors = 2;
  double elapsed_ms = 3;
}

message CellUpdate {
  CellRef target = 1;
  CalcValue value = 2;
  CalcValue display_value = 3;
}

message CalcValue {
  oneof value {
    double number_val = 1;
    string string_val = 2;
    bool bool_val = 3;
    int64 timestamp_val = 4;        // 日期（unix ms）
    CalcError error_val = 5;
  }
}

enum CalcError {
  ERROR_NONE = 0;
  ERROR_REF = 1;       // #REF!
  ERROR_VALUE = 2;     // #VALUE!
  ERROR_DIV_ZERO = 3;  // #DIV/0!
  ERROR_NA = 4;        // #N/A
  ERROR_NAME = 5;      // #NAME?
  ERROR_NUM = 6;       // #NUM!
  ERROR_NULL = 7;      // #NULL!
  ERROR_CYCLE = 8;     // #CYCLE!
}

message FormulaError {
  CellRef target = 1;
  CalcError error = 2;
  string message = 3;
}

// ... 其他 RPC 定义省略
```

**部署方式：**

```
┌──────────────┐    gRPC (Protobuf)    ┌──────────────────┐
│ Node.js API  │◀────────────────────▶│ Rust Calc Engine │
│ 服务          │    localhost:50051    │ (sidecar 部署)   │
└──────────────┘                       └──────────────────┘

为什么 sidecar 而不是独立服务？
- 低延迟：localhost 通信避免网络开销
- 简化运维：随 Node.js Pod 一起扩缩容，不需要独立的负载均衡
- 故障隔离：Rust 进程崩溃不影响 Node.js 主进程

WASM 路线（备用方案）：
  当不需要 50万+ 行规模时，可将 Rust 编译为 WASM 模块
  → 在 Node.js 中通过 wasm-pack 加载
  → 省去 gRPC 开销，延迟更低（<1ms）
  → 适用于中小规模部署
```

### 10.5-二：WebSocket Sticky Session 策略（P0-6 补全）

```
多实例部署的协同房间同步方案:

┌─────────────────────────────────────────────────────────────┐
│                      Nginx / Kong                           │
│  Sticky Session: 基于 docId 的一致性哈希路由                   │
│  · upstream hash $arg_docId consistent;                     │
│  · 同一 docId 的所有连接固定路由到同一 WS 实例                  │
├─────────────────────────────────────────────────────────────┤
│              │                  │                  │         │
│     ┌────────▼──────┐  ┌───────▼──────┐  ┌───────▼──────┐  │
│     │ WS Instance 1 │  │ WS Instance 2│  │ WS Instance 3│  │
│     │ Room: doc_a   │  │ Room: doc_b  │  │ Room: doc_c  │  │
│     │ Room: doc_d   │  │ Room: doc_e  │  │ Room: doc_f  │  │
│     └───────┬───────┘  └───────┬──────┘  └───────┬──────┘  │
│             │                  │                  │         │
│             └──────────────────┼──────────────────┘         │
│                                │                            │
│                    ┌───────────▼────────────┐               │
│                    │   Redis Pub/Sub          │               │
│                    │   跨实例广播兜底          │               │
│                    │   · 只用于 failover 场景  │               │
│                    │   · 正常情况下不使用       │               │
│                    └────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘

故障转移:
1. WS Instance 1 宕机
2. 客户端重连 → Nginx 重新 hash → 路由到 WS Instance 2
3. WS Instance 2 从 PG 读取 crdt_oplog 增量同步
4. WS Instance 2 通过 Redis Pub/Sub 发布 failover 通知
5. 原 WS Instance 1 上的协作者感知到房间迁移（轻微抖动）

一致性保证:
- 主路由: Nginx hash sticky（99.9% 场景）
- 兜底路由: Redis Pub/Sub（仅 failover 时）
- 不需要分布式锁 → 避免性能瓶颈
```

### 10.6 认证与授权

```typescript
// ─── JWT 签发与验证 ───
interface JwtPayload {
  sub: string;           // 用户 ID
  teamId?: string;       // 当前团队 ID
  roles: string[];       // 角色列表
  iat: number;           // 签发时间
  exp: number;           // 过期时间
}

// Access Token: 15 分钟有效期
// Refresh Token: 7 天有效期，存 Redis

// ─── RBAC 权限模型 ───
enum Permission {
  // 文档级
  DOC_READ     = 'doc:read',       // 查看
  DOC_EDIT     = 'doc:edit',       // 编辑
  DOC_COMMENT  = 'doc:comment',    // 评论
  DOC_MANAGE   = 'doc:manage',     // 管理（修改权限/删除）
  DOC_EXPORT   = 'doc:export',     // 导出
  DOC_COPY     = 'doc:copy',       // 复制

  // Sheet 级（可选细粒度控制）
  SHEET_READ   = 'sheet:read',     // 查看某个 Sheet
  SHEET_EDIT   = 'sheet:edit',     // 编辑某个 Sheet
}

enum Role {
  OWNER    = 'owner',       // 创建者（全部权限）
  EDITOR   = 'editor',      // 编辑者（读写 + 导出）
  VIEWER   = 'viewer',      // 查看者（只读 + 评论）
  GUEST    = 'guest',       // 访客（只读，不能评论）
}

// 权限中间件
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ code: 40101, message: '未登录' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ code: 40102, message: 'Token 已过期' });
  }
}

async function docPermissionMiddleware(req, res, next) {
  const { docId } = req.params;
  const userId = req.user.sub;

  // 1. 先查 Redis 缓存
  let role = await redis.get(`perm:${docId}:${userId}`);
  if (!role) {
    // 2. 缓存未命中，查数据库
    role = await db.getUserRole(docId, userId);
    if (role) {
      await redis.setex(`perm:${docId}:${userId}`, 300, role); // 5分钟缓存
    }
  }

  if (!role) return res.status(403).json({ code: 40301, message: '无权访问' });

  req.userRole = role;
  next();
}
```

### 10.7 限流与防护

```typescript
// 多级限流策略
// L1: Nginx 层 — IP 级别（100 rps/IP）
// L2: API Gateway — 用户级别（令牌桶算法）
// L3: 应用层 — 接口级别（按操作类型）

// ─── 用户级限流（Redis 滑动窗口） ───
async function userRateLimiter(userId: string, limit: number, windowSec: number) {
  const key = `ratelimit:${userId}`;
  const now = Date.now();
  const windowStart = now - windowSec * 1000;

  // 使用 Redis Sorted Set 实现滑动窗口
  await redis.zremrangebyscore(key, 0, windowStart);     // 清理过期记录
  const count = await redis.zcard(key);                   // 当前窗口计数值

  if (count >= limit) {
    return { allowed: false, retryAfter: windowSec };
  }

  await redis.zadd(key, now, `${now}-${Math.random()}`);  // 添加本次请求
  await redis.expire(key, windowSec * 2);                  // 过期时间
  return { allowed: true };
}

// 分级限制:
// 普通用户: 100 请求/秒
// 付费用户: 500 请求/秒
// 企业版:  1000 请求/秒

// ─── 操作级限流 ───
const OP_RATE_LIMITS = {
  'import':   { limit: 10,  window: 3600 },  // 导入: 10次/小时
  'export':   { limit: 30,  window: 3600 },  // 导出: 30次/小时
  'calculate':{ limit: 100, window: 60 },    // 服务端计算: 100次/分钟
};
```

### 10.8 登录/注册 API 与 API Body Schema 补全（P1-5/6 补全）

```typescript
// ==========================================
// 登录/注册 API
// ==========================================

POST   /api/v1/auth/register                # 注册
  Body: {
    email: string;       // 邮箱
    password: string;    // 密码（前端已 SHA256 + 盐值后发送）
    displayName: string; // 显示名称
  }
  Response: {
    user: { id, email, displayName, avatarUrl };
    accessToken: string;
    refreshToken: string;
  }

POST   /api/v1/auth/login                   # 登录
  Body: {
    email: string;
    password: string;
  }
  Response: {
    user: { id, email, displayName, avatarUrl };
    accessToken: string;
    refreshToken: string;
  }

POST   /api/v1/auth/refresh                 # 刷新 Token
  Body: { refreshToken: string; }
  Response: { accessToken: string; refreshToken: string; }

POST   /api/v1/auth/logout                  # 登出
  Header: Authorization: Bearer <accessToken>
  Response: { success: true; }

POST   /api/v1/auth/forgot-password         # 忘记密码
  Body: { email: string; }
  Response: { message: "重置链接已发送"; }

POST   /api/v1/auth/reset-password          # 重置密码
  Body: { token: string; newPassword: string; }
  Response: { success: true; }

// 密码加密: bcrypt (cost=12)，前端传输时加 SHA256


// ==========================================
// API Body Schema 补全
// ==========================================

// POST /docs — 创建文档
interface CreateDocRequest {
  title: string;
  docType: 'standard' | 'freeform';  // 默认 'standard'
  teamId?: string;                     // 所属团队（可选）
  templateId?: string;                 // 从模板创建（可选）
  initialSheets?: {                    // 初始 Sheet 定义
    name: string;
    columns?: ColumnDef[];             // 标准表初始列
  }[];
}

// POST /docs/import/xlsx — 导入 Excel
// Content-Type: multipart/form-data
// Fields:
//   file: File (max 100MB, .xlsx/.xls/.csv)
//   targetType: 'standard' | 'freeform' (默认 'freeform')
//   teamId?: string

// POST /docs/:docId/export/xlsx — 导出选项
interface ExportOptions {
  sheets?: string[];          // 导出指定 Sheet（默认全部）
  viewId?: string;            // 按指定视图导出（可选，覆盖筛选/排序）
  includeHidden?: boolean;    // 是否包含隐藏列
  includeFormulas?: boolean;  // 是否包含公式（默认 true）
  password?: string;          // 导出文件加密密码
}

// POST /docs/:docId/sheets/:sheetId/rows/query — 高级查询
interface RowQueryRequest {
  viewId?: string;             // 按视图配置查询
  filter?: {
    conditions: FilterCondition[];
    conjunction: 'and' | 'or';
  };
  sort?: { fieldId: string; order: 'asc' | 'desc' }[];
  groupBy?: string[];          // 分组字段
  aggregations?: {
    fieldId: string;
    function: 'sum' | 'avg' | 'count' | 'min' | 'max';
  }[];
  offset?: number;             // 默认 0
  limit?: number;              // 默认 100, max 1000
}

// POST /docs/:docId/search — 文档内搜索
interface DocSearchRequest {
  query: string;
  sheetId?: string;            // 限定在指定 Sheet（可选）
  searchFields?: string[];     // 限定搜索字段（仅标准表）
  caseSensitive?: boolean;
  regex?: boolean;
}

// POST /docs/:docId/permissions — 添加权限
interface AddPermissionRequest {
  userId?: string;
  teamId?: string;
  role: 'editor' | 'viewer' | 'guest';
  expiresAt?: string;          // ISO 8601, 不传表示永久
}

// PATCH /docs/:docId/automations/:autoId — 更新自动化规则
interface UpdateAutomationRequest {
  name?: string;
  trigger?: AutomationTrigger;
  conditions?: AutomationCondition[];
  actions?: AutomationAction[];
  isEnabled?: boolean;
}
```

### 10.9 导入分片上传协议补充（P1-2 补全）

```typescript
// 大文件（> 10MB）分片上传流程:
//
// 1. 初始化上传
POST /api/v1/uploads/init
  Body: {
    fileName: string;
    fileSize: number;          // 总字节数
    mimeType: string;          // application/vnd.openxmlformats...
    targetDocType: 'standard' | 'freeform';
  }
  Response: {
    uploadId: string;          // 上传会话 ID
    chunkSize: number;         // 每片大小（默认 5MB）
    totalChunks: number;       // 总片数
  }

// 2. 分片上传（并发 3 片）
POST /api/v1/uploads/:uploadId/chunks/:chunkIndex
  Content-Type: multipart/form-data
  Fields:
    chunk: File               // 文件分片
    checksum: string;         // MD5 校验（用于验证完整性）
  Response: {
    chunkIndex: number;
    received: boolean;
    progress: number;         // 0.0 ~ 1.0
  }

// 3. 完成上传 → 触发解析
POST /api/v1/uploads/:uploadId/complete
  Response: {
    taskId: string;           // 异步解析任务 ID
    status: 'processing';
  }

// 4. 轮询解析状态
GET /api/v1/uploads/:uploadId/status
  Response: {
    status: 'processing' | 'completed' | 'failed';
    progress: number;         // 0 ~ 1
    docId?: string;           // 解析完成后返回新文档 ID
    errors?: string[];        // 解析警告
  }

// 5. 异常处理
// - 上传中断: 客户端记录已上传分片索引，续传时跳过已完成的
// - 分片校验失败: 服务端返回 checksum_mismatch → 客户端重新上传该分片
// - 解析失败: status='failed', errors 数组包含详细错误
// - 超时清理: 24 小时未完成的上传会话自动清理
```

---

## 十一、数据库详细设计

### 11.1 核心表结构

#### 用户与团队

```sql
-- ==========================================
-- 用户表
-- ==========================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    display_name    VARCHAR(100) NOT NULL,
    avatar_url      VARCHAR(500),
    phone           VARCHAR(20),
    locale          VARCHAR(10) DEFAULT 'zh-CN',
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- ==========================================
-- 团队表
-- ==========================================
CREATE TABLE teams (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    avatar_url      VARCHAR(500),
    owner_id        UUID NOT NULL REFERENCES users(id),
    member_count    INTEGER DEFAULT 1,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 团队成员关系
-- ==========================================
CREATE TABLE team_members (
    team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(20) NOT NULL DEFAULT 'member',  -- owner / admin / member
    joined_at       TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (team_id, user_id)
);

CREATE INDEX idx_team_members_user ON team_members(user_id);
```

#### 文档核心表

```sql
-- ==========================================
-- 文档表（元数据）
-- ==========================================
CREATE TABLE documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    doc_type        VARCHAR(20) NOT NULL DEFAULT 'standard', -- standard / freeform
    team_id         UUID REFERENCES teams(id),
    owner_id        UUID NOT NULL REFERENCES users(id),
    current_version INTEGER NOT NULL DEFAULT 0,
    sheet_count     INTEGER NOT NULL DEFAULT 1,
    row_count       INTEGER DEFAULT 0,
    col_count       INTEGER DEFAULT 0,
    cell_count      INTEGER DEFAULT 0,
    storage_size    BIGINT DEFAULT 0,       -- 存储大小（字节）
    is_deleted      BOOLEAN DEFAULT FALSE,  -- 软删除标记
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 查询索引
CREATE INDEX idx_documents_owner    ON documents(owner_id, is_deleted);
CREATE INDEX idx_documents_team     ON documents(team_id, is_deleted);
CREATE INDEX idx_documents_updated  ON documents(updated_at DESC);
CREATE INDEX idx_documents_type     ON documents(doc_type);

-- ==========================================
-- 文档权限表（RBAC 细粒度权限）
-- ==========================================
CREATE TABLE document_permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id          UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),
    team_id         UUID REFERENCES teams(id),
    role            VARCHAR(20) NOT NULL,    -- owner / editor / viewer / guest
    granted_by      UUID NOT NULL REFERENCES users(id),
    granted_at      TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,             -- NULL = 永久

    -- 一个用户或团队在一个文档中只能有一条权限记录
    CONSTRAINT perm_unique UNIQUE (doc_id, user_id, team_id),
    -- 用户和团队至少有一个非空
    CONSTRAINT perm_target CHECK (
        (user_id IS NOT NULL AND team_id IS NULL) OR
        (user_id IS NULL AND team_id IS NOT NULL)
    )
);

CREATE INDEX idx_permissions_doc_user ON document_permissions(doc_id, user_id);
CREATE INDEX idx_permissions_doc_team ON document_permissions(doc_id, team_id);
```

#### CRDT 操作日志表（数据库设计核心）

```sql
-- ==========================================
-- CRDT 操作日志表（不可变追加，按文档分区）
-- ==========================================
CREATE TABLE crdt_oplog (
    id              BIGSERIAL,                    -- 全局自增（用于排序）
    doc_id          UUID NOT NULL,
    global_version  INTEGER NOT NULL,             -- 文档级版本号（单调递增）
    op_id           VARCHAR(100) NOT NULL,        -- HLC 生成的全局唯一操作 ID
    user_id         UUID NOT NULL,
    op_type         VARCHAR(30) NOT NULL,         -- set / insert / delete / merge / ...
    op_target       VARCHAR(200) NOT NULL,        -- 操作目标（sheet!A1 格式）
    op_data         JSONB NOT NULL,               -- 完整操作数据
    dependencies    JSONB,                        -- 因果依赖：[op_id_1, op_id_2]
    server_ts       TIMESTAMPTZ DEFAULT NOW(),    -- 服务端接收时间戳
    client_ts       BIGINT,                       -- 客户端发起的物理时间戳（HLC 部分）

    PRIMARY KEY (doc_id, global_version)
) PARTITION BY HASH (doc_id);

-- 创建 32 个哈希分区（按 doc_id 均匀分布）
CREATE TABLE crdt_oplog_p0  PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 0);
CREATE TABLE crdt_oplog_p1  PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 1);
CREATE TABLE crdt_oplog_p2  PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 2);
CREATE TABLE crdt_oplog_p3  PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 3);
CREATE TABLE crdt_oplog_p4  PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 4);
CREATE TABLE crdt_oplog_p5  PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 5);
CREATE TABLE crdt_oplog_p6  PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 6);
CREATE TABLE crdt_oplog_p7  PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 7);
CREATE TABLE crdt_oplog_p8  PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 8);
CREATE TABLE crdt_oplog_p9  PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 9);
CREATE TABLE crdt_oplog_p10 PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 10);
CREATE TABLE crdt_oplog_p11 PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 11);
CREATE TABLE crdt_oplog_p12 PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 12);
CREATE TABLE crdt_oplog_p13 PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 13);
CREATE TABLE crdt_oplog_p14 PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 14);
CREATE TABLE crdt_oplog_p15 PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 15);
CREATE TABLE crdt_oplog_p16 PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 16);
CREATE TABLE crdt_oplog_p17 PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 17);
CREATE TABLE crdt_oplog_p18 PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 18);
CREATE TABLE crdt_oplog_p19 PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 19);
CREATE TABLE crdt_oplog_p20 PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 20);
CREATE TABLE crdt_oplog_p21 PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 21);
CREATE TABLE crdt_oplog_p22 PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 22);
CREATE TABLE crdt_oplog_p23 PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 23);
CREATE TABLE crdt_oplog_p24 PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 24);
CREATE TABLE crdt_oplog_p25 PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 25);
CREATE TABLE crdt_oplog_p26 PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 26);
CREATE TABLE crdt_oplog_p27 PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 27);
CREATE TABLE crdt_oplog_p28 PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 28);
CREATE TABLE crdt_oplog_p29 PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 29);
CREATE TABLE crdt_oplog_p30 PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 30);
CREATE TABLE crdt_oplog_p31 PARTITION OF crdt_oplog FOR VALUES WITH (modulus 32, remainder 31);

-- 关键查询索引
CREATE INDEX idx_oplog_doc_version ON crdt_oplog(doc_id, global_version);
CREATE INDEX idx_oplog_server_ts    ON crdt_oplog(server_ts);
```

#### 文档快照表

```sql
-- ==========================================
-- 文档快照表（基线 + 增量 Diff）
-- ==========================================
CREATE TABLE document_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id          UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version         INTEGER NOT NULL,
    snapshot_type   VARCHAR(20) NOT NULL,        -- base（基线）/ diff（增量）
    snapshot_data   JSONB,                       -- 快照数据（JSONB 支持压缩）
    binary_ref      VARCHAR(500),                -- 大型快照的外部存储引用（MinIO key）
    binary_size     BIGINT,                      -- 快照文件大小
    compressed      BOOLEAN DEFAULT FALSE,       -- 是否压缩（大型快照使用 gzip）
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (doc_id, version)
);

CREATE INDEX idx_snapshots_doc_version ON document_snapshots(doc_id, version DESC);

-- ==========================================
-- 文档 Sheet 结构表
-- ==========================================
CREATE TABLE document_sheets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id          UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    sheet_id        VARCHAR(50) NOT NULL,        -- 客户端定义的 sheet ID
    name            VARCHAR(200) NOT NULL,
    sheet_type      VARCHAR(20) NOT NULL DEFAULT 'grid',  -- grid / kanban / calendar / gantt / gallery
    sort_order      INTEGER NOT NULL DEFAULT 0,
    row_count       INTEGER DEFAULT 0,
    col_count       INTEGER DEFAULT 0,
    is_hidden       BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (doc_id, sheet_id)
);
```

#### 视图与自动化规则

```sql
-- ==========================================
-- 视图定义表（标准表的多视图功能）
-- ==========================================
CREATE TABLE sheet_views (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sheet_id        VARCHAR(50) NOT NULL,
    doc_id          UUID NOT NULL,
    name            VARCHAR(200) NOT NULL,
    view_type       VARCHAR(20) NOT NULL,        -- grid / kanban / calendar / gantt / gallery
    config          JSONB NOT NULL,              -- 视图配置：
                                                 -- { filters: [...], sorts: [...],
                                                 --   groupBy: "col_4", fields: [...],
                                                 --   kanbanConfig: {...} }
    is_personal     BOOLEAN DEFAULT FALSE,       -- 个人视图 vs 共享视图
    owner_id        UUID REFERENCES users(id),   -- 个人视图的拥有者
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_views_sheet ON sheet_views(doc_id, sheet_id);

-- ==========================================
-- 自动化规则表
-- ==========================================
CREATE TABLE automations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id          UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    name            VARCHAR(200) NOT NULL,
    trigger_type    VARCHAR(30) NOT NULL,        -- on_record_create / on_record_update /
                                                 -- on_field_change / on_schedule / on_webhook
    trigger_config  JSONB NOT NULL,              -- 触发器配置
    actions         JSONB NOT NULL,              -- 动作列表：
                                                 -- [{ type: "send_notification", config: {...} },
                                                 --  { type: "update_field", config: {...} },
                                                 --  { type: "webhook", config: {...} }]
    is_enabled      BOOLEAN DEFAULT TRUE,
    last_triggered  TIMESTAMPTZ,
    run_count       INTEGER DEFAULT 0,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_automations_doc ON automations(doc_id);
```

#### 评论与审计日志

```sql
-- ==========================================
-- 评论表（单元格/行级协同批注）
-- ==========================================
CREATE TABLE comments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id          UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    sheet_id        VARCHAR(50) NOT NULL,
    cell_ref        VARCHAR(50),                 -- 单元格引用（可选，NULL 表示行级评论）
    row_id          VARCHAR(50),                 -- 行 ID（标准表行级评论）
    content         TEXT NOT NULL,
    author_id       UUID NOT NULL REFERENCES users(id),
    parent_id       UUID REFERENCES comments(id),-- 回复线程
    is_resolved     BOOLEAN DEFAULT FALSE,
    resolved_by     UUID REFERENCES users(id),
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comments_doc_cell ON comments(doc_id, sheet_id, cell_ref);
CREATE INDEX idx_comments_thread   ON comments(parent_id);

-- ==========================================
-- 审计日志表（操作记录不可变）
-- ==========================================
CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    doc_id          UUID NOT NULL,
    user_id         UUID NOT NULL,
    action          VARCHAR(50) NOT NULL,        -- create_doc / edit_cell / delete_row / export / ...
    target          VARCHAR(200),                -- 操作目标
    action_data     JSONB,                       -- 操作详细数据
    ip_address      INET,
    user_agent      VARCHAR(500),
    created_at      TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- 按月分区（自动创建）
CREATE TABLE audit_logs_2026_06 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE audit_logs_2026_07 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
-- ... 自动脚本每月创建新分区

CREATE INDEX idx_audit_doc    ON audit_logs(doc_id, created_at DESC);
CREATE INDEX idx_audit_user   ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_logs(action, created_at DESC);
```

### 11.2 Redis 缓存策略

```
┌─────────────────────────────────────────────────────────┐
│                    Redis 数据结构一览                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─ String ─────────────────────────────────────────┐   │
│  │ · session:{sessionId}          → 用户会话（7天过期）   │
│  │ · refresh_token:{userId}       → Refresh Token      │
│  │ · ratelimit:{userId}           → 限流计数器           │
│  │ · doc:meta:{docId}             → 文档元数据缓存        │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─ Hash ───────────────────────────────────────────┐   │
│  │ · perm:{docId}                 → {userId: role}     │
│  │ · doc:online:{docId}           → {userId: cursor}   │
│  │ · user:profile:{userId}        → 用户信息缓存        │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─ Sorted Set ──────────────────────────────────────┐  │
│  │ · ratelimit:{userId}:slide     → 滑动窗口限流        │
│  │ · doc:hot                      → 热门文档排行        │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─ Stream ──────────────────────────────────────────┐  │
│  │ · doc:{docId}:oplog            → CRDT 操作流        │
│  │ · notifications:{userId}       → 用户通知流          │
│  │ · automations:trigger          → 自动化触发队列      │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─ Pub/Sub ──────────────────────────────────────────┐  │
│  │ · doc:{docId}:collab           → 协同操作广播        │
│  │ · doc:{docId}:cursor           → 光标位置广播        │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘

缓存过期策略:
- 文档元数据: 5 分钟（LRU 淘汰兜底）
- 用户会话: 7 天
- 限流计数器: 窗口时间
- 文档操作流: 保留最近 1 小时 → 定时归档到 PG
- 权限缓存: 5 分钟
```

### 11.3 读写分离与查询优化

```sql
-- ==========================================
-- 读写分离策略
-- ==========================================
-- 主库（写）：crdt_oplog 写入、document_snapshots 写入、audit_logs 写入
-- 从库1（读）：文档列表查询、用户信息查询、导出任务查询
-- 从库2（读）：版本历史查询、搜索查询、审计日志查询

-- ==========================================
-- 关键查询模式与索引优化
-- ==========================================

-- 查询1: 获取文档最新的 N 个操作（用于客户端增量同步）
-- 执行计划: 主键扫描（doc_id, global_version），O(log N)
SELECT op_id, op_type, op_target, op_data, dependencies, global_version
FROM crdt_oplog
WHERE doc_id = $1 AND global_version > $2
ORDER BY global_version ASC
LIMIT 500;

-- 查询2: 查找最近基线快照（用于文档重建）
-- 执行计划: 索引扫描（doc_id, version DESC），O(log N)
SELECT version, snapshot_data, binary_ref
FROM document_snapshots
WHERE doc_id = $1 AND snapshot_type = 'base' AND version <= $2
ORDER BY version DESC
LIMIT 1;

-- 查询3: 全文搜索单元格内容（由 Elasticsearch 处理，PG 兜底）
-- PG 版本（小规模场景）:
SELECT doc_id, sheet_id, cell_ref, ts_headline('simple', content, query) AS snippet
FROM cell_search_index
WHERE to_tsvector('simple', content) @@ plainto_tsquery('simple', $1)
ORDER BY ts_rank(to_tsvector('simple', content), plainto_tsquery('simple', $1)) DESC
LIMIT 20;

-- 查询4: 文档列表（用户有权限的文档，分页）
SELECT d.id, d.title, d.updated_at, d.doc_type, dp.role
FROM documents d
JOIN document_permissions dp ON d.id = dp.doc_id
WHERE (dp.user_id = $1 OR dp.team_id = ANY($2))
  AND d.is_deleted = FALSE
ORDER BY d.updated_at DESC
LIMIT 50 OFFSET $3;
```

### 11.4 PostgreSQL 配置优化

```ini
# postgresql.conf 关键参数

# ─── 内存 ───
shared_buffers = 4GB               # 25% 系统内存（16GB 服务器）
effective_cache_size = 8GB         # 50% 系统内存
work_mem = 64MB                    # 单个操作的工作内存（排序/哈希）
maintenance_work_mem = 512MB       # VACUUM/CREATE INDEX 内存

# ─── WAL（写前日志，直接影响写入性能） ───
wal_level = replica                # 支持流复制
wal_buffers = 64MB
max_wal_size = 4GB
min_wal_size = 1GB
checkpoint_timeout = 15min
checkpoint_completion_target = 0.9  # 分散刷盘，避免 IO 尖峰

# ─── 连接与并发 ───
max_connections = 200              # 总连接数
                                  # 使用 PgBouncer 连接池，实际应用连接 ≈ 20

# ─── 查询优化 ───
random_page_cost = 1.1             # SSD 环境（默认 4.0 适用于 HDD）
effective_io_concurrency = 200     # SSD 并发 IO
default_statistics_target = 200    # 提高统计采样精度

# ─── 自动清理 ───
autovacuum = on
autovacuum_max_workers = 4
autovacuum_naptime = 1min
autovacuum_vacuum_threshold = 500
autovacuum_analyze_threshold = 250
# crdt_oplog 表写入频繁，需要更激进的 VACUUM
```

### 11.5 备份与恢复策略

```
备份层次:
┌────────────────────────────────────────────┐
│ L1: WAL 归档（连续备份）                      │
│ · pg_receivewal → MinIO/S3                  │
│ · 恢复点: 任意时间点（PITR）                  │
│ · RPO: ~0（接近零数据丢失）                   │
├────────────────────────────────────────────┤
│ L2: 每日全量备份（pg_dump）                   │
│ · 每天凌晨 2:00 执行                         │
│ · 备份文件存 MinIO，保留 30 天                │
├────────────────────────────────────────────┤
│ L3: 文档快照归档（MinIO → 冷存储）            │
│ · > 90 天的文档快照                          │
│ · 移入低频存储（降低成本）                     │
│ · 恢复时自动回热                              │
└────────────────────────────────────────────┘

恢复流程:
1. 从 MinIO 拉取最近的全量备份
2. pg_restore 恢复全量
3. 应用 WAL 日志到目标时间点
4. 验证数据完整性（checksum）
```

### 11.6 Elasticsearch 索引设计

```json
// cells 索引 Mapping（全文搜索用）
{
  "mappings": {
    "properties": {
      "docId":     { "type": "keyword" },
      "sheetId":   { "type": "keyword" },
      "cellRef":   { "type": "keyword" },
      "content":   {
        "type": "text",
        "analyzer": "ik_max_word",        // 中文分词
        "search_analyzer": "ik_smart"
      },
      "valueType": { "type": "keyword" },  // text / number / date / formula
      "numberVal": { "type": "double" },   // 用于范围过滤查询
      "dateVal":   { "type": "date" },
      "docType":   { "type": "keyword" },
      "teamId":    { "type": "keyword" },  // 用于权限过滤
      "owners":    { "type": "keyword" },  // 有权限的用户列表
      "updatedAt": { "type": "date" }
    }
  }
}

// 同步策略:
// 1. 批量写入: 每 5 秒或累积 100 个变更，批量写入 ES
// 2. Redis Stream 触发: crdt_oplog 变更 → 消费者 → 解析单元格内容 → ES bulk index
// 3. 数据一致性: ES 作为二级索引，PG 为源；不一致时从 PG 重建
```

---

## 十二、核心差异总表（三方对比）

| 维度 | 语雀表格 | 飞书多维表 | **自研表格系统** |
|---|---|---|---|
| **数据模型** | 异构（合并单元格） | 同构强类型（禁止合并） | **双模：创建时选定，支持互转** |
| **协同算法** | OT + Command（中心化） | CRDT + OT（去中心化） | **CRDT 主 + OT 辅（半中心化）** |
| **计算模式** | 客户端优先（25万格） | 混算（50万格） | **三级调度：客户端→Worker→服务端** |
| **渲染** | Canvas 自由排版 | Canvas 结构化 | **Canvas 双模式 + OffscreenCanvas** |
| **Excel 兼容** | 强兼容 | 有限兼容 | **分区策略：强兼容 + 智能降级** |
| **协同上限** | ~50人 | ~2000人 | **~500人（按需水平扩展）** |
| **离线编辑** | 弱 | 强 | **强（CRDT + IndexedDB）** |
| **多视图** | 有限 | 丰富 | **5种视图（表格/看板/日历/甘特/画廊）** |
| **适用场景** | 知识库、报表、台账 | 项目管理、CRM、数据中台 | **通用企业报表 + 轻量数据管理** |

---

## 十三、实施路线图

```
Phase 1（MVP — 6 个月）         Phase 2（增强 — 4 个月）        Phase 3（成熟 — 持续）
────────────────────────────────────────────────────────────────────────────
┌─────────────────┐           ┌─────────────────┐           ┌─────────────────┐
│ ✓ Canvas 渲染引擎 │           │ ✓ 标准表+列类型    │           │ ✓ 多视图          │
│ ✓ 单表编辑        │           │ ✓ CRDT 协同      │           │ ✓ 自动化规则      │
│ ✓ 稀疏矩阵模型    │           │ ✓ Excel 强兼容    │           │ ✓ 跨表公式        │
│ ✓ 基础工具栏      │           │ ✓ Web Worker 计算│           │ ✓ 第三方集成      │
│ ✓ xlsx 导入导出   │           │ ✓ 服务端架构      │           │ ✓ 移动端适配      │
│ ✓ OT 基础协同     │           │ ✓ 权限系统        │           │ ✓ 性能优化        │
└─────────────────┘           └─────────────────┘           └─────────────────┘
```

---

## 十四、风险与应对

| 风险 | 等级 | 应对措施 |
|---|---|---|
| Canvas 性能瓶颈（100万+单元格） | 中 | 虚拟滚动 + 脏区域重绘 + OffscreenCanvas 分流 |
| CRDT 实现复杂度高 | 高 | 参考 Yjs/Automerge 开源实现，渐进式集成 |
| 公式引擎兼容性 | 中 | 分阶段实现（先 50 个核心函数，后扩展至 200+） |
| 大文件导入超时 | 中 | 分片上传 + 流式解析 + Web Worker 异步处理 |
| 实时协同延迟 | 低 | WebSocket + 就近部署 + CDN 加速静态资源 |
| 数据安全/隐私合规 | 高 | 字段级加密 + 审计日志 + 数据脱敏 + RBAC 最小权限 |

---

## 附录A：术语表

| 术语 | 说明 |
|---|---|
| **CRDT** | Conflict-free Replicated Data Type，无冲突复制数据类型 |
| **OT** | Operation Transformation，操作变换算法 |
| **HLC** | Hybrid Logical Clock，混合逻辑时钟 |
| **RGA** | Replicated Growable Array，可增长的复制数组 |
| **LWW** | Last-Write-Wins，最后写入胜出策略 |
| **OffscreenCanvas** | Web API，允许在 Worker 线程中执行 Canvas 渲染 |
| **DAG** | Directed Acyclic Graph，有向无环图（用于公式依赖） |
| **Sparse Matrix** | 稀疏矩阵，仅存储非空单元格以节省空间 |

## 附录B：参考项目

| 项目 | 说明 |
|---|---|
| [Yjs](https://github.com/yjs/yjs) | CRDT 协同编辑框架（参考实现） |
| [Automerge](https://github.com/automerge/automerge) | CRDT 文档协同库 |
| [HyperFormula](https://github.com/handsontable/hyperformula) | 高性能公式计算引擎 |
| [SheetJS](https://github.com/SheetJS/sheetjs) | Excel 文件解析库 |
| [Luckysheet](https://github.com/dream-num/Luckysheet) | 开源在线电子表格（Canvas 渲染参考） |
| [Handsontable](https://github.com/handsontable/handsontable) | 企业级数据网格组件（DOM 方案参考） |
