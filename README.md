# 零一文档

零一文档是一个功能完整的智能云文档系统，支持多维表格、富文本文档、思维笔记和白板等多种文档类型，提供实时协作编辑能力。

## 项目定位

零一文档是一个多租户 SaaS 平台，面向企业和团队提供一站式文档协作解决方案：

- **租户隔离**：支持多租户架构，数据完全隔离
- **组织管理**：组织架构、部门、岗位、角色权限管理
- **成员体系**：灵活的成员管理和权限控制
- **管理后台**：平台级管理控制台，支持租户管理、审计日志、系统配置

## 功能特性

### 📊 多维表格
- 支持多种字段类型：文本、数字、日期、多选、单选、评分、进度等
- 多种视图模式：表格视图、日历视图、看板视图、甘特图视图、画廊视图
- 公式计算引擎，支持单元格引用和自动计算
- 条件格式、数据验证、列筛选
- 记录历史追踪

### 📝 富文本文档
- 支持标题、段落、列表、表格、代码块
- Markdown 支持和转换
- Mermaid 图表渲染
- 图片上传和管理
- 文档大纲导航

### 🧠 思维笔记
- 思维导图编辑和渲染
- 节点样式自定义
- 主题预设
- 大纲视图

### 🎨 白板
- 自由画布编辑
- 连接线和标签
- 多种形状模板

### 🔄 实时协作
- 基于 CRDT 的实时同步
- Hybrid Logical Clock 版本控制
- 多人同时编辑

### 📤 导入导出
- DOCX 文档导入/导出
- XLSX 表格导入/导出
- Markdown 导入/导出

## 技术架构

### 前端技术栈
- React 18 + TypeScript
- Vite 构建工具
- Ant Design 组件库
- Zustand 状态管理

### 后端技术栈
- NestJS 框架
- TypeORM 数据库 ORM
- MySQL 数据库
- Redis 缓存
- WebSocket 实时通信
- 阿里云 OSS 文件存储
- 阿里云短信认证

### 项目结构

```
ai-cloud-document/
├── packages/
│   ├── lingyi-doc-core/      # 核心引擎
│   │   ├── chart/            # 图表引擎
│   │   ├── collab/           # 协作模块
│   │   ├── doc/              # 文档模型
│   │   ├── formula/          # 公式引擎
│   │   ├── io/               # 导入导出
│   │   ├── mindnote/         # 思维笔记模型
│   │   ├── renderer/         # 渲染器
│   │   └── whiteboard/       # 白板模型
│   ├── lingyi-doc-editor/    # 编辑器组件
│   ├── lingyi-doc-mind-map/  # 思维图引擎
│   ├── lingyi-doc-mind-map-react/  # 思维图React组件
│   ├── lingyi-doc-web/       # Web应用前端
│   ├── lingyi-doc-admin/     # 管理后台
│   └── lingyi-doc-server/    # 服务端
├── docs/                     # 架构文档
└── deploy/                   # 部署配置
```

## 快速开始

### 环境要求
- Node.js >= 18.0.0
- MySQL >= 8.0
- Redis >= 6.0

### 安装依赖

```bash
npm install
```

### 数据库初始化

```bash
# 检查数据库连接
npm run db:check

# 初始化数据库
npm run db:init

# 执行数据库迁移
npm run db:migrate

# 初始化种子数据
npm run db:seed

# 创建管理员账号
npm run admin:seed
```

### 启动服务

```bash
# 启动服务端
npm run server

# 启动前端（新终端）
npm run dev

# 启动管理后台（新终端）
npm run admin
```

## 开发命令

```bash
# 服务端开发
npm run server

# 前端开发
npm run dev

# 管理后台开发
npm run admin

# 全量构建
npm run build

# 类型检查
npm run typecheck  # 在各 package 目录下执行
```

## 部署

项目提供完整的部署配置，位于 `deploy/` 目录：

- `deploy/dev/docker-compose.mysql.yml` - MySQL Docker Compose 配置
- `deploy/dev/nginx.conf.template` - Nginx 配置模板
- `deploy/dev/ecosystem.config.cjs` - PM2 进程管理配置
- `deploy/dev/.env.example` - 环境变量示例

### Docker 部署

```bash
cd deploy/dev
cp .env.example .env
# 编辑 .env 配置数据库等信息
docker-compose -f docker-compose.mysql.yml up -d
```

### PM2 部署

```bash
npm run build
pm2 start ecosystem.config.cjs
```

## 项目模块说明

| 模块 | 说明 |
|------|------|
| `@lingyi-doc/core` | 核心引擎，包含文档模型、公式计算、图表引擎、协作同步等 |
| `@lingyi-doc/editor` | 编辑器组件库，提供表格、文档、思维笔记、白板的 React 组件 |
| `@lingyi-doc/mind-map` | 思维图核心引擎，基于 Canvas 渲染 |
| `@lingyi-doc/mind-map-react` | 思维图 React 组件封装 |
| `@lingyi-doc/web` | 面向用户的 Web 应用 |
| `@lingyi-doc/admin` | 管理后台，支持租户管理、组织管理、模板管理、审计日志等 |
| `@lingyi-doc/server` | 服务端 API，基于 NestJS |

## 架构文档

详细的架构设计文档位于 `docs/` 目录：

### 架构设计
- [文档共享架构](./docs/document-share-architecture.md)
- [知识图谱架构](./docs/knowledge-base-architecture.md)
- [协作编辑架构](./docs/collaborative-editing-architecture.md)
- [模板管理架构](./docs/template-management-architecture.md)
- [租户组织架构](./docs/tenant-org-architecture.md)
- [成员体系架构](./docs/membership-architecture.md)
- [白板架构](./docs/whiteboard-architecture.md)
- [思维图架构](./docs/mindmap-architecture.md)
- [图表系统设计](./docs/chart-system-design.md)
- [认证与权限设计](./docs/auth-and-admin-design.md)
- [服务端数据库设计](./docs/server-database-design.md)
- [API安全防护](./docs/security-api-protection.md)

### 核心系统设计
- [自研多维表格系统-详细设计方案](./docs/自研多维表格系统-详细设计方案.md)
- [自研文档编辑器-设计方案](./docs/自研文档编辑器-设计方案.md)
- [自研表格系统-技术方案设计](./docs/自研表格系统-技术方案设计.md)
- [自研表格系统-编码就绪性评估报告](./docs/自研表格系统-编码就绪性评估报告.md)
- [多维表-Canvas渲染重构方案](./docs/多维表-Canvas渲染重构方案.md)

### API 规范
- [文档共享 API](./docs/document-share-api.openapi.yaml)
- [知识图谱 API](./docs/knowledge-base-api.openapi.yaml)