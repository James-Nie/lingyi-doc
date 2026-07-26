# 零一文档

零一文档是一个功能完整的智能云文档系统，支持多维表格、富文本文档、思维笔记、白板与问卷等多种文档类型，提供实时协作、知识库、AI 与 MCP 等能力。

本仓库为 **npm workspaces monorepo**：核心引擎与编辑器按域拆包，产品侧通过聚合门面兼容；部分包按 **Open Core** 策略可独立开源。

## 系统定位

零一文档是一个**开源优先、商业增强**的智能云文档平台，面向企业和团队提供**多租户 SaaS** 与**私有化部署**双形态解决方案。

### 核心价值

- **开放架构**：基于 Open Core 策略，核心引擎与编辑器完全开源
- **企业级能力**：多租户隔离、组织管理、权限控制、审计日志
- **模块化设计**：按需启用功能模块，灵活适配不同业务场景
- **AI 增强**：集成 AI 助手与知识库 RAG，提升文档智能化水平

## 能力模块

### 文档类型

| 模块          | 说明                                      | 开源状态   |
| ----------- | --------------------------------------- | ------ |
| **多维表格**    | 多种字段类型与视图（表格/日历/看板/甘特/画廊）、公式引擎、条件格式、仪表盘 | ✅ 完全开源 |
| **富文本文档**   | 标题、列表、表格、代码块、Markdown/Mermaid、大纲导航      | ⚙️ 计划中 |
| **思维笔记/导图** | Canvas 引擎、主题、节点样式、大纲视图                  | ✅ 完全开源 |
| **白板**      | 自由画布、连接线、形状、嵌入思维图                       | ✅ 完全开源 |
| **问卷**      | 表单设计、数据收集与分析                            | ⚙️ 计划中 |

### 核心能力

| 能力         | 说明                                          | 开源状态     |
| ---------- | ------------------------------------------- | -------- |
| **实时协作**   | CRDT 同步、Hybrid Logical Clock、WebSocket 多人编辑 | ⚙️ 企业版功能 |
| **导入导出**   | DOCX/XLSX/Markdown 格式支持                     | ✅ 完全开源   |
| **知识库**    | 文档组织、搜索、权限管理                                | ⚙️ 企业版功能 |
| **AI 助手**  | 智能写作、内容生成、RAG 检索增强                          | ⚙️ 企业版功能 |
| **MCP 集成** | Model Context Protocol，AI 与业务系统深度集成         | ⚙️ 企业版功能 |

### 企业管理

| 模块        | 说明                  | 开源状态     |
| --------- | ------------------- | -------- |
| **多租户架构** | 租户隔离、数据隔离、资源配额      | ⚙️ 企业版功能 |
| **组织管理**  | 组织、部门、岗位、角色权限       | ⚙️ 企业版功能 |
| **会员体系**  | 个人/团队计划、功能授权        | ⚙️ 企业版功能 |
| **管理后台**  | 租户管理、模板管理、审计日志、系统配置 | ⚙️ 企业版功能 |

## 开源范围

### 开源组件（Open Core）

- **核心引擎**：文档模型、协作引擎、导入导出
- **编辑器**：富文本、表格、思维导图、白板编辑器
- **基础服务**：多租户架构、组织管理、权限控制
- **管理后台**：基础管理功能

### 商业增强

- **AI 能力**：AI 助手、知识库 RAG、MCP 集成
- **企业功能**：高级审计、企业安全、专属技术支持
- **专业服务**：定制开发、私有化部署支持

### 开源协议

- **核心引擎**：MIT License
- **编辑器组件**：MIT License
- **商业组件**：商业许可（详见 [LICENSE](./LICENSE)）

## 对外提供的服务

### 云服务（SaaS）

- **零一文档在线版**：完整的云文档协作平台
- **API 服务**：RESTful API 接口调用
- **SDK 支持**：JavaScript/TypeScript SDK

### 私有化部署

- **标准部署**：Docker 容器化部署方案
- **企业部署**：定制化私有云部署
- **混合部署**：公私有云混合架构

### 技术支持

- **社区支持**：GitHub Issues、社区论坛
- **企业支持**：专属技术顾问、7x24 响应
- **培训服务**：系统使用培训、技术架构培训

## 授权方式

### 功能模块授权

```
License > ENABLED_MODULES > Community > SaaS 全开
```

| 版本               | 功能范围           | 适用场景       |
| ---------------- | -------------- | ---------- |
| **Community**    | 核心文档功能、基础协作    | 个人开发者、小型团队 |
| **Professional** | 全功能、基础 AI      | 中型企业       |
| **Enterprise**   | 全功能、高级 AI、企业安全 | 大型企业、政府机构  |

### 部署授权

| 类型       | 说明         | 限制      |
| -------- | ---------- | ------- |
| **开发授权** | 免费、无限制     | 仅用于开发测试 |
| **生产授权** | 按用户数/节点数授权 | 需购买商业许可 |

## 合作方式

### 开源贡献

- **代码贡献**：欢迎提交 PR 参与项目开发
- **问题反馈**：通过 GitHub Issues 报告问题
- **功能建议**：社区讨论功能需求

### 商业合作

- **渠道合作**：代理销售、集成合作
- **技术合作**：SDK 集成、API 对接
- **定制开发**：企业定制功能开发

### 生态合作

- **插件开发**：开发文档类型插件
- **模板市场**：贡献文档模板
- **集成方案**：与第三方系统集成

## 技术栈

- **前端**：React 18、TypeScript、Vite、Ant Design
- **后端**：NestJS、TypeORM、MySQL、Redis、WebSocket
- **存储 / 认证**：阿里云 OSS、阿里云短信

## 快速开始

### 环境要求

- Node.js >= 18.0.0
- MySQL >= 8.0
- Redis >= 6.0

### 安装部署

```bash
# 克隆仓库
git clone https://github.com/your-org/lingyi-doc.git
cd lingyi-doc

# 安装依赖
npm install

# 初始化数据库
npm run db:init
npm run db:migrate

# 启动服务
npm run server   # API 服务（默认 :3000）
npm run dev      # Web 前端
npm run admin    # 管理后台
```

### Docker 部署（推荐）

```bash
# 复制配置文件
cp deploy/docker/.env.example deploy/docker/.env

# 启动服务（包含 MySQL）
npm run docker:up -- --with-mysql --migrate

# 访问服务
# Web: http://localhost:3000
# Admin: http://localhost:3001
# API: http://localhost:3000/api
```

### Open Core Demo

```bash
# 思维导图离线演示
npm run demo:mind-map
# 访问 http://localhost:5179，无需账号
```

## 开发指南

### 常用命令

```bash
npm run build          # 全量构建
npm run typecheck      # 类型检查
npm run test           # 运行测试
```

### 包管理

- `@lingyi-doc/core-*`：核心引擎包
- `@lingyi-doc/editor-*`：编辑器组件
- `@lingyi-doc/web`：用户端应用
- `@lingyi-doc/admin`：管理后台
- `@lingyi-doc/server`：服务端 API

## 部署方案

### Docker 部署（推荐）

```bash
cp deploy/docker/.env.example deploy/docker/.env
npm run docker:up -- --with-mysql --migrate
```

### 传统部署

```bash
npm run build
npm run deploy:dev
```

详见 [部署文档](./deploy/docker/README.md)。

## 文档

### 核心文档

- [会员功能对照表](./docs/architecture/membership-account-feature-matrix.md)
- [API 文档](./docs/api/openapi/document-share-api.yaml)
- [SDK 文档](./docs/guide/README.md)

### 架构设计

- [协作编辑架构](./docs/architecture/collaborative-editing-architecture.md)
- [知识库架构](./docs/architecture/knowledge-base-architecture.md)
- [权限体系](./docs/architecture/auth-and-admin-design.md)

## 社区与支持

### 加入社区

- **GitHub**: [https://github.com/James-Nie/lingyi-doc](https://github.com/your-org/lingyi-doc)
- **Issues**: 问题反馈与功能建议
- **Discussions**: 社区讨论

### 商业支持

- **企业版咨询**: <contact@lingyi-doc.com>
- **技术支持**: <support@lingyi-doc.com>
- **定制开发**: 根据需求提供定制化解决方案

