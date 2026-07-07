# 模板管理模块 — 方案设计

> **版本**：v1.0  
> **日期**：2026-07-04  
> **范围**：管理后台模板 CRUD + C 端模板中心 API 化

---

## 1. 背景与目标

### 现状

| 维度 | 现状 |
|------|------|
| C 端模板中心 | `packages/lingyi-doc-web/src/templates/docTemplates.ts` 硬编码 26 个模板 |
| 模板内容 | 富文本 JSON / Workbook 工厂 / 思维笔记 JSON 内联在前端 |
| 服务端 | 无模板实体与 API；创建文档走通用 `POST /docs` |
| 管理后台 | 无模板管理模块 |

### 目标

1. **管理后台**：支持模板的创建、查看、编辑、更新、删除、发布/下架
2. **C 端模板中心**：从服务端拉取已发布模板，与现有 UI（分类、搜索、预览、使用）兼容
3. **平滑迁移**：API 不可用时回退本地硬编码模板，保证开发体验

---

## 2. 总体架构

```
┌─────────────────────┐         ┌──────────────────────────────┐
│  lingyi-doc-admin   │  CRUD   │  lingyi-doc-server           │
│  模板管理页面        │ ──────► │  /api/v1/admin/templates     │
└─────────────────────┘         │  /api/v1/c/templates         │
                                └──────────────┬───────────────┘
┌─────────────────────┐  列表/详情            │
│  lingyi-doc-web     │ ◄─────────────────────┘
│  TemplatePicker     │  使用模板 → POST /docs（不变）
└─────────────────────┘
```

### 职责划分

| 层 | 职责 |
|----|------|
| **doc_templates 表** | 模板元数据 + `content_json` 快照 |
| **Admin API** | 全量 CRUD、状态流转、审计日志 |
| **Consumer API** | 仅返回 `status=published` 的模板 |
| **C 端** | 列表/详情拉取 + 映射为 `DocTemplate` + 现有创建流程 |

---

## 3. 数据模型

### 3.1 表：`doc_templates`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(64) PK | 模板 slug，如 `weekly-report` |
| title | VARCHAR(200) | 展示标题 |
| subtitle | VARCHAR(500) | 副标题 |
| doc_type | VARCHAR(20) | `richtext` \| `freeform` \| `base` \| `mindnote` \| `slides` |
| document_title | VARCHAR(500) | 创建文档时的默认标题 |
| categories | JSON | 分类 ID 数组，如 `["recommended","report"]` |
| usage_label | VARCHAR(100) | 展示用量文案，如「39.9 万人已使用」 |
| is_new | TINYINT(1) | 是否标记 NEW |
| is_blank | TINYINT(1) | 是否空白模板 |
| thumb_gradient | VARCHAR(500) | 卡片缩略图渐变 CSS |
| content_json | JSON | 模板内容快照（见 3.2） |
| status | VARCHAR(20) | `draft` \| `published` \| `archived` |
| sort_order | INT | 排序权重，越大越靠前 |
| use_count | INT | 使用次数（预留统计） |
| created_by | CHAR(36) | 创建人（管理员） |
| updated_by | CHAR(36) | 最后更新人 |
| published_at | TIMESTAMP | 首次/最近发布时间 |
| is_deleted | TINYINT(1) | 软删除 |
| created_at / updated_at | TIMESTAMP | 时间戳 |

**索引**：`(status, is_deleted, sort_order)`、`doc_type`

### 3.2 内容格式 `content_json`

与现有 C 端创建逻辑对齐：

| doc_type | content_json 结构 |
|----------|-------------------|
| richtext | `RichDocumentJSON`（`content` 数组） |
| mindnote | `MindNoteJSON` |
| freeform / base | `Workbook.toJSON()` 结果 |
| slides | 预留，暂不支持创建 |
| 空白模板 | `null`（`is_blank=1`） |

### 3.3 分类

分类枚举保留在前端常量 `TEMPLATE_CATEGORIES`（推荐、最新、热门、项目管理等），数据库只存 category id 数组，便于 UI 侧栏复用。

---

## 4. API 设计

### 4.1 管理端 ` /api/v1/admin/templates`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/` | `template:read` | 分页列表，支持 keyword/docType/status |
| GET | `/:id` | `template:read` | 详情（含 content_json） |
| POST | `/` | `template:write` | 创建 |
| PUT | `/:id` | `template:write` | 更新 |
| PATCH | `/:id/status` | `template:write` | 发布/下架/归档 |
| DELETE | `/:id` | `template:write` | 软删除 |

**列表响应（不含 content_json）**：

```json
{
  "items": [{
    "id": "weekly-report",
    "title": "工作周报",
    "docType": "richtext",
    "status": "published",
    "categories": ["recommended", "report"],
    "sortOrder": 100,
    "updatedAt": 1710000000000
  }],
  "total": 26,
  "page": 1,
  "pageSize": 20
}
```

### 4.2 C 端 `/api/v1/c/templates`

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/` | 可选 JWT | 已发布模板列表（不含 content_json） |
| GET | `/:id` | 可选 JWT | 详情（含 content_json，供预览/创建） |

查询参数与 C 端 `filterTemplates` 对齐：`category`、`docType`、`query`。

### 4.3 权限码

| 权限 | 说明 |
|------|------|
| `template:read` | 查看模板列表与详情 |
| `template:write` | 创建、编辑、删除、发布 |

`super_admin`、`operator` 默认拥有；`support` 只读。

---

## 5. 管理后台 UI

### 5.1 页面

| 路由 | 页面 | 功能 |
|------|------|------|
| `/templates` | TemplatesPage | 列表、搜索、筛选、新建、删除、发布 |
| `/templates/new` | TemplateEditPage | 创建表单 |
| `/templates/:id` | TemplateDetailPage | 查看元数据与 JSON 内容 |
| `/templates/:id/edit` | TemplateEditPage | 编辑表单 |

### 5.2 表单字段

- 基本信息：ID、标题、副标题、文档类型、创建标题
- 展示：分类（多选）、用量文案、NEW 标记、缩略图渐变、排序
- 内容：`content_json`（JSON 文本域，空白模板可留空）
- 状态：草稿 / 已发布 / 已归档

### 5.3 操作流

```
创建(草稿) → 编辑内容 → 发布 → C端可见
                ↓
            下架/归档 → C端不可见
```

---

## 6. C 端改造

### 6.1 数据流

1. `TemplatePickerModal` 打开时调用 `GET /api/v1/c/templates`
2. 成功则使用 API 数据；失败或空则回退 `DOC_TEMPLATES`
3. 预览/使用时，若列表无 `contentJson`，懒加载 `GET /api/v1/c/templates/:id`
4. `mapApiTemplateToDocTemplate()` 转为现有 `DocTemplate` 结构
5. `createDocumentFromTemplate()` **不变**

### 6.2 兼容性

- `DocTemplate` 接口保持不变
- 分类侧栏、类型筛选、预览组件无需大改
- 本地硬编码作为 fallback，便于离线开发

---

## 7. 迁移与种子数据

### Phase 1（本次）

- 新建表 + API + 管理后台 + C 端接入
- 迁移 SQL 种子：6 个空白模板 + 2 个示例子模板
- 其余模板可通过管理后台导入，或后续运行导出脚本批量导入

### Phase 2（后续）

- 一键脚本：从前端 `DOC_TEMPLATES` 导出 JSON 批量入库
- 模板使用次数统计（创建文档时上报 templateId）
- 缩略图上传（OSS）替代 CSS 渐变
- 可视化内容编辑器（替代 JSON 文本域）

---

## 8. 文件清单（实现）

```
packages/lingyi-doc-server/
  scripts/migrations/20260704_doc_templates.sql
  src/database/entities/doc-template.entity.ts
  src/repositories/doc-template.repository.ts
  src/types/template.ts
  src/modules/template/
    template.module.ts
    template.service.ts
    admin-template.controller.ts
    template.controller.ts

packages/lingyi-doc-admin/
  src/pages/templates/
    templateConstants.ts
    TemplatesPage.tsx
    TemplateDetailPage.tsx
    TemplateEditPage.tsx

packages/lingyi-doc-web/
  src/api/template.ts
  src/templates/mapApiTemplate.ts
  src/components/templates/TemplatePickerModal.tsx  (改造)
```

---

## 9. 风险与约束

| 项 | 说明 |
|----|------|
| JSON 编辑门槛 | 首版用 JSON 文本域，运营需了解文档结构 |
| slides 类型 | 仍标记「开发中」，不在 API 层强制拦截 |
| 大 JSON | `content_json` 存 MySQL JSON 列，单模板 Workbook 通常 < 500KB |
| 并发编辑 | 首版无乐观锁，后接 `updated_at` 校验 |
