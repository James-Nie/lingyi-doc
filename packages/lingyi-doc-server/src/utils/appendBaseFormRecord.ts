import { BusinessException } from '../common/exceptions/business.exception';
import { HttpStatus } from '@nestjs/common';

type CellValueJson = Record<string, unknown> & { type: string };

interface FormFieldItem {
  fieldId: string;
  question?: string;
  required?: boolean;
}

interface BaseViewJson {
  viewId: string;
  viewType: string;
  config?: {
    formShareEnabled?: boolean;
    formFieldItems?: FormFieldItem[];
  };
}

interface ColumnDefJson {
  id: string;
  name: string;
}

interface SheetDataJson {
  type?: string;
  rowCount?: number;
  columnDefs?: ColumnDefJson[];
  rows?: Record<string, unknown>[];
  cells?: Record<string, unknown>;
  rowHeights?: Record<string, number>;
  defaultRowHeight?: number;
  views?: BaseViewJson[];
}

interface WorkbookJson {
  sheets?: Array<{ id: string; data: SheetDataJson }>;
}

function cellKey(row: number, col: number): string {
  return `R${row}C${col}`;
}

function isEmptyCellValue(value: CellValueJson | undefined): boolean {
  if (!value || value.type === 'empty') return true;
  if (value.type === 'text' && typeof value.text === 'string') return value.text.trim() === '';
  return false;
}

function getCellValue(
  cells: Record<string, unknown>,
  row: number,
  col: number,
): CellValueJson | undefined {
  const entry = cells[cellKey(row, col)] as { value?: CellValueJson } | undefined;
  return entry?.value;
}

function rowHasFieldData(
  cells: Record<string, unknown>,
  row: number,
  colIndices: number[],
): boolean {
  for (const col of colIndices) {
    const value = getCellValue(cells, row, col);
    if (!isEmptyCellValue(value)) return true;
  }
  return false;
}

function findNextEmptyRowIndex(sheet: SheetDataJson, colIndices: number[]): number {
  const rowCount = typeof sheet.rowCount === 'number' ? sheet.rowCount : 0;
  const cells = (sheet.cells ?? {}) as Record<string, unknown>;
  for (let r = 0; r < rowCount; r++) {
    if (!rowHasFieldData(cells, r, colIndices)) return r;
  }
  return rowCount;
}

function createRecordRow(order: number): Record<string, unknown> {
  const now = Date.now();
  return {
    _id: `rec_${now}_${Math.random().toString(36).slice(2, 9)}`,
    _createdAt: now,
    _createdBy: 'public_form',
    _updatedAt: now,
    _updatedBy: 'public_form',
    _order: order,
    _parentId: null,
  };
}

function ensureRowsLength(sheet: SheetDataJson, length: number): void {
  if (!Array.isArray(sheet.rows)) sheet.rows = [];
  while (sheet.rows.length < length) {
    sheet.rows.push(createRecordRow(sheet.rows.length));
  }
}

/** 在 workbook JSON 中追加一条表单填写记录 */
export function appendBaseFormRecord(
  workbookData: unknown,
  params: {
    sheetId: string;
    viewId: string;
    fieldValues: Record<string, CellValueJson>;
  },
): unknown {
  const wb = workbookData as WorkbookJson;
  const sheetEntry = wb.sheets?.find(s => s.id === params.sheetId);
  if (!sheetEntry) {
    throw new BusinessException(100004, '工作表不存在', HttpStatus.NOT_FOUND);
  }

  const sheet = sheetEntry.data;
  if (sheet.type !== 'base') {
    throw new BusinessException(100002, '不是多维表格', HttpStatus.BAD_REQUEST);
  }

  const formView = sheet.views?.find(v => v.viewId === params.viewId && v.viewType === 'form');
  if (!formView) {
    throw new BusinessException(100004, '表单视图不存在', HttpStatus.NOT_FOUND);
  }
  if (!formView.config?.formShareEnabled) {
    throw new BusinessException(100403, '表单分享未开启', HttpStatus.FORBIDDEN);
  }

  const formItems = formView.config.formFieldItems ?? [];
  const columnDefs = sheet.columnDefs ?? [];

  for (const item of formItems) {
    if (!item.required) continue;
    const value = params.fieldValues[item.fieldId];
    if (isEmptyCellValue(value)) {
      const col = columnDefs.find(c => c.id === item.fieldId);
      throw new BusinessException(
        100002,
        `请填写必填项「${item.question || col?.name || '字段'}」`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  const formColIndices = formItems
    .map(item => columnDefs.findIndex(c => c.id === item.fieldId))
    .filter(colIndex => colIndex >= 0);

  if (!sheet.cells || typeof sheet.cells !== 'object') sheet.cells = {};
  const cells = sheet.cells as Record<string, unknown>;

  const rowCount = typeof sheet.rowCount === 'number' ? sheet.rowCount : 0;
  const newRowIndex = findNextEmptyRowIndex(sheet, formColIndices);
  const isNewRow = newRowIndex >= rowCount;

  if (isNewRow) {
    sheet.rowCount = newRowIndex + 1;
    ensureRowsLength(sheet, newRowIndex + 1);
    if (!sheet.rowHeights || typeof sheet.rowHeights !== 'object') sheet.rowHeights = {};
    const defaultHeight = sheet.defaultRowHeight ?? 36;
    sheet.rowHeights[String(newRowIndex)] = defaultHeight;
  } else {
    ensureRowsLength(sheet, rowCount);
    const record = sheet.rows![newRowIndex];
    if (record) {
      record._updatedAt = Date.now();
      record._updatedBy = 'public_form';
    }
  }

  for (const item of formItems) {
    const colIndex = columnDefs.findIndex(c => c.id === item.fieldId);
    if (colIndex < 0) continue;
    const value = params.fieldValues[item.fieldId];
    if (isEmptyCellValue(value)) continue;
    cells[cellKey(newRowIndex, colIndex)] = { value };
  }

  return wb;
}
