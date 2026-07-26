# @lingyi-doc/editor-sheet

表格编辑器组件包，提供多维表、普通表格、仪表盘等功能的 React 组件。

## 功能特性

- **多维表编辑器**：支持表单视图、看板视图、分组视图等多种视图模式
- **普通表格编辑器**：支持自由表格的创建和编辑
- **仪表盘**：支持图表、指标卡片、进度条等多种可视化组件
- **图表编辑器**：支持多种图表类型的创建和配置
- **字段管理**：支持字段的增删改查、排序、筛选、分组
- **公式支持**：内置公式引擎，支持复杂计算
- **协作编辑**：支持多人实时协作

## 安装

```bash
npm install @lingyi-doc/editor-sheet
```

## 依赖

- React 18.2+
- React DOM 18.2+
- Ant Design 6.4+
- @lingyi-doc/core-sheet
- @lingyi-doc/core-types
- @lingyi-doc/core-doc
- @lingyi-doc/core-client
- @lingyi-doc/editor-shared

## 核心组件

### SheetContainer

表格容器组件，是表格编辑器的核心入口。

```tsx
import { SheetContainer } from '@lingyi-doc/editor-sheet';

<SheetContainer
  table={freeTable}
  readOnly={false}
/>
```

**SheetContainerProps**：

| 属性 | 类型 | 说明 |
|------|------|------|
| table | FreeTable | 表格数据模型 |
| style | React.CSSProperties | 自定义样式 |
| selectedChartId | string \| null | 当前选中的图表 ID |
| onSelectChart | (chartId: string \| null) => void | 图表选中回调 |
| onOpenFieldConfig | (fieldId?: string \| null) => void | 打开字段配置面板 |
| onToggleFieldVisibility | (fieldId: string, visible: boolean) => void | 切换字段可见性 |
| onDeleteField | (fieldId: string) => void | 删除字段 |
| previewMode | boolean | 只读预览：不读写全局 sheetStore，不挂载编辑/菜单等交互层 |
| embedMode | boolean | 仪表盘嵌入：只读展示 + 本地滚动（不写全局 scroll store） |
| viewIdOverride | string | 使用指定 Base 视图的筛选/分组/排序（默认当前 activeView） |
| onAddSheetComment | (request: SheetCommentRequest) => void | 添加评论 |
| commentsEnabled | boolean | 是否启用评论 |
| sheetCommentThreads | DocCommentThread[] | 当前 sheet 的评论线程（用于单元格高亮） |
| selectedCommentId | string \| null | 评论面板选中的 threadId |
| onSelectComment | (threadId: string) => void | 点击评论标记时选中对应评论 |

### BaseSheetEditor

多维表编辑器，支持多种视图模式。

```tsx
import { BaseSheetEditor } from '@lingyi-doc/editor-sheet';

<BaseSheetEditor
  table={freeTable}
  currentView="form"
  activeFormView={activeView}
  onSelectView={(viewId) => {}}
  onFormViewChange={() => {}}
/>
```

**BaseSheetEditorProps**：

| 属性 | 类型 | 说明 |
|------|------|------|
| table | FreeTable | 表格数据模型 |
| currentView | BaseViewType | 当前视图类型（form/kanban） |
| activeFormView | BaseView \| null | 当前激活的表单视图 |
| activeKanbanView | BaseView \| null | 当前激活的看板视图 |
| onSelectView | (viewId: string) => void | 切换视图回调 |
| onCreateView | (viewType: BaseViewType) => void | 创建视图 |
| onRenameView | (viewId: string, name: string) => void | 重命名视图 |
| onDuplicateView | (viewId: string) => void | 复制视图 |
| onDeleteView | (viewId: string) => void | 删除视图 |
| onFormViewChange | () => void | 表单视图变更回调 |
| onKanbanViewChange | () => void | 看板视图变更回调 |
| toolbar | React.ReactNode | 自定义工具栏 |
| readOnly | boolean | 是否只读 |
| dashboards | DashboardModel[] | 仪表盘列表 |
| activeDashboardId | string \| null | 当前激活的仪表盘 |
| onSelectDashboard | (dashboardId: string) => void | 选择仪表盘 |
| onCreateDashboard | () => void | 创建仪表盘 |

### FreeformSheetEditor

普通表格编辑器，用于自由表格的编辑。

```tsx
import { FreeformSheetEditor } from '@lingyi-doc/editor-sheet';

<FreeformSheetEditor
  table={freeTable}
/>
```

### DashboardEditor

仪表盘编辑器，支持多种可视化组件。

```tsx
import { DashboardEditor } from '@lingyi-doc/editor-sheet';

<DashboardEditor
  dashboard={dashboard}
  table={freeTable}
  readOnly={false}
  onChange={(updated) => {}}
/>
```

**DashboardEditorProps**：

| 属性 | 类型 | 说明 |
|------|------|------|
| dashboard | DashboardModel | 仪表盘数据模型 |
| table | FreeTable | 关联的表格数据模型 |
| readOnly | boolean | 是否只读模式 |
| onChange | (dashboard: DashboardModel) => void | 仪表盘变更回调 |

### Toolbar

表格工具栏组件。

```tsx
import { Toolbar } from '@lingyi-doc/editor-sheet';

<Toolbar
  table={freeTable}
  selectedCell={selectedCell}
  onAction={(action) => {}}
/>
```

### KanbanView

看板视图组件。

```tsx
import { KanbanView } from '@lingyi-doc/editor-sheet';

<KanbanView
  table={freeTable}
  view={kanbanView}
/>
```

## 核心 Hooks

### useSheetStore

表格状态管理 Hook。

```tsx
import { useSheetStore } from '@lingyi-doc/editor-sheet';

const sheetStore = useSheetStore();
```

## 视图管理工具函数

| 函数 | 说明 |
|------|------|
| ensureFormView | 确保表单视图存在 |
| activateBaseView | 激活指定视图 |
| getActiveBaseView | 获取当前激活视图 |
| createKanbanView | 创建看板视图 |
| createGridView | 创建网格视图 |
| renameBaseView | 重命名视图 |
| duplicateBaseView | 复制视图 |
| deleteBaseView | 删除视图 |
| updateBaseViewGroupRules | 更新分组规则 |
| updateBaseViewFilter | 更新筛选条件 |
| updateBaseViewSort | 更新排序 |

## 仪表盘 API

### Widget 配置面板注册

```tsx
import { registerWidgetConfigPanel } from '@lingyi-doc/editor-sheet';

registerWidgetConfigPanel({
  type: 'chart',
  panel: ChartConfigPanel,
});
```

### 确保仪表盘存在

```tsx
import { ensureDashboardForSheet } from '@lingyi-doc/editor-sheet';

const { dashboards, activeId } = ensureDashboardForSheet(
  existingDashboards,
  sheetId,
  columnDefs
);
```

**参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| existing | DashboardModel[] | 已有的仪表盘列表 |
| sheetId | string | 源表格 ID |
| columnDefs | ColumnDef[] | 列定义列表 |

**返回值**：

| 字段 | 类型 | 说明 |
|------|------|------|
| dashboards | DashboardModel[] | 更新后的仪表盘列表 |
| activeId | string | 当前激活的仪表盘 ID |

## 图表组件

| 组件 | 说明 |
|------|------|
| ChartInsertDialog | 图表插入对话框 |
| ChartOverlay | 图表覆盖层 |
| ChartRenderer | 图表渲染器 |
| ChartEditor | 图表编辑器 |

## 字段管理组件

| 组件 | 说明 |
|------|------|
| FieldManagePopover | 字段管理弹窗 |
| FieldConfigPanel | 字段配置面板 |
| ColumnHeaderFilterPanel | 列头筛选面板 |
| ColumnHeaderMenu | 列头菜单 |

## 记录详情组件

| 组件 | 说明 |
|------|------|
| RecordDetailDrawer | 记录详情抽屉 |
| RecordDetailModal | 记录详情弹窗 |
| DeleteRecordsDialog | 删除记录对话框 |

## 工具组件

| 组件 | 说明 |
|------|------|
| FormulaBar | 公式栏 |
| StatusBar | 状态栏 |
| SheetTabs | 表格标签页 |
| ContextMenu | 右键菜单 |
| ColorPicker | 颜色选择器 |
| AlignmentPicker | 对齐选择器 |

## 类型定义

### SheetEditorProps

表格编辑器基础属性。

### BaseSheetEditorProps

多维表编辑器属性，继承 SheetEditorProps。

### DashboardEditorProps

仪表盘编辑器属性。

### PublicFormSchemaField

公共表单字段类型。

### WidgetConfigPanelDescriptor

Widget 配置面板描述符。

## 使用示例

### 基础表格编辑

```tsx
import { SheetContainer, useSheetStore } from '@lingyi-doc/editor-sheet';
import { FreeTable } from '@lingyi-doc/core-sheet';

function MySheetEditor({ table }: { table: FreeTable }) {
  const sheetStore = useSheetStore();
  
  return (
    <SheetContainer
      table={table}
      readOnly={false}
    />
  );
}
```

### 多维表编辑

```tsx
import { BaseSheetEditor } from '@lingyi-doc/editor-sheet';
import { FreeTable, BaseView } from '@lingyi-doc/core-sheet';
import { BaseViewType } from '@lingyi-doc/core-types';

function MyBaseSheetEditor({ 
  table, 
  views, 
  activeViewId 
}: { 
  table: FreeTable;
  views: BaseView[];
  activeViewId: string;
}) {
  const activeView = views.find(v => v.id === activeViewId);
  
  return (
    <BaseSheetEditor
      table={table}
      currentView="form"
      activeFormView={activeView || null}
      onSelectView={(viewId) => {
        // 切换视图
      }}
      onFormViewChange={() => {
        // 视图变更
      }}
    />
  );
}
```

### 仪表盘编辑

```tsx
import { DashboardEditor, ensureDashboardForSheet } from '@lingyi-doc/editor-sheet';
import { FreeTable, DashboardModel, ColumnDef } from '@lingyi-doc/core-sheet';

function MyDashboardEditor({ 
  table, 
  existingDashboards 
}: { 
  table: FreeTable;
  existingDashboards: DashboardModel[];
}) {
  const { dashboards, activeId } = ensureDashboardForSheet(
    existingDashboards,
    table.sheetId,
    table.sheet.columnDefs as ColumnDef[]
  );
  const dashboard = dashboards.find(d => d.id === activeId);
  
  if (!dashboard) return null;
  
  return (
    <DashboardEditor
      dashboard={dashboard}
      table={table}
      onChange={(updated) => {
        // 更新仪表盘
      }}
    />
  );
}
```

## 注意事项

1. 使用前需确保 `SheetAntdProvider` 已正确配置
2. 表格数据模型 `FreeTable` 需要从 `@lingyi-doc/core-sheet` 导入
3. 视图管理函数需要配合状态管理使用
4. 仪表盘功能依赖 `react-grid-layout` 和 `@ant-design/charts`
