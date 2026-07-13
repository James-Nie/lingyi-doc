# @lingyi-doc/mind-map API 文档

`@lingyi-doc/mind-map` 是一个纯 Canvas 的思维导图渲染引擎，不依赖 React 或任何 UI 框架。

## 特性

- 纯 Canvas 渲染，零 UI 依赖
- 支持 9 种布局结构
- 内置主题系统
- 节点折叠/展开
- 快捷操作按钮
- 图片节点支持
- 独立模式 / 嵌入模式

## 安装

```bash
npm install @lingyi-doc/mind-map
```

## 依赖

- `@lingyi-doc/core`（类型定义和节点操作）

---

## MindmapEngine

核心引擎类，负责布局计算、渲染和交互。

```typescript
import { MindmapEngine } from '@lingyi-doc/mind-map';

// 创建引擎
const engine = new MindmapEngine({
  mode: 'standalone',  // 'standalone' | 'embedded'
});
```

### MindmapEngineOptions

```typescript
interface MindmapEngineOptions {
  mode: 'standalone' | 'embedded';
  // standalone: 独立模式，包含完整的交互
  // embedded: 嵌入模式，用于画板内嵌
}
```

### 基本操作

```typescript
// 设置根节点
engine.setRoot({
  id: 'root',
  text: '中心主题',
  children: [
    {
      id: 'child-1',
      text: '子节点 1',
      children: []
    },
    {
      id: 'child-2',
      text: '子节点 2',
      children: []
    }
  ]
});

// 获取根节点
const root = engine.getRoot();

// 设置布局结构
engine.setStructure('right');  // 默认

// 设置连线风格
engine.setBranchStyle('curve');  // 'curve' | 'straight'

// 设置主题
engine.setThemeId('default');

// 设置视口
engine.setViewport({
  x: 0,
  y: 0,
  zoom: 1,
});
```

### 布局计算

```typescript
// 计算布局
const layout = engine.layout(true);  // force=true 强制重新计算

// 获取内容尺寸
const bounds = engine.measureElementSize();
// { width: number, height: number }
```

### 渲染

```typescript
// 独立模式渲染
engine.paintStandalone(ctx, canvasWidth, canvasHeight, {
  background: '#f5f5f5',
  showGrid: false,
});

// 嵌入模式渲染
const layout = engine.paintEmbedded(ctx, {
  offsetX: 100,
  offsetY: 100,
});
```

### Hit 测试

```typescript
// 检测点击位置
const hitResult = engine.hitTest(localX, localY);
// { type: 'node', nodeId: 'xxx' } | { type: 'collapseButton', nodeId: 'xxx' } | null

// 获取节点矩形
const rect = engine.getNodeRect('node-id');
// { x, y, width, height } | null
```

### 适应视口

```typescript
// 自动适应画布
engine.fitView(canvasWidth, canvasHeight, 20);  // padding=20
```

---

## 布局结构

```typescript
import { MindNoteStructure } from '@lingyi-doc/mind-map';

// 9 种布局结构
type MindNoteStructure = 
  | 'right'           // 向右展开
  | 'left'            // 向左展开
  | 'balanced'        // 左右平衡
  | 'vertical'        // 垂直布局
  | 'treeRight'       // 树形向右
  | 'treeLeft'        // 树形向左
  | 'treeBalanced'    // 树形平衡
  | 'timelineH'       // 水平时间线
  | 'timelineV';      // 垂直时间线
```

### 结构示例

```typescript
// 向右展开（默认）
engine.setStructure('right');

// 左右平衡
engine.setStructure('balanced');

// 垂直时间线
engine.setStructure('timelineV');
```

---

## 连线风格

```typescript
import { MindNoteBranchStyle } from '@lingyi-doc/mind-map';

type MindNoteBranchStyle = 'curve' | 'straight';
```

```typescript
// 曲线（默认）
engine.setBranchStyle('curve');

// 直线
engine.setBranchStyle('straight');
```

---

## 主题系统

### 内置主题

```typescript
import { 
  BUILTIN_THEMES, 
  DEFAULT_THEME, 
  WHITEBOARD_THEME, 
  PRINT_THEME,
  resolveTheme 
} from '@lingyi-doc/mind-map';

// 内置主题集合
const themes = BUILTIN_THEMES;
// Map<MindmapThemeId, MindmapTheme>

// 默认主题（浅灰背景、蓝色调）
const defaultTheme = DEFAULT_THEME;

// 画板内嵌主题（透明背景）
const whiteboardTheme = WHITEBOARD_THEME;

// 打印主题（白底黑字）
const printTheme = PRINT_THEME;
```

### MindmapTheme

```typescript
interface MindmapTheme {
  id: string;
  name: string;
  background: string;          // 背景色
  node: {
    root: NodeTheme;           // 根节点样式
    level1: NodeTheme;         // 一级节点样式
    level2: NodeTheme;         // 二级节点样式
    default: NodeTheme;        // 默认节点样式
  };
  branch: {
    color: string;             // 连线颜色
    width: number;             // 连线宽度
    style: 'curve' | 'straight';
  };
  text: {
    color: string;             // 文字颜色
    fontSize: number;          // 字体大小
    fontFamily: string;        // 字体
  };
}

interface NodeTheme {
  fill: string;                // 背景色
  stroke: string;              // 边框色
  strokeWidth: number;         // 边框宽度
  borderRadius: number;        // 圆角
  textColor: string;           // 文字颜色
  fontSize: number;            // 字体大小
}
```

### 自定义主题

```typescript
const customTheme = {
  id: 'custom',
  name: '自定义主题',
  background: '#ffffff',
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
    // ...
  },
  // ...
};

// 使用自定义主题
engine.setThemeId('custom');
```

### resolveTheme

```typescript
// 解析主题（支持 patch 覆盖）
const theme = resolveTheme('default', {
  background: '#f0f0f0',
  node: {
    root: {
      fill: '#ff4d4f',
    }
  }
});
```

---

## 节点类型

```typescript
import { MindNode } from '@lingyi-doc/mind-map';

interface MindNode {
  id: string;
  text: string;
  children: MindNode[];
  completed?: boolean;         // 完成状态
  collapsed?: boolean;         // 折叠状态
  style?: NodeStyle;           // 自定义样式
  image?: string;              // 图片 URL
  shape?: NodeShape;           // 节点形状
  direction?: MindmapGrowDirection;  // 分支方向
}

interface NodeStyle {
  fill?: string;
  stroke?: string;
  textColor?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline' | 'line-through';
  borderRadius?: number;
}

type NodeShape = 
  | 'default'    // 默认矩形
  | 'rounded'    // 圆角矩形
  | 'pill'       // 胶囊形
  | 'circle'     // 圆形
  | 'diamond'    // 菱形
  | 'hexagon'    // 六边形
  | 'parallelogram';  // 平行四边形

type MindmapGrowDirection = 'up' | 'down' | 'left' | 'right';
```

### 创建节点

```typescript
const root: MindNode = {
  id: 'root',
  text: '中心主题',
  children: [
    {
      id: 'child-1',
      text: '子节点 1',
      children: [],
      completed: false,
      collapsed: false,
    },
    {
      id: 'child-2',
      text: '子节点 2',
      children: [],
      style: {
        fill: '#ff4d4f',
        textColor: '#ffffff',
      },
      shape: 'rounded',
    },
  ],
};
```

---

## 节点操作命令

```typescript
import { 
  applyMindmapAction, 
  childActionForGrowDirection,
  isMindmapInsertAction 
} from '@lingyi-doc/mind-map';

// 可用的节点操作
type MindmapNodeAction = 
  | 'child'           // 添加子节点（自动方向）
  | 'childLeft'       // 添加左侧子节点
  | 'childRight'      // 添加右侧子节点
  | 'childUp'         // 添加上方子节点
  | 'childDown'       // 添加下方子节点
  | 'sibling'         // 添加同级节点（自动方向）
  | 'siblingBefore'   // 添加前一个同级节点
  | 'siblingAfter'    // 添加后一个同级节点
  | 'parent'          // 添加父节点
  | 'delete'          // 删除节点
  | 'toggleCollapse'; // 折叠/展开

// 应用操作
const result = applyMindmapAction(root, 'node-id', 'child');
// { newRoot: MindNode, newNodeId?: string } | null

// 根据生长方向获取子节点操作
const action = childActionForGrowDirection('right');
// 'childRight'

// 判断是否为插入操作
const isInsert = isMindmapInsertAction('child');  // true
const isInsert2 = isMindmapInsertAction('delete');  // false
```

---

## 快捷操作布局

```typescript
import { 
  getMindmapQuickActionLayout,
  MINDMAP_QUICK_ACTION_TOP_EXTENT,
  QUICK_DOT_SIZE,
  QUICK_PLUS_SIZE
} from '@lingyi-doc/mind-map';

// 计算快捷按钮位置
const layout = getMindmapQuickActionLayout(nodeRect, growDirection);
// {
//   topDot: { x, y } | null,      // 上方同级添加点
//   bottomDot: { x, y } | null,    // 下方同级添加点
//   leftPlus: { x, y } | null,     // 左侧子节点添加
//   rightPlus: { x, y } | null,    // 右侧子节点添加
//   topPlus: { x, y } | null,      // 上方子节点添加
//   bottomPlus: { x, y } | null,   // 下方子节点添加
// }

// 常量
const TOP_EXTENT = MINDMAP_QUICK_ACTION_TOP_EXTENT;  // 顶部扩展区域
const DOT_SIZE = QUICK_DOT_SIZE;  // 同级添加点大小
const PLUS_SIZE = QUICK_PLUS_SIZE;  // 子节点添加按钮大小
```

---

## 图片缓存

```typescript
import { 
  collectMindmapImageSrcs,
  getCachedMindmapImage,
  loadMindmapImage,
  preloadMindmapImages
} from '@lingyi-doc/mind-map';

// 收集所有图片 URL
const imageSrcs = collectMindmapImageSrcs(root);

// 预加载图片
await preloadMindmapImages(imageSrcs);

// 获取缓存的图片
const img = getCachedMindmapImage('image-url');

// 加载单张图片
const loadedImg = await loadMindmapImage('image-url');
```

---

## 渲染函数

```typescript
import { 
  computeMindmapLayout,
  paintMindmap,
  paintMindmapBackground,
  computeThemedMindMapLayout,
  createThemeMeasureOptions
} from '@lingyi-doc/mind-map';

// 计算布局
const layout = computeMindmapLayout(root, {
  structure: 'right',
  branchStyle: 'curve',
  padding: 16,
});

// 基于主题计算布局
const themedLayout = computeThemedMindMapLayout(root, theme, {
  structure: 'right',
});

// 绘制背景
paintMindmapBackground(ctx, {
  width: canvasWidth,
  height: canvasHeight,
  background: '#f5f5f5',
});

// 绘制思维导图
paintMindmap(ctx, layout, {
  theme: DEFAULT_THEME,
  showCollapseButtons: true,
  showQuickActions: false,
});

// 创建主题测量选项
const measureOpts = createThemeMeasureOptions(theme);
```

---

## Hit 测试

```typescript
import { hitMindmapNode, getMindmapNodeRect } from '@lingyi-doc/mind-map';

// 检测点击位置
const hitResult = hitMindmapNode(layout, localX, localY);
// { type: 'node', nodeId: string } | { type: 'collapseButton', nodeId: string } | null

// 获取节点矩形
const rect = getMindmapNodeRect(layout, 'node-id');
// { x, y, width, height } | null
```

---

## 节点外观

```typescript
import { resolveNodeAppearance } from '@lingyi-doc/mind-map';

// 解析节点外观
const appearance = resolveNodeAppearance(node, depth, theme);
// {
//   fill: string,
//   stroke: string,
//   strokeWidth: number,
//   borderRadius: number,
//   textColor: string,
//   fontSize: number,
//   fontWeight: string,
// }
```

---

## 文本编辑样式

```typescript
import { resolveMindmapTextEditStyle } from '@lingyi-doc/mind-map';

// 解析文本编辑样式
const editStyle = resolveMindmapTextEditStyle(node, depth, theme);
// {
//   left: number,
//   top: number,
//   minWidth: number,
//   fontSize: number,
//   fontFamily: string,
//   color: string,
//   fontWeight: string,
// }
```

---

## 常量

```typescript
import { 
  MINDMAP_CONTENT_PADDING,
  MINDMAP_MIN_WIDTH,
  MINDMAP_MIN_HEIGHT
} from '@lingyi-doc/mind-map';

const PADDING = MINDMAP_CONTENT_PADDING;  // 16
const MIN_WIDTH = MINDMAP_MIN_WIDTH;      // 160
const MIN_HEIGHT = MINDMAP_MIN_HEIGHT;    // 120
```

---

## 完整示例

### 创建思维导图并渲染到 Canvas

```typescript
import { 
  MindmapEngine, 
  MindNode, 
  DEFAULT_THEME 
} from '@lingyi-doc/mind-map';

// 创建思维导图数据
const root: MindNode = {
  id: 'root',
  text: '产品规划',
  children: [
    {
      id: 'feature-1',
      text: '核心功能',
      children: [
        { id: 'f1-1', text: '表格编辑', children: [] },
        { id: 'f1-2', text: '文档编辑', children: [] },
        { id: 'f1-3', text: '思维导图', children: [] },
      ],
    },
    {
      id: 'feature-2',
      text: '高级功能',
      children: [
        { id: 'f2-1', text: '实时协作', children: [] },
        { id: 'f2-2', text: '版本历史', children: [] },
      ],
    },
    {
      id: 'feature-3',
      text: '扩展功能',
      children: [
        { id: 'f3-1', text: '插件系统', children: [] },
        { id: 'f3-2', text: 'API 开放', children: [] },
      ],
    },
  ],
};

// 创建引擎
const engine = new MindmapEngine({ mode: 'standalone' });
engine.setRoot(root);
engine.setStructure('right');
engine.setThemeId('default');

// 获取 Canvas
const canvas = document.getElementById('mindmap-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// 设置画布尺寸
canvas.width = 800;
canvas.height = 600;

// 计算布局
engine.layout(true);

// 适应视口
engine.fitView(canvas.width, canvas.height, 20);

// 渲染
engine.paintStandalone(ctx, canvas.width, canvas.height);
```

### 处理交互

```typescript
// 点击处理
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const hitResult = engine.hitTest(x, y);

  if (hitResult?.type === 'node') {
    console.log('点击节点:', hitResult.nodeId);
    // 选中节点
  } else if (hitResult?.type === 'collapseButton') {
    console.log('折叠/展开:', hitResult.nodeId);
    // 执行折叠/展开操作
    const result = applyMindmapAction(
      engine.getRoot(), 
      hitResult.nodeId, 
      'toggleCollapse'
    );
    if (result) {
      engine.setRoot(result.newRoot);
      engine.layout(true);
      engine.paintStandalone(ctx, canvas.width, canvas.height);
    }
  }
});

// 双击编辑
canvas.addEventListener('dblclick', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const hitResult = engine.hitTest(x, y);

  if (hitResult?.type === 'node') {
    // 显示文本编辑框
    showTextEditOverlay(hitResult.nodeId);
  }
});
```

### 动态添加节点

```typescript
// 添加子节点
const addChild = (parentId: string, text: string) => {
  const result = applyMindmapAction(engine.getRoot(), parentId, 'child');
  if (result?.newNodeId) {
    // 更新新节点的文本
    const updateResult = applyMindmapAction(
      result.newRoot,
      result.newNodeId,
      'child'  // 这里只是示例，实际需要自定义文本更新逻辑
    );
  }
};

// 添加同级节点
const addSibling = (nodeId: string, text: string) => {
  const result = applyMindmapAction(engine.getRoot(), nodeId, 'sibling');
  if (result?.newNodeId) {
    // 更新新节点的文本
  }
};

// 删除节点
const deleteNode = (nodeId: string) => {
  const result = applyMindmapAction(engine.getRoot(), nodeId, 'delete');
  if (result) {
    engine.setRoot(result.newRoot);
    engine.layout(true);
    engine.paintStandalone(ctx, canvas.width, canvas.height);
  }
};
```

### 导出为图片

```typescript
// 导出为 PNG
const exportToPng = () => {
  // 创建临时 Canvas
  const tempCanvas = document.createElement('canvas');
  const bounds = engine.measureElementSize();
  tempCanvas.width = bounds.width + 40;  // 添加边距
  tempCanvas.height = bounds.height + 40;
  
  const tempCtx = tempCanvas.getContext('2d')!;
  
  // 绘制背景
  tempCtx.fillStyle = '#ffffff';
  tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
  
  // 渲染思维导图
  engine.fitView(tempCanvas.width, tempCanvas.height, 20);
  engine.paintStandalone(tempCtx, tempCanvas.width, tempCanvas.height);
  
  // 下载
  const link = document.createElement('a');
  link.download = 'mindmap.png';
  link.href = tempCanvas.toDataURL('image/png');
  link.click();
};
```

---

## 最佳实践

1. **按需导入**：使用子路径导入减少打包体积
   ```typescript
   import { MindmapEngine } from '@lingyi-doc/mind-map';
   import { DEFAULT_THEME } from '@lingyi-doc/mind-map';
   ```

2. **性能优化**：避免频繁调用 layout
   ```typescript
   // 错误：频繁调用
   nodes.forEach(node => {
     engine.layout(true);
   });
   
   // 正确：批量更新后调用一次
   // ... 批量更新节点
   engine.layout(true);
   ```

3. **图片预加载**：确保图片加载完成后再渲染
   ```typescript
   const imageSrcs = collectMindmapImageSrcs(root);
   await preloadMindmapImages(imageSrcs);
   engine.paintStandalone(ctx, width, height);
   ```

4. **主题定制**：使用 resolveTheme 覆盖默认主题
   ```typescript
   const theme = resolveTheme('default', {
     background: '#f0f0f0',
   });
   ```

5. **嵌入模式**：在画板中使用时设置 mode: 'embedded'
   ```typescript
   const engine = new MindmapEngine({ mode: 'embedded' });
   ```
