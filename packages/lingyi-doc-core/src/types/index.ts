// ==================== 坐标系统 ====================

/** 单元格坐标（0-based） */
export interface CellCoord {
  row: number;
  col: number;
}

/** 坐标缓存 key: "R{row}C{col}" */
export function coordToKey(coord: CellCoord): string {
  return `R${coord.row}C${coord.col}`;
}

/** 从 key 解析坐标 */
export function keyToCoord(key: string): CellCoord {
  const match = key.match(/R(\d+)C(\d+)/);
  if (!match) throw new Error(`Invalid cell key: ${key}`);
  return { row: parseInt(match[1]), col: parseInt(match[2]) };
}

/** 列号转列名: 0 -> A, 25 -> Z, 26 -> AA */
export function colToName(col: number): string {
  let name = '';
  let n = col;
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

/** 列名转列号: A -> 0, Z -> 25, AA -> 26 */
export function nameToCol(name: string): number {
  let col = 0;
  for (let i = 0; i < name.length; i++) {
    col = col * 26 + (name.charCodeAt(i) - 64);
  }
  return col - 1;
}

/** 单元格引用字符串 */
export type CellRef = string;

/** 单元格范围（扩展：含主单元格坐标，用于合并） */
export interface CellRange {
  sheetId: string;
  start: CellCoord;
  end: CellCoord;
  /** 合并区域主单元格（合并区域的左上角）。未合并时为 null */
  master?: CellCoord;
}

// ==================== 单元格数据 ====================

export interface CellStyle {
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  fontColor?: string;
  backgroundColor?: string;
  horizontalAlign?: 'left' | 'center' | 'right' | 'justify';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  textWrap?: boolean;
  borderTop?: BorderStyle;
  borderRight?: BorderStyle;
  borderBottom?: BorderStyle;
  borderLeft?: BorderStyle;
}

export interface BorderStyle {
  color: string;
  style: 'thin' | 'medium' | 'thick' | 'dashed' | 'dotted' | 'double' | 'none';
}

export type FormulaError = '#REF!' | '#VALUE!' | '#DIV/0!' | '#N/A' | '#NAME?' | '#NUM!' | '#NULL!' | '#ERROR!' | '#CYCLE!';

// ==================== CellValue 判别联合类型 ====================

/** 数字格式化 */
export type NumberFormat =
  | { kind: 'general' }
  | { kind: 'fixed'; decimals: number }
  | { kind: 'currency'; symbol: string; decimals: number }
  | { kind: 'percent'; decimals: number }
  | { kind: 'scientific'; decimals: number };

/** 日期格式化 */
export type DateFormat =
  | { kind: 'short' }
  | { kind: 'long' }
  | { kind: 'datetime' }
  | { kind: 'time' }
  | { kind: 'custom'; pattern: string };

/** 富文本片段 */
export interface RichTextSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontColor?: string;
  fontSize?: number;
}

/** 链接值 */
export interface LinkValue {
  type: 'link';
  url: string;
  text?: string;
}

/** 单元格值 — 判别联合 */
export type CellValue =
  | { type: 'empty' }
  | { type: 'text'; text: string }
  | { type: 'number'; value: number; format: NumberFormat }
  | { type: 'boolean'; value: boolean }
  | { type: 'date'; timestamp: number; format: DateFormat; reminder?: boolean }
  | { type: 'formula'; formula: string; cached?: CellValue }
  | { type: 'error'; error: FormulaError }
  | { type: 'richtext'; segments: RichTextSegment[] }
  | LinkValue;

// ==================== CellData（新结构） ====================

export interface CellData {
  value: CellValue;
  style?: CellStyle;
  /** 是否为合并单元格的子单元格（非主格），用于编辑拦截 */
  isMergedChild?: boolean;
}

// ==================== 值格式化函数 ====================

/** 格式化数字 */
export function formatNumber(value: number, fmt: NumberFormat = { kind: 'general' }): string {
  if (!isFinite(value)) return String(value);

  switch (fmt.kind) {
    case 'general':
      return String(value);
    case 'fixed':
      return value.toFixed(Math.max(0, Math.min(10, fmt.decimals)));
    case 'currency': {
      const dec = Math.max(0, Math.min(10, fmt.decimals));
      const parts = Math.abs(value).toFixed(dec).split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return `${value < 0 ? '-' : ''}${fmt.symbol}${parts.join('.')}`;
    }
    case 'percent':
      return `${(value * 100).toFixed(fmt.decimals)}%`;
    case 'scientific':
      return value.toExponential(fmt.decimals);
  }
}

/** 格式化日期 */
export function formatDate(timestamp: number, fmt: DateFormat = { kind: 'short' }): string {
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return 'Invalid Date';

  const pad = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  const s = pad(d.getSeconds());

  switch (fmt.kind) {
    case 'short': return `${y}/${m}/${day}`;
    case 'long':  return `${y}年${d.getMonth() + 1}月${d.getDate()}日`;
    case 'datetime': return `${y}/${m}/${day} ${h}:${min}`;
    case 'time':  return `${h}:${min}:${s}`;
    case 'custom':
      return fmt.pattern
        .replace('yyyy', String(y))
        .replace('yy', String(y).slice(-2))
        .replace('mm', m)
        .replace('dd', day)
        .replace('hh', h)
        .replace('MM', min)
        .replace('ss', s);
  }
}

/** 获取单元格的显示文本（用于 Canvas 渲染） */
export function getCellText(value: CellValue): string {
  switch (value.type) {
    case 'empty':   return '';
    case 'text':    return value.text;
    case 'number':  return formatNumber(value.value, value.format);
    case 'boolean': return value.value ? 'TRUE' : 'FALSE';
    case 'date':    return formatDate(value.timestamp, value.format);
    case 'formula': return value.cached ? getCellText(value.cached) : '#CALC!';
    case 'error':   return value.error;
    case 'richtext': return value.segments.map(s => s.text).join('');
    case 'link':    return value.text || value.url;
  }
}

/** 获取单元格的对齐方式（根据类型自动推断） */
export function getCellAlign(value: CellValue): CellStyle['horizontalAlign'] {
  switch (value.type) {
    case 'number':
    case 'date':
      return 'right';
    case 'boolean':
      return 'center';
    default:
      return 'left';
  }
}

/** 获取原始值（用于公式引擎计算） */
export function getRawValue(value: CellValue): string | number | boolean | null {
  switch (value.type) {
    case 'empty':   return null;
    case 'text':    return value.text;
    case 'number':  return value.value;
    case 'boolean': return value.value;
    case 'date':    return value.timestamp;
    case 'formula': return value.cached ? getRawValue(value.cached) : null;
    case 'error':   return null;
    case 'richtext': return value.segments.map(s => s.text).join('');
    case 'link':    return value.url;
  }
}

/** 获取编辑文本（用于公式栏/CellEditor 初始值） */
export function getEditText(value: CellValue): string {
  switch (value.type) {
    case 'empty':   return '';
    case 'text':    return value.text;
    case 'number':  return formatNumber(value.value, value.format);
    case 'boolean': return value.value ? 'TRUE' : 'FALSE';
    case 'date':    return formatDate(value.timestamp, value.format);
    case 'formula': return value.formula;
    case 'error':   return '';
    case 'richtext': return value.segments.map(s => s.text).join('');
    case 'link':    return value.url;
  }
}

/** 普通表格复选框单元格编辑文本（0 / 1） */
export function getFreeformBooleanEditText(value: CellValue): string {
  if (value.type === 'boolean') return value.value ? '1' : '0';
  return getEditText(value);
}

/** 解析普通表格复选框输入 */
export function parseFreeformBooleanInput(input: string): CellValue {
  const trimmed = input.trim();
  if (trimmed === '' || trimmed === '0' || trimmed.toUpperCase() === 'FALSE' || trimmed === '否') {
    return { type: 'boolean', value: false };
  }
  if (trimmed === '1' || trimmed.toUpperCase() === 'TRUE' || trimmed === '是') {
    return { type: 'boolean', value: true };
  }
  return { type: 'boolean', value: true };
}

/** 按表格类型返回单元格编辑文本 */
export function getSheetCellEditText(value: CellValue, isFreeformTable: boolean): string {
  if (isFreeformTable && value.type === 'boolean') {
    return getFreeformBooleanEditText(value);
  }
  if (isFreeformTable && value.type === 'date') {
    const d = new Date(value.timestamp);
    if (Number.isNaN(d.getTime())) return '';
    const includeTime = value.format.kind === 'datetime' || value.format.kind === 'time';
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    if (!includeTime) return `${y}/${m}/${day}`;
    const h = d.getHours();
    const min = String(d.getMinutes()).padStart(2, '0');
    const sec = String(d.getSeconds()).padStart(2, '0');
    return `${y}/${m}/${day} ${h}:${min}:${sec}`;
  }
  return getEditText(value);
}

/** 解析用户输入 → CellValue（自动类型推断） */
export function parseCellValue(input: string): CellValue {
  if (input === '') return { type: 'empty' };

  // Formula
  if (input.startsWith('=')) {
    return { type: 'formula', formula: input };
  }

  // Boolean
  if (input.toUpperCase() === 'TRUE') return { type: 'boolean', value: true };
  if (input.toUpperCase() === 'FALSE') return { type: 'boolean', value: false };

  // Date patterns: 2026-06-15, 2026/06/15, 06-15, 06/15
  const dateRegex = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/;
  const dateMatch = input.match(dateRegex);
  if (dateMatch) {
    const ts = Date.parse(input);
    if (!isNaN(ts)) {
      return { type: 'date', timestamp: ts, format: { kind: 'short' } };
    }
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(input)) {
    return { type: 'number', value: Number(input), format: { kind: 'general' } };
  }

  // Link
  if (/^https?:\/\//i.test(input)) {
    return { type: 'link', url: input, text: input };
  }

  // Default: text
  return { type: 'text', text: input };
}

/** 根据字段类型强制解析用户输入 → CellValue（用于多维表/标准表） */
export function parseFieldValue(input: string, columnType: ColumnType): CellValue {
  const trimmed = input.trim();
  if (trimmed === '') return { type: 'empty' };

  switch (columnType) {
    case 'boolean': {
      const upper = trimmed.toUpperCase();
      if (upper === 'TRUE' || upper === '1' || upper === 'YES' || upper === '是') {
        return { type: 'boolean', value: true };
      }
      if (upper === 'FALSE' || upper === '0' || upper === 'NO' || upper === '否') {
        return { type: 'boolean', value: false };
      }
      // 对于布尔类型，任何非空输入视为 true（复选框交互）
      return { type: 'boolean', value: true };
    }

    case 'number':
    case 'currency':
    case 'percent':
    case 'rating':
    case 'progress': {
      const num = Number(trimmed.replace(/,/g, '').replace(/%/g, ''));
      if (!isNaN(num)) {
        const format: NumberFormat =
          columnType === 'currency' ? { kind: 'currency', symbol: '¥', decimals: 2 } :
          columnType === 'percent' ? { kind: 'percent', decimals: 2 } :
          { kind: 'general' };
        return { type: 'number', value: num, format };
      }
      return { type: 'error', error: '#VALUE!' };
    }

    case 'date':
    case 'datetime': {
      const ts = Date.parse(trimmed);
      if (!isNaN(ts)) {
        const format: DateFormat = columnType === 'datetime' ? { kind: 'datetime' } : { kind: 'short' };
        return { type: 'date', timestamp: ts, format };
      }
      // 尝试 yyyy-mm-dd 格式
      const dateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (dateMatch) {
        const ts2 = Date.parse(trimmed);
        if (!isNaN(ts2)) {
          return { type: 'date', timestamp: ts2, format: { kind: 'short' } };
        }
      }
      return { type: 'error', error: '#VALUE!' };
    }

    case 'email': {
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return { type: 'text', text: trimmed };
      }
      return { type: 'error', error: '#VALUE!' };
    }

    case 'phone': {
      // 简单手机号校验
      if (/^[\d+\-\s()]+$/.test(trimmed)) {
        return { type: 'text', text: trimmed };
      }
      return { type: 'text', text: trimmed };
    }

    case 'link': {
      if (/^https?:\/\//i.test(trimmed)) {
        return { type: 'link', url: trimmed, text: trimmed };
      }
      return { type: 'text', text: trimmed };
    }

    case 'formula': {
      if (trimmed.startsWith('=')) {
        return { type: 'formula', formula: trimmed };
      }
      return { type: 'text', text: trimmed };
    }

    case 'text':
    case 'select':
    case 'multiSelect':
    case 'user':
    case 'attachment':
    case 'autoNumber':
    default:
      return { type: 'text', text: trimmed };
  }
}

/** 将字段定义中的 defaultValue 解析为 CellValue（用于新行填充） */
export function resolveColumnDefaultValue(columnDef: Pick<ColumnDef, 'type' | 'defaultValue'>): CellValue | null {
  const { defaultValue, type } = columnDef;
  if (defaultValue === undefined || defaultValue === null || defaultValue === '') {
    return null;
  }

  switch (type) {
    case 'boolean':
      if (defaultValue === true || defaultValue === 'true') {
        return { type: 'boolean', value: true };
      }
      if (defaultValue === false || defaultValue === 'false') {
        return { type: 'boolean', value: false };
      }
      return null;

    case 'date':
    case 'datetime': {
      if (defaultValue === 'today') {
        const ts = Date.now();
        return {
          type: 'date',
          timestamp: ts,
          format: { kind: type === 'datetime' ? 'datetime' : 'short' },
        };
      }
      const raw = String(defaultValue).trim();
      if (!raw) return null;
      return parseFieldValue(raw, type);
    }

    case 'number':
    case 'currency':
    case 'percent':
    case 'rating':
    case 'progress': {
      const num = typeof defaultValue === 'number' ? defaultValue : Number(String(defaultValue).replace(/,/g, '').replace(/%/g, ''));
      if (Number.isNaN(num)) return null;
      return parseFieldValue(String(num), type);
    }

    default:
      return parseFieldValue(String(defaultValue), type);
  }
}

/** 创建空单元格数据的工厂函数 */
export function emptyCell(): CellData {
  return { value: { type: 'empty' } };
}

/** 普通文本值 */
export function textValue(text: string): CellValue {
  return { type: 'text', text };
}

/** 数字值 */
export function numberValue(value: number, format?: NumberFormat): CellValue {
  return { type: 'number', value, format: format || { kind: 'general' } };
}

// ==================== 列定义（标准表） ====================

export type ColumnType =
  | 'text' | 'number' | 'currency' | 'percent' | 'date' | 'datetime'
  | 'boolean' | 'select' | 'multiSelect' | 'user' | 'attachment'
  | 'link' | 'email' | 'phone' | 'formula' | 'autoNumber' | 'rating' | 'progress';

export interface SelectOption {
  id: string;
  name: string;
  color: string;
}

export interface ColumnDef {
  id: string;
  name: string;
  type: ColumnType;
  required?: boolean;
  defaultValue?: unknown;
  width?: number;
  hidden?: boolean;
  options?: SelectOption[];
  format?: string;
  formula?: string;
  /** 评分图标类型 (star/heart/thumb/fire/smile/bolt/flower/number) */
  ratingIcon?: string;
  /** 评分最小分值 */
  ratingMin?: number;
  /** 评分最大分值 */
  ratingMax?: number;
  /** 人员字段是否允许多选 */
  allowMultiple?: boolean;
}

// ==================== 条件格式 ====================

export interface ConditionalFormat {
  id: string;
  range: CellRange;
  type: 'cellValue' | 'dataBar' | 'colorScale';
  rules: ConditionalRule[];
  format: Partial<CellStyle>;
}

export interface ConditionalRule {
  operator: 'greaterThan' | 'lessThan' | 'equal' | 'between';
  value: unknown;
}

// ==================== 数据验证 ====================

export interface DataValidation {
  id: string;
  range: CellRange;
  type: 'list' | 'dropdownList' | 'number' | 'date' | 'textLength';
  criteria?: {
    operator: 'between' | 'equal' | 'greaterThan' | 'lessThan';
    value1: unknown;
    value2?: unknown;
  };
  /** 下拉列表：单选 / 多选 */
  mode?: 'single' | 'multi';
  /** 下拉列表：是否展示选项颜色 */
  showOptionColor?: boolean;
  /** 下拉列表：选项 */
  options?: SelectOption[];
  /** 日期验证：默认包含时间 */
  includeTime?: boolean;
  /** 日期验证：允许设置提醒 */
  allowReminder?: boolean;
  errorMessage?: string;
}

// ==================== 冻结状态 ====================

export interface FreezeState {
  frozenRows: number;
  frozenCols: number;
}

// ==================== Sheet 模型 ====================

/** Sheet 类型 */
export type SheetType = 'standard' | 'freeform' | 'base';

export interface SheetModel {
  sheetId: string;
  name: string;
  type: SheetType;
  rowCount: number;
  colCount: number;
  isHidden: boolean;

  // 自由表专用
  cells: Map<string, CellData>;
  mergeRanges: CellRange[];
  columnWidths: Map<number, number>;
  rowHeights: Map<number, number>;

  // 标准表专用
  columnDefs: ColumnDef[];
  rows: RecordRow[];

  // 共用
  conditionalFormats: ConditionalFormat[];
  validations: DataValidation[];
  defaultStyle: CellStyle;
  freezeState: FreezeState;

  // 图表
  charts: import('../chart/types').ChartInstance[];

  // 多维表（Base）专用视图
  views?: BaseView[];
  activeViewId?: string;

  /** 多维表全局行高（新行继承此值） */
  defaultRowHeight?: number;

  /** 普通表格列筛选条件 */
  columnFilters?: ColumnFilterCondition[];
  /** 普通表格：是否已开启列头筛选 */
  columnFilterEnabled?: boolean;
  /** 显示筛选图标的列索引（仅这些列头展示下拉三角） */
  columnFilterCols?: number[];
}

/** 普通表格列筛选（按列索引） */
export interface ColumnFilterCondition {
  col: number;
  /** 筛选模式：按值 / 按条件 */
  mode?: 'values' | 'condition';
  operator?: FilterCondition['operator'];
  value?: string;
  /** 按值筛选：选中的值列表；undefined 表示未启用 */
  selectedValues?: string[];
  /** 按值筛选：是否包含空白项 */
  includeBlank?: boolean;
}

// ==================== 多维表视图 ====================

export type BaseViewType = 'grid' | 'kanban' | 'gantt' | 'calendar' | 'gallery' | 'form';

export interface BaseView {
  viewId: string;
  viewName: string;
  viewType: BaseViewType;
  // 视图配置（根据 viewType 使用不同子集）
  config: BaseViewConfig;
  // 筛选条件
  filter?: FilterCondition[];
  // 排序规则
  sort?: SortRule[];
  // 分组规则
  group?: GroupRule[];
  // 隐藏字段
  hiddenFields?: string[];
  // 冻结字段数
  frozenCols?: number;
}

export interface BaseViewConfig {
  // 通用
  rowHeight?: number;
  // 看板
  kanbanGroupFieldId?: string;
  kanbanCardFields?: string[];
  kanbanColumnWidth?: number;
  // 甘特
  ganttStartDateFieldId?: string;
  ganttEndDateFieldId?: string;
  ganttProgressFieldId?: string;
  ganttTaskNameFieldId?: string;
  ganttTimeUnit?: 'day' | 'week' | 'month' | 'quarter' | 'year';
  // 日历
  calendarDateFieldId?: string;
  calendarCardTitleFieldId?: string;
  // 画廊
  galleryCoverFieldId?: string;
  galleryDisplayFields?: string[];
  galleryLayoutType?: 'grid' | 'masonry';
  galleryCardSize?: 'small' | 'medium' | 'large';
  // 表单
  formTitle?: string;
  formDescription?: string;
  formFields?: string[];
  formFieldItems?: BaseFormFieldItem[];
  /** 用户主动移出表单的字段，同步时不再自动加回 */
  formExcludedFieldIds?: string[];
}

/** 表单视图中单个字段的配置 */
export interface BaseFormFieldItem {
  fieldId: string;
  question?: string;
  description?: string;
  required?: boolean;
  /** 当满足条件时展示该问题 */
  conditionalVisible?: boolean;
  /** 展示条件（字段间 AND 关系） */
  displayConditions?: FormDisplayCondition[];
}

/** 表单字段展示条件 */
export interface FormDisplayCondition {
  id: string;
  fieldId: string;
  operator: FilterCondition['operator'];
  value?: unknown;
}

export interface FilterCondition {
  fieldId: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith' | 'in' | 'empty' | 'notEmpty';
  value?: unknown;
}

export interface SortRule {
  fieldId: string;
  order: 'asc' | 'desc';
}

export interface GroupRule {
  fieldId: string;
  order: 'asc' | 'desc';
}

export type RecordChangeAction = 'create' | 'update';

/** 多维表行级变更历史（字段级审计） */
export interface RecordChangeEntry {
  id: string;
  at: number;
  by: string;
  action: RecordChangeAction;
  fieldId?: string;
  before?: CellValue;
  after?: CellValue;
}

export interface RecordRow {
  _id: string;
  _createdAt: number;
  _createdBy: string;
  _updatedAt: number;
  _updatedBy: string;
  _order: number;
  /** 父记录 ID，用于子记录层级 */
  _parentId?: string | null;
  /** 行变更历史（按时间递增） */
  _history?: RecordChangeEntry[];
  [fieldId: string]: unknown;
}

export interface SheetSnapshot {
  docId: string;
  version: number;
  sheets: Record<string, SheetModel>;
  sortedSheetIds: string[];
  activeSheetId: string;
  createdAt: number;
}

// ==================== 默认样式 ====================

export const DEFAULT_CELL_STYLE: CellStyle = {
  fontFamily: 'Arial, sans-serif',
  fontSize: 11,
  horizontalAlign: 'left',
  verticalAlign: 'middle',
  textWrap: false,
};

export const DEFAULT_COLUMN_WIDTH = 100;
export const DEFAULT_ROW_HEIGHT = 25;

/** 多维表默认行高 */
export const DEFAULT_BASE_ROW_HEIGHT = 40;
