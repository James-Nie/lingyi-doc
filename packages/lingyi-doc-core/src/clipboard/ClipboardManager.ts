import { FreeTable } from '../model/index';
import type { BorderStyle, CellCoord, CellData, CellRange, CellStyle, CellValue } from '../types/index';
import { coordToKey, getCellText, keyToCoord } from '../types/index';
import { getSheetMergeRanges } from '../types/sheetAccess';
import {
  SHEET_CLIPBOARD_MIME,
  type ClipboardCellMeta,
  type SheetClipboardPayload,
  serializeSheetClipboard,
} from './clipboardInternal';
import {
  normalizePastedCellText,
  type ClipboardPasteMerge,
  type ClipboardPastePayload,
} from './externalClipboard';

interface ClipboardData {
  cells: [string, CellData][];
  rows: number;
  cols: number;
  merges: ClipboardPasteMerge[];
  meta: [string, ClipboardCellMeta][];
}

function normalizeRect(range: CellRange): { minRow: number; maxRow: number; minCol: number; maxCol: number } {
  return {
    minRow: Math.min(range.start.row, range.end.row),
    maxRow: Math.max(range.start.row, range.end.row),
    minCol: Math.min(range.start.col, range.end.col),
    maxCol: Math.max(range.start.col, range.end.col),
  };
}

function cloneBorder(border?: BorderStyle): BorderStyle | undefined {
  return border ? { ...border } : undefined;
}

function cloneCellStyle(style?: CellStyle): CellStyle | undefined {
  if (!style) return undefined;
  return {
    ...style,
    borderTop: cloneBorder(style.borderTop),
    borderRight: cloneBorder(style.borderRight),
    borderBottom: cloneBorder(style.borderBottom),
    borderLeft: cloneBorder(style.borderLeft),
  };
}

function cloneCellValue(value: CellValue): CellValue {
  return JSON.parse(JSON.stringify(value)) as CellValue;
}

function cloneCellData(cell: CellData): CellData {
  return {
    value: cloneCellValue(cell.value),
    style: cloneCellStyle(cell.style),
  };
}

function cloneCellMeta(meta: ClipboardCellMeta): ClipboardCellMeta {
  const validation = meta.validation;
  if (!validation) return {};
  return {
    validation: {
      ...validation,
      options: validation.options?.map(option => ({ ...option })),
    },
  };
}

function isMergedChildAt(table: FreeTable, row: number, col: number): boolean {
  return table.sheet.cells.get(coordToKey({ row, col }))?.isMergedChild === true;
}

function collectMergesInRect(
  table: FreeTable,
  minRow: number,
  maxRow: number,
  minCol: number,
  maxCol: number,
  originRow: number,
  originCol: number,
): ClipboardPasteMerge[] {
  const merges: ClipboardPasteMerge[] = [];
  for (const range of getSheetMergeRanges(table.sheet)) {
    const mergeMinRow = Math.min(range.start.row, range.end.row);
    const mergeMaxRow = Math.max(range.start.row, range.end.row);
    const mergeMinCol = Math.min(range.start.col, range.end.col);
    const mergeMaxCol = Math.max(range.start.col, range.end.col);
    if (mergeMinRow < minRow || mergeMaxRow > maxRow || mergeMinCol < minCol || mergeMaxCol > maxCol) {
      continue;
    }
    if (mergeMinRow === mergeMaxRow && mergeMinCol === mergeMaxCol) continue;
    merges.push({
      startRow: mergeMinRow - originRow,
      startCol: mergeMinCol - originCol,
      endRow: mergeMaxRow - originRow,
      endCol: mergeMaxCol - originCol,
    });
  }
  return merges;
}

function isMergeChildRelative(merges: ClipboardPasteMerge[], row: number, col: number): boolean {
  return merges.some(merge =>
    row >= merge.startRow && row <= merge.endRow &&
    col >= merge.startCol && col <= merge.endCol &&
    !(row === merge.startRow && col === merge.startCol),
  );
}

function findMergeMaster(merges: ClipboardPasteMerge[], row: number, col: number): ClipboardPasteMerge | undefined {
  return merges.find(merge =>
    row >= merge.startRow && row <= merge.endRow &&
    col >= merge.startCol && col <= merge.endCol,
  );
}

function cellStyleToInline(style?: CellStyle): string {
  if (!style) return '';
  const parts: string[] = [];
  if (style.backgroundColor) parts.push(`background-color:${style.backgroundColor}`);
  if (style.fontColor) parts.push(`color:${style.fontColor}`);
  if (style.bold) parts.push('font-weight:bold');
  if (style.italic) parts.push('font-style:italic');
  if (style.underline) parts.push('text-decoration:underline');
  if (style.strikethrough) parts.push('text-decoration:line-through');
  if (style.horizontalAlign) parts.push(`text-align:${style.horizontalAlign}`);
  if (style.verticalAlign) parts.push(`vertical-align:${style.verticalAlign}`);
  if (style.textWrap) parts.push('white-space:normal');

  const borderSide = (side: BorderStyle | undefined, prop: string) => {
    if (!side || side.style === 'none') return;
    const width = side.style === 'thick' ? '2pt' : side.style === 'medium' ? '1.5pt' : '1pt';
    const line = side.style === 'dashed' ? 'dashed' : side.style === 'dotted' ? 'dotted' : side.style === 'double' ? 'double' : 'solid';
    parts.push(`${prop}:${width} ${line} ${side.color}`);
  };
  borderSide(style.borderTop, 'border-top');
  borderSide(style.borderRight, 'border-right');
  borderSide(style.borderBottom, 'border-bottom');
  borderSide(style.borderLeft, 'border-left');

  return parts.join(';');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildClipboardHtml(table: FreeTable, data: ClipboardData, originRow: number, originCol: number): string {
  const rows: string[] = [];
  for (let r = 0; r < data.rows; r++) {
    const cells: string[] = [];
    for (let c = 0; c < data.cols; c++) {
      if (isMergeChildRelative(data.merges, r, c)) continue;

      const merge = findMergeMaster(data.merges, r, c);
      const sourceRow = originRow + r;
      const sourceCol = originCol + c;
      const cell = table.sheet.cells.get(coordToKey({ row: sourceRow, col: sourceCol }))
        ?? table.getCell(sourceRow, sourceCol);
      const text = cell ? getCellText(cell.value) : '';
      const attrs: string[] = [];
      if (merge && merge.startRow === r && merge.startCol === c) {
        const colspan = merge.endCol - merge.startCol + 1;
        const rowspan = merge.endRow - merge.startRow + 1;
        if (colspan > 1) attrs.push(`colspan="${colspan}"`);
        if (rowspan > 1) attrs.push(`rowspan="${rowspan}"`);
      }
      const style = cellStyleToInline(cell?.style);
      if (style) attrs.push(`style="${style}"`);
      cells.push(`<td${attrs.length ? ` ${attrs.join(' ')}` : ''}>${escapeHtml(text)}</td>`);
    }
    rows.push(`<tr>${cells.join('')}</tr>`);
  }
  return `<table>${rows.join('')}</table>`;
}

function buildPlainText(table: FreeTable, minRow: number, maxRow: number, minCol: number, maxCol: number, merges: ClipboardPasteMerge[]): string {
  const lines: string[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    const relRow = r - minRow;
    const line: string[] = [];
    for (let c = minCol; c <= maxCol; c++) {
      const relCol = c - minCol;
      if (isMergeChildRelative(merges, relRow, relCol)) {
        line.push('');
        continue;
      }
      const cell = table.getCell(r, c);
      line.push(cell ? getCellText(cell.value) : '');
    }
    lines.push(line.join('\t'));
  }
  return lines.join('\n');
}

function expandTableForPaste(table: FreeTable, neededRows: number, neededCols: number): void {
  if (neededRows > table.rowCount) {
    table.insertRows(table.rowCount, neededRows - table.rowCount);
  }
  if (neededCols > table.colCount) {
    table.insertColumns(table.colCount, neededCols - table.colCount);
  }
}

function makeSingleCellRange(table: FreeTable, row: number, col: number): CellRange {
  return {
    sheetId: table.sheetId,
    start: { row, col },
    end: { row, col },
  };
}

function clearSpecialValidationsAt(table: FreeTable, row: number, col: number): void {
  const range = makeSingleCellRange(table, row, col);
  table.removeDropdownValidation(range);
  table.removeDateValidation(range);
}

function clearSpecialValidationsInRect(
  table: FreeTable,
  minRow: number,
  maxRow: number,
  minCol: number,
  maxCol: number,
): void {
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      clearSpecialValidationsAt(table, r, c);
    }
  }
}

function collectCellMeta(table: FreeTable, row: number, col: number): ClipboardCellMeta | undefined {
  const dropdown = table.getDropdownValidationAt(row, col);
  if (dropdown) {
    return {
      validation: {
        type: 'dropdownList',
        mode: dropdown.mode ?? 'single',
        showOptionColor: dropdown.showOptionColor !== false,
        options: dropdown.options?.map(option => ({ ...option })),
      },
    };
  }

  const dateValidation = table.getDateValidationAt(row, col);
  if (dateValidation) {
    return {
      validation: {
        type: 'date',
        includeTime: dateValidation.includeTime ?? false,
        allowReminder: dateValidation.allowReminder ?? false,
      },
    };
  }

  return undefined;
}

function shouldCopyCell(cell: CellData | undefined, meta: ClipboardCellMeta | undefined): boolean {
  if (meta?.validation) return true;
  if (!cell) return false;
  return cell.value.type !== 'empty' || !!cell.style;
}

function collectCopyPayload(
  table: FreeTable,
  minRow: number,
  maxRow: number,
  minCol: number,
  maxCol: number,
  coords?: CellCoord[],
): ClipboardData {
  const cells: [string, CellData][] = [];
  const meta: [string, ClipboardCellMeta][] = [];

  const visit = (row: number, col: number) => {
    if (isMergedChildAt(table, row, col)) return;
    const relKey = coordToKey({ row: row - minRow, col: col - minCol });
    const cellMeta = collectCellMeta(table, row, col);
    if (cellMeta?.validation) {
      meta.push([relKey, cloneCellMeta(cellMeta)]);
    }
    const cell = table.sheet.cells.get(coordToKey({ row, col }));
    if (!shouldCopyCell(cell, cellMeta)) return;
    cells.push([relKey, cloneCellData(cell ?? { value: { type: 'empty' } })]);
  };

  if (coords) {
    for (const coord of coords) visit(coord.row, coord.col);
  } else {
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) visit(r, c);
    }
  }

  return {
    cells,
    rows: maxRow - minRow + 1,
    cols: maxCol - minCol + 1,
    merges: collectMergesInRect(table, minRow, maxRow, minCol, maxCol, minRow, minCol),
    meta,
  };
}

function toSheetClipboardPayload(data: ClipboardData): SheetClipboardPayload {
  return {
    version: 1,
    cells: data.cells,
    rows: data.rows,
    cols: data.cols,
    merges: data.merges,
    meta: data.meta.length > 0 ? data.meta : undefined,
  };
}

function fromSheetClipboardPayload(payload: SheetClipboardPayload): ClipboardData {
  return {
    cells: payload.cells.map(([key, cell]) => [key, cloneCellData(cell)]),
    rows: payload.rows,
    cols: payload.cols,
    merges: payload.merges.map(merge => ({ ...merge })),
    meta: payload.meta?.map(([key, cellMeta]) => [key, cloneCellMeta(cellMeta)]) ?? [],
  };
}

function applyClipboardCells(table: FreeTable, target: CellCoord, cells: [string, CellData][]): void {
  for (const [key, cellData] of cells) {
    const coord = keyToCoord(key);
    const targetRow = target.row + coord.row;
    const targetCol = target.col + coord.col;
    try {
      table.clearCell(targetRow, targetCol);
      if (cellData.value.type !== 'empty') {
        table.setCellValue(targetRow, targetCol, cellData.value);
      }
      if (cellData.style) {
        table.setCellStyle(targetRow, targetCol, cellData.style);
      }
    } catch {
      // 跳过合并单元格冲突
    }
  }
}

function applyClipboardMeta(table: FreeTable, target: CellCoord, meta: [string, ClipboardCellMeta][]): void {
  for (const [key, cellMeta] of meta) {
    const coord = keyToCoord(key);
    const targetRow = target.row + coord.row;
    const targetCol = target.col + coord.col;
    const range = makeSingleCellRange(table, targetRow, targetCol);
    const validation = cellMeta.validation;
    if (!validation) continue;

    try {
      if (validation.type === 'dropdownList') {
        table.setDropdownValidation(range, {
          mode: validation.mode ?? 'single',
          showOptionColor: validation.showOptionColor !== false,
          options: validation.options ?? [],
        });
      } else if (validation.type === 'date') {
        table.setDateValidation(range, {
          includeTime: validation.includeTime ?? false,
          allowReminder: validation.allowReminder ?? false,
        });
      }
    } catch {
      // 跳过无效目标格
    }
  }
}

function applyClipboardMerges(table: FreeTable, target: CellCoord, merges: ClipboardPasteMerge[]): void {
  for (const merge of merges) {
    if (merge.startRow === merge.endRow && merge.startCol === merge.endCol) continue;
    try {
      table.mergeCells({
        sheetId: table.sheetId,
        start: { row: target.row + merge.startRow, col: target.col + merge.startCol },
        end: { row: target.row + merge.endRow, col: target.col + merge.endCol },
      });
    } catch {
      // 跳过无效或重叠合并
    }
  }
}

function applyClipboardPayload(table: FreeTable, target: CellCoord, data: ClipboardData): CellRange {
  expandTableForPaste(table, target.row + data.rows, target.col + data.cols);

  const endRow = target.row + data.rows - 1;
  const endCol = target.col + data.cols - 1;

  table.runBatch(() => {
    clearSpecialValidationsInRect(table, target.row, endRow, target.col, endCol);
    applyClipboardCells(table, target, data.cells);
    applyClipboardMeta(table, target, data.meta);
  }, 'paste');

  applyClipboardMerges(table, target, data.merges);

  return {
    sheetId: table.sheetId,
    start: target,
    end: { row: endRow, col: endCol },
  };
}

export class ClipboardManager {
  private _clipboard: ClipboardData | null = null;

  copy(table: FreeTable, range: CellRange): ClipboardData {
    const { minRow, maxRow, minCol, maxCol } = normalizeRect(range);
    const data = collectCopyPayload(table, minRow, maxRow, minCol, maxCol);

    this._clipboard = data;
    void this._copyToSystemClipboard(table, minRow, minCol, data);
    return data;
  }

  /** 复制离散多选单元格（保留相对位置，不填充中间空白格） */
  copyDiscrete(table: FreeTable, coords: CellCoord[]): ClipboardData {
    if (coords.length === 0) throw new Error('No cells to copy');

    const minRow = Math.min(...coords.map(c => c.row));
    const minCol = Math.min(...coords.map(c => c.col));
    const maxRow = Math.max(...coords.map(c => c.row));
    const maxCol = Math.max(...coords.map(c => c.col));
    const data = collectCopyPayload(table, minRow, maxRow, minCol, maxCol, coords);

    this._clipboard = data;
    void this._copyToSystemClipboard(table, minRow, minCol, data);
    return data;
  }

  paste(table: FreeTable, target: CellCoord): CellRange {
    if (!this._clipboard) throw new Error('Clipboard is empty');
    return applyClipboardPayload(table, target, this._clipboard);
  }

  pastePayload(table: FreeTable, target: CellCoord, payload: SheetClipboardPayload): CellRange {
    const data = fromSheetClipboardPayload(payload);
    this._clipboard = data;
    return applyClipboardPayload(table, target, data);
  }

  hasData(): boolean {
    return this._clipboard !== null;
  }

  /** 粘贴外部来源（Excel 等）的二维文本数据 */
  pasteGrid(table: FreeTable, target: CellCoord, payload: ClipboardPastePayload): CellRange {
    const { grid, merges } = payload;
    if (grid.length === 0) throw new Error('Nothing to paste');

    const rows = grid.length;
    const cols = Math.max(...grid.map(row => row.length), 0);
    const endRow = target.row + rows - 1;
    const endCol = target.col + cols - 1;

    expandTableForPaste(table, endRow + 1, endCol + 1);

    table.runBatch(() => {
      clearSpecialValidationsInRect(table, target.row, endRow, target.col, endCol);
      for (let r = 0; r < rows; r++) {
        const row = grid[r];
        for (let c = 0; c < row.length; c++) {
          const cell = row[c];
          const raw = normalizePastedCellText(cell?.text ?? '');
          const targetRow = target.row + r;
          const targetCol = target.col + c;
          try {
            table.clearCell(targetRow, targetCol);
            if (raw !== '') {
              table.setCell(targetRow, targetCol, raw);
            }
            if (cell?.style && Object.keys(cell.style).length > 0) {
              table.setCellStyle(targetRow, targetCol, cell.style);
            }
          } catch {
            // 跳过合并单元格冲突
          }
        }
      }
    }, 'paste');

    applyClipboardMerges(table, target, merges);

    return {
      sheetId: table.sheetId,
      start: target,
      end: { row: endRow, col: endCol },
    };
  }

  cut(table: FreeTable, range: CellRange): ClipboardData {
    const data = this.copy(table, range);
    table.runBatch(() => {
      const { minRow, maxRow, minCol, maxCol } = normalizeRect(range);
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          if (isMergedChildAt(table, r, c)) continue;
          table.clearCell(r, c);
          clearSpecialValidationsAt(table, r, c);
        }
      }
    }, 'cut');
    return data;
  }

  cutDiscrete(table: FreeTable, coords: CellCoord[]): ClipboardData {
    const data = this.copyDiscrete(table, coords);
    table.runBatch(() => {
      for (const coord of coords) {
        if (isMergedChildAt(table, coord.row, coord.col)) continue;
        table.clearCell(coord.row, coord.col);
        clearSpecialValidationsAt(table, coord.row, coord.col);
      }
    }, 'cut');
    return data;
  }

  private async _copyToSystemClipboard(
    table: FreeTable,
    originRow: number,
    originCol: number,
    data: ClipboardData,
  ): Promise<void> {
    const { minRow, maxRow, minCol, maxCol } = {
      minRow: originRow,
      maxRow: originRow + data.rows - 1,
      minCol: originCol,
      maxCol: originCol + data.cols - 1,
    };
    const plain = buildPlainText(table, minRow, maxRow, minCol, maxCol, data.merges);
    const html = buildClipboardHtml(table, data, originRow, originCol);
    const internal = serializeSheetClipboard(toSheetClipboardPayload(data));

    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            [SHEET_CLIPBOARD_MIME]: new Blob([internal], { type: SHEET_CLIPBOARD_MIME }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' }),
          }),
        ]);
        return;
      }
    } catch {
      // fallback to plain text
    }

    try {
      await navigator.clipboard.writeText(plain);
    } catch {
      // Silently fail — browser may not support clipboard API
    }
  }
}
