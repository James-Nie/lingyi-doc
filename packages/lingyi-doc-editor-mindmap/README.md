# @lingyi-doc/editor-mindmap

思维导图编辑器组件包，提供思维导图和大纲笔记的 React 组件。

## 功能特性

- **思维导图编辑器**：支持多种布局结构（右侧、左侧、平衡、垂直、时间线等）
- **大纲视图**：支持以大纲形式查看和编辑思维导图
- **节点操作**：支持插入同级、子级、父级节点，删除、复制、折叠/展开
- **样式定制**：支持分支样式（曲线/直线）、节点颜色、文本样式
- **图片支持**：支持在节点中插入和管理图片
- **撤销/重做**：完整的历史记录管理
- **打印功能**：支持将思维导图导出为图片并打印
- **SMM 格式转换**：支持与 SMM（Simple Mind Map）格式互转

## 安装

```bash
npm install @lingyi-doc/editor-mindmap
```

## 依赖

- React 18.2+
- React DOM 18.2+
- Ant Design 6.4+
- @lingyi-doc/core-mindmap
- @lingyi-doc/core-types
- @lingyi-doc/editor-shared
- @lingyi-doc/mind-map
- @lingyi-doc/mind-map-react

## 核心组件

### MindNoteEditor

思维导图编辑器主组件，集成了导图视图和大纲视图。

```tsx
import { MindNoteEditor } from '@lingyi-doc/editor-mindmap';

<MindNoteEditor
  title="我的思维导图"
  root={rootNode}
  settings={settings}
  canUndo={canUndo}
  canRedo={canRedo}
  onTitleChange={(title) => {}}
  onRootChange={(root) => {}}
  onSettingsChange={(settings) => {}}
  onNodeTextChange={(id, text) => {}}
  onInsertSibling={(id) => {}}
  onInsertChild={(id) => {}}
  onInsertParent={(id) => {}}
  onDeleteNode={(id) => {}}
  onDuplicateNode={(id) => {}}
  onToggleCollapse={(id) => {}}
  onExpandChildren={(id) => {}}
  onUndo={() => {}}
  onRedo={() => {}}
/>
```

**MindNoteEditorProps**：

| 属性 | 类型 | 说明 |
|------|------|------|
| title | string | 编辑器标题 |
| root | MindNode | 思维导图根节点 |
| settings | MindNoteSettings | 思维导图设置 |
| canUndo | boolean | 是否可撤销 |
| canRedo | boolean | 是否可重做 |
| readOnly | boolean | 是否只读模式 |
| onTitleChange | (title: string) => void | 标题变更回调 |
| onRootChange | (root: MindNode, recordHistory?: boolean) => void | 根节点变更回调 |
| onSettingsChange | (settings: Partial<MindNoteSettings>) => void | 设置变更回调 |
| onNodeTextChange | (id: string, text: string) => void | 节点文本变更回调 |
| onInsertSibling | (id: string) => string \| null | 插入同级节点，返回新节点 ID |
| onInsertChild | (id: string) => string \| null | 插入子节点，返回新节点 ID |
| onInsertParent | (id: string) => string \| null | 插入父节点，返回新节点 ID |
| onDeleteNode | (id: string) => void | 删除节点 |
| onDuplicateNode | (id: string) => string \| null | 复制节点，返回新节点 ID |
| onToggleCollapse | (id: string) => void | 切换节点折叠状态 |
| onExpandChildren | (id: string) => void | 展开所有子节点 |
| onNodeUpdate | (id: string, patch: Partial<MindNode>) => void | 更新节点属性 |
| onBulkNodeUpdate | (ids: string[], patch: Partial<MindNode>) => void | 批量更新节点 |
| onBulkDelete | (ids: string[]) => void | 批量删除节点 |
| onUndo | () => void | 撤销回调 |
| onRedo | () => void | 重做回调 |
| onActiveNodeChange | (id: string \| null) => void | 活动节点变更回调 |

### MindNoteMapView

思维导图视图组件，以图形化方式展示思维导图。

```tsx
import { MindNoteMapView } from '@lingyi-doc/editor-mindmap';

<MindNoteMapView
  root={rootNode}
  structure="right"
  branchStyle="curve"
  zoom={1}
  activeNodeId={activeId}
  onSelectNode={(id) => {}}
  onRootChange={(root) => {}}
  onZoomChange={(zoom) => {}}
/>
```

**MindNoteMapViewProps**：

| 属性 | 类型 | 说明 |
|------|------|------|
| root | MindNode | 思维导图根节点 |
| structure | MindNoteStructure | 布局结构（right/left/balanced/vertical/timelineH/timelineV 等） |
| branchStyle | MindNoteBranchStyle | 分支样式（curve/straight） |
| zoom | number | 缩放比例 |
| activeNodeId | string \| null | 当前激活的节点 ID |
| readOnly | boolean | 是否只读模式 |
| onSelectNode | (id: string \| null) => void | 节点选中回调 |
| onRootChange | (root: MindNode, recordHistory?: boolean) => void | 根节点变更回调 |
| onZoomChange | (zoom: number) => void | 缩放变更回调 |
| onReady | (api: MindmapViewApi) => void | 视图就绪回调 |
| onAddImage | () => void | 添加图片回调 |
| onRemoveImage | (id: string) => void | 移除图片回调 |
| background | string | 背景颜色 |
| containerOverflow | 'hidden' \| 'visible' | 容器溢出行为 |
| fitOnInit | boolean | 是否在初始化时自适应 |
| enableMouseWheel | boolean | 是否启用鼠标滚轮缩放 |
| lockZoom | boolean | 是否锁定缩放 |

### MindNoteOutlineView

大纲视图组件，以层级列表形式展示思维导图。

```tsx
import { MindNoteOutlineView } from '@lingyi-doc/editor-mindmap';

<MindNoteOutlineView
  root={rootNode}
  activeNodeId={activeId}
  onSelectNode={(id) => {}}
  onUpdateText={(id, text) => {}}
  onToggleCollapse={(id) => {}}
  onKeyCommand={(id, cmd, e) => {}}
/>
```

**MindNoteOutlineViewProps**：

| 属性 | 类型 | 说明 |
|------|------|------|
| root | MindNode | 思维导图根节点 |
| activeNodeId | string \| null | 当前激活的节点 ID |
| readOnly | boolean | 是否只读模式 |
| onSelectNode | (id: string) => void | 节点选中回调 |
| onUpdateText | (id: string, text: string) => void | 文本更新回调 |
| onToggleCollapse | (id: string) => void | 切换折叠回调 |
| onKeyCommand | (id: string, cmd: MindNoteOutlineCommand, e: React.KeyboardEvent) => void | 键盘命令回调 |
| onRemoveImage | (id: string) => void | 移除图片回调 |
| onBulkPatch | (ids: string[], patch: Partial<MindNode>) => void | 批量更新回调 |
| onBulkDelete | (ids: string[]) => void | 批量删除回调 |

**MindNoteOutlineCommand**：

| 命令 | 说明 |
|------|------|
| sibling | 插入同级节点 |
| child | 插入子节点 |
| parent | 插入父节点 |
| delete | 删除节点 |
| expand | 展开子节点 |
| duplicate | 复制节点 |

### MindNoteControls

思维导图控制栏组件，包含视图切换、布局选择、缩放控制等功能。

```tsx
import { MindNoteControls } from '@lingyi-doc/editor-mindmap';

<MindNoteControls
  viewMode="map"
  structure="right"
  branchStyle="curve"
  zoom={1}
  canUndo={true}
  canRedo={false}
  onViewModeChange={(mode) => {}}
  onStructureChange={(s) => {}}
  onBranchStyleChange={(s) => {}}
  onZoomChange={(z) => {}}
  onUndo={() => {}}
  onRedo={() => {}}
/>
```

**MindNoteControlsProps**：

| 属性 | 类型 | 说明 |
|------|------|------|
| embedded | boolean | 是否嵌入模式 |
| readOnly | boolean | 是否只读模式 |
| viewMode | MindNoteViewMode | 视图模式（map/outline） |
| structure | MindNoteStructure | 当前布局结构 |
| branchStyle | MindNoteBranchStyle | 当前分支样式 |
| zoom | number | 当前缩放比例 |
| canUndo | boolean | 是否可撤销 |
| canRedo | boolean | 是否可重做 |
| onViewModeChange | (mode: MindNoteViewMode) => void | 视图模式变更回调 |
| onStructureChange | (s: MindNoteStructure) => void | 布局结构变更回调 |
| onBranchStyleChange | (s: MindNoteBranchStyle) => void | 分支样式变更回调 |
| onZoomChange | (z: number) => void | 缩放变更回调 |
| onUndo | () => void | 撤销回调 |
| onRedo | () => void | 重做回调 |
| onRecenter | () => void | 重新居中回调 |

### MindNoteMapNodeToolbar

节点工具栏组件，显示在选中节点上方，提供快捷操作。

```tsx
import { MindNoteMapNodeToolbar } from '@lingyi-doc/editor-mindmap';

<MindNoteMapNodeToolbar
  visible={visible}
  node={node}
  onPatch={(patch) => {}}
  onMoreAction={(action) => {}}
  onEditDescription={() => {}}
  onAddImage={() => {}}
  onAddChild={() => {}}
  onAddSibling={() => {}}
  onComment={() => {}}
/>
```

**MindNoteMapNodeToolbarProps**：

| 属性 | 类型 | 说明 |
|------|------|------|
| visible | boolean | 是否可见 |
| node | MindNode \| null | 当前节点 |
| onPatch | (patch: Partial<MindNode>) => void | 更新节点属性 |
| onMoreAction | (action: MindNoteMapMoreAction) => void | 更多操作 |
| onEditDescription | () => void | 编辑描述 |
| onAddImage | () => void | 添加图片 |
| onAddChild | () => void | 添加子节点 |
| onAddSibling | () => void | 添加同级节点 |
| onComment | () => void | 添加评论 |

### MindNoteNodeImage

节点图片组件，用于展示节点中的图片。

```tsx
import { MindNoteNodeImage } from '@lingyi-doc/editor-mindmap';

<MindNoteNodeImage
  src={imageUrl}
  width={240}
  height={160}
  maxWidth={1000}
  onRemove={() => {}}
/>
```

**MindNoteNodeImageProps**：

| 属性 | 类型 | 说明 |
|------|------|------|
| src | string | 图片 URL |
| width | number | 图片宽度 |
| height | number | 图片高度 |
| maxWidth | number | 最大宽度（默认 1000） |
| onRemove | () => void | 删除图片回调 |

## 打印功能

### printMindNoteMap

将思维导图渲染为图片并打开打印对话框。

```tsx
import { printMindNoteMap } from '@lingyi-doc/editor-mindmap';

await printMindNoteMap(root, structure, branchStyle, '我的思维导图');
```

**参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| root | MindNode | 思维导图根节点 |
| structure | MindNoteStructure | 布局结构 |
| branchStyle | MindNoteBranchStyle | 分支样式 |
| title | string | 打印标题 |

## SMM 格式转换

### mapStructure

将内部结构类型映射为 SMM 格式结构。

```tsx
import { mapStructure } from '@lingyi-doc/editor-mindmap';

const smmStructure = mapStructure('right'); // 'logicalStructure'
```

### mapLineStyle

将内部分支样式映射为 SMM 格式。

```tsx
import { mapLineStyle } from '@lingyi-doc/editor-mindmap';

const smmStyle = mapLineStyle('curve'); // 'curve'
```

### mindNodeToSmmData

将 MindNode 转换为 SMM 节点格式。

```tsx
import { mindNodeToSmmData } from '@lingyi-doc/editor-mindmap';

const smmNode = mindNodeToSmmData(root);
```

### smmDataToMindNode

将 SMM 节点格式转换为 MindNode。

```tsx
import { smmDataToMindNode } from '@lingyi-doc/editor-mindmap';

const mindNode = smmDataToMindNode(smmNode);
```

## 图片工具

### fitMindNodeImageSize

调整图片尺寸以适应节点，限制最大宽度。

```tsx
import { fitMindNodeImageSize } from '@lingyi-doc/editor-mindmap';

const { width, height } = fitMindNodeImageSize(naturalWidth, naturalHeight, maxWidth);
```

**参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| naturalWidth | number | 原始宽度 |
| naturalHeight | number | 原始高度 |
| maxWidth | number | 最大宽度（默认 1000） |

**返回值**：`{ width: number; height: number }`

### readImageFile

读取图片文件并转换为 Data URL，同时返回适配后的尺寸。

```tsx
import { readImageFile } from '@lingyi-doc/editor-mindmap';

const { src, width, height } = await readImageFile(file);
```

**参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| file | File | 图片文件 |

**返回值**：`{ src: string; width: number; height: number }`

## 样式常量

```tsx
import { MN_COLORS, MN_EDITOR_MAX_WIDTH } from '@lingyi-doc/editor-mindmap';
```

**MN_COLORS**：

| 常量 | 说明 |
|------|------|
| primary | 主题色 |
| text | 文本色 |
| muted | 次要文本色 |
| border | 边框色 |
| pageBg | 页面背景色 |
| mapBg | 导图背景色 |
| rootBg | 根节点背景色 |
| rootText | 根节点文本色 |
| selectedBorder | 选中边框色 |

## 类型定义

### MindNode

思维导图节点：

```typescript
interface MindNode {
  id: string;
  text: string;
  children?: MindNode[];
  completed?: boolean;
  collapsed?: boolean;
  color?: string;
  imageUrl?: string;
  underline?: boolean;
  // ... 其他属性
}
```

### MindNoteSettings

思维导图设置：

```typescript
interface MindNoteSettings {
  viewMode: MindNoteViewMode;      // 'outline' | 'map'
  structure: MindNoteStructure;    // 布局结构
  branchStyle: MindNoteBranchStyle; // 'curve' | 'straight'
  zoom: number;                    // 缩放比例（100 = 100%）
}
```

### MindNoteBranchStyle

分支样式：

```typescript
type MindNoteBranchStyle = 'curve' | 'straight';
```

### MindNoteViewMode

视图模式：

```typescript
type MindNoteViewMode = 'map' | 'outline';
```

### MindmapViewApi

思维导图视图 API：

```typescript
interface MindmapViewApi {
  goTargetNode(id: string): void;    // 选中目标节点
  startTextEdit(nodeId: string): void; // 开始文本编辑
  flushTextEdit(): void;            // 提交文本编辑
  fitView(): void;                  // 自适应视图
}
```

## 使用示例

### 基础思维导图编辑

```tsx
import { useState, useCallback } from 'react';
import { MindNoteEditor } from '@lingyi-doc/editor-mindmap';
import { 
  MindNode, 
  MindNoteSettings,
  createEmptyMindNode 
} from '@lingyi-doc/core-mindmap';

function MyMindmapEditor() {
  const [title, setTitle] = useState('我的思维导图');
  const [root, setRoot] = useState<MindNode>(createEmptyMindNode('中心主题'));
  const [settings, setSettings] = useState<MindNoteSettings>({
    structure: 'right',
    branchStyle: 'curve',
    viewMode: 'map',
    zoom: 100, // 缩放比例（100 = 100%）
  });
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [history, setHistory] = useState<MindNode[]>([]);

  const saveHistory = useCallback((newRoot: MindNode) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newRoot);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const handleRootChange = useCallback((newRoot: MindNode, recordHistory = true) => {
    setRoot(newRoot);
    if (recordHistory) {
      saveHistory(newRoot);
    }
  }, [saveHistory]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setRoot(history[newIndex]);
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setRoot(history[newIndex]);
    }
  }, [history, historyIndex]);

  const handleInsertChild = useCallback((parentId: string): string | null => {
    const newNode: MindNode = {
      id: `node-${Date.now()}`,
      text: '新节点',
      children: [],
    };
    // 在实际实现中，需要使用 core-mindmap 的工具函数来插入节点
    // 这里简化处理
    return newNode.id;
  }, []);

  // ... 其他事件处理函数

  return (
    <MindNoteEditor
      title={title}
      root={root}
      settings={settings}
      canUndo={historyIndex > 0}
      canRedo={historyIndex < history.length - 1}
      onTitleChange={setTitle}
      onRootChange={handleRootChange}
      onSettingsChange={setSettings}
      onNodeTextChange={(id, text) => {
        // 更新节点文本
      }}
      onInsertSibling={(id) => handleInsertChild(id)}
      onInsertChild={(id) => handleInsertChild(id)}
      onInsertParent={(id) => handleInsertChild(id)}
      onDeleteNode={(id) => {
        // 删除节点
      }}
      onDuplicateNode={(id) => {
        // 复制节点
        return `node-${Date.now()}`;
      }}
      onToggleCollapse={(id) => {
        // 切换折叠
      }}
      onExpandChildren={(id) => {
        // 展开子节点
      }}
      onUndo={handleUndo}
      onRedo={handleRedo}
    />
  );
}
```

### 仅使用思维导图视图

```tsx
import { useState, useCallback } from 'react';
import { MindNoteMapView } from '@lingyi-doc/editor-mindmap';
import { MindNode, createEmptyMindNode } from '@lingyi-doc/core-mindmap';

function MyMindmapView() {
  const [root, setRoot] = useState<MindNode>(createEmptyMindNode('中心主题'));
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const handleRootChange = useCallback((newRoot: MindNode) => {
    setRoot(newRoot);
  }, []);

  return (
    <MindNoteMapView
      root={root}
      structure="right"
      branchStyle="curve"
      zoom={zoom}
      activeNodeId={activeNodeId}
      onSelectNode={setActiveNodeId}
      onRootChange={handleRootChange}
      onZoomChange={setZoom}
    />
  );
}
```

### 打印思维导图

```tsx
import { printMindNoteMap } from '@lingyi-doc/editor-mindmap';
import { MindNode, MindNoteStructure, MindNoteBranchStyle } from '@lingyi-doc/core-mindmap';

function MindmapPrintButton({ root }: { root: MindNode }) {
  const handlePrint = async () => {
    await printMindNoteMap(
      root,
      'right' as MindNoteStructure,
      'curve' as MindNoteBranchStyle,
      '我的思维导图'
    );
  };

  return (
    <button onClick={handlePrint}>打印思维导图</button>
  );
}
```

## 注意事项

1. 思维导图编辑器需要正确配置节点状态管理和撤销/重做历史
2. `MindNode` 和 `MindNoteSettings` 类型需要从 `@lingyi-doc/core-mindmap` 导入
3. 视图操作（插入节点、删除节点等）需要使用 `@lingyi-doc/core-mindmap` 提供的工具函数
4. 图片功能依赖 `@lingyi-doc/editor-shared` 的图片处理工具
5. SMM 格式转换用于与外部思维导图工具的数据交换
