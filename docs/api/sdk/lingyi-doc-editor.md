# @lingyi-doc/editor API 文档

`@lingyi-doc/editor` 是基于 React 的编辑器组件库，为所有文档类型提供开箱即用的编辑器 UI 组件。

## 特性

- 基于 React 18+ 的组件化设计
- 集成 Ant Design UI 组件库
- 支持表格、多维表、富文本文档、思维笔记、画板、问卷、图表
- 内置 Zustand 状态管理
- 支持 Mermaid 图表渲染
- 完整的工具栏、侧边栏、状态栏组件

## 安装

```bash
npm install @lingyi-doc/editor
```

## 依赖要求

- React 18.2.0+
- React DOM 18.2.0+
- Ant Design 6.x

---

## 表格编辑器

### FreeformSheetEditor（普通表格）

```tsx
import { FreeformSheetEditor } from '@lingyi-doc/editor';
import { Workbook } from '@lingyi-doc/core';

function App() {
  const [workbook] = useState(() => new Workbook());

  return (
    <FreeformSheetEditor
      workbook={workbook}
      readOnly={false}
      onChange={(data) => {
        console.log('数据变化:', data);
      }}
    />
  );
}
```

### BaseSheetEditor（多维表）

```tsx
import { BaseSheetEditor } from '@lingyi-doc/editor';
import { Workbook } from '@lingyi-doc/core';

function App() {
  const [workbook] = useState(() => {
    const wb = new Workbook();
    wb.addSheet('数据表', 'base');
    return wb;
  });

  return (
    <BaseSheetEditor
      workbook={workbook}
      readOnly={false}
      onChange={(data) => {
        console.log('数据变化:', data);
      }}
    />
  );
}
```

### SheetEditorProps

```typescript
interface SheetEditorProps {
  workbook: Workbook;           // 工作簿实例
  readOnly?: boolean;           // 只读模式
  onChange?: (data: any) => void;
  onSave?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

interface BaseSheetEditorProps extends SheetEditorProps {
  showSidebar?: boolean;        // 显示侧边栏
  showToolbar?: boolean;        // 显示工具栏
  showStatusBar?: boolean;      // 显示状态栏
}
```

---

## 表格子组件

### SheetContainer

表格容器组件。

```tsx
import { SheetContainer } from '@lingyi-doc/editor';

<SheetContainer
  workbook={workbook}
  readOnly={false}
>
  {/* 子组件 */}
</SheetContainer>
```

### CellEditor

单元格编辑器。

```tsx
import { CellEditor } from '@lingyi-doc/editor';

<CellEditor
  coord={{ row: 0, col: 0 }}
  value={cellValue}
  onChange={(newValue) => {}}
  onBlur={() => {}}
/>
```

### ContextMenu

右键菜单。

```tsx
import { ContextMenu } from '@lingyi-doc/editor';

<ContextMenu
  visible={true}
  position={{ x: 100, y: 100 }}
  items={[
    { key: 'copy', label: '复制' },
    { key: 'paste', label: '粘贴' },
    { key: 'delete', label: '删除' },
  ]}
  onClick={(key) => {}}
  onClose={() => {}}
/>
```

---

## 工具栏组件

### Toolbar（普通表格工具栏）

```tsx
import { Toolbar } from '@lingyi-doc/editor';

<Toolbar
  workbook={workbook}
  readOnly={false}
/>
```

### BaseToolbar（多维表工具栏）

```tsx
import { BaseToolbar } from '@lingyi-doc/editor';

<BaseToolbar
  workbook={workbook}
  readOnly={false}
/>
```

### ToolbarPopover

工具栏弹出层。

```tsx
import { ToolbarPopover } from '@lingyi-doc/editor';

<ToolbarPopover
  trigger={<button>格式</button>}
  content={<div>格式选项</div>}
/>
```

### FormulaBar

公式栏。

```tsx
import { FormulaBar } from '@lingyi-doc/editor';

<FormulaBar
  workbook={workbook}
  readOnly={false}
/>
```

### StatusBar

状态栏。

```tsx
import { StatusBar } from '@lingyi-doc/editor';

<StatusBar
  workbook={workbook}
/>
```

### SheetTabs

Sheet 标签页。

```tsx
import { SheetTabs } from '@lingyi-doc/editor';

<SheetTabs
  workbook={workbook}
  readOnly={false}
/>
```

---

## 多维表组件

### BaseSidebar

多维表侧边栏。

```tsx
import { BaseSidebar } from '@lingyi-doc/editor';

<BaseSidebar
  workbook={workbook}
  readOnly={false}
/>
```

### BaseViewSidebar

视图侧边栏。

```tsx
import { BaseViewSidebar } from '@lingyi-doc/editor';

<BaseViewSidebar
  workbook={workbook}
  readOnly={false}
/>
```

### FieldManagePopover

字段管理弹出框。

```tsx
import { FieldManagePopover } from '@lingyi-doc/editor';

<FieldManagePopover
  workbook={workbook}
  readOnly={false}
  trigger={<button>管理字段</button>}
/>
```

### FieldConfigPanel

字段配置面板。

```tsx
import { FieldConfigPanel } from '@lingyi-doc/editor';

<FieldConfigPanel
  field={fieldDef}
  onChange={(updatedField) => {}}
/>
```

### RecordDetailModal

记录详情弹窗。

```tsx
import { RecordDetailModal } from '@lingyi-doc/editor';

<RecordDetailModal
  workbook={workbook}
  recordId="record-123"
  visible={true}
  onClose={() => {}}
/>
```

### RecordDetailDrawer

记录详情抽屉。

```tsx
import { RecordDetailDrawer } from '@lingyi-doc/editor';

<RecordDetailDrawer
  workbook={workbook}
  recordId="record-123"
  open={true}
  onClose={() => {}}
/>
```

---

## 表单视图组件

### FormViewEditor

表单视图编辑器。

```tsx
import { FormViewEditor } from '@lingyi-doc/editor';

<FormViewEditor
  workbook={workbook}
  readOnly={false}
/>
```

### PublicFormFillView

公开表单填写视图。

```tsx
import { PublicFormFillView } from '@lingyi-doc/editor';

<PublicFormFillView
  workbook={workbook}
  viewId="form-view-id"
  onSubmit={(data) => {
    console.log('提交数据:', data);
  }}
/>
```

---

## 图表组件

### ChartInsertDialog

图表插入对话框。

```tsx
import { ChartInsertDialog } from '@lingyi-doc/editor';

<ChartInsertDialog
  visible={true}
  workbook={workbook}
  onInsert={(chartConfig) => {}}
  onCancel={() => {}}
/>
```

### ChartOverlay

图表浮层。

```tsx
import { ChartOverlay } from '@lingyi-doc/editor';

<ChartOverlay
  chart={chartInstance}
  visible={true}
/>
```

### ChartRenderer

图表渲染器。

```tsx
import { ChartRenderer } from '@lingyi-doc/editor';

<ChartRenderer
  chart={chartInstance}
  width={400}
  height={300}
/>
```

### ChartEditor

图表编辑器。

```tsx
import { ChartEditor } from '@lingyi-doc/editor';

<ChartEditor
  chart={chartInstance}
  onChange={(updatedChart) => {}}
/>
```

---

## 富文本文档组件

### RichDocEditor

富文本文档编辑器。

```tsx
import { RichDocEditor, RichDocEditorSaveRef } from '@lingyi-doc/editor';
import { RichDocument } from '@lingyi-doc/core';

function App() {
  const [doc] = useState(() => new RichDocument());
  const saveRef = useRef<RichDocEditorSaveRef>(null);

  const handleSave = async () => {
    const data = await saveRef.current?.save();
    console.log('保存数据:', data);
  };

  return (
    <>
      <button onClick={handleSave}>保存</button>
      <RichDocEditor
        ref={saveRef}
        document={doc}
        readOnly={false}
        onChange={(data) => {
          console.log('内容变化:', data);
        }}
      />
    </>
  );
}
```

### RichDocEditorProps

```typescript
interface RichDocEditorProps {
  document: RichDocument;
  readOnly?: boolean;
  onChange?: (data: any) => void;
  onSave?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

interface RichDocEditorSaveRef {
  save: () => Promise<any>;
  undo: () => void;
  redo: () => void;
}
```

### RichDocPreview

富文本文档预览。

```tsx
import { RichDocPreview } from '@lingyi-doc/editor';

<RichDocPreview
  document={doc}
  className="preview-container"
/>
```

### DocToolbar

文档工具栏。

```tsx
import { DocToolbar } from '@lingyi-doc/editor';

<DocToolbar
  document={doc}
  readOnly={false}
/>
```

### DocOutline

文档大纲。

```tsx
import { DocOutline } from '@lingyi-doc/editor';

<DocOutline
  document={doc}
  onHeadingClick={(blockId) => {}}
/>
```

### DocCommentPanel

评论面板。

```tsx
import { DocCommentPanel } from '@lingyi-doc/editor';

<DocCommentPanel
  document={doc}
  visible={true}
/>
```

---

## 思维笔记组件

### MindNoteEditor

思维笔记编辑器。

```tsx
import { MindNoteEditor } from '@lingyi-doc/editor';
import { MindNoteDocument } from '@lingyi-doc/core';

function App() {
  const [mindnote] = useState(() => new MindNoteDocument());

  return (
    <MindNoteEditor
      document={mindnote}
      readOnly={false}
      onChange={(data) => {
        console.log('思维笔记变化:', data);
      }}
    />
  );
}
```

### MindNoteEditorProps

```typescript
interface MindNoteEditorProps {
  document: MindNoteDocument;
  readOnly?: boolean;
  onChange?: (data: any) => void;
  className?: string;
  style?: React.CSSProperties;
}
```

### MindNoteOutlineView

大纲视图。

```tsx
import { MindNoteOutlineView } from '@lingyi-doc/editor';

<MindNoteOutlineView
  document={mindnote}
  readOnly={false}
/>
```

### MindNoteMapView

导图视图。

```tsx
import { MindNoteMapView, MindMapViewApi } from '@lingyi-doc/editor';

function App() {
  const mapApiRef = useRef<MindMapViewApi>(null);

  return (
    <MindNoteMapView
      document={mindnote}
      readOnly={false}
      onReady={(api) => {
        mapApiRef.current = api;
        // api.fitView()
        // api.goToNode('node-id')
      }}
    />
  );
}
```

### MindNoteMapNodeToolbar

节点工具栏。

```tsx
import { MindNoteMapNodeToolbar } from '@lingyi-doc/editor';

<MindNoteMapNodeToolbar
  nodeId="node-123"
  position={{ left: 100, top: 100 }}
  onAddChild={() => {}}
  onAddSibling={() => {}}
  onDelete={() => {}}
/>
```

---

## 画板组件

### WhiteboardEditor

画板编辑器。

```tsx
import { WhiteboardEditor } from '@lingyi-doc/editor';
import { WhiteboardDocument } from '@lingyi-doc/core';

function App() {
  const [whiteboard] = useState(() => new WhiteboardDocument());

  return (
    <WhiteboardEditor
      document={whiteboard}
      readOnly={false}
      onChange={(data) => {
        console.log('画板变化:', data);
      }}
    />
  );
}
```

### WhiteboardEditorProps

```typescript
interface WhiteboardEditorProps {
  document: WhiteboardDocument;
  readOnly?: boolean;
  onChange?: (data: any) => void;
  className?: string;
  style?: React.CSSProperties;
}
```

### WhiteboardEmbedPreview

画板嵌入预览。

```tsx
import { WhiteboardEmbedPreview } from '@lingyi-doc/editor';

<WhiteboardEmbedPreview
  document={whiteboard}
  width={400}
  height={300}
/>
```

### 导出为图片

```tsx
import { 
  downloadWhiteboardElementsAsPng,
  renderWhiteboardElementsToDataUrl,
  resolveWhiteboardElementsForExport
} from '@lingyi-doc/editor';

// 下载为 PNG
await downloadWhiteboardElementsAsPng(elements, 'whiteboard.png');

// 渲染为 DataURL
const dataUrl = await renderWhiteboardElementsToDataUrl(elements, {
  width: 800,
  height: 600,
  scale: 2,
});

// 解析导出元素
const exportElements = resolveWhiteboardElementsForExport(whiteboard);
```

---

## 状态管理

### useSheetStore

Zustand store，管理表格状态。

```tsx
import { useSheetStore } from '@lingyi-doc/editor';

function StatusBar() {
  const { 
    selection, 
    zoom, 
    scrollLeft, 
    scrollTop,
    activeViewId 
  } = useSheetStore();

  return (
    <div>
      <span>缩放: {zoom}%</span>
      <span>选区: {selection?.toString()}</span>
    </div>
  );
}
```

### Store 状态

```typescript
interface SheetStore {
  // 选区
  selection: CellRange | null;
  setSelection: (range: CellRange | null) => void;
  
  // 缩放
  zoom: number;
  setZoom: (zoom: number) => void;
  
  // 滚动
  scrollLeft: number;
  scrollTop: number;
  setScroll: (left: number, top: number) => void;
  
  // 多维表视图
  activeViewId: string | null;
  setActiveViewId: (id: string | null) => void;
  
  // 工具栏状态
  isBold: boolean;
  isItalic: boolean;
  // ...
}
```

---

## 表单视图工具函数

```typescript
import {
  ensureFormView,
  activateBaseView,
  getActiveBaseView,
  ensureActiveBaseView,
  applySheetStoreFromBaseView,
  updateFormViewConfig,
  updateBaseViewGroupRules,
  updateBaseViewFilter,
  updateBaseViewSort,
  updateCollapsedGroupKeys,
  expandGroupPathKeys,
  toggleGroupByField,
  isFieldGrouped
} from '@lingyi-doc/editor';

// 确保表单视图存在
const formView = ensureFormView(workbook);

// 激活视图
activateBaseView(workbook, viewId);

// 获取当前视图
const view = getActiveBaseView(workbook);

// 更新表单配置
updateFormViewConfig(workbook, viewId, {
  title: '新标题',
  description: '新描述',
});

// 更新分组规则
updateBaseViewGroupRules(workbook, viewId, ['field-id']);

// 更新筛选
updateBaseViewFilter(workbook, viewId, [
  { fieldId: 'field-id', operator: 'equals', value: '值' }
]);

// 更新排序
updateBaseViewSort(workbook, viewId, [
  { fieldId: 'field-id', direction: 'asc' }
]);
```

---

## 评论系统

### useDocCommentController

```tsx
import { useDocCommentController, DocCommentAuthor } from '@lingyi-doc/editor';

function CommentPanel() {
  const {
    comments,
    addComment,
    resolveComment,
    deleteComment,
  } = useDocCommentController({
    document: doc,
    currentAuthor: {
      id: 'user-123',
      name: '张三',
      avatar: 'avatar-url',
    } as DocCommentAuthor,
    onUpdate: (comments) => {
      console.log('评论更新:', comments);
    },
  });

  return (
    <div>
      {comments.map(comment => (
        <div key={comment.id}>
          <p>{comment.content}</p>
          <button onClick={() => resolveComment(comment.id)}>
            解决
          </button>
        </div>
      ))}
    </div>
  );
}
```

---

## 打印功能

```tsx
import { printMindNoteMap, printWhiteboard } from '@lingyi-doc/editor';

// 打印思维导图
await printMindNoteMap(mindnote);

// 打印画板
await printWhiteboard(whiteboard);
```

---

## 完整示例

### 多维表应用

```tsx
import React, { useState } from 'react';
import { Workbook } from '@lingyi-doc/core';
import { 
  BaseSheetEditor, 
  SheetAntdProvider 
} from '@lingyi-doc/editor';

function App() {
  const [workbook] = useState(() => {
    const wb = new Workbook();
    wb.addSheet('项目管理', 'base');
    return wb;
  });

  const handleChange = (data: any) => {
    console.log('数据变化:', data);
  };

  const handleSave = async () => {
    const data = workbook.serialize();
    await fetch('/api/save', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  };

  return (
    <SheetAntdProvider>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <header style={{ padding: '16px', borderBottom: '1px solid #eee' }}>
          <h1>项目管理</h1>
          <button onClick={handleSave}>保存</button>
        </header>
        <main style={{ flex: 1, overflow: 'hidden' }}>
          <BaseSheetEditor
            workbook={workbook}
            readOnly={false}
            onChange={handleChange}
          />
        </main>
      </div>
    </SheetAntdProvider>
  );
}
```

### 富文本文档应用

```tsx
import React, { useState, useRef } from 'react';
import { RichDocument } from '@lingyi-doc/core';
import { 
  RichDocEditor, 
  RichDocEditorSaveRef,
  DocToolbar,
  DocOutline,
  SheetAntdProvider 
} from '@lingyi-doc/editor';

function App() {
  const [doc] = useState(() => new RichDocument());
  const saveRef = useRef<RichDocEditorSaveRef>(null);

  const handleSave = async () => {
    const data = await saveRef.current?.save();
    console.log('保存:', data);
  };

  return (
    <SheetAntdProvider>
      <div style={{ display: 'flex', height: '100vh' }}>
        <aside style={{ width: 240, borderRight: '1px solid #eee' }}>
          <DocOutline document={doc} />
        </aside>
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <DocToolbar document={doc} />
          <div style={{ flex: 1, overflow: 'auto' }}>
            <RichDocEditor
              ref={saveRef}
              document={doc}
              readOnly={false}
            />
          </div>
        </main>
      </div>
    </SheetAntdProvider>
  );
}
```

### 思维笔记应用

```tsx
import React, { useState } from 'react';
import { MindNoteDocument } from '@lingyi-doc/core';
import { 
  MindNoteEditor, 
  MindNoteMapView,
  MindNoteOutlineView,
  SheetAntdProvider 
} from '@lingyi-doc/editor';

function App() {
  const [mindnote] = useState(() => new MindNoteDocument());
  const [viewMode, setViewMode] = useState<'map' | 'outline'>('map');

  return (
    <SheetAntdProvider>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <header style={{ padding: '16px', borderBottom: '1px solid #eee' }}>
          <button onClick={() => setViewMode('map')}>导图视图</button>
          <button onClick={() => setViewMode('outline')}>大纲视图</button>
        </header>
        <main style={{ flex: 1, overflow: 'hidden' }}>
          {viewMode === 'map' ? (
            <MindNoteMapView document={mindnote} readOnly={false} />
          ) : (
            <MindNoteOutlineView document={mindnote} readOnly={false} />
          )}
        </main>
      </div>
    </SheetAntdProvider>
  );
}
```

### 画板应用

```tsx
import React, { useState } from 'react';
import { WhiteboardDocument } from '@lingyi-doc/core';
import { 
  WhiteboardEditor,
  downloadWhiteboardElementsAsPng,
  SheetAntdProvider 
} from '@lingyi-doc/editor';

function App() {
  const [whiteboard] = useState(() => new WhiteboardDocument());

  const handleExport = async () => {
    const elements = whiteboard.getElements();
    await downloadWhiteboardElementsAsPng(elements, '画板导出.png');
  };

  return (
    <SheetAntdProvider>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <header style={{ padding: '16px', borderBottom: '1px solid #eee' }}>
          <h1>画板</h1>
          <button onClick={handleExport}>导出为图片</button>
        </header>
        <main style={{ flex: 1, overflow: 'hidden' }}>
          <WhiteboardEditor
            document={whiteboard}
            readOnly={false}
          />
        </main>
      </div>
    </SheetAntdProvider>
  );
}
```

---

## 最佳实践

1. **使用 SheetAntdProvider**：确保 Ant Design 主题和样式正确注入
   ```tsx
   <SheetAntdProvider>
     <YourEditor />
   </SheetAntdProvider>
   ```

2. **使用 useRef 保存**：通过 ref 调用保存方法
   ```tsx
   const saveRef = useRef<RichDocEditorSaveRef>(null);
   const data = await saveRef.current?.save();
   ```

3. **受控模式**：使用 onChange 监听数据变化
   ```tsx
   <FreeformSheetEditor
     workbook={workbook}
     onChange={(data) => {
       // 保存到服务器
     }}
   />
   ```

4. **只读模式**：预览场景使用 readOnly
   ```tsx
   <RichDocEditor document={doc} readOnly={true} />
   ```

5. **按需导入组件**：减少打包体积
   ```typescript
   import { FreeformSheetEditor } from '@lingyi-doc/editor/components';
   ```
