# 零一文档

零一文档是一个功能完整的智能云文档系统，支持多维表格、富文本文档、思维笔记、白板与问卷等多种文档类型，提供实时协作、知识库、AI 与 MCP 等能力。

本仓库为 **npm workspaces monorepo**：核心引擎与编辑器按域拆包，产品侧通过聚合门面兼容；部分包按 **Open Core** 策略可独立开源。

## 项目定位

多租户 SaaS / 私有化双形态：

- **租户隔离**：多租户架构，数据隔离
- **组织管理**：组织、部门、岗位、角色权限
- **会员与模块授权**：个人/团队 × 计划矩阵，叠加产品模块（`mod.*`）开关
- **管理后台**：租户、模板、审计、系统配置

## 功能特性

### 多维表格
- 多种字段类型与视图（表格 / 日历 / 看板 / 甘特 / 画廊）
- 公式引擎、条件格式、筛选、记录历史
- 仪表盘与图表

### 富文本文档
- 标题、列表、表格、代码块；Markdown / Mermaid
- 大纲导航、图片与嵌入块

### 思维笔记 / 思维导图
- Canvas 引擎 + React 封装（Open Core 首发面）
- 主题、节点样式、大纲视图

### 白板
- 自由画布、连接线、形状与嵌入思维图

### 实时协作
- CRDT 同步、Hybrid Logical Clock
- WebSocket 多人编辑

### 导入导出
- DOCX / XLSX / Markdown

### AI / MCP（商业能力）
- AI 助手与知识库 RAG
- MCP Tool 经域端口调用业务能力

## 技术架构

| 层 | 技术 |
|----|------|
| 前端 | React 18、TypeScript、Vite、Ant Design |
| 后端 | NestJS、TypeORM、MySQL、Redis、WebSocket |
| 存储 / 认证 | 阿里云 OSS、阿里云短信 |

### 包分层（依赖铁律）

```
Commercial → 可依赖 → OSS
OSS       → 禁止依赖 → Commercial
```

| 类别 | 包 |
|------|-----|
| **OSS / 引擎** | `core-types`、`core-doc`、`core-sheet`、`core-mindmap`、`core-whiteboard`、`core-io`、`core-collab`、`core-client`、`editor-*`（不含 pro）、`mind-map`、`mind-map-react` |
| **产品门面** | `@lingyi-doc/core`、`@lingyi-doc/editor`（聚合 re-export） |
| **商业** | `editor-pro`（= editor + ai-ui）、`ai-ui`、`web`、`admin`、`server` |

`web` 依赖 `editor-pro`；`admin` 按文档类型懒加载 `editor-*`（不含 AI）。

### 项目结构

```
ai-cloud-document/
├── packages/
│   ├── lingyi-doc-core/              # 核心聚合门面
│   ├── lingyi-doc-core-types/        # 共享类型
│   ├── lingyi-doc-core-doc/          # 富文本文档模型
│   ├── lingyi-doc-core-sheet/        # 表格 / 多维表 / 公式 / 图表
│   ├── lingyi-doc-core-mindmap/      # 思维笔记模型与布局
│   ├── lingyi-doc-core-whiteboard/   # 白板模型
│   ├── lingyi-doc-core-io/           # 导入导出与 patch
│   ├── lingyi-doc-core-collab/       # 协作客户端桥接
│   ├── lingyi-doc-core-client/       # HTTP 客户端（原 core 内 client）
│   ├── lingyi-doc-editor-shared/     # 编辑器共享
│   ├── lingyi-doc-editor-doc/        # 富文本编辑器
│   ├── lingyi-doc-editor-sheet/      # 表格编辑器
│   ├── lingyi-doc-editor-mindmap/    # 思维笔记编辑器
│   ├── lingyi-doc-editor-whiteboard/ # 白板编辑器
│   ├── lingyi-doc-editor/            # OSS 编辑器聚合门面
│   ├── lingyi-doc-editor-pro/        # 产品门面（含 AI UI）
│   ├── lingyi-doc-ai-ui/             # AI 前端（商业）
│   ├── lingyi-doc-mind-map/          # 思维图 Canvas 引擎（Open Core）
│   ├── lingyi-doc-mind-map-react/    # 思维图 React 封装（Open Core）
│   ├── lingyi-doc-license/           # 软件授权签发/验签（独立工具包）
│   ├── lingyi-doc-web/               # 用户端 Web
│   ├── lingyi-doc-admin/             # 管理后台
│   └── lingyi-doc-server/            # NestJS API
├── examples/
│   └── mind-map-demo/                # 离线 mind-map Demo（无需账号）
├── docs/                             # 架构与设计文档
├── scripts/                          # 构建与边界检查
└── deploy/                           # 部署配置
```

## 模块授权（Entitlement）

同一套 `mod.*` ID，两套策略源（互不污染）：

| 场景 | 配置 | 行为 |
|------|------|------|
| SaaS 默认 | 不设 / `ENABLED_MODULES=*` | 模块全开，体验与现网一致 |
| 私有化裁剪 | `ENABLED_MODULES=mod.doc,mod.sheet,...` | 未列出的模块创建返回 `120006` |
| Community | `EDITION=community` | 静态清单，关闭 AI / MCP / 企业安全 |
| License | `LICENSE_FILE` 或 `LICENSE_PAYLOAD` | 最高优先；过期视为无 modules |

优先级：**License > ENABLED_MODULES / Community > SaaS 全开**。

详见 [会员功能对照表](./docs/architecture/membership-account-feature-matrix.md)。

## 快速开始

### 环境要求

- Node.js >= 18.0.0
- MySQL >= 8.0
- Redis >= 6.0

### 安装与数据库

```bash
npm install

npm run db:check
npm run db:init
npm run db:migrate
npm run db:seed
npm run admin:seed
```

### 启动开发服务

```bash
npm run server   # API（默认 :3000）
npm run dev      # Web
npm run admin    # 管理后台
```

### Open Core Demo（思维导图）

```bash
npm run demo:mind-map
# http://localhost:5179 ，无需本公司账号
```

## 开发命令

```bash
npm run build                   # 全量构建（含 OSS 边界检查）
npm run check:oss-boundary      # OSS 包不得依赖商业包
npm run check:modules-matrix    # Community / License 单测 + mind-map 构建冒烟
npm run license:generate -- --help   # 签发 license.json（@lingyi-doc/license CLI）
npm run changeset               # 独立包版本变更记录
npm run version-packages        # 应用 changesets 版本
```

各包内可执行：`npm -w @lingyi-doc/<pkg> run typecheck` / `build`。

## 包一览

| 包名 | 说明 |
|------|------|
| `@lingyi-doc/core` | 核心聚合门面（产品兼容） |
| `@lingyi-doc/core-*` | 按域拆分的引擎包 |
| `@lingyi-doc/editor` | OSS 编辑器聚合 |
| `@lingyi-doc/editor-*` | 按文档类型拆分的编辑器 |
| `@lingyi-doc/editor-pro` | 产品编辑器门面（含 AI） |
| `@lingyi-doc/ai-ui` | AI 前端组件（商业） |
| `@lingyi-doc/mind-map` | 思维图 Canvas 引擎 |
| `@lingyi-doc/mind-map-react` | 思维图 React 组件 |
| `@lingyi-doc/license` | 软件授权签发 / 验签 / CLI |
| `@lingyi-doc/web` | 用户端应用 |
| `@lingyi-doc/admin` | 管理后台 |
| `@lingyi-doc/server` | 服务端 API |

## 部署

支持两套方式（可并存，按环境选用）：

### A. 传统：PM2 + rsync（现有）

配置位于 `deploy/dev/`：

- `deploy/dev/docker-compose.mysql.yml` — 可选本机 MySQL
- `deploy/dev/nginx.conf.template` — 宿主机 Nginx
- `deploy/dev/ecosystem.config.cjs` — PM2
- `deploy/dev/.env.example` — 环境变量

```bash
npm run build
npm run deploy:dev   # 需配置 scripts/deploy/dev/deploy.config.local
```

### B. Docker 镜像 + Compose（新增）

详见 [deploy/docker/README.md](./deploy/docker/README.md)。

```bash
cp deploy/docker/.env.example deploy/docker/.env
# 编辑数据库等配置

# 源码构建镜像并启动（可选本机 MySQL）
npm run docker:up -- --with-mysql --migrate

# 或：先 npm run build，再用 release 打镜像（更快）
npm run build && npm run docker:up:release -- --with-mysql --migrate

npm run docker:down
```

镜像：`lingyi-doc-api`（NestJS）、`lingyi-doc-web`（Nginx 静态站 + 反代）。

## 文档

完整索引见 [docs/README.md](./docs/README.md)。常用入口：

### 架构演进（当前）
- [工程架构优化方案](./docs/architecture-optimization.md)
- [执行看板](./docs/architecture-execution-plan.md)
- [会员功能对照表](./docs/architecture/membership-account-feature-matrix.md)

### 架构设计
- [文档共享](./docs/architecture/document-share-architecture.md)
- [知识库](./docs/architecture/knowledge-base-architecture.md)
- [协作编辑](./docs/architecture/collaborative-editing-architecture.md)
- [模板管理](./docs/architecture/template-management-architecture.md)
- [租户组织](./docs/architecture/tenant-org-architecture.md)
- [会员体系](./docs/architecture/membership-architecture.md)
- [白板](./docs/architecture/whiteboard-architecture.md)
- [思维图](./docs/architecture/mindmap-architecture.md)
- [认证与权限](./docs/architecture/auth-and-admin-design.md)
- [服务端数据库](./docs/architecture/server-database-design.md)
- [API 安全](./docs/security/security-api-protection.md)

### 设计与 API
- [图表系统设计](./docs/design/chart-system-design.md)
- [富文本编辑器设计](./docs/design/rich-text-editor-design.md)
- [表格系统技术方案](./docs/design/spreadsheet-system-design.md)
- [文档共享 OpenAPI](./docs/api/openapi/document-share-api.yaml)
- [知识库 OpenAPI](./docs/api/openapi/knowledge-base-api.yaml)
- [SDK 总览](./docs/guide/README.md)
