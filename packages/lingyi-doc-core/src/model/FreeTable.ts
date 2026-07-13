import {
  SheetModel, CellData, CellCoord, CellRange, CellStyle,
  coordToKey, keyToCoord,
  DEFAULT_CELL_STYLE, DEFAULT_COLUMN_WIDTH, DEFAULT_ROW_HEIGHT, DEFAULT_BASE_ROW_HEIGHT, FreezeState,
  parseCellValue, emptyCell, getCellText, getRawValue, resolveColumnDefaultValue,
} from '../types/index';
import type { ColumnDef, RecordRow, DataValidation, SelectOption } from '../types/index';
import { createRecordRow, findChildInsertIndex } from '../utils/rowTree';
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
import { normalizeSheetType } from '../utils/sheetType';
import type { ActiveSheetType, BaseSheetModel, FreeformSheetModel } from '../types/index';
import { isBaseSheet, isFreeformSheet } from '../types/sheetGuards';
import { createSheetModel, hydrateSheetFromJSON, promoteFreeformToBase } from './sheetFactory';
import { applyDefaultBaseSchema } from './base/BaseSchema';
import { applyBaseColumnVisibility, syncBaseColumnLayout } from './base/BaseColumnLayout';
import {
  ensureRowRecords as syncBaseRowRecords,
  getRecordTitle as resolveRecordTitle,
  markBaseRowsCreated,
  maybeRecordFieldChange,
} from './base/BaseRecordOps';
import {
  clearColumnFilters as clearFreeformColumnFilters,
  disableColumnFilters as disableFreeformColumnFilters,
  enableColumnFiltersForCols as enableFreeformColumnFiltersForCols,
  getColumnFilterIconCols as resolveColumnFilterIconCols,
  getColumnFilters as resolveColumnFilters,
  isColumnFilterEnabled as isFreeformColumnFilterEnabled,
  remapColumnFiltersOnPermutation,
  setColumnFilterForCol as setFreeformColumnFilterForCol,
  setColumnFilters as setFreeformColumnFilters,
} from './freeform/ColumnFilterOps';
import {
  findMergeConflict,
  isInMergedCell as resolveInMergedCell,
  mergeCells as mergeFreeformCells,
  remapMergeRangesOnColumnPermutation,
  remapMergeRangesOnRowPermutation,
  resolveMergedMasterCell,
  shiftMergeRangesOnInsertColumns,
  shiftMergeRangesOnInsertRows,
  filterMergeRangesOnDeleteColumns,
  unmergeCells as unmergeFreeformCells,
} from './freeform/MergeCellOps';
import { UndoManager } from './shared/UndoManager';
import type { Operation, SetCellOptions } from './types';

export class FreeTable {
  private _sheet: SheetModel;
  private _undo = new UndoManager();
  private _recalcEngine = new RecalcEngine();

  /** 变更监听器，每次数据变更时触发 */
  private _changeListeners: Array<(changedRange: CellRange | null) => void> = [];

  constructor(options: {
    sheetId: string;
    name?: string;
    type?: ActiveSheetType | 'standard';
    rowCount?: number;
    colCount?: number;
    /** 为 false 时跳过 base 默认 schema 初始化（fromJSON 使用） */
    initialize?: boolean;
  }) {
    const sheetType = normalizeSheetType(options.type);
    this._sheet = createSheetModel(sheetType, {
      sheetId: options.sheetId,
      name: options.name,
      rowCount: options.rowCount,
      colCount: options.colCount,
    });
    if (sheetType === 'base' && options.initialize !== false) {
      this._initBase();
    }
  }

  private _baseSheet(): BaseSheetModel {
    if (!isBaseSheet(this._sheet)) {
      throw new Error('Expected base sheet');
    }
    return this._sheet;
  }

  private _freeformSheet(): FreeformSheetModel {
    if (!isFreeformSheet(this._sheet)) {
      throw new Error('Expected freeform sheet');
    }
    return this._sheet;
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
    if (!isFreeformSheet(this._sheet)) return [];
    return resolveColumnFilters(this._sheet);
  }

  /** 普通表格：是否已开启列头筛选 */
  isColumnFilterEnabled(): boolean {
    if (!isFreeformSheet(this._sheet)) return false;
    return isFreeformColumnFilterEnabled(this._sheet);
  }

  /** 获取显示筛选图标的列（兼容旧数据：仅 columnFilterEnabled 时视为全部列） */
  getColumnFilterIconCols(): number[] {
    if (!isFreeformSheet(this._sheet)) return [];
    return resolveColumnFilterIconCols(this._sheet, this._sheet.colCount);
  }

  /** 为指定列开启列头筛选（仅这些列显示筛选图标） */
  enableColumnFiltersForCols(cols: number[]): void {
    if (!isFreeformSheet(this._sheet)) return;
    enableFreeformColumnFiltersForCols(
      this._sheet,
      cols,
      this._sheet.colCount,
      r => this._notifyChange(r),
      op => this._pushUndo(op),
    );
  }

  /** @deprecated 使用 enableColumnFiltersForCols */
  enableColumnFilters(): void {
    const cols = Array.from({ length: this._sheet.colCount }, (_, i) => i);
    this.enableColumnFiltersForCols(cols);
  }

  /** 取消筛选：关闭筛选功能并清空全部列条件 */
  disableColumnFilters(): void {
    if (!isFreeformSheet(this._sheet)) return;
    disableFreeformColumnFilters(
      this._sheet,
      r => this._notifyChange(r),
      op => this._pushUndo(op),
    );
  }

  /** 设置普通表格列筛选条件 */
  setColumnFilters(conditions: import('../types/index').ColumnFilterCondition[]): void {
    if (!isFreeformSheet(this._sheet)) return;
    setFreeformColumnFilters(
      this._sheet,
      conditions,
      r => this._notifyChange(r),
      op => this._pushUndo(op),
    );
  }

  /** 清空列筛选条件（保留筛选功能开启状态） */
  clearColumnFilters(): void {
    if (!isFreeformSheet(this._sheet)) return;
    clearFreeformColumnFilters(
      this._sheet,
      r => this._notifyChange(r),
      op => this._pushUndo(op),
    );
  }

  /** 设置单列筛选（null 表示清除该列条件，保留漏斗图标） */
  setColumnFilterForCol(col: number, condition: import('../types/index').ColumnFilterCondition | null): void {
    if (!isFreeformSheet(this._sheet)) return;
    setFreeformColumnFilterForCol(
      this._sheet,
      col,
      condition,
      r => this._notifyChange(r),
      op => this._pushUndo(op),
    );
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

    const newWidths = new Map<number, number>();
    for (const [c, w] of this._sheet.columnWidths) {
      newWidths.set(remapCol(c), w);
    }
    this._sheet.columnWidths = newWidths;

    if (isFreeformSheet(this._sheet)) {
      remapMergeRangesOnColumnPermutation(this._sheet, remapCol);
      remapColumnFiltersOnPermutation(this._sheet, remapCol);
    }

    if (isBaseSheet(this._sheet) && this._sheet.columnDefs.length > 0) {
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

    if (isFreeformSheet(this._sheet)) {
      remapMergeRangesOnRowPermutation(this._sheet, remapRow);
    }

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
    if (!isBaseSheet(this._sheet)) return;
    syncBaseRowRecords(this._sheet);
  }

  /** 获取行记录元数据 */
  getRowRecord(row: number): RecordRow | undefined {
    if (!isBaseSheet(this._sheet)) return undefined;
    this.ensureRowRecords();
    return this._sheet.rows[row];
  }

  /** 插入子记录，返回新行索引 */
  insertChildRow(parentRowIndex: number): number {
    if (!isBaseSheet(this._sheet)) {
      this.insertRows(this._sheet.rowCount, 1);
      return this._sheet.rowCount - 1;
    }
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
    if (!isBaseSheet(this._sheet)) return '未命名记录';
    return resolveRecordTitle(this._sheet, (r, c) => this.getCell(r, c), row);
  }

  private _insertRowsAt(index: number, count: number, parentId?: string | null): void {
    if (index < 0 || index > this._sheet.rowCount || !isBaseSheet(this._sheet)) return;
    const sheet = this._sheet;

    const newCells = new Map<string, CellData>();
    for (const [key, cell] of sheet.cells) {
      const coord = keyToCoord(key);
      if (coord.row >= index) {
        newCells.set(coordToKey({ row: coord.row + count, col: coord.col }), cell);
      } else {
        newCells.set(key, cell);
      }
    }
    sheet.cells = newCells;

    const newHeights = new Map<number, number>();
    for (const [r, h] of sheet.rowHeights) {
      newHeights.set(r >= index ? r + count : r, h);
    }
    sheet.rowHeights = newHeights;

    const defaultH = this.getDefaultRowHeight();
    for (let r = index; r < index + count; r++) {
      sheet.rowHeights.set(r, defaultH);
    }

    const newRows = [...sheet.rows];
    newRows.splice(index, 0, ...Array.from({ length: count }, (_, i) => createRecordRow(index + i, parentId ?? null)));
    for (let i = 0; i < newRows.length; i++) {
      newRows[i] = { ...newRows[i], _order: i };
    }
    sheet.rows = newRows;

    sheet.rowCount += count;

    this._markBaseRowsCreated(index, count);

    if (sheet.columnDefs.length > 0) {
      for (let r = index; r < index + count; r++) {
        this.applyRowDefaults(r);
      }
    }

    this._pushUndo({
      type: 'insertRows',
      undo: () => {
        this._deleteRowsRaw(index, count);
        if (isBaseSheet(this._sheet)) {
          this._sheet.rows.splice(index, count);
        }
        this._notifyChange(null);
      },
      redo: () => {
        this._insertRowsRaw(index, count);
        if (isBaseSheet(this._sheet)) {
          const redoRows = [...this._sheet.rows];
          redoRows.splice(index, 0, ...Array.from({ length: count }, (_, i) => createRecordRow(index + i, parentId ?? null)));
          this._sheet.rows = redoRows;
        }
        this._notifyChange(null);
      },
    });

    this._notifyChange(null);
  }

  /** 同步 colCount 与 columnDefs，避免保存后列数不一致导致无法点击编辑 */
  syncColumnLayout(): void {
    if (!isBaseSheet(this._sheet)) return;
    syncBaseColumnLayout(this._sheet);
  }

  /** 根据字段 hidden 状态同步列宽（隐藏列宽为 0） */
  applyColumnVisibility(): void {
    if (!isBaseSheet(this._sheet)) return;
    applyBaseColumnVisibility(this._sheet);
  }

  /** 补全多维表默认字段结构（保留已有单元格） */
  repairBaseSchema(): void {
    if (isFreeformSheet(this._sheet)) {
      this._sheet = promoteFreeformToBase(this._sheet, [], []);
    }
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
    if (!isBaseSheet(this._sheet)) return;
    maybeRecordFieldChange(this._sheet, row, col, before, after, options?.skipHistory);
  }

  private _markBaseRowsCreated(index: number, count: number): void {
    if (!isBaseSheet(this._sheet)) return;
    markBaseRowsCreated(this._sheet, index, count);
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
    if (isFreeformSheet(this._sheet)) {
      const merged = resolveMergedMasterCell(this._sheet, row, col);
      if (merged !== undefined) return merged;
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
    if (!isFreeformSheet(this._sheet)) {
      throw new Error('多维表不支持合并单元格');
    }
    return mergeFreeformCells(
      this._sheet,
      range,
      r => this._notifyChange(r),
      op => this._pushUndo(op),
    );
  }

  /** 取消合并 */
  unmergeCells(row: number, col: number): void {
    if (!isFreeformSheet(this._sheet)) {
      throw new Error('多维表不支持合并单元格');
    }
    unmergeFreeformCells(
      this._sheet,
      row,
      col,
      r => this._notifyChange(r),
      op => this._pushUndo(op),
    );
  }

  /** 检查单元格是否在合并区域内 */
  isInMergedCell(row: number, col: number): CellRange | null {
    if (!isFreeformSheet(this._sheet)) return null;
    return resolveInMergedCell(this._sheet, row, col);
  }

  // ==================== 行列操作 ====================

  /** 为新行写入各列 defaultValue */
  applyRowDefaults(row: number): void {
    if (!isBaseSheet(this._sheet)) return;
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
    if (isFreeformSheet(this._sheet)) {
      shiftMergeRangesOnInsertRows(this._sheet, index, count);
    }

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

    if (isBaseSheet(this._sheet) && this._sheet.columnDefs.length > 0) {
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

    if (isFreeformSheet(this._sheet)) {
      shiftMergeRangesOnInsertColumns(this._sheet, index, count);
    }

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

    if (isFreeformSheet(this._sheet)) {
      filterMergeRangesOnDeleteColumns(this._sheet, index, count);
    }

    const newWidths = new Map<number, number>();
    for (const [c, w] of this._sheet.columnWidths) {
      if (c >= index && c < index + count) continue;
      newWidths.set(c >= index + count ? c - count : c, w);
    }
    this._sheet.columnWidths = newWidths;

    if (isBaseSheet(this._sheet) && this._sheet.columnDefs.length > 0) {
      this._sheet.columnDefs.splice(index, count);
    }

    this._sheet.colCount -= count;
    this._notifyChange(null);
  }

  /** 调整列宽 */
  setColumnWidth(col: number, width: number): void {
    const clamped = Math.max(20, Math.min(1000, width));
    this._sheet.columnWidths.set(col, clamped);
    if (isBaseSheet(this._sheet) && this._sheet.columnDefs[col]) {
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
    if (!isBaseSheet(this._sheet)) return;
    const clamped = Math.max(10, Math.min(500, height));
    this._sheet.defaultRowHeight = clamped;
    for (let r = 0; r < this._sheet.rowCount; r++) {
      this._sheet.rowHeights.set(r, clamped);
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
    this._undo.runBatch(fn, type, r => this._notifyChange(r));
  }

  beginUndoBatch(): void {
    this._undo.beginUndoBatch();
  }

  endUndoBatch(type = 'batch'): void {
    this._undo.endUndoBatch(type, r => this._notifyChange(r));
  }

  undo(): boolean {
    return this._undo.undo();
  }

  redo(): boolean {
    return this._undo.redo();
  }

  get canUndo(): boolean { return this._undo.canUndo; }
  get canRedo(): boolean { return this._undo.canRedo; }

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
    if (isBaseSheet(this._sheet)) {
      this.syncColumnLayout();
    }

    const base: Record<string, unknown> = {
      sheetId: this._sheet.sheetId,
      name: this._sheet.name,
      type: this._sheet.type,
      rowCount: this._sheet.rowCount,
      colCount: this._sheet.colCount,
      isHidden: this._sheet.isHidden,
      cells: Object.fromEntries(this._sheet.cells),
      columnWidths: Object.fromEntries(this._sheet.columnWidths),
      rowHeights: Object.fromEntries(this._sheet.rowHeights),
      conditionalFormats: this._sheet.conditionalFormats,
      validations: this._sheet.validations,
      defaultStyle: this._sheet.defaultStyle,
      freezeState: this._sheet.freezeState,
      charts: this._sheet.charts,
    };

    if (isFreeformSheet(this._sheet)) {
      return {
        ...base,
        mergeRanges: this._sheet.mergeRanges.map(r => ({
          sheetId: r.sheetId,
          start: r.start,
          end: r.end,
          master: r.master,
        })),
        columnFilters: this._sheet.columnFilters,
        columnFilterEnabled: this._sheet.columnFilterEnabled,
        columnFilterCols: this._sheet.columnFilterCols,
      };
    }

    return {
      ...base,
      columnDefs: this._sheet.columnDefs,
      rows: this._sheet.rows,
      views: this._sheet.views,
      activeViewId: this._sheet.activeViewId,
      defaultRowHeight: this._sheet.defaultRowHeight,
    };
  }

  /** 从 JSON 恢复 */
  static fromJSON(data: any): FreeTable {
    const sheet = hydrateSheetFromJSON(data);
    const table = new FreeTable({
      sheetId: sheet.sheetId,
      name: sheet.name,
      type: sheet.type,
      rowCount: sheet.rowCount,
      colCount: sheet.colCount,
      initialize: false,
    });
    table._sheet = sheet;

    if (isBaseSheet(sheet)) {
      if (sheet.columnDefs.length === 0) {
        table._applyDefaultBaseSchema(false);
      } else {
        table.syncColumnLayout();
      }
      if (sheet.defaultRowHeight != null) {
        for (let r = 0; r < sheet.rowCount; r++) {
          if (!sheet.rowHeights.has(r)) {
            sheet.rowHeights.set(r, sheet.defaultRowHeight);
          }
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
    this._undo.pushUndo(op);
  }

  private _makeRange(row1: number, col1: number, row2: number, col2: number): CellRange {
    return {
      sheetId: this._sheet.sheetId,
      start: { row: Math.min(row1, row2), col: Math.min(col1, col2) },
      end: { row: Math.max(row1, row2), col: Math.max(col1, col2) },
    };
  }

  private _findMergeConflict(row: number, col: number): CellRange | null {
    if (!isFreeformSheet(this._sheet)) return null;
    return findMergeConflict(this._sheet, row, col);
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
    if (!isBaseSheet(this._sheet)) return;
    applyDefaultBaseSchema(this._sheet, resetRows, row => this.applyRowDefaults(row));
  }

  private _initBase(): void {
    this._applyDefaultBaseSchema(true);
  }
}
