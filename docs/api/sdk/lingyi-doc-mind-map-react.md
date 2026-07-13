# @lingyi-doc/mind-map-react API 文档

`@lingyi-doc/mind-map-react` 是思维导图引擎的 React 组件封装层，提供完整的交互体验。

## 特性

- 基于 React 18+ 的组件化设计
- 封装 Canvas 渲染引擎
- 支持点击选择、双击编辑
- 拖拽平移、滚轮缩放
- 键盘快捷键
- IME 中文输入支持
- 快捷操作按钮

## 安装

```bash
npm install @lingyi-doc/mind-map-react
```

## 依赖要求

- React 18.2.0+
- React DOM 18.2.0+
- `@lingyi-doc/core`
- `@lingyi-doc/mind-map`

---

## MindmapView

主视图组件，封装完整的思维导图交互。

```tsx
import { MindmapView } from '@lingyi-doc/mind-map-react';

function App() {
  const [root, setRoot] = useState<MindNode>({
    id: 'root',
    text: '中心主题',
    children: [
      { id: 'child-1', text: '子节点 1', children: [] },
      { id: 'child-2', text: '子节点 2', children: [] },
    ],
  });

  return (
    <MindmapView
      root={root}
      structure="right"
      branchStyle="curve"
      onSelectNode={(id) => {
        console.log('选中节点:', id);
      }}
      onRootChange={(newRoot) => {
        setRoot(newRoot);
      }}
    />
  );
}
```

### MindmapViewProps

```typescript
interface MindmapViewProps {
  // 数据
  root: MindNode;                      // 根节点
  structure: MindNoteStructure;        // 布局结构
  branchStyle: MindNoteBranchStyle;    // 连线风格
  
  // 模式
  mode?: 'standalone' | 'embedded';    // 独立/嵌入模式
  themeId?: MindmapThemeId;            // 主题 ID
  readOnly?: boolean;                  // 只读模式
  interactive?: boolean;               // 是否可交互
  
  // 视口
  zoom?: number;                       // 缩放百分比
  background?: string;                 // 背景色
  fitOnInit?: boolean;                 // 初始自动适应
  enableMouseWheel?: boolean;          // 启用滚轮缩放
  lockZoom?: boolean;                  // 锁定缩放
  canvasZoom?: number;                 // 嵌入模式外层画布缩放
  
  // 选区
  activeNodeId?: string | null;        // 选中的节点 ID
  
  // 回调
  onSelectNode?: (id: string | null) => void;
  onNodeTextChange?: (nodeId: string, text: string, recordHistory?: boolean) => void;
  onRootChange?: (root: MindNode, recordHistory?: boolean) => void;
  onAction?: (action: MindmapNodeAction, nodeId: string) => void;
  onZoomChange?: (zoom: number) => void;
  onReady?: (api: MindmapViewApi) => void;
  onContentSizeChange?: (size: { width: number; height: number }) => void;
  onAddImage?: () => void;
}
```

### 属性详解

#### 数据属性

```typescript
// 根节点
root: MindNode;

// 布局结构：right | left | balanced | vertical | treeRight | treeLeft | treeBalanced | timelineH | timelineV
structure: MindNoteStructure;

// 连线风格：curve | straight
branchStyle: MindNoteBranchStyle;
```

#### 模式属性

```typescript
// 独立模式：包含完整的交互（拖拽、缩放、快捷键）
// 嵌入模式：用于画板内嵌，交互由外部控制
mode?: 'standalone' | 'embedded';

// 只读模式：禁用所有编辑操作
readOnly?: boolean;

// 是否可交互：false 时禁用所有鼠标和键盘交互
interactive?: boolean;
```

#### 视口属性

```typescript
// 缩放百分比（100 = 100%）
zoom?: number;

// 背景色
background?: string;

// 初始自动适应：组件挂载时自动 fitView
fitOnInit?: boolean;

// 启用滚轮缩放
enableMouseWheel?: boolean;

// 锁定缩放：禁止用户缩放
lockZoom?: boolean;
```

---

### MindmapViewApi

通过 `onReady` 回调获取的 API 对象。

```typescript
interface MindmapViewApi {
  // 跳转到目标节点并居中显示
  goTargetNode: (id: string) => void;
  
  // 开始编辑节点文本
  startTextEdit: (id: string) => void;
  
  // 自动适应视口
  fitView: () => void;
  
  // 底层引擎实例
  engine: MindmapEngine;
}
```

#### 使用示例

```tsx
function App() {
  const apiRef = useRef<MindmapViewApi>(null);

  const handleReady = (api: MindmapViewApi) => {
    apiRef.current = api;
  };

  const focusNode = (nodeId: string) => {
    apiRef.current?.goTargetNode(nodeId);
  };

  const startEdit = (nodeId: string) => {
    apiRef.current?.startTextEdit(nodeId);
  };

  const fitView = () => {
    apiRef.current?.fitView();
  };

  return (
    <div>
      <button onClick={() => focusNode('child-1')}>聚焦节点 1</button>
      <button onClick={() => startEdit('child-1')}>编辑节点 1</button>
      <button onClick={fitView}>适应视口</button>
      
      <MindmapView
        root={root}
        structure="right"
        branchStyle="curve"
        onReady={handleReady}
      />
    </div>
  );
}
```

---

## MindmapNodeQuickActions

节点快捷操作按钮组件，显示在节点的上下边缘。

```tsx
import { MindmapNodeQuickActions } from '@lingyi-doc/mind-map-react';

<MindmapNodeQuickActions
  actions={quickActionLayout}
  screenRect={{ left: 0, top: 0, width: 800, height: 600, zoom: 1 }}
  layoutOrigin={{ x: 0, y: 0 }}
  accent="#1890ff"
  onAddSiblingBefore={() => {
    console.log('添加前一个同级节点');
  }}
  onAddSiblingAfter={() => {
    console.log('添加后一个同级节点');
  }}
  onAddChild={(dir) => {
    console.log('添加子节点，方向:', dir);
  }}
/>
```

### MindmapNodeQuickActionsProps

```typescript
interface MindmapNodeQuickActionsProps {
  // 快捷操作布局数据（从 getMindmapQuickActionLayout 获取）
  actions: MindmapQuickActionLayout;
  
  // 屏幕矩形
  screenRect: {
    left: number;
    top: number;
    width: number;
    height: number;
    zoom: number;
  };
  
  // 布局原点
  layoutOrigin: {
    x: number;
    y: number;
  };
  
  // 主题强调色
  accent?: string;
  
  // 回调
  onAddSiblingBefore: () => void;
  onAddSiblingAfter: () => void;
  onAddChild: (dir?: MindmapGrowDirection) => void;
}
```

### MindmapQuickActionLayout

```typescript
interface MindmapQuickActionLayout {
  topDot: MindmapQuickActionPoint | null;      // 上方同级添加点
  bottomDot: MindmapQuickActionPoint | null;    // 下方同级添加点
  leftPlus: MindmapQuickActionPoint | null;     // 左侧子节点添加
  rightPlus: MindmapQuickActionPoint | null;    // 右侧子节点添加
  topPlus: MindmapQuickActionPoint | null;      // 上方子节点添加
  bottomPlus: MindmapQuickActionPoint | null;   // 下方子节点添加
}

interface MindmapQuickActionPoint {
  x: number;
  y: number;
}
```

---

## MindmapNodeActionBar

节点操作栏组件，悬浮在节点上方的深色操作栏。

```tsx
import { MindmapNodeActionBar } from '@lingyi-doc/mind-map-react';

<MindmapNodeActionBar
  anchor={{ left: 100, top: 50, width: 200 }}
  onAddChild={() => {
    console.log('添加子节点');
  }}
  onAddSibling={() => {
    console.log('添加同级节点');
  }}
  onAddImage={() => {
    console.log('添加图片');
  }}
/>
```

### MindmapNodeActionBarProps

```typescript
interface MindmapNodeActionBarProps {
  // 锚点位置
  anchor: {
    left: number;
    top: number;
    width: number;
  };
  
  // 回调
  onAddChild: () => void;
  onAddSibling: () => void;
  onAddImage?: () => void;
}
```

---

## MindmapTextEditOverlay

文本编辑浮层，双击节点时自动显示。

该组件内嵌在 MindmapView 中，无需手动使用。

### 特性

- 支持 IME 中文输入
- 自动定位到节点位置
- Enter 提交、Escape 取消
- 自动调整宽度

---

## 事件处理

### 节点选择

```tsx
<MindmapView
  root={root}
  structure="right"
  branchStyle="curve"
  activeNodeId={selectedNodeId}
  onSelectNode={(id) => {
    setSelectedNodeId(id);
  }}
/>
```

### 节点文本编辑

```tsx
<MindmapView
  root={root}
  structure="right"
  branchStyle="curve"
  onNodeTextChange={(nodeId, text, recordHistory) => {
    // 更新节点文本
    const newRoot = updateNodeText(root, nodeId, text);
    setRoot(newRoot);
  }}
/>
```

### 根节点变化

```tsx
<MindmapView
  root={root}
  structure="right"
  branchStyle="curve"
  onRootChange={(newRoot, recordHistory) => {
    setRoot(newRoot);
    // 可选：记录历史用于撤销重做
    if (recordHistory) {
      pushHistory(newRoot);
    }
  }}
/>
```

### 节点操作

```tsx
<MindmapView
  root={root}
  structure="right"
  branchStyle="curve"
  onAction={(action, nodeId) => {
    console.log('操作:', action, '节点:', nodeId);
    // action: 'child' | 'sibling' | 'delete' | 'toggleCollapse' | ...
  }}
/>
```

### 缩放变化

```tsx
<MindmapView
  root={root}
  structure="right"
  branchStyle="curve"
  onZoomChange={(zoom) => {
    console.log('当前缩放:', zoom);
  }}
/>
```

### 内容尺寸变化

```tsx
<MindmapView
  root={root}
  structure="right"
  branchStyle="curve"
  onContentSizeChange={(size) => {
    console.log('内容尺寸:', size.width, size.height);
  }}
/>
```

---

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Enter` | 添加同级节点 |
| `Tab` | 添加子节点 |
| `Shift + Tab` | 添加父节点 |
| `Delete / Backspace` | 删除节点 |
| `ArrowUp` | 选择上方节点 |
| `ArrowDown` | 选择下方节点 |
| `ArrowLeft` | 选择左侧节点 |
| `ArrowRight` | 选择右侧节点 |
| `Space` | 折叠/展开节点 |
| `F2` | 编辑节点文本 |
| `Escape` | 取消编辑/取消选择 |

---

## 完整示例

### 基础思维导图

```tsx
import React, { useState } from 'react';
import { MindmapView } from '@lingyi-doc/mind-map-react';
import { MindNode } from '@lingyi-doc/mind-map';

function App() {
  const [root, setRoot] = useState<MindNode>({
    id: 'root',
    text: '零一文档',
    children: [
      {
        id: 'table',
        text: '表格',
        children: [
          { id: 'freeform', text: '普通表格', children: [] },
          { id: 'base', text: '多维表', children: [] },
        ],
      },
      {
        id: 'doc',
        text: '文档',
        children: [
          { id: 'richtext', text: '富文本文档', children: [] },
          { id: 'mindnote', text: '思维笔记', children: [] },
        ],
      },
      {
        id: 'whiteboard',
        text: '画板',
        children: [],
      },
    ],
  });

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  return (
    <div style={{ height: '100vh' }}>
      <MindmapView
        root={root}
        structure="right"
        branchStyle="curve"
        activeNodeId={selectedNodeId}
        onSelectNode={setSelectedNodeId}
        onRootChange={setRoot}
        fitOnInit={true}
      />
    </div>
  );
}
```

### 只读预览模式

```tsx
<MindmapView
  root={root}
  structure="right"
  branchStyle="curve"
  readOnly={true}
  interactive={false}
  background="#ffffff"
/>
```

### 嵌入模式（画板内嵌）

```tsx
<MindmapView
  root={root}
  structure="right"
  branchStyle="curve"
  mode="embedded"
  canvasZoom={0.5}
  enableMouseWheel={false}
/>
```

### 带工具栏的思维导图

```tsx
import React, { useState, useRef } from 'react';
import { MindmapView, MindmapViewApi } from '@lingyi-doc/mind-map-react';
import { MindNode, applyMindmapAction } from '@lingyi-doc/mind-map';

function App() {
  const [root, setRoot] = useState<MindNode>({ /* ... */ });
  const apiRef = useRef<MindmapViewApi>(null);

  const handleAddChild = () => {
    if (selectedNodeId) {
      const result = applyMindmapAction(root, selectedNodeId, 'child');
      if (result) {
        setRoot(result.newRoot);
      }
    }
  };

  const handleDelete = () => {
    if (selectedNodeId && selectedNodeId !== 'root') {
      const result = applyMindmapAction(root, selectedNodeId, 'delete');
      if (result) {
        setRoot(result.newRoot);
        setSelectedNodeId(null);
      }
    }
  };

  const handleFitView = () => {
    apiRef.current?.fitView();
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
        <button onClick={handleAddChild} disabled={!selectedNodeId}>
          添加子节点
        </button>
        <button onClick={handleDelete} disabled={!selectedNodeId || selectedNodeId === 'root'}>
          删除节点
        </button>
        <button onClick={handleFitView}>
          适应视口
        </button>
      </div>
      <div style={{ flex: 1 }}>
        <MindmapView
          root={root}
          structure="right"
          branchStyle="curve"
          activeNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onRootChange={setRoot}
          onReady={(api) => {
            apiRef.current = api;
          }}
        />
      </div>
    </div>
  );
}
```

### 支持撤销重做

```tsx
import React, { useState, useRef, useCallback } from 'react';
import { MindmapView } from '@lingyi-doc/mind-map-react';
import { MindNode } from '@lingyi-doc/mind-map';

function App() {
  const [root, setRoot] = useState<MindNode>({ /* ... */ });
  const historyRef = useRef<MindNode[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const pushHistory = useCallback((newRoot: MindNode) => {
    historyRef.current = historyRef.current.slice(0, historyIndex + 1);
    historyRef.current.push(newRoot);
    setHistoryIndex(historyRef.current.length - 1);
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setRoot(historyRef.current[historyIndex - 1]);
    }
  }, [historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < historyRef.current.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setRoot(historyRef.current[historyIndex + 1]);
    }
  }, [historyIndex]);

  const handleRootChange = (newRoot: MindNode, recordHistory?: boolean) => {
    setRoot(newRoot);
    if (recordHistory !== false) {
      pushHistory(newRoot);
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
        <button onClick={undo} disabled={historyIndex <= 0}>
          撤销
        </button>
        <button onClick={redo} disabled={historyIndex >= historyRef.current.length - 1}>
          重做
        </button>
      </div>
      <div style={{ flex: 1 }}>
        <MindmapView
          root={root}
          structure="right"
          branchStyle="curve"
          onRootChange={handleRootChange}
        />
      </div>
    </div>
  );
}
```

### 自定义主题

```tsx
import { MindmapView } from '@lingyi-doc/mind-map-react';
import { resolveTheme } from '@lingyi-doc/mind-map';

const customTheme = resolveTheme('default', {
  background: '#f0f0f0',
  node: {
    root: {
      fill: '#1890ff',
      stroke: '#1890ff',
      textColor: '#ffffff',
    },
  },
});

// 注册自定义主题
// 需要在 @lingyi-doc/mind-map 中扩展 BUILTIN_THEMES

<MindmapView
  root={root}
  structure="right"
  branchStyle="curve"
  themeId="custom"
/>
```

---

## 与 @lingyi-doc/core 集成

### 使用 MindNoteDocument

```tsx
import React, { useState, useEffect } from 'react';
import { MindNoteDocument } from '@lingyi-doc/core';
import { MindmapView } from '@lingyi-doc/mind-map-react';

function App() {
  const [mindnote] = useState(() => new MindNoteDocument());
  const [root, setRoot] = useState(mindnote.getRoot());

  useEffect(() => {
    // 监听文档变化
    const unsubscribe = mindnote.on('change', () => {
      setRoot(mindnote.getRoot());
    });
    return unsubscribe;
  }, [mindnote]);

  const handleRootChange = (newRoot: MindNode, recordHistory?: boolean) => {
    setRoot(newRoot);
    // 同步到文档模型
    mindnote.setRoot(newRoot, recordHistory);
  };

  return (
    <MindmapView
      root={root}
      structure="right"
      branchStyle="curve"
      onRootChange={handleRootChange}
    />
  );
}
```

---

## 最佳实践

1. **受控模式**：使用 state 管理 root，通过 onRootChange 同步
   ```tsx
   const [root, setRoot] = useState(initialRoot);
   
   <MindmapView
     root={root}
     onRootChange={setRoot}
   />
   ```

2. **使用 onReady 获取 API**：通过 ref 保存 API 实例
   ```tsx
   const apiRef = useRef<MindmapViewApi>(null);
   
   <MindmapView
     onReady={(api) => {
       apiRef.current = api;
     }}
   />
   ```

3. **性能优化**：避免频繁更新 root
   ```tsx
   // 错误：每次渲染都创建新对象
   <MindmapView root={{ id: 'root', text: '...', children: [] }} />
   
   // 正确：使用 state 或 memo
   const root = useMemo(() => ({ id: 'root', text: '...', children: [] }), []);
   <MindmapView root={root} />
   ```

4. **只读模式**：预览场景使用 readOnly 或 interactive
   ```tsx
   <MindmapView root={root} readOnly={true} interactive={false} />
   ```

5. **嵌入模式**：在画板中使用时设置 mode: 'embedded'
   ```tsx
   <MindmapView root={root} mode="embedded" canvasZoom={0.5} />
   ```
