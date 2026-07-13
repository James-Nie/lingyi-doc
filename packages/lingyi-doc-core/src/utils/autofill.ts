import type { CellCoord, CellRange, CellValue, DateFormat } from '../types/index';
import type { ViewportManager } from '../renderer/index';
import type { FreeTable } from '../model/index';

export const FILL_HANDLE_SIZE = 8;

/** 是否应显示填充柄（整行/整列选区不显示） */
export function shouldShowFillHandle(
  range: CellRange,
  rowCount: number,
  colCount: number,
): boolean {
  const { startRow, endRow, startCol, endCol } = normalizeRange(range);
  const isFullRow = startRow === endRow &&
    startCol === 0 &&
    endCol === colCount - 1 &&
    colCount > 1;
  const isFullCol = startCol === endCol &&
    startRow === 0 &&
    endRow === rowCount - 1 &&
    rowCount > 1;
  return !isFullRow && !isFullCol;
}

export function normalizeRange(range: CellRange): {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
} {
  return {
    startRow: Math.min(range.start.row, range.end.row),
    endRow: Math.max(range.start.row, range.end.row),
    startCol: Math.min(range.start.col, range.end.col),
    endCol: Math.max(range.start.col, range.end.col),
  };
}

/** 填充柄锚点：选区右下角（与选区边框右下角一致） */
export function getFillHandleAnchor(range: CellRange): CellCoord {
  const norm = normalizeRange(range);
  return { row: norm.endRow, col: norm.endCol };
}

/** 在 canvas 上绘制填充柄 */
export function drawFillHandle(
  ctx: CanvasRenderingContext2D,
  coord: CellCoord,
  viewport: ViewportManager,
  columnWidths: Map<number, number>,
  rowHeights: Map<number, number>,
  handleSize = FILL_HANDLE_SIZE,
): void {
  const cellRect = viewport.getCellRect(coord, columnWidths, rowHeights);
  const hx = cellRect.x + cellRect.width - handleSize / 2;
  const hy = cellRect.y + cellRect.height - handleSize / 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(hx - 1, hy - 1, handleSize + 2, handleSize + 2);
  ctx.fillStyle = '#000000';
  ctx.fillRect(hx, hy, handleSize, handleSize);
}

/** 检测鼠标是否点在选区右下角填充柄上 */
export function hitTestFillHandle(
  clientX: number,
  clientY: number,
  canvasRect: DOMRect,
  range: CellRange,
  viewport: ViewportManager,
  columnWidths: Map<number, number>,
  rowHeights: Map<number, number>,
  handleSize = FILL_HANDLE_SIZE,
): boolean {
  const anchor = getFillHandleAnchor(range);
  const bottomRight = viewport.getCellRect(anchor, columnWidths, rowHeights);

  const half = handleSize / 2;
  const handleLeft = canvasRect.left + bottomRight.x + bottomRight.width - half;
  const handleTop = canvasRect.top + bottomRight.y + bottomRight.height - half;
  const pad = 6;

  return (
    clientX >= handleLeft - pad &&
    clientX <= handleLeft + handleSize + pad &&
    clientY >= handleTop - pad &&
    clientY <= handleTop + handleSize + pad
  );
}

/** 根据拖拽目标单元格计算填充后的选区范围 */
export function computeFillTargetRange(
  sourceRange: CellRange,
  targetCoord: CellCoord,
): CellRange {
  const src = normalizeRange(sourceRange);

  let startRow = src.startRow;
  let endRow = src.endRow;
  let startCol = src.startCol;
  let endCol = src.endCol;

  if (targetCoord.row > src.endRow) endRow = targetCoord.row;
  if (targetCoord.row < src.startRow) startRow = targetCoord.row;
  if (targetCoord.col > src.endCol) endCol = targetCoord.col;
  if (targetCoord.col < src.startCol) startCol = targetCoord.col;

  return {
    sheetId: sourceRange.sheetId,
    start: { row: startRow, col: startCol },
    end: { row: endRow, col: endCol },
  };
}

function cloneCellValue(value: CellValue): CellValue {
  return JSON.parse(JSON.stringify(value)) as CellValue;
}

function makeSingleCellRange(table: FreeTable, row: number, col: number): CellRange {
  return {
    sheetId: table.sheetId,
    start: { row, col },
    end: { row, col },
  };
}

function getCellTimestamp(cell: { value: CellValue } | undefined | null): number | null {
  if (!cell) return null;
  if (cell.value.type === 'date') return cell.value.timestamp;
  if (cell.value.type === 'text') {
    const parsed = Date.parse(cell.value.text);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** 将源格的下拉列表/日期验证规则应用到目标格 */
function applyCellValidationFromSource(
  table: FreeTable,
  srcRow: number,
  srcCol: number,
  targetRow: number,
  targetCol: number,
): void {
  const range = makeSingleCellRange(table, targetRow, targetCol);
  table.removeDropdownValidation(range);
  table.removeDateValidation(range);

  const dropdown = table.getDropdownValidationAt(srcRow, srcCol);
  if (dropdown) {
    table.setDropdownValidation(range, {
      mode: dropdown.mode ?? 'single',
      showOptionColor: dropdown.showOptionColor !== false,
      options: dropdown.options?.map(option => ({ ...option })) ?? [],
    });
    return;
  }

  const dateValidation = table.getDateValidationAt(srcRow, srcCol);
  if (dateValidation) {
    table.setDateValidation(range, {
      includeTime: dateValidation.includeTime ?? false,
      allowReminder: dateValidation.allowReminder ?? false,
    });
  }
}

function getNumericSeriesStep(values: number[]): number | null {
  if (values.length < 2) return null;
  const step = values[1] - values[0];
  for (let i = 2; i < values.length; i++) {
    if (values[i] - values[i - 1] !== step) return null;
  }
  return step;
}

function buildDateSeriesValue(
  table: FreeTable,
  src: ReturnType<typeof normalizeRange>,
  relRow: number,
  relCol: number,
  axis: 'column' | 'row',
): CellValue | null {
  const srcRows = src.endRow - src.startRow + 1;
  const srcCols = src.endCol - src.startCol + 1;
  const isColumn = axis === 'column';

  if (isColumn) {
    if (srcCols !== 1 || srcRows < 2 || relCol !== 0) return null;
  } else {
    if (srcRows !== 1 || srcCols < 2 || relRow !== 0) return null;
  }

  const count = isColumn ? srcRows : srcCols;
  const timestamps: number[] = [];
  let template: Extract<CellValue, { type: 'date' }> | null = null;

  for (let i = 0; i < count; i++) {
    const r = isColumn ? src.startRow + i : src.startRow;
    const c = isColumn ? src.startCol : src.startCol + i;
    const cell = table.getCell(r, c);
    const ts = getCellTimestamp(cell);
    if (ts === null) return null;
    timestamps.push(ts);
    if (cell?.value.type === 'date' && !template) {
      template = cell.value;
    }
  }

  const step = getNumericSeriesStep(timestamps);
  if (step === null) return null;

  const offset = isColumn ? relRow : relCol;
  const format: DateFormat = template?.format ?? { kind: 'short' };
  return {
    type: 'date',
    timestamp: timestamps[0] + step * offset,
    format,
    ...(template?.reminder !== undefined ? { reminder: template.reminder } : {}),
  };
}

function resolveFillValue(
  table: FreeTable,
  src: ReturnType<typeof normalizeRange>,
  targetRow: number,
  targetCol: number,
  srcRows: number,
  srcCols: number,
): CellValue {
  const relRow = targetRow - src.startRow;
  const relCol = targetCol - src.startCol;

  const columnDateValue = buildDateSeriesValue(table, src, relRow, relCol, 'column');
  if (columnDateValue) return columnDateValue;

  const rowDateValue = buildDateSeriesValue(table, src, relRow, relCol, 'row');
  if (rowDateValue) return rowDateValue;

  // 单列数字序列：向下/上拖动时递增
  if (srcCols === 1 && srcRows >= 2 && relCol === 0) {
    const numbers: number[] = [];
    for (let r = src.startRow; r <= src.endRow; r++) {
      const cell = table.getCell(r, src.startCol);
      if (cell?.value.type === 'number') numbers.push(cell.value.value);
      else if (cell?.value.type === 'text') {
        const n = Number(cell.value.text);
        if (!Number.isNaN(n)) numbers.push(n);
      }
    }
    const step = getNumericSeriesStep(numbers);
    if (step !== null) {
      const base = numbers[0];
      const offset = relRow;
      return { type: 'number', value: base + step * offset, format: { kind: 'general' } };
    }
  }

  // 单行数字序列：向右/左拖动时递增
  if (srcRows === 1 && srcCols >= 2 && relRow === 0) {
    const numbers: number[] = [];
    for (let c = src.startCol; c <= src.endCol; c++) {
      const cell = table.getCell(src.startRow, c);
      if (cell?.value.type === 'number') numbers.push(cell.value.value);
      else if (cell?.value.type === 'text') {
        const n = Number(cell.value.text);
        if (!Number.isNaN(n)) numbers.push(n);
      }
    }
    const step = getNumericSeriesStep(numbers);
    if (step !== null) {
      const base = numbers[0];
      return { type: 'number', value: base + step * relCol, format: { kind: 'general' } };
    }
  }

  const srcRow = src.startRow + ((relRow % srcRows) + srcRows) % srcRows;
  const srcCol = src.startCol + ((relCol % srcCols) + srcCols) % srcCols;
  const srcCell = table.getCell(srcRow, srcCol);
  if (!srcCell || srcCell.value.type === 'empty') {
    return { type: 'empty' };
  }
  return cloneCellValue(srcCell.value);
}

/** 将源选区模式填充到目标范围（含复制与简单数字序列） */
export function applyAutofill(
  table: FreeTable,
  sourceRange: CellRange,
  targetRange: CellRange,
): void {
  const src = normalizeRange(sourceRange);
  const tgt = normalizeRange(targetRange);
  const srcRows = src.endRow - src.startRow + 1;
  const srcCols = src.endCol - src.startCol + 1;

  table.runBatch(() => {
    for (let r = tgt.startRow; r <= tgt.endRow; r++) {
      for (let c = tgt.startCol; c <= tgt.endCol; c++) {
        if (r >= src.startRow && r <= src.endRow && c >= src.startCol && c <= src.endCol) {
          continue;
        }

        if (table.isInMergedCell(r, c)) continue;

        const value = resolveFillValue(table, src, r, c, srcRows, srcCols);
        const srcRow = src.startRow + (((r - src.startRow) % srcRows) + srcRows) % srcRows;
        const srcCol = src.startCol + (((c - src.startCol) % srcCols) + srcCols) % srcCols;
        const srcCell = table.getCell(srcRow, srcCol);

        if (value.type === 'empty') {
          table.clearCell(r, c);
        } else {
          table.setCellValue(r, c, value);
          if (srcCell?.style) {
            table.setCellStyle(r, c, { ...srcCell.style });
          }
        }
        applyCellValidationFromSource(table, srcRow, srcCol, r, c);
      }
    }
  }, 'autofill');

  table.notifyChange(null);
}
