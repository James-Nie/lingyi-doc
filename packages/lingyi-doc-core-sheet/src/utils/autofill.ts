import type { CellCoord, CellRange, CellValue, DateFormat } from '@lingyi-doc/core-types';
import type { ViewportManager } from '../renderer/index';
import type { FreeTable } from '../model/index';

export const FILL_HANDLE_SIZE = 8;

/** 填充模式枚举 */
export type FillMode = 'copy' | 'series' | 'workday' | 'month' | 'year';

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

/** 检测等比数列，返回公比；若不是等比数列返回 null */
function getGeometricRatio(values: number[]): number | null {
  if (values.length < 2) return null;
  // 不能有 0 值（会导致公比不确定）
  if (values.some(v => v === 0)) return null;
  const ratio = values[1] / values[0];
  // 公比不能是 0 或无穷大
  if (!isFinite(ratio) || ratio === 0) return null;
  for (let i = 2; i < values.length; i++) {
    // 允许浮点精度误差
    if (Math.abs(values[i] / values[i - 1] - ratio) > 1e-10) return null;
  }
  return ratio;
}

// ==================== 内置自定义列表 ====================

/** 内置自定义列表：用于循环填充 */
const CUSTOM_LISTS: string[][] = [
  // 中文天干
  ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'],
  // 中文地支
  ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'],
  // 中文数字
  ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'],
  // 中文月份
  ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
  // 星期（中文）
  ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
  ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期天'],
  // 星期（英文缩写）
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  // 星期（英文全称）
  ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  // 月份（英文缩写）
  ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  // 月份（英文全称）
  ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  // 季度
  ['一季度', '二季度', '三季度', '四季度'],
  ['Q1', 'Q2', 'Q3', 'Q4'],
  // 日
  ['日', '一', '二', '三', '四', '五', '六'],
];

/** 查找文本在自定义列表中的位置，返回 { listIndex, positionInList } 或 null */
function findInCustomList(text: string): { listIndex: number; positionInList: number } | null {
  const normalizedText = text.trim();
  for (let i = 0; i < CUSTOM_LISTS.length; i++) {
    const pos = CUSTOM_LISTS[i].indexOf(normalizedText);
    if (pos !== -1) {
      return { listIndex: i, positionInList: pos };
    }
  }
  return null;
}

/** 根据自定义列表获取下一个值 */
function getNextFromCustomList(text: string): string | null {
  const found = findInCustomList(text);
  if (!found) return null;
  const list = CUSTOM_LISTS[found.listIndex];
  const nextPos = (found.positionInList + 1) % list.length;
  return list[nextPos];
}

// ==================== 文本+数字混合递增 ====================

/** 解析文本中的数字部分，返回 { prefix, number, suffix, numberStr } 或 null */
function parseTextWithNumber(text: string): { prefix: string; number: number; suffix: string; numberStr: string } | null {
  // 匹配：前缀 + 数字（支持前导零）+ 后缀
  // 例如: "A-01", "Test123", "Item 001", "第1章"
  const match = text.match(/^(.*?)(\d+)(.*?)$/);
  if (!match) return null;
  return {
    prefix: match[1],
    number: parseInt(match[2], 10),
    suffix: match[3],
    numberStr: match[2],
  };
}

/** 生成文本+数字混合递增的值 */
function incrementTextWithNumber(text: string, increment: number): string | null {
  const parsed = parseTextWithNumber(text);
  if (!parsed) return null;
  const newNumber = parsed.number + increment;
  // 保持原始数字位数（前导零）
  const newNumberStr = String(newNumber).padStart(parsed.numberStr.length, '0');
  return parsed.prefix + newNumberStr + parsed.suffix;
}

/** 检测两个文本是否具有相同的前缀/后缀模式，仅数字部分不同 */
function haveSameTextPattern(a: string, b: string): boolean {
  const parsedA = parseTextWithNumber(a);
  const parsedB = parseTextWithNumber(b);
  if (!parsedA || !parsedB) return false;
  return parsedA.prefix === parsedB.prefix && parsedA.suffix === parsedB.suffix;
}

// ==================== 日期序列（按月/年） ====================

/** 日期按月递增 */
function addMonths(timestamp: number, months: number): number {
  const date = new Date(timestamp);
  date.setMonth(date.getMonth() + months);
  return date.getTime();
}

/** 日期按年递增 */
function addYears(timestamp: number, years: number): number {
  const date = new Date(timestamp);
  date.setFullYear(date.getFullYear() + years);
  return date.getTime();
}

/** 判断日期是否为工作日（周一到周五） */
function isWorkday(timestamp: number): boolean {
  const day = new Date(timestamp).getDay();
  return day !== 0 && day !== 6;
}

/** 获取下一个工作日 */
function getNextWorkday(timestamp: number): number {
  let next = timestamp + 24 * 60 * 60 * 1000;
  while (!isWorkday(next)) {
    next += 24 * 60 * 60 * 1000;
  }
  return next;
}

/** 构建日期序列值（支持按天、月、年、工作日） */
function buildDateSeriesValue(
  table: FreeTable,
  src: ReturnType<typeof normalizeRange>,
  relRow: number,
  relCol: number,
  axis: 'column' | 'row',
  fillMode: FillMode = 'series',
): CellValue | null {
  const srcRows = src.endRow - src.startRow + 1;
  const srcCols = src.endCol - src.startCol + 1;
  const isColumn = axis === 'column';

  if (isColumn) {
    if (srcCols !== 1 || srcRows < 1 || relCol !== 0) return null;
  } else {
    if (srcRows !== 1 || srcCols < 1 || relRow !== 0) return null;
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

  if (timestamps.length === 0) return null;

  const offset = isColumn ? relRow : relCol;
  const format: DateFormat = template?.format ?? { kind: 'short' };

  let newTimestamp: number;

  if (fillMode === 'month' && timestamps.length >= 1) {
    // 按月填充：基于第一个日期，每个月递增
    newTimestamp = addMonths(timestamps[0], offset);
  } else if (fillMode === 'year' && timestamps.length >= 1) {
    // 按年填充：基于第一个日期，每 year 递增
    newTimestamp = addYears(timestamps[0], offset);
  } else if (fillMode === 'workday') {
    // 按工作日填充：基于第一个日期，跳过周末
    newTimestamp = timestamps[0];
    if (offset > 0) {
      for (let i = 0; i < offset; i++) {
        newTimestamp = getNextWorkday(newTimestamp);
      }
    } else if (offset < 0) {
      for (let i = 0; i > offset; i--) {
        newTimestamp = getPreviousWorkday(newTimestamp);
      }
    }
  } else {
    // 默认按天数间隔
    if (timestamps.length < 2) {
      // 单个日期，按天递增
      newTimestamp = timestamps[0] + offset * 24 * 60 * 60 * 1000;
    } else {
      const step = getNumericSeriesStep(timestamps);
      if (step === null) return null;
      newTimestamp = timestamps[0] + step * offset;
    }
  }

  return {
    type: 'date',
    timestamp: newTimestamp,
    format,
    ...(template?.reminder !== undefined ? { reminder: template.reminder } : {}),
  };
}

/** 获取上一个工作日 */
function getPreviousWorkday(timestamp: number): number {
  let prev = timestamp - 24 * 60 * 60 * 1000;
  while (!isWorkday(prev)) {
    prev -= 24 * 60 * 60 * 1000;
  }
  return prev;
}

// ==================== 时间序列 ====================

/** 解析时间字符串（HH:mm 或 HH:mm:ss）为分钟数 */
function parseTimeToMinutes(text: string): number | null {
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 将分钟数转换为时间字符串 */
function minutesToTimeString(minutes: number, originalFormat: string): string {
  const dayMinutes = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(dayMinutes / 60);
  const m = dayMinutes % 60;
  if (originalFormat.includes(':') && originalFormat.split(':').length === 3) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 尝试构建时间序列 */
function buildTimeSeriesValue(
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
    if (srcCols !== 1 || srcRows < 1 || relCol !== 0) return null;
  } else {
    if (srcRows !== 1 || srcCols < 1 || relRow !== 0) return null;
  }

  const count = isColumn ? srcRows : srcCols;
  const times: number[] = [];
  let originalFormat = '';

  for (let i = 0; i < count; i++) {
    const r = isColumn ? src.startRow + i : src.startRow;
    const c = isColumn ? src.startCol : src.startCol + i;
    const cell = table.getCell(r, c);
    if (cell?.value.type !== 'text') return null;
    const minutes = parseTimeToMinutes(cell.value.text);
    if (minutes === null) return null;
    times.push(minutes);
    if (!originalFormat) originalFormat = cell.value.text;
  }

  if (times.length === 0) return null;

  const offset = isColumn ? relRow : relCol;

  if (times.length === 1) {
    // 单个时间点，默认按30分钟递增
    const newMinutes = times[0] + offset * 30;
    return { type: 'text', text: minutesToTimeString(newMinutes, originalFormat) };
  }

  // 多个时间点，计算步长
  const step = getNumericSeriesStep(times);
  if (step === null) return null;
  const newMinutes = times[0] + step * offset;
  return { type: 'text', text: minutesToTimeString(newMinutes, originalFormat) };
}

// ==================== 主解析函数 ====================

function resolveFillValue(
  table: FreeTable,
  src: ReturnType<typeof normalizeRange>,
  targetRow: number,
  targetCol: number,
  srcRows: number,
  srcCols: number,
  fillMode: FillMode = 'series',
): CellValue {
  const relRow = targetRow - src.startRow;
  const relCol = targetCol - src.startCol;

  // 时间序列：文本格式的时间（08:00, 08:30）
  const timeValue = buildTimeSeriesValue(table, src, relRow, relCol, 'column');
  if (timeValue) return timeValue;
  const rowTimeValue = buildTimeSeriesValue(table, src, relRow, relCol, 'row');
  if (rowTimeValue) return rowTimeValue;

  // 日期序列：支持按天、月、年、工作日
  const columnDateValue = buildDateSeriesValue(table, src, relRow, relCol, 'column', fillMode);
  if (columnDateValue) return columnDateValue;

  const rowDateValue = buildDateSeriesValue(table, src, relRow, relCol, 'row', fillMode);
  if (rowDateValue) return rowDateValue;

  // 文本+数字混合递增
  const textNumberValue = buildTextNumberSeriesValue(table, src, relRow, relCol, 'column');
  if (textNumberValue) return textNumberValue;
  const rowTextNumberValue = buildTextNumberSeriesValue(table, src, relRow, relCol, 'row');
  if (rowTextNumberValue) return rowTextNumberValue;

  // 自定义列表循环
  const customListValue = buildCustomListValue(table, src, relRow, relCol, 'column');
  if (customListValue) return customListValue;
  const rowCustomListValue = buildCustomListValue(table, src, relRow, relCol, 'row');
  if (rowCustomListValue) return rowCustomListValue;

  // 单列数字序列：向下/上拖动时递增（支持等差和等比）
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
    // 先尝试等差数列
    const step = getNumericSeriesStep(numbers);
    if (step !== null) {
      const base = numbers[0];
      const offset = relRow;
      return { type: 'number', value: base + step * offset, format: { kind: 'general' } };
    }
    // 再尝试等比数列
    const ratio = getGeometricRatio(numbers);
    if (ratio !== null) {
      const base = numbers[0];
      const offset = relRow;
      return { type: 'number', value: base * Math.pow(ratio, offset), format: { kind: 'general' } };
    }
  }

  // 单行数字序列：向右/左拖动时递增（支持等差和等比）
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
    // 先尝试等差数列
    const step = getNumericSeriesStep(numbers);
    if (step !== null) {
      const base = numbers[0];
      return { type: 'number', value: base + step * relCol, format: { kind: 'general' } };
    }
    // 再尝试等比数列
    const ratio = getGeometricRatio(numbers);
    if (ratio !== null) {
      const base = numbers[0];
      return { type: 'number', value: base * Math.pow(ratio, relCol), format: { kind: 'general' } };
    }
  }

  // 默认：循环复制源单元格
  const srcRow = src.startRow + ((relRow % srcRows) + srcRows) % srcRows;
  const srcCol = src.startCol + ((relCol % srcCols) + srcCols) % srcCols;
  const srcCell = table.getCell(srcRow, srcCol);
  if (!srcCell || srcCell.value.type === 'empty') {
    return { type: 'empty' };
  }
  return cloneCellValue(srcCell.value);
}

// ==================== 文本+数字混合序列 ====================

/** 构建文本+数字混合序列值 */
function buildTextNumberSeriesValue(
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
    if (srcCols !== 1 || srcRows < 1 || relCol !== 0) return null;
  } else {
    if (srcRows !== 1 || srcCols < 1 || relRow !== 0) return null;
  }

  const count = isColumn ? srcRows : srcCols;
  const texts: string[] = [];

  for (let i = 0; i < count; i++) {
    const r = isColumn ? src.startRow + i : src.startRow;
    const c = isColumn ? src.startCol : src.startCol + i;
    const cell = table.getCell(r, c);
    if (cell?.value.type !== 'text') return null;
    texts.push(cell.value.text);
  }

  if (texts.length === 0) return null;

  // 检查是否都是文本+数字格式且具有相同模式
  const firstParsed = parseTextWithNumber(texts[0]);
  if (!firstParsed) return null;

  for (let i = 1; i < texts.length; i++) {
    if (!haveSameTextPattern(texts[0], texts[i])) return null;
  }

  // 计算数字步长
  const numbers = texts.map(t => parseTextWithNumber(t)!.number);
  const step = numbers.length >= 2 ? numbers[1] - numbers[0] : 1;

  const offset = isColumn ? relRow : relCol;
  const newNumber = numbers[0] + step * offset;
  const newNumberStr = String(newNumber).padStart(firstParsed.numberStr.length, '0');
  return { type: 'text', text: firstParsed.prefix + newNumberStr + firstParsed.suffix };
}

// ==================== 自定义列表序列 ====================

/** 构建自定义列表序列值 */
function buildCustomListValue(
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
    if (srcCols !== 1 || srcRows < 1 || relCol !== 0) return null;
  } else {
    if (srcRows !== 1 || srcCols < 1 || relRow !== 0) return null;
  }

  const count = isColumn ? srcRows : srcCols;
  const texts: string[] = [];

  for (let i = 0; i < count; i++) {
    const r = isColumn ? src.startRow + i : src.startRow;
    const c = isColumn ? src.startCol : src.startCol + i;
    const cell = table.getCell(r, c);
    if (cell?.value.type !== 'text') return null;
    texts.push(cell.value.text);
  }

  if (texts.length === 0) return null;

  // 检查所有文本是否在同一个自定义列表中且连续
  const firstFound = findInCustomList(texts[0]);
  if (!firstFound) return null;

  const list = CUSTOM_LISTS[firstFound.listIndex];
  for (let i = 1; i < texts.length; i++) {
    const found = findInCustomList(texts[i]);
    if (!found || found.listIndex !== firstFound.listIndex) return null;
    // 检查是否连续（允许循环）
    const expectedPos = (firstFound.positionInList + i) % list.length;
    if (found.positionInList !== expectedPos) return null;
  }

  // 计算偏移后的值
  const offset = isColumn ? relRow : relCol;
  const newPos = (firstFound.positionInList + texts.length - 1 + offset) % list.length;
  return { type: 'text', text: list[newPos] };
}

/** 将源选区模式填充到目标范围（含复制与简单数字序列） */
export function applyAutofill(
  table: FreeTable,
  sourceRange: CellRange,
  targetRange: CellRange,
  fillMode: FillMode = 'series',
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

        const value = resolveFillValue(table, src, r, c, srcRows, srcCols, fillMode);
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
