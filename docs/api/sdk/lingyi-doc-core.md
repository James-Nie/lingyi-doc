# @lingyi-doc/core API 文档

`@lingyi-doc/core` 是零一文档系统的核心引擎，提供所有文档类型的数据模型、类型定义、渲染基础设施、公式计算、协作同步和导入导出能力。

## 特性

- 纯 TypeScript 实现，零 UI 依赖
- 支持普通表格、多维表、富文本文档、思维笔记、画板、问卷、图表
- 内置公式引擎，支持 18+ 种字段类型
- 实时协作支持（CRDT）
- 多格式导入导出（XLSX、DOCX、Markdown）

## 安装

```bash
npm install @lingyi-doc/core
```

## 模块结构

```typescript
import { 
  // 类型系统
  CellCoord, CellRange, CellValue, CellData, ColumnDef,
  
  // 数据模型
  Workbook, FreeTable, RichDocument, MindNoteDocument, WhiteboardDocument,
  
  // 渲染器
  ViewportManager, CellRenderer, ChartEngine,
  
  // 公式引擎
  FormulaEngine,
  
  // 协作
  WorkbookCollabBridge, DocumentCollabBridge,
  
  // IO
  XlsxIO, DocxIO, MarkdownIO
} from '@lingyi-doc/core';
```

---

## 类型系统 (`@lingyi-doc/core/types`)

### 坐标系统

```typescript
// 单元格坐标
interface CellCoord {
  row: number;  // 行号（0-based）
  col: number;  // 列号（0-based）
}

// 单元格范围
interface CellRange {
  start: CellCoord;
  end: CellCoord;
}

// 工具函数
coordToKey(coord: CellCoord): string;      // "0,0"
keyToCoord(key: string): CellCoord;         // { row: 0, col: 0 }
colToName(col: number): string;             // "A", "B", ...
nameToCol(name: string): number;            // 0, 1, ...
```

### 单元格值

```typescript
// 单元格值类型（判别联合）
type CellValue = 
  | { type: 'empty' }
  | { type: 'text'; value: string }
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'date'; value: number }  // 时间戳
  | { type: 'formula'; value: string; display?: string | number }
  | { type: 'error'; value: string }
  | { type: 'richtext'; value: string }  // JSON 字符串
  | { type: 'link'; value: { text: string; url: string } };

// 单元格数据
interface CellData {
  value: CellValue;
  style?: CellStyle;
  validation?: DataValidation;
  format?: string;
}

// 样式
interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  backgroundColor?: string;
  horizontalAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  borderTop?: BorderStyle;
  borderRight?: BorderStyle;
  borderBottom?: BorderStyle;
  borderLeft?: BorderStyle;
  wrap?: boolean;
}
```

### 列定义

```typescript
// 列类型
type ColumnType = 
  | 'text' | 'number' | 'currency' | 'percent' 
  | 'date' | 'datetime' | 'boolean' | 'select' | 'multiSelect'
  | 'user' | 'attachment' | 'link' | 'email' | 'phone'
  | 'formula' | 'autoNumber' | 'rating' | 'progress';

// 列定义
interface ColumnDef {
  id: string;
  name: string;
  type: ColumnType;
  width?: number;
  frozen?: boolean;
  hidden?: boolean;
  options?: SelectOption[];  // 选择字段选项
  formula?: string;          // 公式字段
  validation?: DataValidation;
}
```

### 多维表视图

```typescript
// 视图类型
type BaseViewType = 'grid' | 'kanban' | 'gantt' | 'calendar' | 'gallery' | 'form';

// 视图定义
interface BaseView {
  id: string;
  name: string;
  type: BaseViewType;
  filter?: FilterRule[];
  sort?: SortRule[];
  groupBy?: string;  // 分组字段 ID
  hiddenColumns?: string[];
}
```

---

## 数据模型 (`@lingyi-doc/core/model`)

### Workbook

工作簿管理类，支持多表操作。

```typescript
import { Workbook } from '@lingyi-doc/core';

// 创建工作簿
const workbook = new Workbook();

// 添加工作表
workbook.addSheet('Sheet1');
workbook.addSheet('多维表', 'base');  // 多维表

// 获取工作表
const sheet = workbook.getActiveSheet();
const sheetById = workbook.getSheetById('sheet-id');

// 删除工作表
workbook.removeSheet('sheet-id');

// 重命名
workbook.renameSheet('sheet-id', '新名称');

// 切换活动表
workbook.setActiveSheet('sheet-id');

// 序列化
const data = workbook.serialize();
const restored = Workbook.deserialize(data);
```

### FreeTable

核心表格操作类，提供单元格读写、行列操作、撤销重做等。

```typescript
import { FreeTable } from '@lingyi-doc/core';

const table = new FreeTable();

// 单元格操作
const value = table.getCellValue(row, col);
table.setCellValue(row, col, { type: 'text', value: 'Hello' });

// 批量设置
table.batchSetCells([
  { row: 0, col: 0, value: { type: 'text', value: 'A1' } },
  { row: 0, col: 1, value: { type: 'number', value: 100 } },
]);

// 行列操作
table.insertRow(1);
table.deleteRow(1);
table.insertColumn(1);
table.deleteColumn(1);

// 合并单元格
table.mergeCells({ start: { row: 0, col: 0 }, end: { row: 1, col: 1 } });
table.unmergeCells({ row: 0, col: 0 });

// 撤销重做
table.undo();
table.redo();
table.canUndo();  // boolean
table.canRedo();  // boolean

// 公式重算
table.recalculate();
```

### 多维表操作

```typescript
// 获取多维表记录
const records = table.getBaseRecords();
const record = table.getBaseRecordById('record-id');

// 添加记录
const newRecord = table.addBaseRecord({
  fields: {
    'field-id': { type: 'text', value: '新记录' }
  }
});

// 更新记录
table.updateBaseRecord('record-id', {
  fields: {
    'field-id': { type: 'text', value: '更新值' }
  }
});

// 删除记录
table.deleteBaseRecord('record-id');

// 字段操作
const fields = table.getBaseColumns();
table.addBaseColumn({
  name: '新字段',
  type: 'text'
});

// 视图操作
const views = table.getBaseViews();
const activeView = table.getActiveBaseView();
table.addBaseView({ name: '看板视图', type: 'kanban' });
table.setActiveBaseView('view-id');
```

---

## 公式引擎 (`@lingyi-doc/core/formula`)

```typescript
import { FormulaEngine } from '@lingyi-doc/core';

const engine = new FormulaEngine();

// 解析和计算公式
const result = engine.evaluate('=SUM(A1:A10)', {
  A1: 10,
  A2: 20,
  A3: 30,
});

// 支持的函数
// 数学: SUM, AVERAGE, COUNT, MAX, MIN, ABS, ROUND, etc.
// 文本: CONCAT, LEFT, RIGHT, MID, LEN, LOWER, UPPER, etc.
// 逻辑: IF, AND, OR, NOT, TRUE, FALSE, etc.
// 日期: TODAY, NOW, YEAR, MONTH, DAY, DATE, etc.
// 查找: VLOOKUP, HLOOKUP, INDEX, MATCH, etc.

// 依赖图
const deps = engine.getDependencies('A1');  // 返回 A1 依赖的单元格
```

---

## 渲染器 (`@lingyi-doc/core/renderer`)

### ViewportManager

视口管理器，处理滚动、缩放、冻结窗格。

```typescript
import { ViewportManager } from '@lingyi-doc/core';

const viewport = new ViewportManager({
  canvas: HTMLCanvasElement,
  table: FreeTable,
});

// 滚动
viewport.scrollTo(x, y);
viewport.scrollBy(dx, dy);

// 缩放
viewport.setZoom(1.5);
viewport.getZoom();  // 1.5

// 冻结窗格
viewport.setFreeze({ rows: 1, cols: 1 });

// 坐标转换
const cell = viewport.hitTest(x, y);  // 返回 CellCoord
const rect = viewport.getCellRect(cell);  // 返回像素坐标
```

### CellRenderer

单元格渲染器。

```typescript
import { CellRenderer } from '@lingyi-doc/core';

const renderer = new CellRenderer({
  viewport: ViewportManager,
  table: FreeTable,
});

// 渲染单元格
renderer.renderCell(ctx, coord, cellData);

// 渲染网格线
renderer.renderGridLines(ctx);

// 渲染选区
renderer.renderSelection(ctx, range);
```

### 多维表视图渲染器

```typescript
import { 
  KanbanRenderer, 
  GanttRenderer, 
  CalendarRenderer, 
  GalleryRenderer 
} from '@lingyi-doc/core';

// 看板渲染
const kanban = new KanbanRenderer({ viewport, table });
kanban.render(ctx);

// 甘特图渲染
const gantt = new GanttRenderer({ viewport, table });
gantt.render(ctx);

// 日历渲染
const calendar = new CalendarRenderer({ viewport, table });
calendar.render(ctx);

// 画廊渲染
const gallery = new GalleryRenderer({ viewport, table });
gallery.render(ctx);
```

---

## 图表引擎 (`@lingyi-doc/core/chart`)

```typescript
import { ChartEngine } from '@lingyi-doc/core';

const chart = new ChartEngine();

// 创建图表
chart.create({
  type: 'bar',  // bar, horizontalBar, line, pie
  data: {
    labels: ['Q1', 'Q2', 'Q3', 'Q4'],
    datasets: [{
      label: '销售额',
      data: [100, 200, 150, 300]
    }]
  },
  options: {
    stacked: false,  // 堆叠模式
    donut: false,    // 环形图（仅饼图）
  }
});

// 渲染到 Canvas
chart.render(ctx, { width: 400, height: 300 });
```

---

## 协作模块 (`@lingyi-doc/core/collab`)

### 表格协作

```typescript
import { WorkbookCollabBridge } from '@lingyi-doc/core';

const collab = new WorkbookCollabBridge({
  workbook: Workbook,
  websocket: WebSocket,
  userId: 'user-123',
  userName: '张三',
});

// 连接
collab.connect();

// 监听状态变化
collab.on('connectionChange', (state: CollabConnectionState) => {
  console.log('连接状态:', state);
});

// 监听在线用户
collab.on('onlineUsers', (users: OnlineUser[]) => {
  console.log('在线用户:', users);
});

// 断开
collab.disconnect();
```

### 文档协作

```typescript
import { DocumentCollabBridge } from '@lingyi-doc/core';

const collab = new DocumentCollabBridge({
  document: RichDocument | MindNoteDocument | WhiteboardDocument,
  websocket: WebSocket,
  userId: 'user-123',
});

collab.connect();
```

---

## 导入导出 (`@lingyi-doc/core/io`)

### Excel 导入导出

```typescript
import { XlsxIO } from '@lingyi-doc/core';

// 导入
const workbook = await XlsxIO.import(file);
// 或
const workbook = await XlsxIO.importFromBuffer(buffer);

// 导出
const buffer = await XlsxIO.export(workbook);
const blob = new Blob([buffer], { 
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
});
```

### Word 文档导入

```typescript
import { DocxIO } from '@lingyi-doc/core';

const doc = await DocxIO.import(file);
```

### Markdown 导入

```typescript
import { MarkdownIO } from '@lingyi-doc/core';

const doc = await MarkdownIO.import(markdownString);
```

### 富文本导出

```typescript
import { RichDocExport } from '@lingyi-doc/core';

const html = RichDocExport.toHtml(document);
const markdown = RichDocExport.toMarkdown(document);
```

---

## 富文本文档 (`@lingyi-doc/core/doc`)

```typescript
import { RichDocument } from '@lingyi-doc/core';

const doc = new RichDocument();

// 添加块
doc.addBlock({
  type: 'heading',
  level: 1,
  text: '标题'
});

doc.addBlock({
  type: 'paragraph',
  text: '正文内容'
});

doc.addBlock({
  type: 'list',
  listType: 'unordered',
  items: ['项目1', '项目2', '项目3']
});

doc.addBlock({
  type: 'code',
  language: 'typescript',
  code: 'const a = 1;'
});

doc.addBlock({
  type: 'table',
  rows: [
    [{ text: 'A1' }, { text: 'B1' }],
    [{ text: 'A2' }, { text: 'B2' }]
  ]
});

// 块操作
const blocks = doc.getBlocks();
doc.moveBlock(blockId, newIndex);
doc.deleteBlock(blockId);

// 撤销重做
doc.undo();
doc.redo();
```

---

## 思维笔记 (`@lingyi-doc/core/mindnote`)

```typescript
import { MindNoteDocument } from '@lingyi-doc/core';

const mindnote = new MindNoteDocument();

// 获取根节点
const root = mindnote.getRoot();

// 添加节点
mindnote.addNode(parentId, {
  text: '新节点',
  completed: false,
  collapsed: false,
});

// 更新节点
mindnote.updateNode(nodeId, {
  text: '更新文本'
});

// 删除节点
mindnote.deleteNode(nodeId);

// 移动节点
mindnote.moveNode(nodeId, newParentId, index);

// 设置结构
mindnote.setStructure('right');  // right/left/balanced/vertical/...

// 设置连线风格
mindnote.setBranchStyle('curve');  // curve/straight

// 撤销重做
mindnote.undo();
mindnote.redo();
```

---

## 画板 (`@lingyi-doc/core/whiteboard`)

```typescript
import { WhiteboardDocument } from '@lingyi-doc/core';

const whiteboard = new WhiteboardDocument();

// 添加元素
whiteboard.addElement({
  type: 'shape',
  shapeType: 'roundRect',
  x: 100,
  y: 100,
  width: 200,
  height: 100,
  fill: '#ffffff',
  stroke: '#000000',
});

whiteboard.addElement({
  type: 'text',
  x: 100,
  y: 200,
  text: '文本内容',
  fontSize: 16,
});

whiteboard.addElement({
  type: 'sticky',
  x: 100,
  y: 300,
  width: 200,
  height: 200,
  color: '#ffff00',
  text: '便签内容'
});

whiteboard.addElement({
  type: 'connector',
  points: [
    { x: 100, y: 150 },
    { x: 300, y: 150 }
  ],
  style: 'curve'  // straight/curve/polyline
});

whiteboard.addElement({
  type: 'image',
  x: 100,
  y: 400,
  width: 300,
  height: 200,
  src: 'image-url'
});

// 元素操作
const elements = whiteboard.getElements();
whiteboard.updateElement(elementId, { x: 200, y: 200 });
whiteboard.deleteElement(elementId);

// 画板内嵌思维导图
whiteboard.addElement({
  type: 'mindmap',
  x: 100,
  y: 500,
  width: 400,
  height: 300,
  root: {
    id: 'root',
    text: '中心主题',
    children: []
  }
});

// 撤销重做
whiteboard.undo();
whiteboard.redo();
```

---

## 问卷 (`@lingyi-doc/core/utils/questionnaireWorkbook`)

```typescript
import { createQuestionnaireWorkbook } from '@lingyi-doc/core';

// 创建问卷工作簿
const workbook = createQuestionnaireWorkbook({
  title: '用户满意度调查',
  questions: [
    {
      type: 'text',
      title: '您的姓名',
      required: true,
    },
    {
      type: 'select',
      title: '您的年龄段',
      options: ['18-25', '26-35', '36-45', '46+'],
      required: true,
    },
    {
      type: 'rating',
      title: '请为我们的服务评分',
      max: 5,
      required: true,
    },
    {
      type: 'textarea',
      title: '请提供您的建议',
      required: false,
    }
  ]
});
```

---

## 工具函数

### 评分配置

```typescript
import { RATING_CONFIGS } from '@lingyi-doc/core';

// 预设评分配置
// RATING_CONFIGS.stars - 星级评分
// RATING_CONFIGS.hearts - 心形评分
// RATING_CONFIGS.numbers - 数字评分
```

### 选择选项

```typescript
import { createSelectOption } from '@lingyi-doc/core';

const option = createSelectOption('选项1', '#ff0000');
```

### 数据验证

```typescript
import { 
  createDropdownValidation,
  createDateValidation 
} from '@lingyi-doc/core';

// 下拉验证
const validation = createDropdownValidation(['选项1', '选项2', '选项3']);

// 日期验证
const dateValidation = createDateValidation({
  min: '2024-01-01',
  max: '2024-12-31',
});
```

### 字段类型图标

```typescript
import { getFieldTypeIcon } from '@lingyi-doc/core';

const icon = getFieldTypeIcon('text');  // 返回对应图标
```

---

## 事件系统

大部分模型类都支持事件监听：

```typescript
// 工作簿事件
workbook.on('sheetAdded', (sheet) => {});
workbook.on('sheetRemoved', (sheetId) => {});
workbook.on('sheetRenamed', (sheetId, name) => {});

// 表格事件
table.on('cellChanged', (coord, value) => {});
table.on('rowInserted', (rowIndex) => {});
table.on('columnInserted', (colIndex) => {});

// 文档事件
doc.on('blockAdded', (block) => {});
doc.on('blockRemoved', (blockId) => {});
doc.on('blockMoved', (blockId, newIndex) => {});
```

---

## 最佳实践

1. **按需导入**：使用子路径导入减少打包体积
   ```typescript
   import { Workbook } from '@lingyi-doc/core/model';
   import { CellValue } from '@lingyi-doc/core/types';
   ```

2. **性能优化**：大量单元格操作使用批量 API
   ```typescript
   table.batchSetCells([...]);
   ```

3. **撤销重做**：利用内置的撤销重做系统
   ```typescript
   table.undo();
   table.redo();
   ```

4. **公式引擎**：复杂计算使用公式而非手动计算
   ```typescript
   table.setCellValue(row, col, { 
     type: 'formula', 
     value: '=SUM(A1:A10)' 
   });
   ```
