# @lingyi-doc/editor-whiteboard

白板编辑器组件包，提供图形绘制、流程图、思维导图等功能的 React 组件。

## 功能特性

- **图形绘制**：支持矩形、圆形、线条、箭头等多种基础图形
- **流程图编辑**：支持节点连接、自动布线、连接线样式
- **思维导图**：支持思维导图的创建、编辑、布局
- **图片处理**：支持图片插入、裁剪、缩放
- **文本编辑**：支持富文本编辑、样式设置
- **表格支持**：支持在白板中插入和编辑表格
- **协作编辑**：支持多人实时协作
- **导出功能**：支持导出为 PNG 图片、打印

## 安装

```bash
npm install @lingyi-doc/editor-whiteboard
```

## 依赖

- React 18.2+
- React DOM 18.2+
- @lingyi-doc/core-whiteboard
- @lingyi-doc/core-mindmap
- @lingyi-doc/core-types
- @lingyi-doc/core-doc
- @lingyi-doc/core-client
- @lingyi-doc/editor-shared
- @lingyi-doc/editor-mindmap
- @lingyi-doc/mind-map
- @lingyi-doc/mind-map-react

## 核心组件

### WhiteboardEditor

白板编辑器主组件，是白板功能的核心入口。

```tsx
import { WhiteboardEditor } from '@lingyi-doc/editor-whiteboard';

<WhiteboardEditor
  title="我的白板"
  elements={elements}
  viewport={viewport}
  canUndo={canUndo}
  canRedo={canRedo}
  onElementsChange={(elements) => {}}
  onViewportChange={(viewport) => {}}
  onUndo={() => {}}
  onRedo={() => {}}
/>
```

**WhiteboardEditorProps**：

| 属性 | 类型 | 说明 |
|------|------|------|
| title | string | 白板标题 |
| elements | WhiteboardElement[] | 白板元素列表 |
| viewport | WhiteboardViewport | 视口配置 |
| canUndo | boolean | 是否可撤销 |
| canRedo | boolean | 是否可重做 |
| readOnly | boolean | 是否只读模式 |
| embedded | boolean | 是否嵌入模式 |
| onTitleChange | (title: string) => void | 标题变更回调 |
| onElementsChange | (elements: WhiteboardElement[], recordHistory?: boolean) => void | 元素变更回调 |
| onViewportChange | (viewport: Partial<WhiteboardViewport>, recordHistory?: boolean) => void | 视口变更回调 |
| onElementUpdate | (id: string, patch: Partial<WhiteboardElement>, recordHistory?: boolean) => void | 单个元素更新回调 |
| onUndo | () => void | 撤销回调 |
| onRedo | () => void | 重做回调 |
| commentsEnabled | boolean | 是否启用评论 |
| commentThreads | DocCommentThread[] | 评论线程列表 |
| selectedCommentId | string \| null | 当前选中的评论 ID |
| onSelectComment | (threadId: string) => void | 选中评论回调 |
| onCommentPinMove | (threadId: string, pinX: number, pinY: number) => void | 评论标记移动回调 |
| onRequestAddComment | (input: { elementId?, mindNodeId?, pinX, pinY, quote }) => void | 请求添加评论 |

### WhiteboardEmbedPreview

白板嵌入预览组件。

```tsx
import { WhiteboardEmbedPreview } from '@lingyi-doc/editor-whiteboard';

<WhiteboardEmbedPreview
  elements={elements}
  viewport={viewport}
/>
```

## 导出功能

### downloadWhiteboardElementsAsPng

下载白板为 PNG 图片。

```tsx
import { downloadWhiteboardElementsAsPng } from '@lingyi-doc/editor-whiteboard';

downloadWhiteboardElementsAsPng(elements, 'whiteboard');
```

### renderWhiteboardElementsToDataUrl

将白板渲染为 Data URL。

```tsx
import { renderWhiteboardElementsToDataUrl } from '@lingyi-doc/editor-whiteboard';

const dataUrl = await renderWhiteboardElementsToDataUrl(elements);
```

### resolveWhiteboardElementsForExport

解析白板元素用于导出。

```tsx
import { resolveWhiteboardElementsForExport } from '@lingyi-doc/editor-whiteboard';

const exportElements = resolveWhiteboardElementsForExport(elements);
```

### printWhiteboard

打印白板。

```tsx
import { printWhiteboard } from '@lingyi-doc/editor-whiteboard';

printWhiteboard(elements, viewport, '我的白板');
```

## 评论功能

### resolveCommentBindAtPoint

解析指定点绑定的评论。

```tsx
import { resolveCommentBindAtPoint } from '@lingyi-doc/editor-whiteboard';

const comment = resolveCommentBindAtPoint(elements, x, y);
```

### resolveLiveWhiteboardCommentPin

解析实时白板评论标记位置。

```tsx
import { resolveLiveWhiteboardCommentPin } from '@lingyi-doc/editor-whiteboard';

const pin = resolveLiveWhiteboardCommentPin(elements, threadId);
```

### syncWhiteboardCommentPinsWithElements

同步白板评论标记与元素位置。

```tsx
import { syncWhiteboardCommentPinsWithElements } from '@lingyi-doc/editor-whiteboard';

syncWhiteboardCommentPinsWithElements(elements, commentThreads);
```

## 视口工具

### computeFitViewport

计算适应所有元素的视口配置。

```tsx
import { computeFitViewport } from '@lingyi-doc/editor-whiteboard';

const viewport = computeFitViewport(elements, containerWidth, containerHeight);
```

## 样式常量

```tsx
import { WB_COLORS, WB_PANEL, WB_Z_INDEX } from '@lingyi-doc/editor-whiteboard';
```

| 常量 | 说明 |
|------|------|
| WB_COLORS | 白板颜色配置 |
| WB_PANEL | 面板样式配置 |
| WB_Z_INDEX | Z-index 层级配置 |

## 内部组件（按需使用）

### 画布组件

| 组件 | 说明 |
|------|------|
| WhiteboardCanvas | 白板画布 |
| WhiteboardControls | 白板控制栏（缩放、平移） |
| WhiteboardToolbar | 白板工具栏 |

### 选择与交互

| 组件 | 说明 |
|------|------|
| SelectionOverlay | 选区覆盖层 |
| SelectionLockBadge | 锁定标记 |
| WhiteboardContextMenu | 右键菜单 |

### 形状与格式

| 组件 | 说明 |
|------|------|
| ShapeLibraryPanel | 形状库面板 |
| ShapeFormatToolbar | 形状格式工具栏 |
| ConnectorFormatToolbar | 连接线格式工具栏 |
| ImageFormatToolbar | 图片格式工具栏 |
| TextStylePanel | 文本样式面板 |

### 思维导图

| 组件 | 说明 |
|------|------|
| WbMindmapView | 白板思维导图视图 |
| WbMindmapCanvasLayer | 思维导图画布层 |
| WbMindmapCanvasOverlay | 思维导图覆盖层 |
| WbMindmapControls | 思维导图控制 |
| WbMindmapInteractionOverlay | 思维导图交互覆盖层 |
| WbMindmapToolbar | 思维导图工具栏 |
| MindmapLayoutPicker | 布局选择器 |
| MindmapNodeFormatToolbar | 节点格式工具栏 |
| MindmapNodeInlineEditor | 节点内联编辑器 |

### 画布辅助

| 组件 | 说明 |
|------|------|
| CanvasInlineEditor | 画布内联编辑器 |
| ConnectorLabelEditor | 连接线标签编辑器 |
| ImageCropOverlay | 图片裁剪覆盖层 |
| TableCanvasOverlay | 表格画布覆盖层 |
| TableCellInlineEditor | 单元格内联编辑器 |

## 类型定义

### WhiteboardElement

白板元素，包括：
- ShapeElement：形状元素
- ConnectorElement：连接线元素
- MindmapElement：思维导图元素

### WhiteboardViewport

视口配置：
```typescript
interface WhiteboardViewport {
  x: number;      // 水平偏移
  y: number;      // 垂直偏移
  scale: number;  // 缩放比例
}
```

### WhiteboardEditorProps

白板编辑器属性（详见上方核心组件章节）。

## 使用示例

### 基础白板编辑

```tsx
import { useState, useCallback } from 'react';
import { WhiteboardEditor } from '@lingyi-doc/editor-whiteboard';
import { 
  WhiteboardElement, 
  WhiteboardViewport,
  genWhiteboardId,
  createShapeElement
} from '@lingyi-doc/core-whiteboard';

// createShapeElement 签名: createShapeElement(shapeKind, x, y, zIndex, options?)
// shapeKind 可选值: 'rect', 'roundRect', 'circle', 'diamond', 'triangle', 'text', 'sticky' 等

function MyWhiteboardEditor() {
  const [title, setTitle] = useState('我的白板');
  const [elements, setElements] = useState<WhiteboardElement[]>([]);
  const [viewport, setViewport] = useState<WhiteboardViewport>({
    x: 0,
    y: 0,
    scale: 1,
  });
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [history, setHistory] = useState<WhiteboardElement[][]>([]);

  const saveHistory = useCallback((newElements: WhiteboardElement[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newElements);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const handleElementsChange = useCallback((newElements: WhiteboardElement[]) => {
    setElements(newElements);
    saveHistory(newElements);
  }, [saveHistory]);

  const handleViewportChange = useCallback((newViewport: Partial<WhiteboardViewport>) => {
    setViewport(prev => ({ ...prev, ...newViewport }));
  }, []);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setElements(history[newIndex]);
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setElements(history[newIndex]);
    }
  }, [history, historyIndex]);

  // 添加初始形状
  const addShape = useCallback(() => {
    const newShape = createShapeElement('rect', 100, 100, elements.length);
    setElements(prev => [...prev, { ...newShape, text: '新形状' }]);
  }, [elements.length]);

  return (
    <div>
      <button onClick={addShape}>添加形状</button>
      <WhiteboardEditor
        title={title}
        elements={elements}
        viewport={viewport}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onTitleChange={setTitle}
        onElementsChange={handleElementsChange}
        onViewportChange={handleViewportChange}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />
    </div>
  );
}
```

### 导出白板

```tsx
import { 
  downloadWhiteboardElementsAsPng, 
  printWhiteboard 
} from '@lingyi-doc/editor-whiteboard';
import { WhiteboardElement, WhiteboardViewport } from '@lingyi-doc/core-whiteboard';

function WhiteboardActions({ elements, viewport }: { 
  elements: WhiteboardElement[];
  viewport: WhiteboardViewport;
}) {
  const handleDownload = () => {
    downloadWhiteboardElementsAsPng(elements, 'my-whiteboard');
  };

  const handlePrint = () => {
    printWhiteboard(elements, viewport, '我的白板');
  };

  return (
    <div>
      <button onClick={handleDownload}>下载为图片</button>
      <button onClick={handlePrint}>打印</button>
    </div>
  );
}
```

### 嵌入预览模式

```tsx
import { WhiteboardEmbedPreview } from '@lingyi-doc/editor-whiteboard';
import { WhiteboardElement, WhiteboardViewport } from '@lingyi-doc/core-whiteboard';

function WhiteboardPreview({ elements }: { elements: WhiteboardElement[] }) {
  const viewport = { x: 0, y: 0, scale: 1 };
  
  return (
    <WhiteboardEmbedPreview
      elements={elements}
      viewport={viewport}
    />
  );
}
```

## 注意事项

1. 白板编辑器需要正确配置元素状态管理和撤销/重做历史
2. `WhiteboardElement` 和 `WhiteboardViewport` 类型需要从 `@lingyi-doc/core-whiteboard` 导入
3. 思维导图功能依赖 `@lingyi-doc/core-mindmap` 和 `@lingyi-doc/mind-map-react`
4. 建议使用 `genWhiteboardId()` 生成唯一元素 ID
5. 嵌入模式下工具栏和控制栏会被隐藏
