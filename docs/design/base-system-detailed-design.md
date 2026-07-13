# 自研多维表格系统（Base）详细设计方案

> 版本：v1.0  
> 日期：2026-06-16  
> 基于现有自研表格系统（双模：标准表+自由表）进行扩展设计

---

## 一、设计概述与定位

### 1.1 产品定义

多维表格（Base）是一款以**关系型数据库为内核、表格交互为外壳**的零代码业务应用搭建平台。它融合电子表格的易用性与数据库的结构化能力，用户无需编写代码，即可通过可视化操作快速构建项目管理、客户管理、库存管理等各类业务系统。

### 1.2 与普通表格的关系

现有自研表格系统已具备**双模架构**：
- **自由表（freeform）**：传统 Excel 模式，二维单元格矩阵，支持合并单元格、公式计算、自由格式
- **标准表（standard）**：结构化数据模式，强类型字段、记录行、列定义，已支持 18 种字段类型

**多维表格（Base）** 是在标准表能力上的**重大升级**：
1. 扩展字段类型体系（新增关联、查找引用、汇总等数据库级字段）
2. 增加表间关联能力（单向关联、双向关联、Lookup、Rollup）
3. 构建多视图系统（表格/看板/甘特/日历/画廊/表单）
4. 引入四级权限体系（应用/表/视图/字段/行级）
5. 增加自动化工作流与仪表盘分析能力
6. 强化协同能力（实时协作、评论、历史版本）

> **关键决策**：多维表格不独立新建产品，而是作为标准表模式的**超集**进行渐进式扩展。SheetModel 的 `type` 从 `'standard' | 'freeform'` 扩展为 `'standard' | 'freeform' | 'base'`，其中 `base` 继承 `standard` 的全部能力并追加多维特性。

---

## 二、与普通表格的复用关系分析

### 2.1 复用矩阵

| 模块 | 复用度 | 说明 | 具体复用内容 | 需新增/改造内容 |
|------|--------|------|-------------|---------------|
| **Canvas 渲染引擎** | 80% | 表格视图可直接复用，其他视图需新增渲染器 | ViewportManager、LayerManager、DirtyTracker、QuadTree、CellRenderer、虚拟滚动、列头/行头绘制 | 看板渲染器（KanbanRenderer）、甘特渲染器（GanttRenderer）、日历渲染器（CalendarRenderer）、画廊渲染器（GalleryRenderer） |
| **数据模型层** | 60% | SheetModel 基础结构可复用，需扩展多维字段 | SheetModel 接口、RecordRow 结构、ColumnDef 类型定义 | 新增关联字段类型、Lookup/Rollup 字段、视图配置（ViewConfig）、权限规则（PermissionRule） |
| **公式引擎** | 70% | 现有公式解析/计算/依赖图可复用，需扩展跨表引用 | RecalcEngine、Parser、DependencyGraph、AST 节点 | 跨表引用语法（`TableName.field`）、关联字段值解析、Lookup 值穿透计算、Rollup 聚合函数 |
| **协同引擎** | 90% | CRDT 操作合并、WebSocket 通道、版本号管理完全复用 | CrdtOperation、SyncManager、WebSocket 连接、HLC 时钟 | 新增操作类型（`create_record`/`delete_record`/`move_record`/`set_field_property`/`add_view`/`update_view`） |
| **状态管理（Store）** | 75% | Zustand Store 架构复用，需扩展多维状态 | useSheetStore 结构、selection、editingCell、formulaBarText | 新增视图状态（activeViewId、viewConfigs）、筛选器状态、分组状态、行级权限状态 |
| **Toolbar / 工具栏** | 50% | 部分工具按钮可复用，需新增多维专属操作 | 放大/缩小、撤销/重做、字体样式（Bold/Italic） | 字段配置、视图配置、筛选、分组、行高、生成表单、评论、添加记录 |
| **SheetTabs** | 85% | Sheet 切换标签可复用，需增加创建菜单 | SheetTabs 组件、新增 Sheet 按钮 | 新增"新建电子表格"和"新建多维表格"下拉菜单 |
| **导入导出** | 70% | CSV/Excel 导入导出逻辑复用，需适配多维字段 | 分片上传、流式解析、XLSX 生成 | 关联字段导出为 ID 或名称、多选字段导出为逗号分隔、附件字段导出为 URL 列表 |
| **权限体系** | 40% | 现有 JWT + RBAC 基础可复用，需新增多维权限模型 | JWT 认证、RBAC 中间件、用户/团队表 | 四级权限体系（表/视图/字段/行级）、条件权限、角色体系 |
| **快捷键系统** | 80% | 导航/编辑/格式化快捷键完全复用 | 40+ 键映射、方向键导航、Ctrl+C/V/X/Z/Y | 视图切换快捷键（Ctrl+Shift+1~6）、记录操作快捷键（Ctrl+Enter 新增行） |
| **图表系统** | 60% | 现有图表 Overlay 和 ChartInstance 可复用，需适配多维数据源 | ChartOverlay、ChartRenderer、ChartEditor | 图表数据源从 CellRange 切换为 TableQuery，支持跨表关联分析 |
| **后端服务** | 65% | 数据库 DDL、Redis 缓存、ES 索引、REST API 框架复用 | PG 表结构、Redis 缓存结构、限流算法、JWT 中间件 | 新增多维表元数据表（base_fields、base_views、base_relations、base_permissions）、视图查询引擎、关联查询优化器 |

### 2.2 不可复用模块（必须全新设计）

| 模块 | 不可复用原因 | 全新设计要点 |
|------|------------|-------------|
| **关联字段系统** | 现有表格无表间关联概念，CellValue 类型不支持关联引用 | 设计 LinkToRecord / Lookup / Rollup 三种字段类型，建立关联关系表，实现跨表查询引擎 |
| **多视图渲染引擎** | 看板/甘特/日历/画廊/表单与表格的渲染范式完全不同 | 基于 React 的独立视图组件（非 Canvas），每个视图有独立的渲染逻辑和交互模型 |
| **视图查询引擎** | 现有筛选基于 CellRange，多维表筛选基于结构化字段 + 条件表达式 | 设计 Filter AST（条件组、或逻辑、字段值比较），实现服务端查询优化 |
| **行级权限** | 现有权限只到表级，无记录级过滤能力 | 设计条件表达式引擎，按字段值动态过滤可见记录 |
| **仪表盘系统** | 现有图表依附于 Sheet，仪表盘是独立的跨表分析画布 | 设计 DashboardModel（组件布局、数据绑定、全局筛选器、联动下钻） |
| **自动化工作流** | 现有系统无触发器-执行器架构 | 设计 WorkflowEngine（触发器注册、节点执行、异步调度、执行日志） |
| **表单视图** | 表单是面向外部数据收集的独立页面，与表格编辑完全不同 | 设计 FormView（字段可见性配置、提交校验、匿名/登录模式、防重复提交） |
| **评论系统** | 现有无评论能力，需全新设计 | 支持单元格级/记录级/视图级评论，@提及、通知、回复线程 |

---

## 三、核心数据模型扩展

### 3.1 扩展后的 SheetModel（Base 类型）

```typescript
// SheetModel 扩展 —— type 新增 'base'
export type SheetType = 'standard' | 'freeform' | 'base';

export interface SheetModel {
  sheetId: string;
  name: string;
  type: SheetType;
  rowCount: number;
  colCount: number;
  isHidden: boolean;

  // 自由表专用（base 不使用）
  cells: Map<string, CellData>;
  mergeRanges: CellRange[];
  columnWidths: Map<number, number>;
  rowHeights: Map<number, number>;

  // 标准表 + Base 共用
  columnDefs: BaseColumnDef[];  // 升级为 BaseColumnDef
  rows: BaseRecordRow[];         // 升级为 BaseRecordRow

  // Base 专属：多视图
  views: BaseView[];
  activeViewId: string;

  // Base 专属：关联关系定义
  relations: TableRelation[];

  // Base 专属：权限规则
  permissions: PermissionRule[];

  // 共用
  conditionalFormats: ConditionalFormat[];
  validations: DataValidation[];
  defaultStyle: CellStyle;
  freezeState: FreezeState;
  charts: ChartInstance[];
}
```

### 3.2 Base 字段定义（BaseColumnDef）

```typescript
// 在现有 ColumnType 基础上扩展
export type BaseColumnType =
  // 基础字段（现有 18 种，完全复用）
  | 'text' | 'number' | 'currency' | 'percent' | 'date' | 'datetime'
  | 'boolean' | 'select' | 'multiSelect' | 'user' | 'attachment'
  | 'link' | 'email' | 'phone' | 'formula' | 'autoNumber' | 'rating' | 'progress'
  // 新增多维字段
  | 'singleLink'      // 单向关联：关联另一张表的记录
  | 'dualLink'        // 双向关联：两表互相关联
  | 'lookup'          // 查找引用：通过关联拉取关联表字段
  | 'rollup'          // 汇总字段：对关联数据聚合
  | 'button'          // 按钮：触发工作流
  | 'stage'           // 流程阶段
  | 'location'        // 地理位置
  | 'signature'       // 电子签名
  | 'barcode';        // 条码

export interface BaseColumnDef {
  id: string;
  name: string;
  type: BaseColumnType;
  required?: boolean;
  defaultValue?: unknown;
  width?: number;
  hidden?: boolean;
  options?: SelectOption[];           // select / multiSelect 用
  format?: string;                    // 日期/数字格式
  formula?: string;                   // formula 类型用
  // 新增：字段属性配置
  property?: FieldProperty;           // 各类型专属配置
  // 新增：字段描述与帮助
  description?: string;
  // 新增：字段级权限覆盖
  fieldPermission?: FieldPermission;
}

// 字段属性配置（按类型区分）
export type FieldProperty =
  | TextProperty
  | NumberProperty
  | SelectProperty
  | DateProperty
  | SingleLinkProperty
  | DualLinkProperty
  | LookupProperty
  | RollupProperty
  | ButtonProperty
  | AutoNumberProperty;

export interface SingleLinkProperty {
  linkedTableId: string;        // 关联表 ID
  linkedFieldId: string;        // 关联表显示字段（用于展示关联记录标题）
  limit?: number;               // 最大关联数（1 = 单条，>1 = 多条）
}

export interface DualLinkProperty {
  linkedTableId: string;
  linkedFieldId: string;        // 对方表中的关联字段 ID
  symmetricFieldId: string;     // 本表在对表中的反向关联字段 ID
}

export interface LookupProperty {
  linkFieldId: string;          // 本表的关联字段 ID
  targetFieldId: string;        // 关联表的目标字段 ID
  lookupType: 'first' | 'last' | 'all'; // 取第一条/最后一条/全部
}

export interface RollupProperty {
  linkFieldId: string;          // 本表的关联字段 ID
  targetFieldId: string;        // 关联表的目标字段 ID（需为数值型）
  aggregation: 'sum' | 'count' | 'avg' | 'max' | 'min' | 'unique';
}

export interface ButtonProperty {
  label: string;
  style: 'primary' | 'default' | 'danger';
  workflowId: string;           // 绑定的工作流 ID
  confirmText?: string;         // 二次确认文案
}

export interface AutoNumberProperty {
  prefix?: string;
  digits: number;
  startValue: number;
  resetRule?: 'never' | 'daily' | 'monthly' | 'yearly';
}
```

### 3.3 Base 记录行（BaseRecordRow）

```typescript
export interface BaseRecordRow {
  _id: string;                  // 记录唯一 ID（全局唯一）
  _createdAt: number;
  _createdBy: string;            // 用户 ID
  _updatedAt: number;
  _updatedBy: string;
  _order: number;               // 行排序序号（用于手动拖拽排序）
  _version: number;              // 乐观锁版本号
  // 字段值存储（fieldId -> value）
  [fieldId: string]: unknown;
}

// 字段值的标准格式（JSON 存储）
export type BaseFieldValue =
  | string                         // text, link, email, phone, formula(缓存值)
  | number                         // number, currency, percent, rating, progress
  | boolean                        // boolean
  | null                             // 空值
  | string[]                       // multiSelect, attachment, multi-user
  | { id: string; name: string }    // singleSelect, user, singleLink
  | { id: string; name: string }[]  // multiSelect, multiLink
  | { timestamp: number; timezone?: string }  // date, datetime
  | { lat: number; lng: number; address?: string }  // location
  | { url: string; name: string; size: number; mimeType: string }[]  // attachment
  | { formula: string; cached: BaseFieldValue | null }  // formula 元数据
  ;
```

### 3.4 视图配置（BaseView）

```typescript
export type ViewType = 'grid' | 'kanban' | 'gantt' | 'calendar' | 'gallery' | 'form';

export interface BaseView {
  viewId: string;
  name: string;
  type: ViewType;
  // 筛选条件
  filters: FilterCondition[];
  filterMatchType: 'all' | 'any';  // 全部满足 / 任一满足
  // 排序规则
  sorts: SortRule[];
  // 分组规则
  groups: GroupRule[];
  // 字段可见性（覆盖字段的 hidden 属性）
  visibleFields: string[];         // 可见字段 ID 列表（空 = 全部可见）
  fieldOrders: string[];            // 字段显示顺序
  // 表格视图专属
  gridConfig?: GridViewConfig;
  // 看板视图专属
  kanbanConfig?: KanbanViewConfig;
  // 甘特视图专属
  ganttConfig?: GanttViewConfig;
  // 日历视图专属
  calendarConfig?: CalendarViewConfig;
  // 画廊视图专属
  galleryConfig?: GalleryViewConfig;
  // 表单视图专属
  formConfig?: FormViewConfig;
  // 共享设置
  isShared: boolean;
  shareUrl?: string;
  sharePermission: 'view' | 'edit';
  // 元数据
  createdAt: number;
  createdBy: string;
  updatedAt: number;
}

// 筛选条件
export interface FilterCondition {
  fieldId: string;
  operator: FilterOperator;
  value: unknown;
}

export type FilterOperator =
  | 'equal' | 'notEqual' | 'greaterThan' | 'lessThan' | 'greaterOrEqual' | 'lessOrEqual'
  | 'contains' | 'notContains' | 'startsWith' | 'endsWith'
  | 'isEmpty' | 'isNotEmpty'
  | 'in' | 'notIn'           // 包含在列表中
  | 'isToday' | 'isThisWeek' | 'isThisMonth' | 'isThisYear'  // 日期快捷
  | 'before' | 'after' | 'between'  // 日期范围
  | 'isMe' | 'isNotMe'       // 人员字段
  | 'isAnyOf' | 'isNoneOf';  // 多选字段

export interface SortRule {
  fieldId: string;
  direction: 'asc' | 'desc';
}

export interface GroupRule {
  fieldId: string;
  direction: 'asc' | 'desc';
  // 分组后是否显示汇总行
  showSummary: boolean;
  summaryAggregations: Array<{ fieldId: string; aggregation: 'count' | 'sum' | 'avg' }>;
}

// 表格视图配置
export interface GridViewConfig {
  frozenFields: string[];       // 冻结字段（左侧固定列）
  columnWidths: Record<string, number>;  // 字段列宽
  rowHeight: 'short' | 'medium' | 'tall'; // 行高
  showRecordNumber: boolean;    // 显示行号
  wrapText: boolean;            // 自动换行
}

// 看板视图配置
export interface KanbanViewConfig {
  stackFieldId: string;         // 分组字段（必须是单选/人员/关联字段）
  stackOrders: string[];         // 看板列顺序
  cardVisibleFields: string[];   // 卡片显示字段
  coverFieldId?: string;        // 封面字段（附件字段）
  laneFieldId?: string;         // 泳道字段（二级分组）
  allowDragBetweenStacks: boolean;  // 是否允许跨列拖拽
}

// 甘特视图配置
export interface GanttViewConfig {
  startDateFieldId: string;     // 开始日期字段
  endDateFieldId: string;       // 结束日期字段
  progressFieldId?: string;     // 进度字段
  dependencyFieldId?: string;   // 依赖字段（关联自身表）
  milestoneFieldId?: string;   // 里程碑字段
  timelineUnit: 'day' | 'week' | 'month' | 'quarter' | 'year';
  groupFieldId?: string;        // 分组字段
}

// 日历视图配置
export interface CalendarViewConfig {
  dateFieldId: string;          // 日期字段
  endDateFieldId?: string;      // 结束日期字段（时段事件）
  defaultView: 'month' | 'week' | 'day';
  colorFieldId?: string;        // 按字段值着色
}

// 画廊视图配置
export interface GalleryViewConfig {
  coverFieldId?: string;        // 封面字段
  visibleFields: string[];      // 卡片显示字段
  cardSize: 'small' | 'medium' | 'large';
  layout: 'grid' | 'waterfall'; // 网格/瀑布流
}

// 表单视图配置
export interface FormViewConfig {
  title: string;
  description: string;
  submitButtonText: string;
  successMessage: string;
  successRedirectUrl?: string;
  fieldPermissions: Record<string, 'visible' | 'hidden' | 'readonly'>;  // 字段级覆盖
  allowAnonymous: boolean;      // 是否允许匿名提交
  requireLogin: boolean;        // 是否要求登录
  maxSubmissions?: number;      // 最大提交次数
  captchaEnabled: boolean;      // 是否启用验证码
  notifyOnSubmit: string[];     // 提交后通知用户 ID 列表
}
```

### 3.5 表间关联关系（TableRelation）

```typescript
export interface TableRelation {
  relationId: string;
  name: string;
  type: 'oneToOne' | 'oneToMany' | 'manyToMany';
  // 源表端
  sourceTableId: string;
  sourceFieldId: string;       // 本表的关联字段
  // 目标表端
  targetTableId: string;
  targetFieldId: string;        // 目标表的关联字段（双向关联时必填）
  // 行为约束
  onDelete: 'cascade' | 'restrict' | 'setNull';  // 删除记录时
  onUpdate: 'cascade' | 'restrict';              // 更新关联时
}
```

### 3.6 权限规则（PermissionRule）

```typescript
export interface PermissionRule {
  ruleId: string;
  // 作用对象
  target: {
    type: 'table' | 'view' | 'field' | 'record';
    tableId?: string;            // 表级/字段级/行级需指定
    viewId?: string;             // 视图级需指定
    fieldId?: string;            // 字段级需指定
  };
  // 条件表达式（行级权限用）
  condition?: ConditionExpression;
  // 权限主体
  principals: Array<{ type: 'user' | 'group' | 'role'; id: string }>;
  // 权限动作
  actions: Array<'view' | 'edit' | 'create' | 'delete' | 'manage'>;
  // 生效时间
  validFrom?: number;
  validUntil?: number;
}

// 条件表达式（用于行级权限和筛选条件）
export type ConditionExpression =
  | { type: 'compare'; fieldId: string; operator: FilterOperator; value: unknown }
  | { type: 'and'; conditions: ConditionExpression[] }
  | { type: 'or'; conditions: ConditionExpression[] }
  | { type: 'not'; condition: ConditionExpression }
  | { type: 'me'; fieldId: string };  // 字段值等于当前用户
```

---

## 四、字段系统详细扩展

### 4.1 字段类型完整体系

| 字段类型 | 分类 | 说明 | 复用情况 |
|---------|------|------|---------|
| 文本 | 基础 | 单行/多行文本 | 复用现有 |
| 数字 | 基础 | 数值类型 | 复用现有 |
| 单选 | 基础 | 单选项选择 | 复用现有 |
| 多选 | 基础 | 多选项选择 | 复用现有 |
| 日期 | 基础 | 日期/日期时间 | 复用现有 |
| 复选框 | 基础 | 布尔值 | 复用现有 |
| 人员 | 基础 | 用户选择器 | 复用现有 |
| 电话号码 | 基础 | 手机号格式 | 复用现有 |
| 邮箱 | 基础 | 邮箱地址 | 复用现有 |
| 超链接 | 基础 | URL 链接 | 复用现有 |
| 附件 | 基础 | 文件上传 | 复用现有 |
| 货币 | 基础 | 金额类型 | 复用现有（原 currency） |
| 百分比 | 基础 | 百分比 | 复用现有（原 percent） |
| 评分 | 基础 | 星级评分 | 复用现有（原 rating） |
| 进度 | 基础 | 百分比进度 | 复用现有（原 progress） |
| 公式 | 基础 | 表达式自动计算 | 复用现有（需扩展跨表引用） |
| 自动编号 | 基础 | 自增序列号 | 复用现有（需增强配置） |
| **单向关联** | **新增** | 关联另一张表的记录 | **全新** |
| **双向关联** | **新增** | 两表互相关联 | **全新** |
| **查找引用** | **新增** | 通过关联拉取数据 | **全新** |
| **汇总字段** | **新增** | 对关联数据聚合 | **全新** |
| **按钮** | **新增** | 触发工作流 | **全新** |
| **地理位置** | **新增** | 经纬度位置 | **全新** |
| **电子签名** | **新增** | 手写签名 | **全新** |
| **条码** | **新增** | 条码扫描/生成 | **全新** |
| **流程阶段** | **新增** | 业务流程节点 | **全新** |
| **创建时间** | **新增** | 系统字段 | **全新** |
| **修改时间** | **新增** | 系统字段 | **全新** |
| **创建人** | **新增** | 系统字段 | **全新** |
| **修改人** | **新增** | 系统字段 | **全新** |

### 4.2 字段类型转换规则（新增多维字段）

| 转换方向 | 结果 | 说明 |
|---------|------|------|
| 单向关联 ↔ 双向关联 | 无损 | 双向关联 = 单向关联 + 自动创建反向字段 |
| 单向关联 → 文本 | 有损 | 保留关联记录的显示名称 |
| 文本 → 单向关联 | 有损 | 按名称匹配关联记录，匹配失败置空 |
| 查找引用 → 文本 | 有损 | 保留查找到的值文本 |
| 汇总字段 → 数字 | 有损 | 保留聚合数值 |
| 汇总字段 → 文本 | 有损 | 保留数值文本 |
| 公式 → 任何类型 | 有损 | 保留当前缓存值，断开公式计算 |
| 自动编号 → 文本 | 有损 | 保留当前编号值 |
| 系统字段（创建时间/人等）→ 任何类型 | **禁止** | 系统字段不可转换 |

---

## 五、视图系统详细设计

### 5.1 视图架构

Base 的核心交互范式是：**同一份数据，多种呈现方式**。每个 Base 表可以有多个视图，视图只改变数据的呈现方式，不改变底层数据。

```
BaseTable
├── columnDefs[]          // 字段定义（全局）
├── rows[]               // 记录数据（全局）
├── views[]              // 视图配置列表
│   ├── GridView          // 表格视图（默认）
│   ├── KanbanView        // 看板视图
│   ├── GanttView         // 甘特视图
│   ├── CalendarView      // 日历视图
│   ├── GalleryView       // 画廊视图
│   └── FormView          // 表单视图
├── relations[]          // 关联关系定义
└── permissions[]        // 权限规则
```

### 5.2 表格视图（Grid View）— 复用现有 Canvas 引擎

**复用策略**：直接复用现有的 `SheetContainer` + `CellRenderer` + `ViewportManager`，但需进行以下改造：

1. **列头改造**：从字母列头（A, B, C）改为字段名列头（"任务名称", "负责人", "截止日期"）
2. **单元格渲染改造**：根据字段类型使用不同的渲染方式（复选框用勾选图标、人员用头像、附件用文件图标等）
3. **行头改造**：从数字行头改为记录选择器（复选框 + 行号）
4. **新增列固定**：`GridViewConfig.frozenFields` 映射到现有 `freezeState`
5. **新增行高切换**：short/medium/tall 对应现有行高计算

**交互差异（与自由表对比）**：
| 交互 | 自由表 | Base 表格视图 |
|------|--------|--------------|
| 点击单元格 | 选中单元格 | 选中整行记录 |
| 双击单元格 | 进入编辑 | 进入编辑（字段类型决定编辑器） |
| 右键 | 单元格操作菜单 | 记录操作菜单 |
| 列宽调整 | 调整列宽 | 同自由表 |
| 拖拽列 | 调整列顺序 | 同自由表 |
| 拖拽行 | 无 | 调整记录排序（_order） |
| 冻结列 | 冻结前 N 列 | 按字段 ID 冻结 |
| 新增行 | 在末尾添加空白行 | 在末尾添加空记录（带默认值） |
| 删除行 | 删除整行 | 删除记录（进入回收站） |
| 合并单元格 | 支持 | **不支持** |
| 公式输入 | `=A1+B1` | `={字段名}+100` 或 `=SUM(关联字段)` |

### 5.3 看板视图（Kanban View）— 全新 React 组件

**设计要点**：
- 使用 React 实现（非 Canvas），利用虚拟滚动库（如 react-window）
- 按 `stackFieldId` 分组，每个分组值为一列看板
- 卡片使用 React 组件渲染，支持封面图、字段显示
- 拖拽使用 react-beautiful-dnd 或 @dnd-kit
- 跨列拖拽自动更新记录的分组字段值

```tsx
// 看板视图组件结构
<KanbanView>
  <KanbanBoard>
    <KanbanColumn key={option.id} title={option.name}>
      <KanbanCard key={record._id} record={record}>
        <CoverImage src={record[coverFieldId]} />
        <CardTitle>{record[titleFieldId]}</CardTitle>
        <CardFields fields={cardVisibleFields} />
      </KanbanCard>
    </KanbanColumn>
  </KanbanBoard>
</KanbanView>
```

### 5.4 甘特视图（Gantt View）— 全新 Canvas/SVG 渲染

**设计要点**：
- 使用 SVG + Canvas 混合渲染（时间轴用 SVG，任务条用 Canvas）
- 支持年/季度/月/周/日/小时多粒度切换
- 任务条拖拽调整起止日期
- 依赖关系连线（FS/SS/FF/SF）
- 左侧任务列表与表格视图共用列渲染逻辑

### 5.5 日历视图（Calendar View）— 全新 React 组件

**设计要点**：
- 使用 React 实现，日历布局使用 CSS Grid
- 月/周/日三种视图模式
- 记录卡片按日期字段排布
- 拖拽卡片调整日期
- 全天事件 vs 时段事件区分

### 5.6 画廊视图（Gallery View）— 全新 React 组件

**设计要点**：
- 瀑布流/网格布局，使用 CSS Grid 或 Masonry 布局
- 封面图优先显示（附件字段首图）
- 卡片尺寸大/中/小三档
- 点击卡片展开详情面板

### 5.7 表单视图（Form View）— 全新 React 组件 + 独立路由

**设计要点**：
- 独立页面路由（`/form/{formViewId}`）
- 字段按配置顺序排列，每个字段使用对应类型的编辑器
- 字段可见性和可编辑性独立配置
- 支持匿名提交和登录提交两种模式
- 提交后跳转或显示成功提示

---

## 六、页面交互设计（参照截图）

### 6.1 顶部导航栏

参照截图，顶部导航栏包含以下元素：

```
┌────────────────────────────────────────────────────────────┐
│ [Logo]  Sheet1    Sheet1 (表格视图)   Sheet2   Sheet3   [+] ▼│
├────────────────────────────────────────────────────────────┤
│ >> 表格  [字段配置] [视图配置] [筛选] [分组] [行高] [生成表单]│
│   [评论] [↺] [↻] [⋯] [+ 添加记录]                          │
├────────────────────────────────────────────────────────────┤
│ □  文本      ⊙ 单选      📅 日期     📎 附件     ☑ 复选框  │
├────────────────────────────────────────────────────────────┤
│ 1 │                                                          │
│ 2 │ ☑                                                        │
│ 3 │ ☑                                                        │
│ 4 │                                                          │
│ 5 │                                                          │
│ 6 │                                                          │
│ 7 │                                                          │
│ 8 │                                                          │
│ 9 │                                                          │
│ 10│                                                          │
│ ...│                                                         │
│ 20│                                                          │
├────────────────────────────────────────────────────────────┤
│ + 添加行                                                     │
└────────────────────────────────────────────────────────────┘
```

**各元素说明**：

| 元素 | 功能 | 实现方式 |
|------|------|---------|
| **Sheet 标签** | 切换不同数据表/视图 | 复用 `SheetTabs` 组件，增加视图切换（Sheet1 和 "Sheet1 (表格视图)"） |
| **[+] 按钮** | 新建电子表格 / 新建多维表格 | 复用 `SheetTabs` 的新增按钮，下拉菜单增加"新建多维表格"选项 |
| **表格** | 当前视图类型标识（面包屑） | 新增组件，显示当前视图路径 |
| **字段配置** | 打开字段配置面板 | 新增面板组件，支持增删字段、调整顺序、设置字段属性 |
| **视图配置** | 打开视图配置面板 | 新增面板组件，支持切换视图类型、设置视图专属配置 |
| **筛选** | 打开筛选条件面板 | 新增组件，支持添加/编辑/删除筛选条件，实时过滤数据 |
| **分组** | 打开分组配置面板 | 新增组件，支持按字段分组，显示分组汇总 |
| **行高** | 切换行高（短/中/高） | 新增下拉菜单，对应 GridViewConfig.rowHeight |
| **生成表单** | 从当前视图生成表单视图 | 新增功能，自动创建 FormView 并复制字段配置 |
| **评论** | 打开评论面板 | 新增组件，支持记录级/视图级评论 |
| **撤销/重做** | 撤销/重做操作 | 复用现有 undo/redo |
| **更多** | 导出/导入/打印/设置 | 新增菜单 |
| **+ 添加记录** | 在末尾添加新记录 | 新增按钮，调用 `BaseTable.createRecord()` |
| **列头** | 字段名称 + 类型图标 | 改造现有列头，支持字段类型图标、排序指示器、字段菜单 |
| **行头** | 复选框 + 行号 | 改造现有行头，增加记录选择复选框 |
| **+ 添加行** | 在底部添加空行 | 复用现有 "+200 行" 按钮，改为 "+ 添加行" |

### 6.2 字段配置面板

```
┌──────────────────────────────────────┐
│ 字段配置                        [×]  │
├──────────────────────────────────────┤
│ 拖拽调整字段顺序                        │
│ ┌─────────────────────────────────┐  │
│ │ ☰  文本        [设置] [隐藏] [×]│  │
│ │ ☰  单选        [设置] [隐藏] [×]│  │
│ │ ☰  日期        [设置] [隐藏] [×]│  │
│ │ ☰  附件        [设置] [隐藏] [×]│  │
│ │ ☰  复选框      [设置] [隐藏] [×]│  │
│ └─────────────────────────────────┘  │
│                                      │
│ [+ 添加字段]  下拉选择字段类型          │
│ 文本 | 数字 | 单选 | 多选 | 日期 ...   │
└──────────────────────────────────────┘
```

**字段设置弹窗**：
```
┌──────────────────────────────────────┐
│ 字段设置                          │
├──────────────────────────────────────┤
│ 字段名称: [文本                    ] │
│ 字段类型: [文本         ▼]           │
│                                      │
│ 字段属性:                            │
│ ☑ 必填                              │
│ 默认值: [                         ] │
│ 最大长度: [255                    ]  │
│                                      │
│ [删除字段]              [确定] [取消]│
└──────────────────────────────────────┘
```

### 6.3 视图配置面板

```
┌──────────────────────────────────────┐
│ 视图配置                        [×]  │
├──────────────────────────────────────┤
│ 视图名称: [表格视图                ]  │
│ 视图类型: [表格 ▼ | 看板 ▼ | 甘特 ▼] │
│                                      │
│ 可见字段:                             │
│ ☑ 文本  ☑ 单选  ☑ 日期  ☑ 附件  ☑ 复选框│
│                                      │
│ 字段顺序: 拖拽调整                     │
│                                      │
│ 筛选条件:                             │
│ 文本 包含 "xxx"  [删除]               │
│ 日期 在本周  [删除]                   │
│ [+ 添加筛选条件]                      │
│                                      │
│ 排序:                                │
│ 日期 降序  [删除]                     │
│ [+ 添加排序]                         │
│                                      │
│ 分组:                                │
│ 单选  [删除]                         │
│ [+ 添加分组]                         │
│                                      │
│ [删除视图]              [确定] [取消] │
└──────────────────────────────────────┘
```

### 6.4 记录行交互

| 操作 | 行为 | 数据变更 |
|------|------|---------|
| 点击行头复选框 | 选中/取消选中记录 | 无 |
| 点击单元格 | 选中整行，激活单元格进入编辑 | 无 |
| 双击单元格 | 进入编辑模式 | 无 |
| 输入值 + Enter | 提交值，移动到下一行同列 | 更新字段值 |
| 输入值 + Tab | 提交值，移动到右侧单元格 | 更新字段值 |
| 拖拽行头 | 调整记录排序 | 更新 `_order` |
| 右键行 | 显示记录操作菜单（复制/删除/评论） | 视操作而定 |
| 点击字段头 | 按该字段排序（单击升序/降序/取消） | 更新视图 sort 配置 |
| 拖拽字段头 | 调整字段顺序 | 更新视图 fieldOrders |
| 拖拽字段头边界 | 调整列宽 | 更新视图 columnWidths |

---

## 七、关联与引用系统

### 7.1 关联字段架构

```
┌─────────────────┐         ┌─────────────────┐
│   项目表         │         │   人员表         │
│  ─────────────  │         │  ─────────────  │
│  任务名称        │         │  姓名           │
│  负责人  ─────────┼───────> │  部门           │
│  [单向关联]     │         │  邮箱           │
│  截止日期        │         │                 │
│  状态           │         │                 │
└─────────────────┘         └─────────────────┘

关联关系定义:
- 源表: 项目表, 源字段: 负责人 (singleLink)
- 目标表: 人员表, 目标字段: - (单向关联无反向字段)
- 类型: oneToMany (一个人员可以负责多个项目)
```

### 7.2 数据存储

关联字段在记录中以以下格式存储：

```json
// 单向关联字段值（单条）
{
  "负责人": { "id": "user_123", "name": "张三" }
}

// 单向关联字段值（多条）
{
  "参与人员": [
    { "id": "user_123", "name": "张三" },
    { "id": "user_456", "name": "李四" }
  ]
}

// 双向关联字段值（在源表）
{
  "客户": { "id": "cust_001", "name": "ABC公司" }
}
// 同时在目标表（客户表）自动同步：
{
  "关联项目": [
    { "id": "proj_001", "name": "项目A" },
    { "id": "proj_002", "name": "项目B" }
  ]
}
```

### 7.3 查找引用（Lookup）计算

Lookup 字段在记录中以以下格式存储：

```json
// Lookup 字段值（通过"负责人"关联，查找"邮箱"）
{
  "负责人邮箱": { "id": "user_123", "name": "zhangsan@example.com" }
}
```

Lookup 计算逻辑：
1. 读取当前记录的 `linkFieldId` 字段值（关联记录 ID）
2. 查询关联表的对应记录
3. 读取关联记录的 `targetFieldId` 字段值
4. 缓存到当前记录的 Lookup 字段中

### 7.4 汇总字段（Rollup）计算

Rollup 字段在记录中以以下格式存储：

```json
// Rollup 字段值（汇总关联项目的总金额）
{
  "订单总金额": { "type": "number", "value": 15000, "format": { "kind": "currency", "symbol": "¥", "decimals": 2 } }
}
```

Rollup 计算逻辑：
1. 读取当前记录的 `linkFieldId` 字段值（获取所有关联记录 ID 列表）
2. 批量查询关联记录
3. 提取每个关联记录的 `targetFieldId` 字段值
4. 按 `aggregation` 类型执行聚合计算
5. 结果缓存到当前记录的 Rollup 字段

### 7.5 关联查询优化

| 场景 | 优化策略 |
|------|---------|
| 关联记录显示名称 | 在关联字段值中内联缓存 `name`，避免 N+1 查询 |
| 关联记录下拉选择 | 关联表数据常驻 Redis 缓存，支持搜索过滤 |
| 双向关联同步 | 使用数据库触发器或消息队列异步同步，避免事务阻塞 |
| Lookup/Rollup 重算 | 建立依赖图，关联字段变更时触发增量重算 |
| 深层关联（>3 层） | 限制最大关联深度为 3 层，超出时提示简化模型 |

---

## 八、权限体系详细设计

### 8.1 四级权限模型

```
App（应用级）
├── Table（表级）
│   ├── View（视图级）
│   │   ├── Field（字段级）
│   │   └── Record（行级）
│   └── Record（行级）
└── Dashboard（仪表盘级）
```

| 权限层级 | 粒度 | 可控制动作 | 实现方式 |
|---------|------|-----------|---------|
| **应用级** | 整个多维表格应用 | 可管理 / 可编辑 / 可查看 / 不可访问 | 应用成员表 `app_members` + 角色字段 |
| **表级** | 单张数据表 | 可管理 / 可编辑 / 可查看 / 不可访问 | `table_permissions` 表，按 table_id + user_id 存储 |
| **视图级** | 单个视图 | 可编辑 / 只读 / 不可见 | 视图配置 `isShared` + `sharePermission`，或 `view_permissions` 表 |
| **字段级** | 单个字段 | 可编辑 / 只读 / 不可见 | 字段定义 `fieldPermission` 覆盖，或 `field_permissions` 表 |
| **行级** | 符合条件的记录 | 可编辑 / 只读 / 不可见 | 条件表达式引擎 + 查询时过滤 |

### 8.2 权限计算流程

```
用户请求 -> 身份认证（JWT）-> 应用级权限检查 -> 表级权限检查 -> 视图级权限检查 -> 字段级权限过滤 -> 行级权限过滤 -> 返回数据
```

**权限叠加规则**：
- 默认继承上层权限，上层"可编辑"意味着下层默认"可编辑"
- 下层权限可以**下调**（例如表级可编辑 → 字段级只读），不可**上调**
- 行级权限使用条件表达式，与其他层级权限取**交集**

### 8.3 条件权限示例

```typescript
// 示例：用户只能编辑"负责人"为当前用户的记录
const recordPermission: PermissionRule = {
  target: { type: 'record', tableId: 'tbl_001' },
  condition: {
    type: 'compare',
    fieldId: 'fld_负责人',
    operator: 'isMe',
    value: null,
  },
  principals: [{ type: 'role', id: 'role_成员' }],
  actions: ['edit'],
};

// 示例：隐藏"薪资"字段
const fieldPermission: PermissionRule = {
  target: { type: 'field', tableId: 'tbl_001', fieldId: 'fld_薪资' },
  principals: [{ type: 'role', id: 'role_成员' }],
  actions: ['view'],  // 空数组 = 不可见
};
```

---

## 九、技术实现方案

### 9.1 前端架构

```
sheet-react
├── components/
│   ├── BaseContainer.tsx          // Base 主容器（替代 SheetContainer）
│   ├── BaseToolbar.tsx            // Base 工具栏（字段配置/视图配置/筛选/分组）
│   ├── BaseSheetTabs.tsx          // Sheet 标签 + 视图切换
│   ├── views/
│   │   ├── GridView.tsx           // 表格视图（复用 SheetContainer + 改造）
│   │   ├── KanbanView.tsx         // 看板视图（全新 React）
│   │   ├── GanttView.tsx          // 甘特视图（全新 SVG+Canvas）
│   │   ├── CalendarView.tsx       // 日历视图（全新 React）
│   │   ├── GalleryView.tsx        // 画廊视图（全新 React）
│   │   └── FormView.tsx           // 表单视图（全新 React，独立路由）
│   ├── editors/                   // 字段编辑器集合
│   │   ├── TextEditor.tsx
│   │   ├── NumberEditor.tsx
│   │   ├── SelectEditor.tsx
│   │   ├── DateEditor.tsx
│   │   ├── UserEditor.tsx
│   │   ├── AttachmentEditor.tsx
│   │   ├── LinkEditor.tsx
│   │   ├── FormulaEditor.tsx
│   │   └── LinkToRecordEditor.tsx  // 关联记录选择器（全新）
│   ├── panels/
│   │   ├── FieldConfigPanel.tsx   // 字段配置面板
│   │   ├── ViewConfigPanel.tsx    // 视图配置面板
│   │   ├── FilterPanel.tsx        // 筛选面板
│   │   ├── GroupPanel.tsx         // 分组面板
│   │   └── CommentPanel.tsx       // 评论面板
│   └── common/
│       ├── RecordSelector.tsx     // 记录选择复选框
│       ├── FieldIcon.tsx          // 字段类型图标
│       └── ViewBadge.tsx          // 视图类型标识
├── store/
│   ├── baseStore.ts               // Base 状态管理（扩展 sheetStore）
│   └── viewStore.ts               // 视图状态管理
└── hooks/
    ├── useBaseTable.ts            // Base 表操作 hook
    ├── useViewQuery.ts            // 视图查询 hook
    └── usePermissions.ts          // 权限检查 hook
```

### 9.2 后端架构

```
lingyi-doc-server
├── controllers/
│   ├── baseController.ts          // Base 表 CRUD
│   ├── viewController.ts          // 视图 CRUD
│   ├── recordController.ts        // 记录 CRUD
│   ├── fieldController.ts         // 字段 CRUD
│   ├── relationController.ts      // 关联关系管理
│   ├── permissionController.ts    // 权限管理
│   ├── queryController.ts         // 视图查询（筛选/排序/分组）
│   └── formController.ts          // 表单提交
├── services/
│   ├── BaseTableService.ts        // Base 表核心服务
│   ├── ViewQueryService.ts        // 视图查询引擎
│   ├── RelationService.ts         // 关联关系服务
│   ├── LookupService.ts           // 查找引用计算
│   ├── RollupService.ts           // 汇总计算
│   ├── PermissionService.ts       // 权限计算
│   ├── FormulaService.ts          // 公式计算（扩展 RecalcEngine）
│   └── CommentService.ts          // 评论服务
├── models/
│   ├── BaseTable.ts               // 多维表模型
│   ├── BaseView.ts                // 视图模型
│   ├── BaseRecord.ts              // 记录模型
│   ├── BaseField.ts               // 字段模型
│   ├── TableRelation.ts           // 关联关系模型
│   └── PermissionRule.ts          // 权限规则模型
└── db/
    ├── migrations/
    │   ├── 001_create_base_tables.sql
    │   └── 002_add_views_and_permissions.sql
    └── schema.sql
```

### 9.3 数据库 Schema 扩展

```sql
-- 多维表定义（扩展现有 sheets 表）
CREATE TABLE base_tables (
  id VARCHAR(64) PRIMARY KEY,
  doc_id VARCHAR(64) NOT NULL REFERENCES docs(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  column_defs JSONB NOT NULL DEFAULT '[]',    -- BaseColumnDef[]
  relations JSONB NOT NULL DEFAULT '[]',       -- TableRelation[]
  permissions JSONB NOT NULL DEFAULT '[]',     -- PermissionRule[]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(64) NOT NULL,
  updated_by VARCHAR(64) NOT NULL
);

-- 记录数据（行存储模式）
CREATE TABLE base_records (
  id VARCHAR(64) PRIMARY KEY,
  table_id VARCHAR(64) NOT NULL REFERENCES base_tables(id),
  field_values JSONB NOT NULL DEFAULT '{}',   -- { fieldId: BaseFieldValue }
  _order INTEGER NOT NULL DEFAULT 0,
  _version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(64) NOT NULL,
  updated_by VARCHAR(64) NOT NULL,
  deleted_at TIMESTAMPTZ,                      -- 软删除（回收站）
  INDEX idx_table_id (table_id),
  INDEX idx_order (table_id, _order)
);

-- 视图配置
CREATE TABLE base_views (
  id VARCHAR(64) PRIMARY KEY,
  table_id VARCHAR(64) NOT NULL REFERENCES base_tables(id),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(32) NOT NULL CHECK (type IN ('grid', 'kanban', 'gantt', 'calendar', 'gallery', 'form')),
  config JSONB NOT NULL DEFAULT '{}',          -- BaseView 配置
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(64) NOT NULL,
  INDEX idx_table_id (table_id)
);

-- 关联关系表（辅助查询和约束）
CREATE TABLE table_relations (
  id VARCHAR(64) PRIMARY KEY,
  source_table_id VARCHAR(64) NOT NULL REFERENCES base_tables(id),
  source_field_id VARCHAR(64) NOT NULL,
  target_table_id VARCHAR(64) NOT NULL REFERENCES base_tables(id),
  target_field_id VARCHAR(64),
  relation_type VARCHAR(32) NOT NULL CHECK (relation_type IN ('oneToOne', 'oneToMany', 'manyToMany')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  INDEX idx_source (source_table_id, source_field_id),
  INDEX idx_target (target_table_id, target_field_id)
);

-- 评论
CREATE TABLE base_comments (
  id VARCHAR(64) PRIMARY KEY,
  table_id VARCHAR(64) NOT NULL REFERENCES base_tables(id),
  record_id VARCHAR(64) REFERENCES base_records(id),  -- NULL = 视图级评论
  view_id VARCHAR(64) REFERENCES base_views(id),        -- NULL = 记录级评论
  parent_id VARCHAR(64) REFERENCES base_comments(id),   -- 回复线程
  content TEXT NOT NULL,
  mentions JSONB DEFAULT '[]',  -- 提及用户列表
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(64) NOT NULL,
  INDEX idx_record (table_id, record_id),
  INDEX idx_view (table_id, view_id)
);

-- 操作历史（审计日志）
CREATE TABLE base_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  table_id VARCHAR(64) NOT NULL,
  record_id VARCHAR(64),
  operation VARCHAR(32) NOT NULL,  -- create, update, delete, view
  field_id VARCHAR(64),             -- 字段级变更
  old_value JSONB,
  new_value JSONB,
  performed_by VARCHAR(64) NOT NULL,
  performed_at TIMESTAMPTZ DEFAULT NOW(),
  INDEX idx_table_record (table_id, record_id, performed_at DESC)
) PARTITION BY RANGE (performed_at);
```

### 9.4 存储模式选择

Base 表采用**行存储模式**（JSONB 字段值）：

**原因**：
1. 字段动态变更频繁（Base 的核心特性），宽表模式需要频繁 DDL，不现实
2. 字段类型多样，JSONB 可以灵活存储不同结构
3. 单表百万行数据，PostgreSQL JSONB + 适当索引可以胜任
4. 与现有标准表结构兼容（RecordRow 已经是 `{ [fieldId]: unknown }` 结构）

**索引策略**：
```sql
-- 为常用筛选字段建立 GIN 索引
CREATE INDEX idx_records_gin ON base_records USING GIN (field_values);

-- 为具体字段建立 BTREE 索引（动态创建）
CREATE INDEX idx_records_field_xyz ON base_records USING BTREE ((field_values->>'fld_xyz'));

-- 为 _order 和 deleted_at 建立索引
CREATE INDEX idx_records_active ON base_records(table_id, _order) WHERE deleted_at IS NULL;
```

---

## 十、API 接口设计

### 10.1 核心 REST API

```yaml
# Base 表管理
POST   /api/docs/{docId}/base-tables              # 创建多维表
GET    /api/docs/{docId}/base-tables              # 列出所有多维表
GET    /api/docs/{docId}/base-tables/{tableId}    # 获取多维表详情
PATCH  /api/docs/{docId}/base-tables/{tableId}    # 更新多维表
DELETE /api/docs/{docId}/base-tables/{tableId}    # 删除多维表

# 视图管理
POST   /api/base-tables/{tableId}/views           # 创建视图
GET    /api/base-tables/{tableId}/views            # 列出视图
GET    /api/base-tables/{tableId}/views/{viewId}   # 获取视图详情
PATCH  /api/base-tables/{tableId}/views/{viewId}   # 更新视图
DELETE /api/base-tables/{tableId}/views/{viewId}   # 删除视图

# 记录管理
POST   /api/base-tables/{tableId}/records          # 创建记录（批量）
GET    /api/base-tables/{tableId}/records          # 查询记录（支持筛选/排序/分页）
GET    /api/base-tables/{tableId}/records/{recordId} # 获取单条记录
PATCH  /api/base-tables/{tableId}/records/{recordId} # 更新记录
DELETE /api/base-tables/{tableId}/records/{recordId} # 删除记录（软删除）
POST   /api/base-tables/{tableId}/records/batch-update  # 批量更新
POST   /api/base-tables/{tableId}/records/batch-delete  # 批量删除

# 字段管理
POST   /api/base-tables/{tableId}/fields           # 创建字段
PATCH  /api/base-tables/{tableId}/fields/{fieldId}  # 更新字段
DELETE /api/base-tables/{tableId}/fields/{fieldId}  # 删除字段
POST   /api/base-tables/{tableId}/fields/reorder   # 调整字段顺序

# 视图查询（核心 API）
POST   /api/base-tables/{tableId}/views/{viewId}/query  # 执行视图查询
# Request Body:
# {
#   "filters": [{ "fieldId": "xxx", "operator": "equal", "value": "yyy" }],
#   "sorts": [{ "fieldId": "xxx", "direction": "asc" }],
#   "groups": [{ "fieldId": "xxx" }],
#   "page": 1,
#   "pageSize": 100
# }

# 关联管理
POST   /api/base-tables/{tableId}/relations         # 创建关联
DELETE /api/base-tables/{tableId}/relations/{relationId} # 删除关联
GET    /api/base-tables/{tableId}/records/{recordId}/linked/{fieldId} # 获取关联记录

# 表单提交
POST   /api/forms/{formViewId}/submit              # 提交表单（无需认证）
GET    /api/forms/{formViewId}                     # 获取表单配置（无需认证）

# 评论
POST   /api/base-tables/{tableId}/records/{recordId}/comments  # 添加评论
GET    /api/base-tables/{tableId}/records/{recordId}/comments  # 获取评论
DELETE /api/comments/{commentId}                   # 删除评论

# 权限
POST   /api/base-tables/{tableId}/permissions       # 设置权限
GET    /api/base-tables/{tableId}/permissions        # 获取权限
GET    /api/base-tables/{tableId}/my-permissions     # 获取当前用户权限
```

### 10.2 WebSocket 实时协同（复用现有）

```yaml
# 现有 WebSocket 消息类型扩展
{
  "type": "crdt_op",
  "op": {
    "type": "create_record",
    "tableId": "tbl_xxx",
    "record": { ... }
  }
}

{
  "type": "crdt_op",
  "op": {
    "type": "update_record",
    "tableId": "tbl_xxx",
    "recordId": "rec_xxx",
    "fieldId": "fld_xxx",
    "value": { ... }
  }
}

{
  "type": "crdt_op",
  "op": {
    "type": "delete_record",
    "tableId": "tbl_xxx",
    "recordId": "rec_xxx"
  }
}

{
  "type": "crdt_op",
  "op": {
    "type": "move_record",
    "tableId": "tbl_xxx",
    "recordId": "rec_xxx",
    "newOrder": 42
  }
}

{
  "type": "crdt_op",
  "op": {
    "type": "set_field_property",
    "tableId": "tbl_xxx",
    "fieldId": "fld_xxx",
    "property": { ... }
  }
}

{
  "type": "crdt_op",
  "op": {
    "type": "add_view",
    "tableId": "tbl_xxx",
    "view": { ... }
  }
}
```

---

## 十一、实施路线图

### 第一阶段：基础表格视图（Base Grid）— 4-6 周

**目标**：在现有标准表基础上，完成 Base 表格视图的核心能力，使其可以作为多维表的最小可用产品（MVP）。

| 任务 | 复用度 | 工作量 | 说明 |
|------|--------|--------|------|
| 扩展 SheetModel 为 Base 类型 | 60% | 1 周 | 新增 views、relations、permissions，扩展 ColumnDef |
| 改造表格视图列头/行头 | 80% | 1 周 | 字段名列头、记录选择复选框、字段类型图标 |
| 实现字段配置面板 | 0% | 1 周 | 新增字段、编辑字段、调整顺序、字段类型选择 |
| 实现视图配置面板（Grid 部分） | 0% | 1 周 | 筛选、排序、分组、字段可见性、冻结列 |
| 新增 Base 字段类型编辑器 | 70% | 1 周 | 复用现有 CellEditor，为 select/user/attachment/date 等增加专用编辑器 |
| 记录操作（增删改） | 70% | 1 周 | 复用现有行操作，增加记录级默认值、软删除、回收站 |
| 后端 API（记录 CRUD + 视图查询） | 60% | 1 周 | 复用现有 REST 框架，新增 Base 表相关端点 |
| 数据库 Schema（base_tables + base_records + base_views） | 50% | 3 天 | 基于现有 sheets 表扩展 |

### 第二阶段：高级字段与关联（Advanced Fields）— 4-6 周

**目标**：实现关联字段体系，使 Base 具备数据库级别的关联能力。

| 任务 | 复用度 | 工作量 | 说明 |
|------|--------|--------|------|
| 单向关联字段 | 0% | 1 周 | 关联记录选择器、关联关系存储、关联记录下拉搜索 |
| 双向关联字段 | 0% | 1 周 | 自动创建反向字段、双向同步机制 |
| 查找引用（Lookup） | 0% | 1 周 | 依赖关联字段、跨表字段值拉取、缓存策略 |
| 汇总字段（Rollup） | 0% | 1 周 | 依赖关联字段、聚合计算（sum/count/avg/max/min） |
| 公式引擎扩展（跨表引用） | 70% | 1 周 | 扩展语法支持 `TableName.field`、关联值解析 |
| 关联查询优化 | 0% | 3 天 | N+1 优化、Redis 缓存、关联深度限制 |
| 数据库触发器/消息队列同步 | 0% | 3 天 | 双向关联同步机制 |

### 第三阶段：多视图系统（Multi-Views）— 6-8 周

**目标**：实现看板、甘特、日历、画廊、表单五种视图。

| 任务 | 复用度 | 工作量 | 说明 |
|------|--------|--------|------|
| 看板视图（Kanban） | 0% | 2 周 | React 实现、虚拟滚动、卡片拖拽、跨列更新 |
| 日历视图（Calendar） | 0% | 1 周 | 月/周/日模式、记录卡片排布、日期拖拽 |
| 画廊视图（Gallery） | 0% | 1 周 | 瀑布流/网格、封面图、卡片详情 |
| 甘特视图（Gantt） | 0% | 2 周 | SVG+Canvas 混合、时间轴、任务条、依赖连线 |
| 表单视图（Form） | 0% | 1 周 | 独立路由、字段权限、匿名提交、防重复 |
| 视图切换与状态保持 | 50% | 3 天 | 复用 Store 架构，增加视图级状态管理 |
| 视图查询引擎优化 | 50% | 3 天 | 复用筛选/排序逻辑，适配多视图 |

### 第四阶段：权限与协作（Permissions & Collaboration）— 4-6 周

**目标**：实现四级权限体系和高级协作能力。

| 任务 | 复用度 | 工作量 | 说明 |
|------|--------|--------|------|
| 应用级权限 | 80% | 3 天 | 复用现有 RBAC，增加应用成员管理 |
| 表级权限 | 60% | 3 天 | 复用现有权限中间件，增加表级过滤 |
| 视图级权限 | 50% | 3 天 | 视图可见性控制 |
| 字段级权限 | 50% | 3 天 | 字段可见性/可编辑性过滤 |
| 行级权限（条件权限） | 0% | 1 周 | 条件表达式引擎、查询时过滤 |
| 评论系统 | 0% | 1 周 | 记录级/视图级评论、@提及、通知 |
| 历史版本与审计日志 | 50% | 1 周 | 复用现有审计日志，增加字段级变更历史 |
| 回收站与恢复 | 50% | 3 天 | 复用软删除，增加恢复机制 |
| 实时协作（Base 操作） | 90% | 1 周 | 复用现有 CRDT + WebSocket，增加 Base 操作类型 |

### 第五阶段：仪表盘与自动化（Dashboard & Automation）— 4-6 周

**目标**：实现数据分析和自动化能力。

| 任务 | 复用度 | 工作量 | 说明 |
|------|--------|--------|------|
| 仪表盘画布 | 0% | 1 周 | 拖拽布局、栅格对齐、组件大小调整 |
| 图表组件（指标卡/柱状图/折线图/饼图） | 60% | 1 周 | 复用现有图表渲染，适配多维数据源 |
| 数据聚合引擎 | 0% | 1 周 | 预聚合 + 实时计算、聚合维度、时间维度 |
| 全局筛选器与联动下钻 | 0% | 1 周 | 组件联动、下钻到明细 |
| 自动化工作流引擎 | 0% | 2 周 | 触发器注册、节点执行、异步调度、执行日志 |
| 基础触发器与执行节点 | 0% | 1 周 | 记录增删改触发、更新记录、发送通知 |
| 定时触发与按钮触发 | 0% | 3 天 | Cron 调度、按钮绑定工作流 |

### 第六阶段：性能优化与开放能力（Performance & Open API）— 4-6 周

**目标**：百万行级性能优化，对外开放 API。

| 任务 | 复用度 | 工作量 | 说明 |
|------|--------|--------|------|
| 查询性能优化（ES + 列式存储） | 50% | 1 周 | 复用 ES 索引，增加多维表 Mapping |
| 虚拟滚动优化（十万行流畅） | 80% | 3 天 | 复用现有虚拟滚动，优化大数据量场景 |
| 前端数据分片与按需加载 | 50% | 3 天 | 增量加载、游标分页 |
| 列式存储（ClickHouse） | 0% | 1 周 | 异步同步、仪表盘查询优化 |
| Open API（REST + Webhook） | 60% | 1 周 | 复用现有 API 框架，增加 Base 端点 |
| OAuth 2.0 授权 | 50% | 3 天 | 复用现有 JWT，增加 OAuth 流程 |
| API 限流与配额 | 80% | 2 天 | 复用现有限流算法 |
| 移动端适配 | 0% | 1 周 | 响应式布局、触摸操作优化 |

---

## 十二、性能指标目标

| 指标项 | 目标值 | 与现有系统对比 |
|-------|--------|--------------|
| 单表最大记录数 | 100 万行 | 现有自由表约 10 万行（Canvas 渲染限制） |
| 单表最大字段数 | 200 个 | 现有标准表无明确限制（建议 50 个） |
| 单应用最大数据表数 | 100 张 | 现有无限制（建议 20 张） |
| 首屏加载时间（万行级） | < 1.5s | 现有约 2s（自由表） |
| 单元格编辑响应延迟 | < 100ms | 现有约 50ms（自由表） |
| 公式计算（千行级） | < 500ms | 现有约 300ms（自由表） |
| 多条件筛选（十万行） | < 1s | 现有无（自由表无筛选） |
| 并发在线用户数 | 单表 200+ 人 | 现有约 50 人（自由表） |
| 数据一致性延迟 | < 500ms | 现有约 300ms |
| 关联查询（3 层关联） | < 1s | 现有无 |
| 批量导入（10 万行） | < 5 分钟 | 现有无 |

---

## 十三、风险评估与应对

| 风险 | 概率 | 影响 | 应对策略 |
|------|------|------|---------|
| 关联查询性能差（N+1） | 中 | 高 | 关联记录缓存、批量加载、关联深度限制为 3 层 |
| 字段频繁变更导致索引失效 | 高 | 中 | JSONB 存储 + 动态索引管理，字段变更不触发 DDL |
| 多视图状态同步复杂 | 中 | 高 | 统一视图查询引擎，同一份数据驱动所有视图 |
| 公式跨表引用循环依赖 | 低 | 高 | 公式依赖图检测，循环引用时报错并阻断计算 |
| 权限查询性能差 | 中 | 中 | 权限预计算 + Redis 缓存，条件权限使用物化视图 |
| 实时协同冲突（多人编辑同记录） | 中 | 中 | 行级乐观锁（_version），冲突时提示用户 |
| 数据迁移（标准表 → Base） | 高 | 中 | 提供一键迁移工具，自动生成字段定义和视图 |
| 自由表与 Base 的边界模糊 | 中 | 低 | 明确产品定位：自由表 = Excel 替代，Base = 数据库应用 |

---

## 十四、与普通表格的共存策略

### 14.1 产品层面

```
用户新建 Sheet 时：
┌──────────────────────────┐
│ [+] 下拉菜单              │
│  ├─ 新建电子表格（自由表）  │
│  └─ 新建多维表格（Base）   │
└──────────────────────────┘
```

- **电子表格（自由表）**：面向 Excel 用户，强调自由格式、公式计算、图表分析
- **多维表格（Base）**：面向业务应用搭建，强调结构化数据、表间关联、多视图、权限管控、自动化

### 14.2 技术层面

- `SheetModel.type` 三个值分别对应三种渲染模式：
  - `'freeform'` → `SheetContainer`（Canvas 渲染）
  - `'standard'` → `SheetContainer`（Canvas 渲染，列头为字段名）
  - `'base'` → `BaseContainer`（React 渲染，支持多视图切换）
- 三种类型在**同一个文档**中共存，通过 `SheetTabs` 切换
- 后端使用**同一张表**（`sheets` / `base_tables`）存储，通过 `type` 字段区分查询逻辑

### 14.3 数据互通

- 自由表可以**导出为** Base 表（一键转换，自动推断字段类型）
- Base 表可以**导出为** Excel/CSV（兼容格式）
- 公式可以在自由表和 Base 表之间**复制粘贴**（A1 引用自动转换为字段名引用）

---

> **文档结束**  
> 本方案基于现有自研表格系统（双模：标准表 + 自由表）进行扩展设计，充分利用现有技术资产（Canvas 渲染引擎、公式引擎、协同引擎、状态管理、后端架构），在复用约 65% 现有代码的基础上，新增多维表核心能力（关联字段、多视图、权限体系、自动化工作流）。建议按六阶段路线图实施，总工期约 26-38 周。
