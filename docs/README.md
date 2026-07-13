# 零一文档（Lingyi Doc）开发文档

零一文档是一套完整的文档处理解决方案，提供表格、多维表、画板、文档、问卷、思维笔记、思维导图等文档类型的处理能力。

## 目录结构

```
docs/
├── README.md                              # 本文档
├── guide/                                 # 开发指南
│   ├── README.md                          # SDK 总览
│   └── development.md                     # 二次开发指南
├── architecture/                          # 架构设计
│   ├── auth-and-admin-design.md           # 权限管理设计
│   ├── collaborative-editing-architecture.md  # 协同编辑架构
│   ├── document-share-architecture.md     # 文档分享架构
│   ├── knowledge-base-architecture.md     # 知识库架构
│   ├── membership-architecture.md         # 成员管理架构
│   ├── mindmap-architecture.md            # 思维导图架构
│   ├── server-database-design.md          # 服务端数据库设计
│   ├── template-management-architecture.md # 模板管理架构
│   ├── tenant-org-architecture.md         # 租户组织架构
│   └── whiteboard-architecture.md         # 画板架构
├── design/                                # 技术方案
│   ├── base-canvas-render-refactor.md     # 多维表 Canvas 渲染重构
│   ├── base-system-detailed-design.md     # 多维表系统详细设计
│   ├── chart-system-design.md             # 图表系统设计
│   ├── rich-text-editor-design.md         # 富文本编辑器设计
│   └── spreadsheet-system-design.md       # 表格系统技术方案
├── api/                                   # API 文档
│   ├── openapi/                           # OpenAPI 规范
│   │   ├── document-share-api.yaml        # 文档分享 API
│   │   └── knowledge-base-api.yaml        # 知识库 API
│   └── sdk/                               # SDK API 文档
│       ├── lingyi-doc-core.md             # 核心引擎 API
│       ├── lingyi-doc-editor.md           # 编辑器组件 API
│       ├── lingyi-doc-mind-map.md         # 思维导图引擎 API
│       └── lingyi-doc-mind-map-react.md   # 思维导图 React 组件 API
├── security/                              # 安全相关
│   └── security-api-protection.md         # API 安全防护
└── assessment/                            # 评估报告
    └── spreadsheet-readiness-assessment.md # 表格系统编码就绪性评估
```

---

## 按角色导航

### 第三方开发者（二次开发）

1. **快速开始** → [SDK 总览](./guide/README.md)
2. **环境准备** → [二次开发指南](./guide/development.md)
3. **API 参考** → [SDK API 文档](./api/sdk/)

### 架构师

1. **系统架构** → [协同编辑架构](./architecture/collaborative-editing-architecture.md)
2. **数据库设计** → [服务端数据库设计](./architecture/server-database-design.md)
3. **业务架构** → [知识库架构](./architecture/knowledge-base-architecture.md) / [文档分享架构](./architecture/document-share-architecture.md)

### 产品经理

1. **功能设计** → [多维表系统详细设计](./design/base-system-detailed-design.md)
2. **功能设计** → [富文本编辑器设计](./design/rich-text-editor-design.md)
3. **功能设计** → [思维导图架构](./architecture/mindmap-architecture.md)

---

## 按功能导航

### 表格/多维表

- **架构** → [多维表系统详细设计](./design/base-system-detailed-design.md)
- **渲染** → [多维表 Canvas 渲染重构](./design/base-canvas-render-refactor.md)
- **评估** → [表格系统编码就绪性评估](./assessment/spreadsheet-readiness-assessment.md)
- **API** → [lingyi-doc-core](./api/sdk/lingyi-doc-core.md) / [lingyi-doc-editor](./api/sdk/lingyi-doc-editor.md)

### 富文本文档

- **设计** → [富文本编辑器设计](./design/rich-text-editor-design.md)
- **API** → [lingyi-doc-core](./api/sdk/lingyi-doc-core.md) / [lingyi-doc-editor](./api/sdk/lingyi-doc-editor.md)

### 思维导图/思维笔记

- **架构** → [思维导图架构](./architecture/mindmap-architecture.md)
- **API** → [lingyi-doc-mind-map](./api/sdk/lingyi-doc-mind-map.md) / [lingyi-doc-mind-map-react](./api/sdk/lingyi-doc-mind-map-react.md)

### 画板

- **架构** → [画板架构](./architecture/whiteboard-architecture.md)
- **API** → [lingyi-doc-core](./api/sdk/lingyi-doc-core.md) / [lingyi-doc-editor](./api/sdk/lingyi-doc-editor.md)

### 图表

- **设计** → [图表系统设计](./design/chart-system-design.md)
- **API** → [lingyi-doc-core](./api/sdk/lingyi-doc-core.md) / [lingyi-doc-editor](./api/sdk/lingyi-doc-editor.md)

---

## SDK 包说明

| 包名 | 说明 | 依赖 |
|------|------|------|
| `@lingyi-doc/core` | 核心引擎，提供数据模型、类型定义、渲染基础设施 | 无 UI 依赖 |
| `@lingyi-doc/editor` | React 编辑器组件库，提供开箱即用的编辑器 UI | React, Antd |
| `@lingyi-doc/mind-map` | 纯 Canvas 思维导图渲染引擎 | 无 UI 依赖 |
| `@lingyi-doc/mind-map-react` | 思维导图 React 组件封装 | React |

---

## 文档类型支持

| 文档类型 | 核心模型 | 渲染器 | 编辑器组件 |
|---------|---------|--------|-----------|
| 普通表格 | Workbook + FreeTable | ViewportManager | FreeformSheetEditor |
| 多维表 | Workbook + FreeTable | Kanban/Gantt/Calendar/Gallery | BaseSheetEditor |
| 富文本文档 | RichDocument | - | RichDocEditor |
| 思维笔记 | MindNoteDocument | MindmapEngine | MindNoteEditor |
| 画板 | WhiteboardDocument | MindmapEngine | WhiteboardEditor |
| 问卷 | Workbook (表单视图) | - | PublicFormFillView |
| 图表 | ChartInstance | ChartEngine | ChartEditor |

---

## 联系方式

如有问题，请通过以下方式联系：

- 提交 Issue: [GitHub Issues](https://github.com/your-repo/issues)
- 邮件: dev@lingyi-doc.com
