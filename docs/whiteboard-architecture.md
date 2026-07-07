# 画板（Whiteboard）技术方案

## 1. 目标

在现有云文档体系中新增 `docType: whiteboard` 文档类型，提供无限画布协作能力，UI 对齐设计稿：

- 左侧浮动工具栏（选择、形状、文本、便签、连接线、分区、表格、画笔、思维导图等）
- 工具二级面板（形状库、便签颜色、连接线样式、分区比例、画笔调色板、思维导图模板）
- 右下视图控件（撤销/重做、抓手、缩放）
- 画布元素：几何形状、文本、便签、连接线、分区框、表格、自由画笔、简易思维导图

## 2. 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│  lingyi-doc-web                                             │
│  WhiteboardEditorPage  ── DocumentBar / SaveManager         │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  lingyi-doc-editor                                          │
│  WhiteboardEditor → Toolbar + Canvas + Controls             │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  lingyi-doc-core                                            │
│  WhiteboardDocument（元素模型、undo/redo、JSON 序列化）        │
│  DocumentManager.create/load/saveWhiteboard                   │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  lingyi-doc-server                                          │
│  documents.doc_type = 'whiteboard'（VARCHAR，无需 migration） │
└─────────────────────────────────────────────────────────────┘
```

## 3. 数据模型

### 3.1 文档 JSON（WhiteboardJSON）

| 字段 | 说明 |
|------|------|
| `documentId` | 文档 ID |
| `title` | 标题 |
| `viewport` | `{ x, y, zoom }` 视口平移与缩放 |
| `elements` | 画布元素数组，按 `zIndex` 排序 |

### 3.2 元素类型

| type | 用途 | 关键字段 |
|------|------|----------|
| `shape` | 几何/流程图形状 | `shapeKind`, `fill`, `stroke`, `text` |
| `text` | 独立文本框 | `text`, `fontSize`, `color` |
| `sticky` | 便签 | `text`, `color`（9 色预设） |
| `connector` | 连接线 | `style`, `points[]`, `arrowEnd` |
| `section` | 分区/画板框 | `title`, `aspect` |
| `table` | 简易表格 | `rows`, `cols`, `cells[][]` |
| `pen` | 自由画笔 | `points[]`, `color`, `strokeWidth`, `mode` |
| `mindmap` | 画布内思维导图 | `root` 节点树 + 布局方向 |
| `image` | 图片 | `src`（URL / data URL） |

所有元素继承基类：`id, type, x, y, width, height, rotation?, zIndex, locked?`。

### 3.3 历史记录

`WhiteboardDocument` 内置 undo/redo 栈（与 `MindNoteDocument` 相同模式），每次结构性变更 push snapshot。

## 4. 渲染方案

采用 **HTML + SVG 混合渲染**（不引入 Konva/Fabric 等新依赖）：

- 外层容器：`overflow: hidden`，监听 wheel 缩放、空格/中键平移
- 画布层：`transform: translate(viewport.x, viewport.y) scale(viewport.zoom)`
- 形状/文本/便签/表格：`position: absolute` 的 HTML 节点
- 连接线/画笔：`SVG path`  overlay
- 选中态：虚线边框 + 8 向 resize handle

坐标换算：`screenToCanvas(clientX, clientY)` 逆变换 viewport。

## 5. 交互与工具

| 工具 | 行为 |
|------|------|
| select | 点击选中，拖拽移动，handle 缩放 |
| shape | 二级面板选形状 → 点击/拖拽创建 |
| text | 点击创建文本框，双击编辑 |
| sticky | 选颜色 → 点击创建便签 |
| connector | 选线型 → 拖拽两点创建 |
| section | 选比例 → 拖拽创建分区 |
| table | 点击创建 3×3 默认表格 |
| pen | 右下画笔面板：笔/荧光笔/橡皮，拖拽绘制 |
| mindmap | 选模板 → 在画布中心插入节点树 |

快捷键：`V` 选择、`T` 文本、`P` 画笔、`N` 便签、`Shift+S` 分区。

## 6. 持久化

- 创建：`POST /docs { docType: 'whiteboard', data: WhiteboardJSON }`
- 加载：`GET /docs/:id` → `WhiteboardDocument.fromJSON`
- 保存：`PUT /docs/:id` 全量 JSON；后续可扩展 patch

## 7. Web 集成点

| 文件 | 变更 |
|------|------|
| `CreateDocMenu` | `whiteboard` → `onCreate('whiteboard')` |
| `docTypeMeta` | 画板图标/颜色 |
| `DocPublicEditorPage` / `UnifiedEditorPage` / `WikiSpaceDocEditor` | 路由到 `WhiteboardEditorPage` |
| `DocumentPreviewView` | 只读画板预览 |
| `createFromTemplate` / `docTemplates` | 空白画板模板 |
| `DocumentManager.duplicate` | 复制 whiteboard |

## 8. 分期交付

**MVP（本次）**：完整模型 + 工具栏 UI + 基础元素 CRUD + 平移缩放 + undo/redo + 创建/打开/保存。

**后续迭代**：元素成组、对齐参考线、评论锚点、协同 OT、表格嵌入 freeform 引擎、更多形状库。
