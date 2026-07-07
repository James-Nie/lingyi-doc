# 自研表格系统 — 编码就绪性评估报告

> **评估时间**：2026-06-15  
> **评估对象**：《自研表格系统-技术方案设计 v2.0》（14章+2附录）  
> **评估标准**：开发团队拿到方案后能否直接开始编码，无需反复澄清设计决策。

---

## 一、总体结论

**当前状态：约 65% 就绪** — 架构层设计充分，但关键接口契约、边界条件、异常路径存在明显缺失。

```
就绪度分布：
████████████████████░░░░░░░░░░░░░░░░  65%  可直接编码
████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░  20%  需补全（阻塞 Phase 1 MVP）
████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  15%  可延期（Phase 2+ 才需要）
```

### 是否可以开始编码？

**可以开始，但有明确前提条件**：
- ✅ Canvas 渲染引擎、数据模型、项目结构 — 可以直接开工
- ✅ 数据库 DDL、Redis 策略、PG 配置 — 可以直接开工
- ⚠️ CRDT 协同、公式引擎、导入导出 — 需要补全接口契约后才能开工
- ⚠️ 服务端 WebSocket、计算服务边界 — 需要明确数据传递格式
- ❌ 自动化规则、多视图、离线合并 — 暂缓，Phase 2 再编码

---

## 二、阻塞项（P0 — 必须解决才能编码）

### P0-1：CRDT 操作类型缺乏完整定义

**现状**：`CrdtOperation` 接口定义了 6 种 `type`，但：
- `merge_cells` / `unmerge_cells` / `insert_row` / `delete_row` / `insert_column` / `delete_column` / `sort` / `format_range` 等操作**未在 type 联合类型中列出**
- 前端 9.1 的 Store Actions 中有这些方法，但 CRDT 层未定义对应操作体

**缺失**：

```typescript
// 当前定义（不完整）
type OpType = 'set' | 'insert' | 'delete' | 'move' | 'counter_inc' | 'counter_dec';

// 实际需要的完整操作类型（至少还需要）：
type FullOpType = OpType |
  // 行列操作
  'insert_row' | 'delete_row' | 'insert_column' | 'delete_column' |
  // 合并单元格
  'merge_cells' | 'unmerge_cells' |
  // 格式刷
  'format_range' |
  // 排序/筛选（影响数据排列，需要协同）
  'sort_range' | 'set_filter' |
  // 数据验证/条件格式
  'set_validation' | 'set_conditional_format' |
  // 行记录操作（标准表）
  'create_record' | 'delete_record' | 'move_record';
```

**影响**：CRDT 引擎开发无法确定需要实现多少种操作合并逻辑。

### P0-2：SheetModel / SheetSnapshot 类型从未完整定义

**现状**：整个文档中，`SheetModel`、`SheetSnapshot`、`SheetData` 三种数据结构被反复引用，但**从未给出完整 TypeScript 接口**。

**影响范围**：
- 前端 Store 的 `sheets: Record<string, SheetModel>` 无法实现
- Worker API 的 `model: SheetSnapshot` 参数无法定义
- 服务端 `CrdtService.rebuildDocument()` 返回类型不明确
- CRDT 操作 Apply 逻辑的目标对象不确定

**必须明确**：

```typescript
interface SheetModel {
  // 元数据
  sheetId: string;
  name: string;
  type: 'standard' | 'freeform';

  // 标准表专用
  columnDefs?: ColumnDef[];
  rows?: RecordRow[];

  // 自由表专用
  cells?: Map<string, CellData>;      // key: "R<row>C<col>"
  mergeMap?: Map<string, CellRange>;  // key: "R<row>C<col>"
  rowHeights?: Map<number, number>;
  columnWidths?: Map<number, number>;

  // 共用
  styleDefaults?: StyleDefaults;
  namedRanges?: Map<string, CellRange>;
  conditionalFormats?: ConditionalFormat[];
  validations?: DataValidation[];
  rowCount: number;
  colCount: number;
}
```

### P0-3：Command 接口体系完全缺失

**现状**：数据流架构图（9.2）画了 `SetCellCmd`、`MergeCmd`、`SortCmd`、`FormatCmd`，但**从未定义 Command 的接口基类/协议**。

**缺失**：

```typescript
// 必须定义的接口
interface Command {
  type: string;
  execute(model: SheetModel): void;
  undo(model: SheetModel): void;
  toCrdtOp(): CrdtOperation;     // 转换为协同操作
  toUndoOp(): CrdtOperation;      // 生成逆向操作
}
```

**影响**：Command Layer 和 CommandExecutor 无法编码。

### P0-4：公式引擎 AST 节点类型未定义

**现状**：文档多次提到公式解析器（ANTLR 生成、Parser.ts、递归下降解析），但：
- AST 节点类型（BinaryOp / UnaryOp / FunctionCall / CellRef / NumberLiteral / StringLiteral / RangeRef）从未定义
- `evaluate()` 的输入输出类型不完整
- `CycleRef` 检测时的错误处理协议未定义
- 公式错误值（`#REF!`、`#VALUE!`、`#DIV/0!`、`#N/A`）的类型表示未定义

**影响**：FormulaEngine 和 Rust 计算服务无法开始编码。

### P0-5：服务端 Rust 计算服务的数据传递格式未定

**现状**：后端 10.5 展示了 Rust `recalc` 接口，但：
- `Sheet` Rust 结构体定义缺失
- 客户端如何将 JSON 模型序列化为 Rust 可接收的格式？
- 使用 Protobuf？JSON？Cap'n Proto？
- WASM 运行时路径不明确：Rust 编译为 WASM 后如何在 Node.js 中加载和调用？

**影响**：Node.js API 服务和 Rust 计算服务之间的通信协议无法确定。

### P0-6：WebSocket 连接的 sticky session 策略未说明

**现状**：10.1 架构图中 WebSocket 协同服务是独立的 Node.js Cluster，但多实例部署时：
- 同一 docId 的所有连接如何路由到同一实例？
- 如果不做 sticky，RoomManager 内存中的 Rooms 如何跨实例共享？
- 是否需要引入 Redis Pub/Sub 做跨实例广播？

**影响**：WebSocket 服务无法正确部署生产环境。

---

## 三、高风险项（P1 — 强烈建议编码前解决）

### P1-1：离线三方合并算法的伪代码缺失

**现状**：9.6 的 `OfflineManager.onReconnect()` 提到 `threeWayMerge()`，但这是整个离线协同最复杂的部分，文档只有一行调用，无实现说明。

**缺失**：
- 三方合并的输入输出明确签名
- 合并冲突时的冲突列表格式
- 合并失败时的回退策略
- 离线操作队列的大小上限？超出后如何处理？

### P1-2：导入导出的大文件处理流程不完整

**现状**：7.2 导入流程提到"分片上传+流式解析"，7.4 提到"100MB 文件"，但：
- 分片上传的 API 端点未在设计中出现
- 分片大小、并发数、断点续传协议未定义
- 服务端解析时是否需要创建临时文件？存储在哪？生命周期？
- 大文件导入失败时，如何清理已创建的部分数据？

### P1-3：自动化规则执行引擎设计缺失

**现状**：数据库有 `automations` 表，前端有 `AutomationPanel` 组件，但：
- 自动化规则的触发链路完全不清晰（Webhook 由谁接收？）
- `trigger_type: 'on_schedule'` 的定时调度机制未说明
- 自动化执行失败的重试策略？
- 自动化执行的频率限制/防死循环？

### P1-4：多视图（看板/日历/甘特/画廊）渲染方案未定义

**现状**：方案提到 5 种视图类型，但只详细设计了 grid 表格式视图。看板视图需要拖拽排序，日历视图需要日期计算+布局，甘特图需要 Canvas 或 SVG 渲染，这些都是独立的渲染模式。

**注意**：Phase 1 可以先不做，但数据库 schema 中 `sheet_views` 的 `config` JSONB 字段结构需要提前定义，否则 Phase 1 的数据结构后期不兼容。

### P1-5：用户登录/注册/会话管理流程缺失

**现状**：有 JWT 设计、RBAC 权限，但：
- 登录/注册 API 端点未列出
- 密码加密算法？重置密码流程？
- 多设备登录策略？
- Session 管理（是否需要 session 表）？
- 第三方 OAuth 登录（如有需要）？

### P1-6：请求/响应中涉及的所有子类型 Schema 缺失

**现状**：REST API 列出了 30+ 端点路径，但：
- `POST /docs` 创建文档的 request body 结构未定义
- `POST /docs/:docId/sheets/:sheetId/rows/query` 的查询语法未定义
- `POST /docs/:docId/export/xlsx` 的导出选项参数未定义
- `PATCH /docs/:docId/automations/:autoId` 的更新格式未定义

### P1-7：错误码体系未建立

**现状**：响应格式中有 `code: 40001` 示例，但没有统一的错误码编号规则。开发团队会各自定义错误码，导致后期混乱。

**需要一个错误码枚举表**，至少覆盖：
- 4xxxx: 客户端错误（参数、权限、资源不存在）
- 5xxxx: 服务端错误（数据库、超时、服务不可用）

---

## 四、中风险项（P2 — 可以先编码，但需要尽快补齐）

### P2-1：Canvas 引擎的列头/行头渲染未设计

**现状**：9.3 的渲染流水线只处理单元格区域，但 `ColumnHeader.tsx` 和 `RowHeader.tsx` 是 React DOM 组件还是 Canvas 绘制的？如果是 Canvas，它们和单元格 Canvas 是同一个还是独立的？

### P2-2：CellEditor（HTML overlay）与 Canvas 的坐标同步

**现状**：9.1 列出 `CellEditor.tsx`（HTML overlay），但 HTML 元素如何精确叠加到 Canvas 的某个单元格位置？缩放（0.5x-3.0x）时如何同步？滚动时如何处理？

### P2-3：剪贴板跨表粘贴的数据格式

**现状**：有 `ClipboardManager` 但未定义剪贴板数据格式。系统内部格式是什么？粘贴到外部 Excel 时格式是什么？从 Excel 粘贴进来时如何解析？

### P2-4：富文本单元格的 OT/CRDT 冲突

**现状**：文档提到"富文本"（L4 Content 层），但：
- CRDT 操作是单元格级别的 `set`，不覆盖富文本子编辑
- 如果两个用户同时编辑同一个富文本单元格的文字，如何处理？
- 是否需要引入 Quill/ProseMirror 级别的 Yjs 富文本 CRDT？

### P2-5：条件格式、数据验证的 CRDT 操作未被处理

**现状**：CRDT 引擎只处理 `set`/`insert`/`delete` 等基础操作，条件格式设置和数据验证设置如何协同？它们影响的是整列/整个区域的显示规则。

### P2-6：crdt_oplog 表的 global_version 单调递增实现

**现状**：10.4 代码中提到 `this.versionSeq.nextVal()`，但这在分布式环境下：
- 是通过 PG Sequence 实现？
- 多个 WS 实例并发写入时如何保证不冲突？
- 如果 PG Sequence 有性能瓶颈怎么办（热点争用）？

### P2-7：CDN 静态资源上传/版本管理

**现状**：架构图中有 CDN，但前端资源如何部署到 CDN？Hash 命名策略？缓存策略？多环境 CDN 配置？

### P2-8：缺少开发环境搭建指南

**现状**：无法让新成员快速启动本地开发环境，需要：
- Docker Compose 文件（PG + Redis + MinIO + ES）
- pnpm 初始化脚本
- 环境变量配置模板
- 数据种子脚本

---

## 五、缺失的定义补全清单

### 必须补充的 TypeScript 接口/类型

```
待定义                                    优先级    所属章节
────────────────────────────────────────────────────────────
SheetModel / SheetSnapshot                 P0        3.1, 9.1, 9.4, 10.4
Command 接口基类                           P0        9.2
Formula AST 节点类型                       P0        5.2, 9.5
CrdtOperation Type 完整联合类型            P0        4.2, 10.4
CellData 完整结构                          P0        3.2
ColumnDef 完整结构（含所有 type 枚举）       P0        3.2
CellRange 接口                             P1        多处
CellRef 格式规范（"A1" / "sheet!A1"）      P1        多处
RecalcResult 类型                          P1        5.3, 9.5, 10.5
OnlineUser / RemoteCursor 接口             P1        9.4
MenuAction / MenuItem 接口                 P2        9.1
DialogStack 接口                           P2        9.4
StyleDefaults 接口                         P2        2.2
PrintPage 接口                             P2        9.5
```

### 必须补充的 API Request/Response Schema

```
待定义                                    优先级
───────────────────────────────────────────────
POST /docs request body                    P0
POST /docs/:docId/export/xlsx options      P1
POST /docs/:docId/sheets/:sheetId/rows/query  P1
POST /docs/:docId/import/xlsx multipart     P1
POST /docs/:docId/search request body      P1
PATCH /docs/:docId/automations/:autoId     P1
POST /docs/:docId/permissions request body  P1
错误码枚举表（全量）                         P1
```

### 必须补充的数据库内容

```
待补充                                    优先级
───────────────────────────────────────────────
cell_search_index 表 DDL（查询中引用但未定义）  P1
文档模板初始数据表                            P2
配置/设置表（用户偏好、团队设置）              P2
数据库迁移工具和策略                          P1
PgBouncer 连接池配置详情                      P2
```

---

## 六、可直接编码的模块清单

以下模块已达编码就绪状态，开发团队可以立即开始：

| # | 模块 | 依据 | 负责方 |
|---|------|------|--------|
| 1 | Canvas 渲染引擎 — ViewportManager | 2.2 完整伪代码 | 前端 |
| 2 | Canvas 渲染引擎 — DirtyTracker | 2.2 完整伪代码 | 前端 |
| 3 | Canvas 渲染引擎 — LayerManager | 9.3 7层定义+策略 | 前端 |
| 4 | Canvas 渲染引擎 — QuadTree | 9.3 完整实现 | 前端 |
| 5 | 快捷键系统 | 9.7 40+键映射表 | 前端 |
| 6 | 状态管理 Store 定义 | 9.4 4个Store接口 | 前端 |
| 7 | 构建配置 vite.config.ts | 9.8 完整配置 | 前端 |
| 8 | Monorepo 项目结构创建 | 9.1 完整目录树 | 前端 |
| 9 | HLC 混合逻辑时钟 | 4.2 完整实现 | 前端 |
| 10 | 用户/团队/权限 DDL | 11.1 完整SQL | 后端 |
| 11 | 文档/快照/Sheet DDL | 11.1 完整SQL | 后端 |
| 12 | crdt_oplog 分区表 DDL | 11.1 完整SQL | 后端 |
| 13 | 审计日志分区表 DDL | 11.1 完整SQL | 后端 |
| 14 | 评论表 DDL | 11.1 完整SQL | 后端 |
| 15 | Redis 缓存结构 | 11.2 完整设计 | 后端 |
| 16 | PostgreSQL 配置 | 11.4 完整参数 | 后端 |
| 17 | Elasticsearch 索引 Mapping | 11.6 完整定义 | 后端 |
| 18 | 备份恢复策略 | 11.5 完整流程 | 运维 |
| 19 | JWT 认证中间件 | 10.6 完整代码 | 后端 |
| 20 | RBAC 权限中间件 | 10.6 完整代码 | 后端 |
| 21 | 限流算法 | 10.7 完整代码 | 后端 |

---

## 七、建议的编码启动顺序

```
Week 1-2: 先补 P0
  ├── 定义 SheetModel / SheetSnapshot / CellData 等核心类型
  ├── 完整化 CrdtOperation 操作类型
  ├── 定义 Command 接口体系
  └── 建立错误码枚举表

Week 3-8: 并行开发已就绪模块
  ├── 前端: Canvas 引擎（ViewportManager/DirtyTracker/LayerManager/QuadTree）
  ├── 前端: 项目结构搭建（monorepo + Vite + Zustand Store）
  ├── 后端: 数据库初始化（DDL + Docker Compose 本地环境）
  └── 后端: API 框架搭建（Express/Fastify + JWT + RBAC 中间件）

Week 9-12: 开发核心业务模块（P0 已解决后）
  ├── 前端: FormulaEngine + Parser + DependencyGraph
  ├── 前端: CRDT Engine + SyncManager
  ├── 后端: CRDT Service + WebSocket Room
  └── 后端: 文档 CRUD REST API
```

---

## 八、一句话总结

> **方案在架构层面充分成熟，但在接口层面存在约 35% 的缺失。补全 6 个 P0 项和 6 个 P1 项后即可全速编码。建议先用 1-2 周补齐类型定义和接口契约，同时开发团队并行搭建项目骨架和基础设施。**
