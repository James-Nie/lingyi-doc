import {
  SheetModel, CellData, CellCoord, CellRange, CellStyle,
  coordToKey, keyToCoord,
  DEFAULT_CELL_STYLE, DEFAULT_COLUMN_WIDTH, DEFAULT_ROW_HEIGHT, DEFAULT_BASE_ROW_HEIGHT, FreezeState,
  parseCellValue, emptyCell, getCellText, getRawValue, resolveColumnDefaultValue,
} from '../types/index';
import type { ColumnDef, RecordRow, DataValidation, SelectOption } from '../types/index';
import { createRecordRow, ensureSheetRows, findChildInsertIndex } from '../utils/rowTree';
import {
  appendRecordCreateHistory,
  appendRecordHistoryChange,
  cellValuesEqual,
} from '../utils/recordHistory';
import { computeColumnAutoWidth, computeRowAutoHeight } from '../utils/axisAutoFit';
import {
  getDropdownValidationAt,
  normalizeDropdownOptions,
  rangesOverlap,
} from '../utils/dropdownValidation';
import {
  getDateValidationAt,
  type DateValidationConfig,
} from '../utils/dateValidation';
import type { ChartInstance } from '../chart/types';
import { RecalcEngine } from '../formula/RecalcEngine';

/** 多维表默认列定义 */
export function getDefaultBaseColumns(): ColumnDef[] {
  return [
    { id: 'col_text', name: '文本', type: 'text', width: 180, required: true },
    { id: 'col_select', name: '单选', type: 'select', width: 120, options: [
      { id: 'opt1', name: '选项1', color: '#3370FF' },
      { id: 'opt2', name: '选项2', color: '#FF8800' },
      { id: 'opt3', name: '选项3', color: '#36cfc9' },
    ]},
    { id: 'col_date', name: '日期', type: 'date', width: 120 },
    { id: 'col_attachment', name: '附件', type: 'attachment', width: 120 },
  ];
}

// ==================== 操作记录（用于撤销/重做） ====================

export interface Operation {
  type: string;
  undo: () => void;
  redo: () => void;
}

// ==================== FreeTable Model ====================

export interface SetCellOptions {
  /** 跳过行历史记录（如新行默认值填充） */
  skipHistory?: boolean;
}

export class FreeTable {
  private _sheet: SheetModel;
  private _undoStack: Operation[] = [];
  private _redoStack: Operation[] = [];
  private _maxUndoSteps = 100;
  private _recalcEngine = new RecalcEngine();
  /** 批量操作期间暂存的子 undo 记录 */
  private _undoBatchStack: Operation[][] = [];

  /** 变更监听器，每次数据变更时触发 */
  private _changeListeners: Array<(changedRange: CellRange | null) => void> = [];

  constructor(options: {
    sheetId: string;
    name?: string;
    type?: 'freeform' | 'standard' | 'base';
    rowCount?: number;
    colCount?: number;
  }) {
    const sheetType = options.type || 'freeform';
    this._sheet = {
      sheetId: options.sheetId,
      name: options.name || 'Sheet1',
      type: sheetType,
      rowCount: options.rowCount || 200,
      colCount: options.colCount || 26,
      isHidden: false,
      cells: new Map<string, CellData>(),
      mergeRanges: [],
      columnWidths: new Map<number, number>(),
      rowHeights: new Map<number, number>(),
      columnDefs: [],
      rows: [],
      conditionalFormats: [],
      validations: [],
      defaultStyle: { ...DEFAULT_CELL_STYLE },
      freezeState: { frozenRows: 0, frozenCols: 0 },
      charts: [],
    };
    if (sheetType === 'base') {
      this._initBase();
    }
  }

  // ==================== 访问器 ====================

  get sheet(): SheetModel { return this._sheet; }
  get sheetId(): string { return this._sheet.sheetId; }
  get name(): string { return this._sheet.name; }
  get rowCount(): number { return this._sheet.rowCount; }
  get colCount(): number { return this._sheet.colCount; }
  get recalcEngine(): RecalcEngine { return this._recalcEngine; }

  setName(name: string): void {
    this._sheet.name = name;
    this._notifyChange(null);
  }

  // ==================== 变更监听 ====================

  onChange(listener: (changedRange: CellRange | null) => void): () => void {
    this._changeListeners.push(listener);
    return () => {
      this._changeListeners = this._changeListeners.filter(l => l !== listener);
    };
  }

  /** 通知外部数据/结构变更（如字段配置更新） */
  notifyChange(range: CellRange | null = null): void {
    this._notifyChange(range);
  }

  /** 获取普通表格列筛选条件 */
  getColumnFilters(): import('../types/index').ColumnFilterCondition[] {
    return this._sheet.columnFilters ?? [];
  }

  /** 普通表格：是否已开启列头筛选 */
  isColumnFilterEnabled(): boolean {
    return (this._sheet.columnFilterCols?.length ?? 0) > 0 || !!this._sheet.columnFilterEnabled;
  }

  /** 获取显示筛选图标的列（兼容旧数据：仅 columnFilterEnabled 时视为全部列） */
  getColumnFilterIconCols(): number[] {
    const cols = this._sheet.columnFilterCols;
    if (cols?.length) return cols;
    if (this._sheet.columnFilterEnabled) {
      return Array.from({ length: this._sheet.colCount }, (_, i) => i);
    }
    return [];
  }

  private _snapshotColumnFilterState(): {
    enabled: boolean;
    filterCols: number[];
    filters: import('../types/index').ColumnFilterCondition[];
  } {
    return {
      enabled: !!this._sheet.columnFilterEnabled,
      filterCols: [...(this._sheet.columnFilterCols ?? [])],
      filters: (this._sheet.columnFilters ?? []).map(f => ({
        ...f,
        selectedValues: f.selectedValues ? [...f.selectedValues] : undefined,
      })),
    };
  }

  private _applyColumnFilterState(state: {
    enabled: boolean;
    filterCols: number[];
    filters: import('../types/index').ColumnFilterCondition[];
  }): void {
    this._sheet.columnFilterEnabled = state.enabled;
    this._sheet.columnFilterCols = [...state.filterCols];
    this._sheet.columnFilters = state.filters.map(f => ({
      ...f,
      selectedValues: f.selectedValues ? [...f.selectedValues] : undefined,
    }));
    this._notifyChange(null);
  }

  private _pushColumnFilterUndo(before: ReturnType<typeof this._snapshotColumnFilterState>): void {
    const after = this._snapshotColumnFilterState();
    const same = before.enabled === after.enabled
      && JSON.stringify(before.filterCols) === JSON.stringify(after.filterCols)
      && JSON.stringify(before.filters) === JSON.stringify(after.filters);
    if (same) return;
    this._pushUndo({
      type: 'columnFilter',
      undo: () => this._applyColumnFilterState(before),
      redo: () => this._applyColumnFilterState(after),
    });
  }

  /** 为指定列开启列头筛选（仅这些列显示筛选图标） */
  enableColumnFiltersForCols(cols: number[]): void {
    const unique = [...new Set(cols.filter(c => c >= 0 && c < this._sheet.colCount))].sort((a, b) => a - b);
    if (unique.length === 0) return;
    const before = this._snapshotColumnFilterState();
    this._sheet.columnFilterCols = unique;
    this._sheet.columnFilterEnabled = true;
    this._notifyChange(null);
    this._pushColumnFilterUndo(before);
  }

  /** @deprecated 使用 enableColumnFiltersForCols */
  enableColumnFilters(): void {
    const cols = Array.from({ length: this._sheet.colCount }, (_, i) => i);
    this.enableColumnFiltersForCols(cols);
  }

  /** 取消筛选：关闭筛选功能并清空全部列条件 */
  disableColumnFilters(): void {
    if (!this._sheet.columnFilterEnabled && !(this._sheet.columnFilters?.length) && !(this._sheet.columnFilterCols?.length)) return;
    const before = this._snapshotColumnFilterState();
    this._sheet.columnFilterEnabled = false;
    this._sheet.columnFilterCols = [];
    this._sheet.columnFilters = [];
    this._notifyChange(null);
    this._pushColumnFilterUndo(before);
  }

  /** 设置普通表格列筛选条件 */
  setColumnFilters(conditions: import('../types/index').ColumnFilterCondition[]): void {
    const before = this._snapshotColumnFilterState();
    this._sheet.columnFilters = conditions;
    this._notifyChange(null);
    this._pushColumnFilterUndo(before);
  }

  /** 清空列筛选条件（保留筛选功能开启状态） */
  clearColumnFilters(): void {
    if (!(this._sheet.columnFilters?.length)) return;
    const before = this._snapshotColumnFilterState();
    this._sheet.columnFilters = [];
    this._notifyChange(null);
    this._pushColumnFilterUndo(before);
  }

  /** 设置单列筛选（null 表示清除该列条件，保留漏斗图标） */
  setColumnFilterForCol(col: number, condition: import('../types/index').ColumnFilterCondition | null): void {
    const before = this._snapshotColumnFilterState();
    const rest = (this._sheet.columnFilters ?? []).filter(f => f.col !== col);
    if (condition) rest.push(condition);
    this._sheet.columnFilters = rest;
    this._notifyChange(null);
    this._pushColumnFilterUndo(before);
  }

  /** 移动列顺序 */
  moveColumns(fromCol: number, toCol: number): void {
    if (fromCol === toCol) return;
    const colCount = this._sheet.colCount;
    if (fromCol < 0 || fromCol >= colCount || toCol < 0 || toCol >= colCount) return;

    const remapCol = (c: number): number => {
      if (c === fromCol) return toCol;
      if (fromCol < toCol) {
        if (c > fromCol && c <= toCol) return c - 1;
      } else if (c >= toCol && c < fromCol) {
        return c + 1;
      }
      return c;
    };

    this._applyColumnPermutation(remapCol);
  }

  /** 移动连续多列（整块调整顺序） */
  moveColumnBlock(blockStart: number, blockEnd: number, insertIndex: number): void {
    const colCount = this._sheet.colCount;
    const start = Math.min(blockStart, blockEnd);
    const end = Math.max(blockStart, blockEnd);
    const blockLen = end - start + 1;
    if (blockLen <= 0 || start < 0 || end >= colCount) return;
    if (insertIndex >= start && insertIndex <= end) return;
    if (blockLen === 1) {
      this.moveColumns(start, insertIndex);
      return;
    }

    const without: number[] = [];
    for (let c = 0; c < colCount; c++) {
      if (c < start || c > end) without.push(c);
    }

    let insertAt = insertIndex <= start ? insertIndex : insertIndex - blockLen;
    insertAt = Math.max(0, Math.min(insertAt, without.length));

    const block = Array.from({ length: blockLen }, (_, i) => start + i);
    const order = [...without];
    order.splice(insertAt, 0, ...block);

    const oldToNew = new Map<number, number>();
    order.forEach((oldCol, newCol) => oldToNew.set(oldCol, newCol));
    this._applyColumnPermutation(c => oldToNew.get(c) ?? c);
  }

  private _applyColumnPermutation(remapCol: (c: number) => number): void {
    const newCells = new Map<string, CellData>();
    for (const [key, cell] of this._sheet.cells) {
      const coord = keyToCoord(key);
      newCells.set(coordToKey({ row: coord.row, col: remapCol(coord.col) }), cell);
    }
    this._sheet.cells = newCells;

    this._sheet.mergeRanges = this._sheet.mergeRanges.map(range => {
      const nr: CellRange = {
        ...range,
        start: { ...range.start, col: remapCol(range.start.col) },
        end: { ...range.end, col: remapCol(range.end.col) },
        master: range.master ? { ...range.master, col: remapCol(range.master.col) } : undefined,
      };
      return nr;
    });

    const newWidths = new Map<number, number>();
    for (const [c, w] of this._sheet.columnWidths) {
      newWidths.set(remapCol(c), w);
    }
    this._sheet.columnWidths = newWidths;

    if (this._sheet.columnFilters?.length) {
      this._sheet.columnFilters = this._sheet.columnFilters.map(f => ({ ...f, col: remapCol(f.col) }));
    }

    if (this._sheet.columnFilterCols?.length) {
      this._sheet.columnFilterCols = this._sheet.columnFilterCols.map(remapCol).sort((a, b) => a - b);
    }

    if (this._sheet.columnDefs.length > 0) {
      const defs = this._sheet.columnDefs;
      const newDefs = new Array<ColumnDef>(defs.length);
      for (let oldCol = 0; oldCol < defs.length; oldCol++) {
        const newCol = remapCol(oldCol);
        if (newCol >= 0 && newCol < newDefs.length) {
          newDefs[newCol] = defs[oldCol];
        }
      }
      this._sheet.columnDefs = newDefs;
    }

    this._notifyChange(null);
  }

  /** 移动行顺序 */
  moveRows(fromRow: number, toRow: number): void {
    if (fromRow === toRow) return;
    const rowCount = this._sheet.rowCount;
    if (fromRow < 0 || fromRow >= rowCount || toRow < 0 || toRow >= rowCount) return;

    const remapRow = (r: number): number => {
      if (r === fromRow) return toRow;
      if (fromRow < toRow) {
        if (r > fromRow && r <= toRow) return r - 1;
      } else if (r >= toRow && r < fromRow) {
        return r + 1;
      }
      return r;
    };

    this._applyRowPermutation(remapRow);
  }

  /** 移动连续多行（整块调整顺序） */
  moveRowBlock(blockStart: number, blockEnd: number, insertIndex: number): void {
    const rowCount = this._sheet.rowCount;
    const start = Math.min(blockStart, blockEnd);
    const end = Math.max(blockStart, blockEnd);
    const blockLen = end - start + 1;
    if (blockLen <= 0 || start < 0 || end >= rowCount) return;
    if (insertIndex >= start && insertIndex <= end) return;
    if (blockLen === 1) {
      this.moveRows(start, insertIndex);
      return;
    }

    const without: number[] = [];
    for (let r = 0; r < rowCount; r++) {
      if (r < start || r > end) without.push(r);
    }

    let insertAt = insertIndex <= start ? insertIndex : insertIndex - blockLen;
    insertAt = Math.max(0, Math.min(insertAt, without.length));

    const block = Array.from({ length: blockLen }, (_, i) => start + i);
    const order = [...without];
    order.splice(insertAt, 0, ...block);

    const oldToNew = new Map<number, number>();
    order.forEach((oldRow, newRow) => oldToNew.set(oldRow, newRow));
    this._applyRowPermutation(r => oldToNew.get(r) ?? r);
  }

  private _applyRowPermutation(remapRow: (r: number) => number): void {
    const newCells = new Map<string, CellData>();
    for (const [key, cell] of this._sheet.cells) {
      const coord = keyToCoord(key);
      newCells.set(coordToKey({ row: remapRow(coord.row), col: coord.col }), cell);
    }
    this._sheet.cells = newCells;

    this._sheet.mergeRanges = this._sheet.mergeRanges.map(range => {
      const nr: CellRange = {
        ...range,
        start: { ...range.start, row: remapRow(range.start.row) },
        end: { ...range.end, row: remapRow(range.end.row) },
        master: range.master ? { ...range.master, row: remapRow(range.master.row) } : undefined,
      };
      return nr;
    });

    const newHeights = new Map<number, number>();
    for (const [r, h] of this._sheet.rowHeights) {
      newHeights.set(remapRow(r), h);
    }
    this._sheet.rowHeights = newHeights;

    if (this._sheet.type === 'base' && this._sheet.rows.length > 0) {
      const oldRows = this._sheet.rows;
      const newRows: RecordRow[] = new Array(this._sheet.rowCount);
      for (let oldR = 0; oldR < oldRows.length; oldR++) {
        const newR = remapRow(oldR);
        if (newR >= 0 && newR < newRows.length) {
          newRows[newR] = { ...oldRows[oldR], _order: newR };
        }
      }
      for (let i = 0; i < newRows.length; i++) {
        if (!newRows[i]) newRows[i] = createRecordRow(i);
        else newRows[i] = { ...newRows[i], _order: i };
      }
      this._sheet.rows = newRows;
    }

    this._notifyChange(null);
  }

  /** 按列值排序（保留表头行） */
  sortByColumn(col: number, order: 'asc' | 'desc', headerRow = 0): void {
    if (col < 0 || col >= this._sheet.colCount) return;
    const dataRows: number[] = [];
    for (let r = headerRow + 1; r < this._sheet.rowCount; r++) {
      dataRows.push(r);
    }
    dataRows.sort((a, b) => {
      const ta = getCellText(this.getCell(a, col)?.value ?? { type: 'empty' });
      const tb = getCellText(this.getCell(b, col)?.value ?? { type: 'empty' });
      const cmp = ta.localeCompare(tb, undefined, { numeric: true, sensitivity: 'base' });
      return order === 'asc' ? cmp : -cmp;
    });

    const orderRows = [...Array(headerRow + 1).keys(), ...dataRows];
    const snapshots = orderRows.map(r => this._snapshotRow(r));
    for (let newR = 0; newR < orderRows.length; newR++) {
      this._applyRowSnapshot(newR, snapshots[newR]);
    }
    this._notifyChange(null);
  }

  /** 确保多维表 rows 与 rowCount 同步 */
  ensureRowRecords(): void {
    if (this._sheet.type !== 'base') return;
    this._sheet.rows = ensureSheetRows(this._sheet.rows, this._sheet.rowCount);
  }

  /** 获取行记录元数据 */
  getRowRecord(row: number): RecordRow | undefined {
    this.ensureRowRecords();
    return this._sheet.rows[row];
  }

  /** 插入子记录，返回新行索引 */
  insertChildRow(parentRowIndex: number): number {
    this.ensureRowRecords();
    const parent = this._sheet.rows[parentRowIndex];
    if (!parent) {
      this.insertRows(this._sheet.rowCount, 1);
      return this._sheet.rowCount - 1;
    }

    const insertIndex = findChildInsertIndex(parentRowIndex, this._sheet.rows);
    this._insertRowsAt(insertIndex, 1, parent._id);
    return insertIndex;
  }

  /** 获取记录展示标题（首列文本或默认） */
  getRecordTitle(row: number): string {
    const titleCol = this._sheet.columnDefs.find(c => c.type === 'text') || this._sheet.columnDefs[0];
    if (!titleCol) return '未命名记录';
    const colIndex = this._sheet.columnDefs.findIndex(c => c.id === titleCol.id);
    const cell = this.getCell(row, colIndex);
    const text = getCellText(cell?.value ?? { type: 'empty' });
    return text.trim() || '未命名记录';
  }

  private _insertRowsAt(index: number, count: number, parentId?: string | null): void {
    if (index < 0 || index > this._sheet.rowCount) return;

    const newCells = new Map<string, CellData>();
    for (const [key, cell] of this._sheet.cells) {
      const coord = keyToCoord(key);
      if (coord.row >= index) {
        newCells.set(coordToKey({ row: coord.row + count, col: coord.col }), cell);
      } else {
        newCells.set(key, cell);
      }
    }
    this._sheet.cells = newCells;

    this._sheet.mergeRanges = this._sheet.mergeRanges.map(range => {
      const newRange: CellRange = { ...range, start: { ...range.start }, end: { ...range.end }, master: range.master ? { ...range.master } : undefined };
      if (newRange.start.row >= index) newRange.start.row += count;
      if (newRange.end.row >= index) newRange.end.row += count;
      if (newRange.master && newRange.master.row >= index) newRange.master.row += count;
      return newRange;
    });

    const newHeights = new Map<number, number>();
    for (const [r, h] of this._sheet.rowHeights) {
      newHeights.set(r >= index ? r + count : r, h);
    }
    this._sheet.rowHeights = newHeights;

    if (this._sheet.type === 'base') {
      const defaultH = this.getDefaultRowHeight();
      for (let r = index; r < index + count; r++) {
        this._sheet.rowHeights.set(r, defaultH);
      }
    }

    const newRows = [...this._sheet.rows];
    newRows.splice(index, 0, ...Array.from({ length: count }, (_, i) => createRecordRow(index + i, parentId ?? null)));
    for (let i = 0; i < newRows.length; i++) {
      newRows[i] = { ...newRows[i], _order: i };
    }
    this._sheet.rows = newRows;

    this._sheet.rowCount += count;

    this._markBaseRowsCreated(index, count);

    if (this._sheet.columnDefs.length > 0) {
      for (let r = index; r < index + count; r++) {
        this.applyRowDefaults(r);
      }
    }

    this._pushUndo({
      type: 'insertRows',
      undo: () => {
        this._deleteRowsRaw(index, count);
        this._sheet.rows.splice(index, count);
        this._notifyChange(null);
      },
      redo: () => {
        this._insertRowsRaw(index, count);
        const redoRows = [...this._sheet.rows];
        redoRows.splice(index, 0, ...Array.from({ length: count }, (_, i) => createRecordRow(index + i, parentId ?? null)));
        this._sheet.rows = redoRows;
        this._notifyChange(null);
      },
    });

    this._notifyChange(null);
  }

  /** 同步 colCount 与 columnDefs，避免保存后列数不一致导致无法点击编辑 */
  syncColumnLayout(): void {
    const defs = this._sheet.columnDefs;
    if (defs.length === 0) return;
    this._sheet.colCount = Math.max(this._sheet.colCount, defs.length);
    for (let i = 0; i < defs.length; i++) {
      if (!this._sheet.columnWidths.has(i)) {
        this._sheet.columnWidths.set(i, defs[i].width || 120);
      }
    }
    this.applyColumnVisibility();
  }

  /** 根据字段 hidden 状态同步列宽（隐藏列宽为 0） */
  applyColumnVisibility(): void {
    const defs = this._sheet.columnDefs;
    for (let i = 0; i < defs.length; i++) {
      if (defs[i].hidden) {
        this._sheet.columnWidths.set(i, 0);
      } else if (this._sheet.columnWidths.get(i) === 0) {
        this._sheet.columnWidths.set(i, defs[i].width || 120);
      }
    }
  }

  /** 补全多维表默认字段结构（保留已有单元格） */
  repairBaseSchema(): void {
    this._sheet.type = 'base';
    this._applyDefaultBaseSchema(false);
  }

  private _notifyChange(range: CellRange | null): void {
    for (const listener of this._changeListeners) {
      try { listener(range); } catch (e) { console.error(e); }
    }
  }

  /** 多维表：记录字段级变更历史 */
  private _maybeRecordFieldChange(
    row: number,
    col: number,
    before: import('../types/index').CellValue,
    after: import('../types/index').CellValue,
    options?: SetCellOptions,
  ): void {
    if (this._sheet.type !== 'base' || options?.skipHistory) return;
    if (cellValuesEqual(before, after)) return;
    this.ensureRowRecords();
    const record = this._sheet.rows[row];
    const colDef = this._sheet.columnDefs[col];
    if (!record || !colDef) return;
    appendRecordHistoryChange(record, {
      action: 'update',
      fieldId: colDef.id,
      before: before.type === 'empty' ? undefined : before,
      after: after.type === 'empty' ? undefined : after,
    });
  }

  private _markBaseRowsCreated(index: number, count: number): void {
    if (this._sheet.type !== 'base') return;
    this.ensureRowRecords();
    for (let row = index; row < index + count; row++) {
      const record = this._sheet.rows[row];
      if (record) appendRecordCreateHistory(record);
    }
  }

  /** 触发依赖公式的增量重算 */
  private _triggerRecalc(row: number, col: number): void {
    try {
      const updates = this._recalcEngine.recalcOnChange(row, col, this);
      for (const u of updates) {
        const key = coordToKey({ row: u.row, col: u.col });
        const existing = this._sheet.cells.get(key);
        if (existing && existing.value.type === 'formula') {
          const updated: CellData = {
            value: u.value,
            style: existing.style,
          };
          this._sheet.cells.set(key, updated);
        }
      }
    } catch (e) {
      // Recalc errors are non-fatal
      console.error('Recalc error:', e);
    }
  }

  // ==================== 单元格操作 ====================

  /** 获取单元格数据 */
  getCell(row: number, col: number): CellData | undefined {
    // 检查是否在合并区域中（非主单元格 → 返回主格数据）
    for (const range of this._sheet.mergeRanges) {
      if (row >= range.start.row && row <= range.end.row &&
          col >= range.start.col && col <= range.end.col) {
        const master = range.master || range.start;
        if (master.row !== row || master.col !== col) {
          return this._sheet.cells.get(coordToKey(master));
        }
      }
    }
    return this._sheet.cells.get(coordToKey({ row, col }));
  }

  /** 设置单元格值，可选的 formula 参数用于设置公式元数据 */
  setCell(
    row: number,
    col: number,
    value: string | number | boolean | null,
    formula?: string,
    options?: SetCellOptions,
  ): void {
    const key = coordToKey({ row, col });

    const mergeConflict = this._findMergeConflict(row, col);
    if (mergeConflict) {
      throw new Error(`Cannot set merged cell at (${row},${col})`);
    }

    const oldValue = this._sheet.cells.get(key);
    const oldCellValue = oldValue?.value ?? { type: 'empty' as const };

    // If old value was a formula, remove from dependency graph
    if (oldValue?.value.type === 'formula') {
      this._recalcEngine.removeFormula(row, col);
    }

    // Convert raw value to CellValue
    let cellValue: import('../types/index').CellValue;
    if (formula) {
      // Use RecalcEngine for formula evaluation
      try {
        cellValue = this._recalcEngine.evaluateAndStore(formula, this, row, col);
      } catch {
        cellValue = { type: 'formula', formula };
      }
    } else if (value === null || value === undefined) {
      cellValue = { type: 'empty' };
    } else if (typeof value === 'number') {
      cellValue = { type: 'number', value, format: { kind: 'general' } };
    } else if (typeof value === 'boolean') {
      cellValue = { type: 'boolean', value };
    } else {
      // String value — check if it's a formula
      const strVal = String(value);
      if (strVal.startsWith('=')) {
        try {
          cellValue = this._recalcEngine.evaluateAndStore(strVal, this, row, col);
        } catch {
          cellValue = { type: 'formula', formula: strVal };
        }
      } else {
        cellValue = parseCellValue(strVal);
      }
    }

    const cellData: CellData = { value: cellValue };

    // Preserve style
    if (oldValue?.style) {
      cellData.style = { ...oldValue.style };
    }

    this._sheet.cells.set(key, cellData);

    this._pushUndo({
      type: 'setCell',
      undo: () => {
        if (oldValue) this._sheet.cells.set(key, oldValue);
        else this._sheet.cells.delete(key);
        this._notifyChange(this._makeRange(row, col, row, col));
      },
      redo: () => {
        this._sheet.cells.set(key, cellData);
        this._notifyChange(this._makeRange(row, col, row, col));
      },
    });

    // Trigger recalculation of dependent formulas
    this._triggerRecalc(row, col);

    this._maybeRecordFieldChange(row, col, oldCellValue, cellValue, options);
    this._notifyChange(this._makeRange(row, col, row, col));
  }

  /** 设置单元格值（直接传入 CellValue） */
  setCellValue(
    row: number,
    col: number,
    cellValue: import('../types/index').CellValue,
    options?: SetCellOptions,
  ): void {
    const key = coordToKey({ row, col });
    const mergeConflict = this._findMergeConflict(row, col);
    if (mergeConflict) throw new Error(`Cannot set merged cell at (${row},${col})`);

    const oldValue = this._sheet.cells.get(key);
    const oldCellValue = oldValue?.value ?? { type: 'empty' as const };
    
    // If old value was a formula, remove from dependency graph
    if (oldValue?.value.type === 'formula') {
      this._recalcEngine.removeFormula(row, col);
    }
    
    // If new value is a formula, evaluate it
    let finalValue = cellValue;
    if (cellValue.type === 'formula') {
      try {
        finalValue = this._recalcEngine.evaluateAndStore(cellValue.formula, this, row, col);
      } catch {
        // Keep as-is
      }
    }

    const cellData: CellData = { value: finalValue };
    if (oldValue?.style) cellData.style = { ...oldValue.style };
    this._sheet.cells.set(key, cellData);

    this._pushUndo({
      type: 'setCell',
      undo: () => { if (oldValue) this._sheet.cells.set(key, oldValue); else this._sheet.cells.delete(key); this._notifyChange(this._makeRange(row, col, row, col)); },
      redo: () => { this._sheet.cells.set(key, cellData); this._notifyChange(this._makeRange(row, col, row, col)); },
    });

    // Trigger recalculation of dependent formulas
    this._triggerRecalc(row, col);

    this._maybeRecordFieldChange(row, col, oldCellValue, finalValue, options);
    this._notifyChange(this._makeRange(row, col, row, col));
  }

  /** 清除单元格 */
  clearCell(row: number, col: number): void {
    const key = coordToKey({ row, col });
    const oldValue = this._sheet.cells.get(key);
    if (!oldValue) return;
    const oldCellValue = oldValue.value;

    // If old value was a formula, remove from dependency graph
    if (oldValue.value.type === 'formula') {
      this._recalcEngine.removeFormula(row, col);
    }

    this._sheet.cells.delete(key);

    this._pushUndo({
      type: 'clearCell',
      undo: () => {
        this._sheet.cells.set(key, oldValue);
        this._notifyChange(this._makeRange(row, col, row, col));
      },
      redo: () => {
        this._sheet.cells.delete(key);
        this._notifyChange(this._makeRange(row, col, row, col));
      },
    });

    // Trigger recalculation of dependent formulas
    this._triggerRecalc(row, col);

    this._maybeRecordFieldChange(row, col, oldCellValue, { type: 'empty' });
    this._notifyChange(this._makeRange(row, col, row, col));
  }

  /** 清除单元格内容（保留样式和格式） */
  clearCellContent(row: number, col: number): void {
    const key = coordToKey({ row, col });
    const oldCell = this._sheet.cells.get(key);
    if (!oldCell) return;

    if (oldCell.value.type === 'formula') {
      this._recalcEngine.removeFormula(row, col);
    }

    const newCell: CellData = { value: { type: 'empty' } };
    if (oldCell.style) newCell.style = { ...oldCell.style };

    this._sheet.cells.set(key, newCell);

    this._pushUndo({
      type: 'clearContent',
      undo: () => { this._sheet.cells.set(key, oldCell); this._notifyChange(this._makeRange(row, col, row, col)); },
      redo: () => { this._sheet.cells.set(key, newCell); this._notifyChange(this._makeRange(row, col, row, col)); },
    });

    this._triggerRecalc(row, col);
    this._notifyChange(this._makeRange(row, col, row, col));
  }

  /** 清除选区内所有单元格内容（保留格式），跳过合并子格 */
  clearRangeContent(range: CellRange): void {
    this.runBatch(() => {
      const startRow = Math.min(range.start.row, range.end.row);
      const endRow = Math.max(range.start.row, range.end.row);
      const startCol = Math.min(range.start.col, range.end.col);
      const endCol = Math.max(range.start.col, range.end.col);

      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          const merged = this.isInMergedCell(r, c);
          if (merged) {
            const master = merged.master || merged.start;
            if (master.row !== r || master.col !== c) continue;
          }
          const key = coordToKey({ row: r, col: c });
          const cell = this._sheet.cells.get(key);
          if (cell?.isMergedChild) continue;
          this.clearCellContent(r, c);
        }
      }
    }, 'clearRange');
  }

  /** 清除单元格格式（保留内容） */
  clearCellFormat(row: number, col: number): void {
    const key = coordToKey({ row, col });
    const oldCell = this._sheet.cells.get(key);
    if (!oldCell) return;

    const newCell: CellData = { ...oldCell, style: undefined };
    this._sheet.cells.set(key, newCell);

    this._pushUndo({
      type: 'clearFormat',
      undo: () => { this._sheet.cells.set(key, oldCell); this._notifyChange(this._makeRange(row, col, row, col)); },
      redo: () => { this._sheet.cells.set(key, newCell); this._notifyChange(this._makeRange(row, col, row, col)); },
    });

    this._notifyChange(this._makeRange(row, col, row, col));
  }

  /** 清除单元格全部（内容+格式） */
  clearCellAll(row: number, col: number): void {
    this.clearCell(row, col);
  }

  /** 插入单元格，右侧单元格右移 */
  insertCellShiftRight(row: number, col: number): void {
    this._shiftCellsRight(row, col);
    this._notifyChange(this._makeRange(row, col, row, this._sheet.colCount - 1));
  }

  /** 插入单元格，下方单元格下移 */
  insertCellShiftDown(row: number, col: number): void {
    this._shiftCellsDown(row, col);
    this._notifyChange(this._makeRange(row, col, this._sheet.rowCount - 1, col));
  }

  /** 删除单元格，下方单元格上移 */
  deleteCellShiftUp(row: number, col: number): void {
    const key = coordToKey({ row, col });
    const oldCell = this._sheet.cells.get(key);
    if (oldCell?.value.type === 'formula') {
      this._recalcEngine.removeFormula(row, col);
    }
    for (let r = row; r < this._sheet.rowCount - 1; r++) {
      const currKey = coordToKey({ row: r, col });
      const belowKey = coordToKey({ row: r + 1, col });
      const below = this._sheet.cells.get(belowKey);
      if (below) this._sheet.cells.set(currKey, below);
      else this._sheet.cells.delete(currKey);
    }
    this._sheet.cells.delete(coordToKey({ row: this._sheet.rowCount - 1, col }));
    this._notifyChange(this._makeRange(row, col, this._sheet.rowCount - 1, col));
  }

  /** 删除单元格，右侧单元格左移 */
  deleteCellShiftLeft(row: number, col: number): void {
    const key = coordToKey({ row, col });
    const oldCell = this._sheet.cells.get(key);
    if (oldCell?.value.type === 'formula') {
      this._recalcEngine.removeFormula(row, col);
    }
    for (let c = col; c < this._sheet.colCount - 1; c++) {
      const currKey = coordToKey({ row, col: c });
      const rightKey = coordToKey({ row, col: c + 1 });
      const right = this._sheet.cells.get(rightKey);
      if (right) this._sheet.cells.set(currKey, right);
      else this._sheet.cells.delete(currKey);
    }
    this._sheet.cells.delete(coordToKey({ row, col: this._sheet.colCount - 1 }));
    this._notifyChange(this._makeRange(row, col, row, this._sheet.colCount - 1));
  }

  /** 设置单元格样式 */
  setCellStyle(row: number, col: number, style: Partial<CellStyle>): void {
    const merged = this.isInMergedCell(row, col);
    if (merged) {
      const master = merged.master || merged.start;
      row = master.row;
      col = master.col;
    }

    const key = coordToKey({ row, col });
    let cell = this._sheet.cells.get(key);
    const oldStyle = cell?.style ? { ...cell.style } : undefined;

    if (!cell) {
      cell = emptyCell();
    }
    cell.style = { ...(cell.style || DEFAULT_CELL_STYLE), ...style };
    this._sheet.cells.set(key, cell);

    this._pushUndo({
      type: 'setStyle',
      undo: () => {
        const c = this._sheet.cells.get(key);
        if (c) {
          c.style = oldStyle || DEFAULT_CELL_STYLE;
          this._sheet.cells.set(key, c);
        }
        this._notifyChange(this._makeRange(row, col, row, col));
      },
      redo: () => {
        const c = this._sheet.cells.get(key);
        if (c) {
          c.style = { ...(c.style || DEFAULT_CELL_STYLE), ...style };
          this._sheet.cells.set(key, c);
        }
        this._notifyChange(this._makeRange(row, col, row, col));
      },
    });

    this._notifyChange(this._makeRange(row, col, row, col));
  }

  // ==================== 合并单元格 ====================

  /** 合并单元格范围 */
  mergeCells(range: CellRange): CellRange {
    const { minRow, maxRow, minCol, maxCol } = {
      minRow: range.start.row, maxRow: range.end.row,
      minCol: range.start.col, maxCol: range.end.col,
    };

    // 前置校验 1：单单元格不可合并
    if (minRow === maxRow && minCol === maxCol) {
      throw new Error('单单元格不可合并');
    }

    // 前置校验 2：与现有合并区域重叠
    for (const existing of this._sheet.mergeRanges) {
      if (this._rangesOverlap(range, existing)) {
        throw new Error('合并区域存在重叠');
      }
    }

    // 前置校验 3：尺寸限制
    const rowCount = maxRow - minRow + 1;
    const colCount = maxCol - minCol + 1;
    if (rowCount > 100 || colCount > 100) {
      throw new Error('合并区域过大（最大100x100）');
    }

    // 备份子单元格原始数据
    const originChildCells = new Map<string, CellData>();
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        if (r === minRow && c === minCol) continue; // 跳过主格
        const key = coordToKey({ row: r, col: c });
        const existing = this._sheet.cells.get(key);
        originChildCells.set(key, existing || { value: { type: 'empty' }, isMergedChild: false });
      }
    }

    // 清空、标记所有子单元格
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        if (r === minRow && c === minCol) continue;
        const key = coordToKey({ row: r, col: c });
        this._sheet.cells.set(key, { value: { type: 'empty' }, isMergedChild: true });
      }
    }

    // 写入合并区域
    const newMerge: CellRange = {
      sheetId: range.sheetId,
      start: { row: minRow, col: minCol },
      end: { row: maxRow, col: maxCol },
      master: { row: minRow, col: minCol },
    };
    this._sheet.mergeRanges.push(newMerge);

    // 推入撤销栈
    this._pushUndo({
      type: 'mergeCells',
      undo: () => {
        // 回滚：删除合并区域，恢复子格数据
        this._sheet.mergeRanges = this._sheet.mergeRanges.filter(r => r !== newMerge);
        for (const [key, cell] of originChildCells) {
          this._sheet.cells.set(key, { ...cell, isMergedChild: false });
        }
        this._notifyChange(range);
      },
      redo: () => {
        this._sheet.mergeRanges.push(newMerge);
        for (let r = minRow; r <= maxRow; r++) {
          for (let c = minCol; c <= maxCol; c++) {
            if (r === minRow && c === minCol) continue;
            this._sheet.cells.set(coordToKey({ row: r, col: c }), { value: { type: 'empty' }, isMergedChild: true });
          }
        }
        this._notifyChange(range);
      },
    });

    // Trigger full redraw (not just range) to clear internal gridlines
    this._notifyChange(null);
    return newMerge;
  }

  /** 取消合并 */
  unmergeCells(row: number, col: number): void {
    // 查找匹配的合并区域
    let targetMerge: CellRange | null = null;
    for (const range of this._sheet.mergeRanges) {
      if (row >= range.start.row && row <= range.end.row &&
          col >= range.start.col && col <= range.end.col) {
        const master = range.master || range.start;
        // 仅主格可拆分
        if (master.row === row && master.col === col) {
          targetMerge = range;
          break;
        }
      }
    }

    if (!targetMerge) {
      throw new Error('当前单元格未合并或非主格，不可拆分');
    }

    const { startRow, endRow, startCol, endCol } = {
      startRow: targetMerge.start.row, endRow: targetMerge.end.row,
      startCol: targetMerge.start.col, endCol: targetMerge.end.col,
    };

    // 读取备份数据载体
    const originChildCells = new Map<string, CellData>();
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        if (r === startRow && c === startCol) continue;
        const key = coordToKey({ row: r, col: c });
        const childCell = this._sheet.cells.get(key);
        originChildCells.set(key, childCell ? { ...childCell } : { value: { type: 'empty' }, isMergedChild: false });
      }
    }

    // 删除合并区间
    this._sheet.mergeRanges = this._sheet.mergeRanges.filter(r => r !== targetMerge);

    // 恢复所有子单元格，清除 isMergedChild
    const restoredRange: CellRange = {
      sheetId: targetMerge!.sheetId,
      start: { row: startRow, col: startCol },
      end: { row: endRow, col: endCol },
    };
    for (const [key, cell] of originChildCells) {
      this._sheet.cells.set(key, { ...cell, isMergedChild: false });
    }

    // 推入撤销栈
    this._pushUndo({
      type: 'unmergeCells',
      undo: () => {
        this._sheet.mergeRanges.push(targetMerge!);
        for (let r = startRow; r <= endRow; r++) {
          for (let c = startCol; c <= endCol; c++) {
            if (r === startRow && c === startCol) continue;
            this._sheet.cells.set(coordToKey({ row: r, col: c }), { value: { type: 'empty' }, isMergedChild: true });
          }
        }
        this._notifyChange(restoredRange);
      },
      redo: () => {
        this._sheet.mergeRanges = this._sheet.mergeRanges.filter(r => r !== targetMerge);
        for (const [key, cell] of originChildCells) {
          this._sheet.cells.set(key, { ...cell, isMergedChild: false });
        }
        this._notifyChange(restoredRange);
      },
    });

    // Trigger full redraw to clear internal gridlines
    this._notifyChange(null);
  }

  /** 检查单元格是否在合并区域内 */
  isInMergedCell(row: number, col: number): CellRange | null {
    for (const range of this._sheet.mergeRanges) {
      if (row >= range.start.row && row <= range.end.row &&
          col >= range.start.col && col <= range.end.col) {
        return range;
      }
    }
    return null;
  }

  // ==================== 行列操作 ====================

  /** 为新行写入各列 defaultValue */
  applyRowDefaults(row: number): void {
    for (let c = 0; c < this._sheet.columnDefs.length; c++) {
      const colDef = this._sheet.columnDefs[c];
      const value = resolveColumnDefaultValue(colDef);
      if (value) {
        this.setCellValue(row, c, value, { skipHistory: true });
      }
    }
  }

  /** 插入行 */
  insertRows(index: number, count: number = 1): void {
    if (index < 0 || index > this._sheet.rowCount) return;

    // 移动现有数据
    const newCells = new Map<string, CellData>();
    for (const [key, cell] of this._sheet.cells) {
      const coord = keyToCoord(key);
      if (coord.row >= index) {
        newCells.set(coordToKey({ row: coord.row + count, col: coord.col }), cell);
      } else {
        newCells.set(key, cell);
      }
    }
    this._sheet.cells = newCells;

    // 更新合并区域
    this._sheet.mergeRanges = this._sheet.mergeRanges.map(range => {
      const newRange: CellRange = { ...range, start: { ...range.start }, end: { ...range.end }, master: range.master ? { ...range.master } : undefined };
      if (newRange.start.row >= index) newRange.start.row += count;
      if (newRange.end.row >= index) newRange.end.row += count;
      if (newRange.master && newRange.master.row >= index) newRange.master.row += count;
      return newRange;
    });

    // 更新行高
    const newHeights = new Map<number, number>();
    for (const [r, h] of this._sheet.rowHeights) {
      newHeights.set(r >= index ? r + count : r, h);
    }
    this._sheet.rowHeights = newHeights;

    // 多维表：新行继承 sheet 全局行高
    if (this._sheet.type === 'base') {
      const defaultH = this.getDefaultRowHeight();
      for (let r = index; r < index + count; r++) {
        this._sheet.rowHeights.set(r, defaultH);
      }
    }

    this._sheet.rowCount += count;

    if (this._sheet.type === 'base') {
      this.ensureRowRecords();
      const newRows = [...this._sheet.rows];
      newRows.splice(index, 0, ...Array.from({ length: count }, (_, i) => createRecordRow(index + i)));
      for (let i = 0; i < newRows.length; i++) {
        newRows[i] = { ...newRows[i], _order: i };
      }
      this._sheet.rows = newRows;
    }

    this._markBaseRowsCreated(index, count);

    if (this._sheet.columnDefs.length > 0) {
      for (let r = index; r < index + count; r++) {
        this.applyRowDefaults(r);
      }
    }

    this._pushUndo({
      type: 'insertRows',
      undo: () => {
        this._deleteRowsRaw(index, count);
        if (this._sheet.type === 'base') {
          this._sheet.rows.splice(index, count);
        }
        this._notifyChange(null);
      },
      redo: () => {
        this._insertRowsRaw(index, count);
        this._notifyChange(null);
      },
    });

    this._notifyChange(null);
  }

  /** 删除行 */
  deleteRows(index: number, count: number = 1): void {
    if (index < 0 || index >= this._sheet.rowCount) return;

    // 备份被删除的数据
    const deletedCells = new Map<string, CellData>();
    for (const [key, cell] of this._sheet.cells) {
      const coord = keyToCoord(key);
      if (coord.row >= index && coord.row < index + count) {
        deletedCells.set(key, cell);
      }
    }

    const oldRowCount = this._sheet.rowCount;
    this._deleteRowsRaw(index, count);

    if (this._sheet.type === 'base') {
      this.ensureRowRecords();
      this._sheet.rows.splice(index, count);
      for (let i = 0; i < this._sheet.rows.length; i++) {
        this._sheet.rows[i] = { ...this._sheet.rows[i], _order: i };
      }
    }

    this._pushUndo({
      type: 'deleteRows',
      undo: () => {
        this._insertRowsRaw(index, count);
        for (const [key, cell] of deletedCells) {
          this._sheet.cells.set(key, cell);
        }
        this._notifyChange(null);
      },
      redo: () => {
        this._deleteRowsRaw(index, count);
        this._notifyChange(null);
      },
    });

    this._notifyChange(null);
  }

  /** 插入列 */
  insertColumns(index: number, count: number = 1): void {
    if (index < 0 || index > this._sheet.colCount) return;

    const newCells = new Map<string, CellData>();
    for (const [key, cell] of this._sheet.cells) {
      const coord = keyToCoord(key);
      if (coord.col >= index) {
        newCells.set(coordToKey({ row: coord.row, col: coord.col + count }), cell);
      } else {
        newCells.set(key, cell);
      }
    }
    this._sheet.cells = newCells;

    this._sheet.mergeRanges = this._sheet.mergeRanges.map(range => {
      const newRange: CellRange = { ...range, start: { ...range.start }, end: { ...range.end }, master: range.master ? { ...range.master } : undefined };
      if (newRange.start.col >= index) newRange.start.col += count;
      if (newRange.end.col >= index) newRange.end.col += count;
      if (newRange.master && newRange.master.col >= index) newRange.master.col += count;
      return newRange;
    });

    const newWidths = new Map<number, number>();
    for (const [c, w] of this._sheet.columnWidths) {
      newWidths.set(c >= index ? c + count : c, w);
    }
    this._sheet.columnWidths = newWidths;

    this._sheet.colCount += count;
    this._notifyChange(null);
  }

  /** 删除列 */
  deleteColumns(index: number, count: number = 1): void {
    if (index < 0 || index >= this._sheet.colCount) return;

    const newCells = new Map<string, CellData>();
    for (const [key, cell] of this._sheet.cells) {
      const coord = keyToCoord(key);
      if (coord.col >= index && coord.col < index + count) continue; // 删除这些列
      const newCol = coord.col >= index + count ? coord.col - count : coord.col;
      newCells.set(coordToKey({ row: coord.row, col: newCol }), cell);
    }
    this._sheet.cells = newCells;

    // 清理合并区域
    this._sheet.mergeRanges = this._sheet.mergeRanges.filter(range => {
      const newRange: CellRange = { ...range, start: { ...range.start }, end: { ...range.end }, master: range.master ? { ...range.master } : undefined };
      if (newRange.start.col >= index) newRange.start.col -= count;
      if (newRange.end.col >= index) newRange.end.col -= count;
      if (newRange.master && newRange.master.col >= index) newRange.master.col -= count;
      return newRange.start.col >= 0 && newRange.end.col >= 0;
    }).map(r => {
      if (r.start.col >= index) r.start.col -= count;
      if (r.end.col >= index) r.end.col -= count;
      if (r.master && r.master.col >= index) r.master.col -= count;
      return r;
    });

    const newWidths = new Map<number, number>();
    for (const [c, w] of this._sheet.columnWidths) {
      if (c >= index && c < index + count) continue;
      newWidths.set(c >= index + count ? c - count : c, w);
    }
    this._sheet.columnWidths = newWidths;

    if (this._sheet.columnDefs.length > 0) {
      this._sheet.columnDefs.splice(index, count);
    }

    this._sheet.colCount -= count;
    this._notifyChange(null);
  }

  /** 调整列宽 */
  setColumnWidth(col: number, width: number): void {
    const clamped = Math.max(20, Math.min(1000, width));
    this._sheet.columnWidths.set(col, clamped);
    if (this._sheet.columnDefs[col]) {
      this._sheet.columnDefs[col].width = clamped;
      if (this._sheet.columnDefs[col].hidden) {
        this._sheet.columnDefs[col].hidden = false;
      }
    }
    this._notifyChange(null);
  }

  /** 获取多维表全局行高 */
  getDefaultRowHeight(): number {
    if (this._sheet.type === 'base') {
      return this._sheet.defaultRowHeight ?? DEFAULT_BASE_ROW_HEIGHT;
    }
    return DEFAULT_ROW_HEIGHT;
  }

  /** 设置多维表全局行高（所有行统一，新行继承） */
  setDefaultRowHeight(height: number): void {
    const clamped = Math.max(10, Math.min(500, height));
    this._sheet.defaultRowHeight = clamped;
    if (this._sheet.type === 'base') {
      for (let r = 0; r < this._sheet.rowCount; r++) {
        this._sheet.rowHeights.set(r, clamped);
      }
    }
    this._notifyChange(null);
  }

  /** 调整行高 */
  setRowHeight(row: number, height: number): void {
    if (this._sheet.type === 'base') {
      this.setDefaultRowHeight(height);
      return;
    }
    this._sheet.rowHeights.set(row, Math.max(10, Math.min(500, height)));
    this._notifyChange(null);
  }

  /** 双击列分隔线：按内容自动调整列宽 */
  autoFitColumnWidth(col: number): void {
    this.setColumnWidth(col, computeColumnAutoWidth(this, col));
  }

  /** 双击行分隔线：按内容自动调整行高（普通表格） */
  autoFitRowHeight(row: number): void {
    if (this._sheet.type === 'base') return;
    const height = computeRowAutoHeight(
      this,
      row,
      this._sheet.columnWidths,
    );
    this.setRowHeight(row, height);
  }

  // ==================== 冻结 ====================

  setFreeze(frozenRows: number, frozenCols: number): void {
    this._sheet.freezeState = { frozenRows, frozenCols };
    this._notifyChange(null);
  }

  // ==================== 撤销/重做 ====================

  /** 将 fn 内多次变更合并为一条撤销记录（如批量粘贴、填充、清除选区） */
  runBatch(fn: () => void, type = 'batch'): void {
    this.beginUndoBatch();
    try {
      fn();
    } finally {
      this.endUndoBatch(type);
    }
  }

  beginUndoBatch(): void {
    this._undoBatchStack.push([]);
  }

  endUndoBatch(type = 'batch'): void {
    const batch = this._undoBatchStack.pop();
    if (!batch || batch.length === 0) return;

    const composite: Operation = {
      type,
      undo: () => {
        for (let i = batch.length - 1; i >= 0; i--) {
          batch[i].undo();
        }
        this._notifyChange(null);
      },
      redo: () => {
        for (const op of batch) {
          op.redo();
        }
        this._notifyChange(null);
      },
    };

    if (this._undoBatchStack.length > 0) {
      this._undoBatchStack[this._undoBatchStack.length - 1].push(composite);
    } else {
      this._pushUndo(composite);
    }
  }

  undo(): boolean {
    const op = this._undoStack.pop();
    if (!op) return false;
    op.undo();
    this._redoStack.push(op);
    return true;
  }

  redo(): boolean {
    const op = this._redoStack.pop();
    if (!op) return false;
    op.redo();
    this._undoStack.push(op);
    return true;
  }

  get canUndo(): boolean { return this._undoStack.length > 0; }
  get canRedo(): boolean { return this._redoStack.length > 0; }

  // ==================== 图表管理 ====================

  private _chartIdCounter = 0;

  /** 添加图表 */
  addChart(chart: Omit<ChartInstance, 'id'>): ChartInstance {
    const id = `chart_${Date.now()}_${this._chartIdCounter++}`;
    const newChart: ChartInstance = { ...chart, id };
    this._sheet.charts.push(newChart);

    this._pushUndo({
      type: 'addChart',
      undo: () => { this._sheet.charts = this._sheet.charts.filter(c => c.id !== id); this._notifyChange(null); },
      redo: () => { this._sheet.charts.push(newChart); this._notifyChange(null); },
    });

    this._notifyChange(null);
    return newChart;
  }

  /** 更新图表 */
  updateChart(id: string, updates: Partial<ChartInstance>): void {
    const idx = this._sheet.charts.findIndex(c => c.id === id);
    if (idx === -1) return;

    const old = { ...this._sheet.charts[idx] };
    this._sheet.charts[idx] = { ...old, ...updates };

    this._pushUndo({
      type: 'updateChart',
      undo: () => { this._sheet.charts[idx] = old; this._notifyChange(null); },
      redo: () => { this._sheet.charts[idx] = { ...old, ...updates }; this._notifyChange(null); },
    });

    this._notifyChange(null);
  }

  /** 删除图表 */
  removeChart(id: string): void {
    const idx = this._sheet.charts.findIndex(c => c.id === id);
    if (idx === -1) return;

    const removed = this._sheet.charts[idx];
    this._sheet.charts.splice(idx, 1);

    this._pushUndo({
      type: 'removeChart',
      undo: () => { this._sheet.charts.splice(idx, 0, removed); this._notifyChange(null); },
      redo: () => { this._sheet.charts = this._sheet.charts.filter(c => c.id !== id); this._notifyChange(null); },
    });

    this._notifyChange(null);
  }

  /** 获取图表 */
  getChart(id: string): ChartInstance | undefined {
    return this._sheet.charts.find(c => c.id === id);
  }

  /** 获取所有图表 */
  getAllCharts(): ChartInstance[] {
    return [...this._sheet.charts];
  }

  /** 获取指定位置附近的图表 */
  getChartsAt(row: number, col: number): ChartInstance[] {
    return this._sheet.charts.filter(c => {
      const p = c.position;
      return row >= p.anchorRow && row <= p.anchorRow + Math.ceil(p.height / DEFAULT_ROW_HEIGHT) &&
             col >= p.anchorCol && col <= p.anchorCol + Math.ceil(p.width / DEFAULT_COLUMN_WIDTH);
    });
  }

  // ==================== 下拉列表验证 ====================

  getDropdownValidationAt(row: number, col: number): DataValidation | null {
    return getDropdownValidationAt(this._sheet.validations, row, col);
  }

  getDateValidationAt(row: number, col: number): DataValidation | null {
    return getDateValidationAt(this._sheet.validations, row, col);
  }

  getFreeformSpecialValidationAt(row: number, col: number): DataValidation | null {
    return this.getDropdownValidationAt(row, col) ?? this.getDateValidationAt(row, col);
  }

  setDropdownValidation(
    range: CellRange,
    config: {
      mode: 'single' | 'multi';
      showOptionColor: boolean;
      options: SelectOption[];
    },
  ): void {
    const normalizedRange: CellRange = {
      sheetId: this._sheet.sheetId,
      start: { ...range.start },
      end: { ...range.end },
    };
    const options = normalizeDropdownOptions(config.options);
    const prev = this._sheet.validations.map(v => ({
      ...v,
      range: { ...v.range, start: { ...v.range.start }, end: { ...v.range.end } },
      options: v.options?.map(o => ({ ...o })),
    }));
    const existing = prev.find(v => v.type === 'dropdownList' && rangesOverlap(v.range, normalizedRange));
    const nextValidation: DataValidation = {
      id: existing?.id ?? `val_${Date.now()}`,
      range: normalizedRange,
      type: 'dropdownList',
      mode: config.mode,
      showOptionColor: config.showOptionColor,
      options,
    };
    const next = [
      ...prev.filter(v => !(v.type === 'dropdownList' && rangesOverlap(v.range, normalizedRange))),
      nextValidation,
    ];
    this._sheet.validations = next;
    this._pushUndo({
      type: 'setDropdownValidation',
      undo: () => { this._sheet.validations = prev; this._notifyChange(normalizedRange); },
      redo: () => { this._sheet.validations = next; this._notifyChange(normalizedRange); },
    });
    this._notifyChange(normalizedRange);
  }

  removeDropdownValidation(range: CellRange): void {
    const normalizedRange: CellRange = {
      sheetId: this._sheet.sheetId,
      start: { ...range.start },
      end: { ...range.end },
    };
    const prev = this._sheet.validations.map(v => ({
      ...v,
      range: { ...v.range, start: { ...v.range.start }, end: { ...v.range.end } },
      options: v.options?.map(o => ({ ...o })),
    }));
    const next = prev.filter(v => !(v.type === 'dropdownList' && rangesOverlap(v.range, normalizedRange)));
    if (next.length === prev.length) return;
    this._sheet.validations = next;
    this._pushUndo({
      type: 'removeDropdownValidation',
      undo: () => { this._sheet.validations = prev; this._notifyChange(normalizedRange); },
      redo: () => { this._sheet.validations = next; this._notifyChange(normalizedRange); },
    });
    this._notifyChange(normalizedRange);
  }

  setDateValidation(range: CellRange, config: DateValidationConfig = {}): void {
    const normalizedRange: CellRange = {
      sheetId: this._sheet.sheetId,
      start: { ...range.start },
      end: { ...range.end },
    };
    const prev = this._sheet.validations.map(v => ({
      ...v,
      range: { ...v.range, start: { ...v.range.start }, end: { ...v.range.end } },
      options: v.options?.map(o => ({ ...o })),
    }));
    const existing = prev.find(v => v.type === 'date' && rangesOverlap(v.range, normalizedRange));
    const nextValidation: DataValidation = {
      id: existing?.id ?? `val_date_${Date.now()}`,
      range: normalizedRange,
      type: 'date',
      includeTime: config.includeTime ?? false,
      allowReminder: config.allowReminder ?? false,
    };
    const next = [
      ...prev.filter(v => !(v.type === 'date' && rangesOverlap(v.range, normalizedRange))),
      nextValidation,
    ];
    this._sheet.validations = next;
    this._pushUndo({
      type: 'setDateValidation',
      undo: () => { this._sheet.validations = prev; this._notifyChange(normalizedRange); },
      redo: () => { this._sheet.validations = next; this._notifyChange(normalizedRange); },
    });
    this._notifyChange(normalizedRange);
  }

  removeDateValidation(range: CellRange): void {
    const normalizedRange: CellRange = {
      sheetId: this._sheet.sheetId,
      start: { ...range.start },
      end: { ...range.end },
    };
    const prev = this._sheet.validations.map(v => ({
      ...v,
      range: { ...v.range, start: { ...v.range.start }, end: { ...v.range.end } },
      options: v.options?.map(o => ({ ...o })),
    }));
    const next = prev.filter(v => !(v.type === 'date' && rangesOverlap(v.range, normalizedRange)));
    if (next.length === prev.length) return;
    this._sheet.validations = next;
    this._pushUndo({
      type: 'removeDateValidation',
      undo: () => { this._sheet.validations = prev; this._notifyChange(normalizedRange); },
      redo: () => { this._sheet.validations = next; this._notifyChange(normalizedRange); },
    });
    this._notifyChange(normalizedRange);
  }

  // ==================== 序列化 ====================

  /** 导出为可序列化的 JSON（Map → Object） */
  toJSON(): object {
    if (this._sheet.type === 'base') {
      this.syncColumnLayout();
    }
    return {
      sheetId: this._sheet.sheetId,
      name: this._sheet.name,
      type: this._sheet.type,
      rowCount: this._sheet.rowCount,
      colCount: this._sheet.colCount,
      isHidden: this._sheet.isHidden,
      cells: Object.fromEntries(this._sheet.cells),
      mergeRanges: this._sheet.mergeRanges.map(r => ({
        sheetId: r.sheetId,
        start: r.start,
        end: r.end,
        master: r.master,
      })),
      columnWidths: Object.fromEntries(this._sheet.columnWidths),
      rowHeights: Object.fromEntries(this._sheet.rowHeights),
      columnDefs: this._sheet.columnDefs,
      rows: this._sheet.rows,
      conditionalFormats: this._sheet.conditionalFormats,
      validations: this._sheet.validations,
      defaultStyle: this._sheet.defaultStyle,
      freezeState: this._sheet.freezeState,
      charts: this._sheet.charts,
      views: this._sheet.views,
      activeViewId: this._sheet.activeViewId,
      defaultRowHeight: this._sheet.defaultRowHeight,
      columnFilters: this._sheet.columnFilters,
      columnFilterEnabled: this._sheet.columnFilterEnabled,
      columnFilterCols: this._sheet.columnFilterCols,
    };
  }

  /** 从 JSON 恢复 */
  static fromJSON(data: any): FreeTable {
    const sheetType = data.type || 'freeform';
    const table = new FreeTable({
      sheetId: data.sheetId,
      name: data.name,
      type: sheetType,
      rowCount: data.rowCount,
      colCount: data.colCount,
    });

    table._sheet.isHidden = data.isHidden ?? false;

    if (data.cells) {
      table._sheet.cells = new Map(Object.entries(data.cells) as [string, CellData][]);
    }

    if (data.mergeRanges) {
      table._sheet.mergeRanges = data.mergeRanges.map((v: any) => ({
        sheetId: v.sheetId,
        start: v.start,
        end: v.end,
        master: v.master,
      }));
    }

    if (data.columnWidths) {
      table._sheet.columnWidths = new Map(
        Object.entries(data.columnWidths).map(([k, v]) => [Number(k), v as number]),
      );
    }

    if (data.rowHeights) {
      table._sheet.rowHeights = new Map(
        Object.entries(data.rowHeights).map(([k, v]) => [Number(k), v as number]),
      );
    }

    if (Array.isArray(data.columnDefs) && data.columnDefs.length > 0) {
      table._sheet.columnDefs = data.columnDefs;
      table.syncColumnLayout();
    } else if (table._sheet.type === 'base') {
      table._applyDefaultBaseSchema(false);
    }

    table.syncColumnLayout();

    if (Array.isArray(data.rows)) {
      table._sheet.rows = data.rows;
    }

    if (Array.isArray(data.conditionalFormats)) {
      table._sheet.conditionalFormats = data.conditionalFormats;
    }

    if (Array.isArray(data.validations)) {
      table._sheet.validations = data.validations;
    }

    if (data.defaultStyle) {
      table._sheet.defaultStyle = data.defaultStyle;
    }

    if (data.freezeState) {
      table._sheet.freezeState = data.freezeState;
    } else if (table._sheet.type === 'base') {
      table._sheet.freezeState = { frozenRows: 0, frozenCols: 1 };
    }

    if (Array.isArray(data.charts)) {
      table._sheet.charts = data.charts;
    }

    if (Array.isArray(data.views)) {
      table._sheet.views = data.views;
    }

    if (data.activeViewId) {
      table._sheet.activeViewId = data.activeViewId;
    }

    if (typeof data.defaultRowHeight === 'number') {
      table._sheet.defaultRowHeight = data.defaultRowHeight;
    } else if (table._sheet.type === 'base') {
      const heights = Object.values(data.rowHeights || {}) as number[];
      table._sheet.defaultRowHeight = heights.length > 0 ? heights[0] : DEFAULT_BASE_ROW_HEIGHT;
    }

    if (Array.isArray(data.columnFilters)) {
      table._sheet.columnFilters = data.columnFilters;
    }
    if (typeof data.columnFilterEnabled === 'boolean') {
      table._sheet.columnFilterEnabled = data.columnFilterEnabled;
    }
    if (Array.isArray(data.columnFilterCols)) {
      table._sheet.columnFilterCols = data.columnFilterCols;
    } else if (table._sheet.columnFilterEnabled && Array.isArray(data.columnFilters)) {
      table._sheet.columnFilterCols = [...new Set(
        (data.columnFilters as import('../types/index').ColumnFilterCondition[])
          .filter((f: import('../types/index').ColumnFilterCondition) => typeof f.col === 'number')
          .map((f: import('../types/index').ColumnFilterCondition) => f.col),
      )].sort((a: number, b: number) => a - b);
    }

    if (table._sheet.type === 'base' && table._sheet.defaultRowHeight != null) {
      for (let r = 0; r < table._sheet.rowCount; r++) {
        if (!table._sheet.rowHeights.has(r)) {
          table._sheet.rowHeights.set(r, table._sheet.defaultRowHeight);
        }
      }
    }

    return table;
  }

  // ==================== 私有方法 ====================

  private _snapshotRow(row: number): { cells: Map<number, CellData>; height?: number } {
    const cells = new Map<number, CellData>();
    for (let c = 0; c < this._sheet.colCount; c++) {
      const cell = this.getCell(row, c);
      if (cell) cells.set(c, { ...cell, style: cell.style ? { ...cell.style } : undefined });
    }
    return { cells, height: this._sheet.rowHeights.get(row) };
  }

  private _applyRowSnapshot(row: number, snap: { cells: Map<number, CellData>; height?: number }): void {
    for (let c = 0; c < this._sheet.colCount; c++) {
      const cell = snap.cells.get(c);
      if (cell) {
        this._sheet.cells.set(coordToKey({ row, col: c }), cell);
      } else {
        this._sheet.cells.delete(coordToKey({ row, col: c }));
      }
    }
    if (snap.height != null) {
      this._sheet.rowHeights.set(row, snap.height);
    } else {
      this._sheet.rowHeights.delete(row);
    }
  }

  private _pushUndo(op: Operation): void {
    if (this._undoBatchStack.length > 0) {
      this._undoBatchStack[this._undoBatchStack.length - 1].push(op);
      return;
    }
    this._undoStack.push(op);
    if (this._undoStack.length > this._maxUndoSteps) {
      this._undoStack.shift();
    }
    this._redoStack = [];
  }

  private _makeRange(row1: number, col1: number, row2: number, col2: number): CellRange {
    return {
      sheetId: this._sheet.sheetId,
      start: { row: Math.min(row1, row2), col: Math.min(col1, col2) },
      end: { row: Math.max(row1, row2), col: Math.max(col1, col2) },
    };
  }

  private _findMergeConflict(row: number, col: number): CellRange | null {
    for (const range of this._sheet.mergeRanges) {
      if (row >= range.start.row && row <= range.end.row &&
          col >= range.start.col && col <= range.end.col) {
        const master = range.master || range.start;
        if (master.row === row && master.col === col) return null;
        return range;
      }
    }
    return null;
  }

  private _rangesOverlap(a: CellRange, b: CellRange): boolean {
    return !(
      a.end.row < b.start.row ||
      b.end.row < a.start.row ||
      a.end.col < b.start.col ||
      b.end.col < a.start.col
    );
  }

  private _insertRowsRaw(index: number, count: number): void {
    const newCells = new Map<string, CellData>();
    for (const [key, cell] of this._sheet.cells) {
      const coord = keyToCoord(key);
      newCells.set(
        coordToKey({ row: coord.row >= index ? coord.row + count : coord.row, col: coord.col }),
        cell,
      );
    }
    this._sheet.cells = newCells;
    this._sheet.rowCount += count;
  }

  private _deleteRowsRaw(index: number, count: number): void {
    const newCells = new Map<string, CellData>();
    for (const [key, cell] of this._sheet.cells) {
      const coord = keyToCoord(key);
      if (coord.row >= index && coord.row < index + count) continue;
      const newRow = coord.row >= index + count ? coord.row - count : coord.row;
      newCells.set(coordToKey({ row: newRow, col: coord.col }), cell);
    }
    this._sheet.cells = newCells;
    this._sheet.rowCount -= count;
  }

  /** Shift cells right from (row, col) — creates empty cell at (row, col) */
  private _shiftCellsRight(row: number, col: number): void {
    // Collect cells in the row from col to colCount-1, shift them right
    const rowCells: Array<{ col: number; data: CellData }> = [];
    for (let c = col; c < this._sheet.colCount; c++) {
      const key = coordToKey({ row, col: c });
      const cell = this._sheet.cells.get(key);
      if (cell) rowCells.push({ col: c, data: cell });
    }
    for (const { col: c, data } of rowCells) {
      this._sheet.cells.delete(coordToKey({ row, col: c }));
      this._sheet.cells.set(coordToKey({ row, col: c + 1 }), data);
    }
    this._sheet.cells.delete(coordToKey({ row, col }));
  }

  /** Shift cells down from (row, col) — creates empty cell at (row, col) */
  private _shiftCellsDown(row: number, col: number): void {
    const colCells: Array<{ row: number; data: CellData }> = [];
    for (let r = row; r < this._sheet.rowCount; r++) {
      const key = coordToKey({ row: r, col });
      const cell = this._sheet.cells.get(key);
      if (cell) colCells.push({ row: r, data: cell });
    }
    for (const { row: r, data } of colCells) {
      this._sheet.cells.delete(coordToKey({ row: r, col }));
      this._sheet.cells.set(coordToKey({ row: r + 1, col }), data);
    }
    this._sheet.cells.delete(coordToKey({ row, col }));
  }

  // ==================== 多维表初始化 ====================

  /** 应用多维表默认结构（resetRows=true 时按 sheet.rowCount 初始化行，未指定或过大时用 10 行） */
  private _applyDefaultBaseSchema(resetRows: boolean): void {
    const defaultColumns = getDefaultBaseColumns();
    this._sheet.columnDefs = defaultColumns;
    this._sheet.colCount = defaultColumns.length;

    for (let i = 0; i < defaultColumns.length; i++) {
      if (!this._sheet.columnWidths.has(i)) {
        this._sheet.columnWidths.set(i, defaultColumns[i].width || 120);
      }
    }

    if (resetRows) {
      const configured = this._sheet.rowCount;
      const targetRows = configured > 0 && configured <= 50 ? configured : 10;
      this._sheet.rowCount = targetRows;
      this._sheet.cells.clear();
      this._sheet.defaultRowHeight = DEFAULT_BASE_ROW_HEIGHT;
      for (let r = 0; r < targetRows; r++) {
        this._sheet.rowHeights.set(r, DEFAULT_BASE_ROW_HEIGHT);
      }
      for (let r = 0; r < targetRows; r++) {
        this.applyRowDefaults(r);
      }
      this._sheet.rows = ensureSheetRows([], targetRows);
    } else if (this._sheet.defaultRowHeight == null) {
      this._sheet.defaultRowHeight = DEFAULT_BASE_ROW_HEIGHT;
    }

    if (!this._sheet.views?.length) {
      this._sheet.views = [
        {
          viewId: 'view_grid_default',
          viewName: '表格',
          viewType: 'grid',
          config: {},
        },
      ];
      this._sheet.activeViewId = 'view_grid_default';
    }

    // 多维表首列（主字段）固定
    this._sheet.freezeState = { frozenRows: 0, frozenCols: 1 };
  }

  private _initBase(): void {
    this._applyDefaultBaseSchema(true);
  }
}

export { Workbook, type SheetInfo } from './Workbook';
