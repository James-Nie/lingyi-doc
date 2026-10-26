# 零一文档（Lingyi Doc）

> 开源优先的智能云文档系统 · 面向**开发者与 Agent** 的一站式文档协作平台

零一文档是一个开源优先的智能云文档系统，提供多维表格、富文本文档、思维笔记、白板、问卷等文档能力，支持实时协作、知识库与 **MCP** 标准协议接入。开发者可一键自托管，AI Agent 可通过 MCP 安全读写知识库与文档。

- **源码主入口（本文档）**：[github.com/James-Nie/lingyi-doc](https://github.com/James-Nie/lingyi-doc)
- **体验入口**：[lingyidoc.com](https://lingyidoc.com) — 访客直接进入登录 / 注册，登录即用
- **目标读者**：技术开发者、AI Agent（自动化 / IDE / 自建工作流）

---

## 导航（给 Agent / 开发者）

- [系统定位](#系统定位)
- [能力总览](#能力总览)
- [架构](#架构)
- [接入：REST API / SDK / MCP](#接入面向开发者与-agent)
- [部署（自托管）](#部署自托管)
- [快速开始](#快速开始)
- [开发指南](#开发指南)
- [开源协议](#开源协议)
- [链接与联系](#链接与联系)

---

## 系统定位

| 维度 | 说明 |
| --- | --- |
| **定位** | 开源优先的智能云文档系统，覆盖「写、协、管、接」全链路 |
| **主要使用者** | 技术开发者、AI Agent、研发 / 产品团队、企业 |
| **开源策略** | 核心引擎与编辑器完全开源，可自托管；商业能力独立授权 |
| **体验入口** | [lingyidoc.com](https://lingyidoc.com) 提供在线体验（登录 / 注册即用） |
| **系统集成** | REST API + JavaScript/TypeScript SDK + MCP（面向 Agent） |

一句话：**把文档能力变成可被代码与 Agent 调用的基础设施。**

---

## 能力总览

### 文档类型

| 模块 | 说明 | 开源状态 |
| --- | --- | --- |
| **多维表格** | 字段类型与多视图（表格 / 日历 / 看板 / 甘特 / 画廊）、公式引擎、条件格式、仪表盘 | ✅ 完全开源 |
| **富文本文档** | 标题、列表、表格、代码块、Markdown / Mermaid、大纲导航 | ⚙️ 计划中 |
| **思维笔记 / 导图** | Canvas 引擎、主题、节点样式、大纲视图 | ✅ 完全开源 |
| **白板** | 自由画布、连接线、形状、嵌入思维图 | ✅ 完全开源 |
| **问卷** | 表单设计、数据收集与分析 | ⚙️ 计划中 |

### 核心能力

| 能力 | 说明 | 开源状态 |
| --- | --- | --- |
| **实时协作** | CRDT 同步、Hybrid Logical Clock、WebSocket 多人编辑 | ✅ 开源 |
| **导入导出** | DOCX / XLSX / Markdown 格式支持 | ✅ 完全开源 |
| **知识库** | 文档组织、检索、权限管理 | ✅ 开源 |
| **MCP 接入** | Model Context Protocol，Agent 与业务系统深度集成 | ✅ 开源 |
| **AI 助手 / RAG** | 智能写作、内容生成、知识库检索增强 | ⚙️ 商业授权 |

---

## 架构

### 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                        客户端 / Agent                         │
│   Web (React + Antd)   ·   IDE (Cursor)   ·   自建 Agent       │
└───────────┬───────────────────────────┬──────────────────────┘
            │ HTTP / WebSocket           │ MCP (Streamable HTTP)
            ▼                           ▼
┌──────────────────────────────────────────────────────────────┐
│                  lingyi-doc-server (NestJS)                  │
│   REST API  │  Auth (JWT + MCP Token)  │  MCP Module          │
│   Services  │  协作引擎 (CRDT/HLC)     │  Knowledge / Doc / RAG│
└───────────┬───────────────────────────┬──────────────────────┘
            │                           │
            ▼                           ▼
       MySQL / PostgreSQL          Redis（协作 / 缓存）
```

- **协作引擎**：基于 CRDT + Hybrid Logical Clock，WebSocket 实时多人编辑。
- **MCP 层**：独立的 Token 授权体系（与 JWT 分离，Scope 粒度控制），桥接现有知识库 / 文档 / RAG 服务，对外暴露标准 Tools / Resources。

### 仓库结构（npm workspaces monorepo）

| 分组 | 包 | 说明 |
| --- | --- | --- |
| **核心引擎** | `@lingyi-doc/core`、`core-client`、`core-collab`、`core-doc`、`core-io`、`core-mindmap`、`core-sheet`、`core-types`、`core-whiteboard` | 数据模型、协作、IO、渲染基础设施（纯 TS，零 UI 依赖） |
| **编辑器** | `@lingyi-doc/editor`、`editor-doc`、`editor-mindmap`、`editor-sheet`、`editor-whiteboard`、`editor-pro`、`editor-shared` | React + Antd 编辑器组件库 |
| **思维导图** | `@lingyi-doc/mind-map`（纯 Canvas）、`mind-map-react` | 思维导图渲染与 React 封装 |
| **应用** | `@lingyi-doc/web`（用户端）、`@lingyi-doc/admin`（管理后台）、`@lingyi-doc/server`（API）、`ai-ui` | 可部署产品 |

### 技术栈

- **前端**：React 18、TypeScript、Vite、Ant Design
- **后端**：NestJS、TypeORM、MySQL / PostgreSQL、Redis、WebSocket
- **部署**：Docker / Docker Compose、Nginx

---

## 接入（面向开发者与 Agent）

### 1. REST API

服务端提供 RESTful API（前缀 `/api/v1`），典型端点：

- `POST /api/v1/c/mcp/tokens` — 管理 MCP Token（JWT 登录态）
- `GET /api/v1/mcp` · `POST /api/v1/mcp` — MCP JSON-RPC 端点
- 文档共享 / 知识库接口见 [`docs/api/`](./docs/api)

### 2. JavaScript / TypeScript SDK

```bash
npm install @lingyi-doc/core     # 核心引擎（无 UI 依赖）
npm install @lingyi-doc/editor   # React 编辑器组件（需 React 18+）
npm install @lingyi-doc/mind-map # 纯 Canvas 思维导图引擎
```

```typescript
import { Workbook, FreeTable } from '@lingyi-doc/core';
import { FreeformSheetEditor, BaseSheetEditor } from '@lingyi-doc/editor';

const workbook = new Workbook();
workbook.addSheet('Sheet1');
const sheet = workbook.getActiveSheet();
```

详见 [SDK 文档](./docs/guide/README.md) 与 [二次开发指南](./docs/guide/development.md)。

### 3. MCP 接入（Agent 重点）

零一文档实现 **MCP 2024-11-05** 规范，支持 Streamable HTTP，使 Cursor、Claude Desktop、自建 Agent、CI 流水线可通过标准协议访问知识库与文档。

**端点与鉴权**

```http
POST /api/v1/mcp
Authorization: Bearer mcp_<token>
Content-Type: application/json
MCP-Protocol-Version: 2024-11-05
```

**能力范围（Scope）**

| Scope | 说明 |
| --- | --- |
| `kb:read` / `kb:write` | 知识库与目录节点的读 / 写 |
| `doc:read` / `doc:write` | 文档的读 / 写（含表格、多维表写入） |
| `ai:rag` | 向量语义检索与索引 |

**客户端配置示例（Cursor）**

```json
{
  "mcpServers": {
    "lingyi-doc": {
      "url": "https://your-domain.com/api/v1/mcp",
      "headers": { "Authorization": "Bearer mcp_xxxxxxxx" }
    }
  }
}
```

**典型 Agent 工作流**

```
list_knowledge_bases → list_kb_nodes → create_kb_document
→ update_document（写 Markdown）→ embed_document → search_knowledge
```

> MCP 设计详见 [`docs/design/mcp-module-design.md`](./docs/design/mcp-module-design.md)。Token 在 Web 账号中心自助签发，明文仅展示一次，支持 Scope、过期与吊销。

---

## 部署（自托管）

零一文档可完全自托管，适用于本地开发、内网与云服务器。

### 环境要求

- Node.js >= 18.0.0
- 数据库：MySQL 8.0 或 PostgreSQL 15
- Redis >= 6.0

### Docker 部署（推荐）

```bash
# 复制配置
cp deploy/docker/.env.example deploy/docker/.env
# 编辑 DB / JWT 等；本机 MySQL 用 DB_HOST=mysql

# 方式 A：源码多阶段构建并启动（含本机 MySQL）
npm run docker:up -- --with-mysql --migrate

# 方式 B：先打 release 再构建镜像
npm run build
npm run docker:up:release -- --with-mysql --migrate
```

访问：

- Web：http://127.0.0.1/
- 管理后台：http://127.0.0.1/admin/
- 健康检查：http://127.0.0.1/api/v1/health

停止：`npm run docker:down`（加 `-- --volumes` 会删数据卷）。

详见 [部署文档](./deploy/docker/README.md)。

### 本地开发（一键起依赖）

```bash
# 启动 PostgreSQL + Redis
docker compose up -d

# 初始化并启动
npm install
npm run db:init
npm run db:migrate
npm run server   # API（默认 :3000）
npm run dev      # Web 前端
```

### 源码构建

```bash
npm run build          # 全量构建
npm run typecheck      # 类型检查
npm run test           # 运行测试
```

---

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/James-Nie/lingyi-doc.git
cd lingyi-doc

# 安装依赖
npm install

# 启动依赖（PostgreSQL + Redis）
docker compose up -d

# 初始化数据库
npm run db:init
npm run db:migrate

# 启动服务
npm run server   # API 服务（默认 :3000）
npm run dev      # Web 前端
npm run admin    # 管理后台
```

打开 http://localhost:5173（Web 前端）即可注册账号、进入工作台。
在线体验也可直接访问 [lingyidoc.com](https://lingyidoc.com)。

---

## 开发指南

### 常用命令

```bash
npm run dev            # Web 前端开发
npm run server         # API 服务开发
npm run admin          # 管理后台开发
npm run build          # 全量构建
npm run typecheck      # 类型检查
npm run test           # 测试
npm run docker:up      # Docker 部署
```

### 包地图

- `@lingyi-doc/core-*`：核心引擎包
- `@lingyi-doc/editor-*`：编辑器组件
- `@lingyi-doc/web`：用户端应用
- `@lingyi-doc/admin`：管理后台
- `@lingyi-doc/server`：服务端 API

### 设计文档

- [协作编辑架构](./docs/architecture/collaborative-editing-architecture.md)
- [知识库架构](./docs/architecture/knowledge-base-architecture.md)
- [权限体系](./docs/architecture/auth-and-admin-design.md)
- [MCP 模块设计](./docs/design/mcp-module-design.md)
- [API 文档](./docs/api/openapi/document-share-api.yaml)

---

## 开源协议

- **核心引擎**：MIT License
- **编辑器组件**：MIT License
- **商业组件**（AI 助手、RAG、企业安全等）：商业许可（详见仓库 LICENSE 文件）

---

## 链接与联系

- **源码仓库**：[github.com/James-Nie/lingyi-doc](https://github.com/James-Nie/lingyi-doc)
- **体验站点**：[lingyidoc.com](https://lingyidoc.com)
- **问题反馈**：GitHub Issues
- **文档**：[docs/](./docs)

> 商业合作与授权：contact@lingyi-doc.com
