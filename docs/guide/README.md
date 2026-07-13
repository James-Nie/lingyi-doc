# 零一文档（Lingyi Doc）开放能力 SDK

零一文档 SDK 是一套完整的文档处理解决方案，提供表格、多维表、画板、文档、问卷、思维笔记、思维导图等文档类型的处理能力。

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    @lingyi-doc/core                          │
│  (纯 TypeScript，零 UI 依赖)                                  │
│  数据模型 │ 渲染器 │ 公式引擎 │ 协作模块 │ IO导入导出         │
└────────────────────┬────────────────────────────────────────┘
                     │
     ┌───────────────┼───────────────────┐
     │               │                   │
     ▼               ▼                   ▼
┌────────────┐ ┌────────────────┐ ┌────────────────────────┐
│ mind-map   │ │ mind-map-react │ │       editor           │
│ (纯Canvas) │ │ (React封装)    │ │ (React + Antd)         │
└────────────┘ └────────────────┘ └────────────────────────┘
```

## 包说明

| 包名 | 说明 | 依赖 |
|------|------|------|
| `@lingyi-doc/core` | 核心引擎，提供数据模型、类型定义、渲染基础设施 | 无 UI 依赖 |
| `@lingyi-doc/editor` | React 编辑器组件库，提供开箱即用的编辑器 UI | React, Antd |
| `@lingyi-doc/mind-map` | 纯 Canvas 思维导图渲染引擎 | 无 UI 依赖 |
| `@lingyi-doc/mind-map-react` | 思维导图 React 组件封装 | React |

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

## 安装

```bash
# 核心库
npm install @lingyi-doc/core

# React 编辑器组件（需要 React 18+）
npm install @lingyi-doc/editor

# 思维导图（纯 Canvas）
npm install @lingyi-doc/mind-map

# 思维导图 React 组件
npm install @lingyi-doc/mind-map-react
```

## 快速开始

### 表格/多维表

```typescript
import { Workbook, FreeTable } from '@lingyi-doc/core';
import { FreeformSheetEditor, BaseSheetEditor } from '@lingyi-doc/editor';

// 创建工作簿
const workbook = new Workbook();
workbook.addSheet('Sheet1');

// 获取表格实例
const sheet = workbook.getActiveSheet();
```

### 富文本文档

```typescript
import { RichDocument } from '@lingyi-doc/core';
import { RichDocEditor } from '@lingyi-doc/editor';

// 创建文档
const doc = new RichDocument();
```

### 思维导图

```typescript
import { MindmapEngine } from '@lingyi-doc/mind-map';
import { MindmapView } from '@lingyi-doc/mind-map-react';

// 创建引擎
const engine = new MindmapEngine({ mode: 'standalone' });
```

### 画板

```typescript
import { WhiteboardDocument } from '@lingyi-doc/core';
import { WhiteboardEditor } from '@lingyi-doc/editor';

// 创建画板
const whiteboard = new WhiteboardDocument();
```

## API 文档

详细 API 文档请参考：

- [lingyi-doc-core API](./api/lingyi-doc-core.md)
- [lingyi-doc-editor API](./api/lingyi-doc-editor.md)
- [lingyi-doc-mind-map API](./api/lingyi-doc-mind-map.md)
- [lingyi-doc-mind-map-react API](./api/lingyi-doc-mind-map-react.md)

## 二次开发指南

请参考 [二次开发指南](./development.md)

## 许可证

私有项目，未经授权禁止使用。
