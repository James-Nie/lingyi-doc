# 二次开发指南

本指南帮助第三方开发者基于零一文档 SDK 进行二次开发。

## 目录

- [环境准备](#环境准备)
- [项目集成](#项目集成)
- [按需引入](#按需引入)
- [扩展开发](#扩展开发)
- [自定义主题](#自定义主题)
- [插件开发](#插件开发)
- [API 扩展](#api-扩展)
- [常见问题](#常见问题)

---

## 环境准备

### 系统要求

- Node.js 16+
- npm 7+ 或 yarn 1.22+
- TypeScript 4.7+

### 依赖要求

```json
{
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "antd": "^6.0.0"
}
```

### 安装

```bash
# 安装核心库
npm install @lingyi-doc/core

# 安装编辑器组件（需要 React）
npm install @lingyi-doc/editor

# 安装思维导图（纯 Canvas，无 React 依赖）
npm install @lingyi-doc/mind-map

# 安装思维导图 React 组件
npm install @lingyi-doc/mind-map-react
```

---

## 项目集成

### 1. 基础集成

```tsx
// App.tsx
import React, { useState } from 'react';
import { Workbook } from '@lingyi-doc/core';
import { 
  FreeformSheetEditor, 
  SheetAntdProvider 
} from '@lingyi-doc/editor';

function App() {
  const [workbook] = useState(() => new Workbook());

  return (
    <SheetAntdProvider>
      <FreeformSheetEditor
        workbook={workbook}
        readOnly={false}
      />
    </SheetAntdProvider>
  );
}
```

### 2. 多文档类型集成

```tsx
import React, { useState } from 'react';
import { 
  Workbook, 
  RichDocument, 
  MindNoteDocument, 
  WhiteboardDocument 
} from '@lingyi-doc/core';
import {
  FreeformSheetEditor,
  BaseSheetEditor,
  RichDocEditor,
  MindNoteEditor,
  WhiteboardEditor,
  SheetAntdProvider,
} from '@lingyi-doc/editor';

function App() {
  const [activeTab, setActiveTab] = useState('sheet');
  
  const [workbook] = useState(() => new Workbook());
  const [doc] = useState(() => new RichDocument());
  const [mindnote] = useState(() => new MindNoteDocument());
  const [whiteboard] = useState(() => new WhiteboardDocument());

  return (
    <SheetAntdProvider>
      <div>
        <nav>
          <button onClick={() => setActiveTab('sheet')}>表格</button>
          <button onClick={() => setActiveTab('doc')}>文档</button>
          <button onClick={() => setActiveTab('mindnote')}>思维笔记</button>
          <button onClick={() => setActiveTab('whiteboard')}>画板</button>
        </nav>
        
        <main>
          {activeTab === 'sheet' && (
            <BaseSheetEditor workbook={workbook} />
          )}
          {activeTab === 'doc' && (
            <RichDocEditor document={doc} />
          )}
          {activeTab === 'mindnote' && (
            <MindNoteEditor document={mindnote} />
          )}
          {activeTab === 'whiteboard' && (
            <WhiteboardEditor document={whiteboard} />
          )}
        </main>
      </div>
    </SheetAntdProvider>
  );
}
```

---

## 按需引入

### 减少打包体积

```typescript
// 错误：引入整个包
import { Workbook } from '@lingyi-doc/core';

// 正确：按需引入子模块
import { Workbook } from '@lingyi-doc/core/model';
import { CellValue } from '@lingyi-doc/core/types';
import { ViewportManager } from '@lingyi-doc/core/renderer';
```

### 编辑器组件按需引入

```typescript
// 错误：引入所有组件
import { FreeformSheetEditor, BaseSheetEditor, RichDocEditor } from '@lingyi-doc/editor';

// 正确：只引入需要的组件
import { FreeformSheetEditor } from '@lingyi-doc/editor/components';
```

---

## 扩展开发

### 1. 自定义单元格渲染

```typescript
import { CellRenderer, CellData, CellCoord } from '@lingyi-doc/core';

class CustomCellRenderer extends CellRenderer {
  renderCell(ctx: CanvasRenderingContext2D, coord: CellCoord, data: CellData) {
    // 调用父类渲染
    super.renderCell(ctx, coord, data);
    
    // 添加自定义渲染
    if (data.value.type === 'text' && data.value.value.startsWith('特殊:')) {
      ctx.fillStyle = '#ff4d4f';
      ctx.fillText('特殊标记', coord.col * 100, coord.row * 30);
    }
  }
}
```

### 2. 自定义工具栏

```tsx
import React from 'react';
import { Toolbar } from '@lingyi-doc/editor';
import { Workbook } from '@lingyi-doc/core';

interface CustomToolbarProps {
  workbook: Workbook;
}

const CustomToolbar: React.FC<CustomToolbarProps> = ({ workbook }) => {
  const handleCustomAction = () => {
    // 自定义操作
    console.log('执行自定义操作');
  };

  return (
    <div className="custom-toolbar">
      <Toolbar workbook={workbook} />
      <button onClick={handleCustomAction}>自定义按钮</button>
    </div>
  );
};
```

### 3. 自定义右键菜单

```tsx
import React from 'react';
import { ContextMenu } from '@lingyi-doc/editor';

interface CustomContextMenuProps {
  visible: boolean;
  position: { x: number; y: number };
  onClose: () => void;
}

const CustomContextMenu: React.FC<CustomContextMenuProps> = ({
  visible,
  position,
  onClose,
}) => {
  const items = [
    { key: 'copy', label: '复制' },
    { key: 'paste', label: '粘贴' },
    { key: 'delete', label: '删除' },
    { key: 'custom', label: '自定义操作' },
  ];

  const handleClick = (key: string) => {
    if (key === 'custom') {
      console.log('执行自定义操作');
    }
    onClose();
  };

  return (
    <ContextMenu
      visible={visible}
      position={position}
      items={items}
      onClick={handleClick}
      onClose={onClose}
    />
  );
};
```

---

## 自定义主题

### 1. 思维导图主题

```typescript
import { resolveTheme, MindmapTheme } from '@lingyi-doc/mind-map';

// 创建自定义主题
const customTheme: MindmapTheme = resolveTheme('default', {
  id: 'my-theme',
  name: '我的主题',
  background: '#f5f5f5',
  node: {
    root: {
      fill: '#1890ff',
      stroke: '#1890ff',
      strokeWidth: 2,
      borderRadius: 8,
      textColor: '#ffffff',
      fontSize: 16,
    },
    level1: {
      fill: '#e6f7ff',
      stroke: '#1890ff',
      strokeWidth: 1,
      borderRadius: 4,
      textColor: '#000000',
      fontSize: 14,
    },
    level2: {
      fill: '#ffffff',
      stroke: '#d9d9d9',
      strokeWidth: 1,
      borderRadius: 4,
      textColor: '#000000',
      fontSize: 13,
    },
    default: {
      fill: '#ffffff',
      stroke: '#d9d9d9',
      strokeWidth: 1,
      borderRadius: 4,
      textColor: '#000000',
      fontSize: 12,
    },
  },
  branch: {
    color: '#1890ff',
    width: 2,
    style: 'curve',
  },
  text: {
    color: '#000000',
    fontSize: 14,
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
  },
});

// 使用自定义主题
<MindmapView
  root={root}
  structure="right"
  branchStyle="curve"
  themeId="my-theme"
/>
```

### 2. 表格主题

```typescript
import { BASE_THEME } from '@lingyi-doc/core';

// 自定义表格主题
const customSheetTheme = {
  ...BASE_THEME,
  backgroundColor: '#ffffff',
  gridLineColor: '#e8e8e8',
  selectionColor: '#1890ff',
  headerBackgroundColor: '#fafafa',
  headerTextColor: '#000000',
  cellTextColor: '#000000',
  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
  fontSize: 14,
};
```

---

## 插件开发

### 1. 插件接口

```typescript
interface LingyiPlugin {
  name: string;
  version: string;
  
  // 生命周期
  onInit?: (context: PluginContext) => void;
  onDestroy?: () => void;
  
  // 功能扩展
  renderToolbar?: () => React.ReactNode;
  renderSidebar?: () => React.ReactNode;
  renderContextMenu?: (items: ContextMenuItem[]) => ContextMenuItem[];
  
  // 事件监听
  onCellChange?: (coord: CellCoord, value: CellValue) => void;
  onSelectionChange?: (range: CellRange | null) => void;
}

interface PluginContext {
  workbook: Workbook;
  viewport: ViewportManager;
  // ... 其他上下文
}
```

### 2. 插件注册

```typescript
import { Workbook } from '@lingyi-doc/core';

class PluginManager {
  private plugins: Map<string, LingyiPlugin> = new Map();
  
  register(plugin: LingyiPlugin) {
    this.plugins.set(plugin.name, plugin);
  }
  
  unregister(name: string) {
    this.plugins.delete(name);
  }
  
  initPlugins(context: PluginContext) {
    this.plugins.forEach(plugin => {
      plugin.onInit?.(context);
    });
  }
  
  destroyPlugins() {
    this.plugins.forEach(plugin => {
      plugin.onDestroy?.();
    });
  }
}

// 使用
const manager = new PluginManager();
manager.register(myPlugin);
manager.initPlugins({ workbook, viewport });
```

### 3. 示例插件：数据校验

```typescript
interface ValidationPluginOptions {
  rules: ValidationRule[];
}

class ValidationPlugin implements LingyiPlugin {
  name = 'validation';
  version = '1.0.0';
  
  private options: ValidationPluginOptions;
  private workbook?: Workbook;
  
  constructor(options: ValidationPluginOptions) {
    this.options = options;
  }
  
  onInit(context: PluginContext) {
    this.workbook = context.workbook;
  }
  
  onCellChange(coord: CellCoord, value: CellValue) {
    if (!this.workbook) return;
    
    // 执行校验
    for (const rule of this.options.rules) {
      if (rule.field === coord.col) {
        const error = rule.validate(value);
        if (error) {
          console.error(`单元格 (${coord.row}, ${coord.col}) 校验失败: ${error}`);
          // 显示错误提示
        }
      }
    }
  }
}

// 使用
const validationPlugin = new ValidationPlugin({
  rules: [
    {
      field: 0,
      validate: (value) => {
        if (value.type === 'text' && value.value.length > 100) {
          return '文本长度不能超过100';
        }
        return null;
      },
    },
  ],
});
```

---

## API 扩展

### 1. 扩展 Workbook

```typescript
import { Workbook } from '@lingyi-doc/core';

// 扩展 Workbook 类
class ExtendedWorkbook extends Workbook {
  private customData: Map<string, any> = new Map();
  
  setCustomData(key: string, value: any) {
    this.customData.set(key, value);
  }
  
  getCustomData(key: string) {
    return this.customData.get(key);
  }
  
  // 重写序列化方法
  serialize() {
    const baseData = super.serialize();
    return {
      ...baseData,
      customData: Object.fromEntries(this.customData),
    };
  }
  
  // 重写反序列化方法
  static deserialize(data: any) {
    const workbook = super.deserialize(data) as ExtendedWorkbook;
    if (data.customData) {
      workbook.customData = new Map(Object.entries(data.customData));
    }
    return workbook;
  }
}
```

### 2. 扩展编辑器组件

```tsx
import React from 'react';
import { 
  FreeformSheetEditor, 
  FreeformSheetEditorProps 
} from '@lingyi-doc/editor';

interface ExtendedSheetEditorProps extends FreeformSheetEditorProps {
  showCustomPanel?: boolean;
  onCustomAction?: () => void;
}

const ExtendedSheetEditor: React.FC<ExtendedSheetEditorProps> = ({
  showCustomPanel,
  onCustomAction,
  ...props
}) => {
  return (
    <div className="extended-editor">
      <FreeformSheetEditor {...props} />
      {showCustomPanel && (
        <div className="custom-panel">
          <button onClick={onCustomAction}>自定义操作</button>
        </div>
      )}
    </div>
  );
};
```

---

## 常见问题

### Q: 如何保存文档？

```typescript
// 表格
const data = workbook.serialize();
await fetch('/api/save', {
  method: 'POST',
  body: JSON.stringify(data),
});

// 富文本文档
const docData = doc.serialize();
await fetch('/api/save-doc', {
  method: 'POST',
  body: JSON.stringify(docData),
});
```

### Q: 如何实现撤销重做？

```typescript
// 内置支持
table.undo();
table.redo();
table.canUndo();  // boolean
table.canRedo();  // boolean

// 监听状态变化
table.on('historyChange', () => {
  const canUndo = table.canUndo();
  const canRedo = table.canRedo();
  // 更新 UI
});
```

### Q: 如何实现协作？

```typescript
import { WorkbookCollabBridge } from '@lingyi-doc/core';

const collab = new WorkbookCollabBridge({
  workbook,
  websocket: new WebSocket('wss://your-server.com/collab'),
  userId: 'user-123',
  userName: '张三',
});

collab.connect();

// 监听在线用户
collab.on('onlineUsers', (users) => {
  console.log('在线用户:', users);
});
```

### Q: 如何导出为 Excel？

```typescript
import { XlsxIO } from '@lingyi-doc/core';

const buffer = await XlsxIO.export(workbook);
const blob = new Blob([buffer], { 
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
});
const url = URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.download = 'export.xlsx';
link.click();
```

### Q: 如何自定义字段类型？

```typescript
import { ColumnType, CellValue } from '@lingyi-doc/core';

// 扩展字段类型
type CustomColumnType = ColumnType | 'custom';

interface CustomColumnDef {
  type: CustomColumnType;
  // ... 其他属性
}

// 自定义单元格值
interface CustomCellValue extends CellValue {
  type: 'custom';
  value: any;
  display: string;
}
```

### Q: 如何优化性能？

1. **使用虚拟滚动**：大数据量时启用
2. **按需渲染**：只渲染可见区域
3. **使用 Web Worker**：复杂计算放到 Worker
4. **缓存计算结果**：避免重复计算
5. **批量更新**：使用 batch API

```typescript
// 批量更新
table.batchSetCells([
  { row: 0, col: 0, value: { type: 'text', value: 'A1' } },
  { row: 0, col: 1, value: { type: 'text', value: 'B1' } },
  // ...
]);
```

---

## 参考链接

- [lingyi-doc-core API](./api/lingyi-doc-core.md)
- [lingyi-doc-editor API](./api/lingyi-doc-editor.md)
- [lingyi-doc-mind-map API](./api/lingyi-doc-mind-map.md)
- [lingyi-doc-mind-map-react API](./api/lingyi-doc-mind-map-react.md)
