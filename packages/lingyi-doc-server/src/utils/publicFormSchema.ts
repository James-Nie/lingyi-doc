import { BusinessException } from '../common/exceptions/business.exception';
import { HttpStatus } from '@nestjs/common';

type CellValueJson = Record<string, unknown> & { type: string };

interface FormDisplayConditionJson {
  id?: string;
  fieldId?: string;
  operator?: string;
  value?: unknown;
}

interface FormFieldItemJson {
  fieldId: string;
  question?: string;
  description?: string;
  required?: boolean;
  conditionalVisible?: boolean;
  displayConditions?: FormDisplayConditionJson[];
}

interface BaseViewJson {
  viewId: string;
  viewName?: string;
  viewType: string;
  config?: {
    formTitle?: string;
    formDescription?: string;
    formShareEnabled?: boolean;
    formShareLinkScope?: 'internet' | 'organization' | 'collaborators';
    formFieldItems?: FormFieldItemJson[];
  };
}

interface SelectOptionJson {
  id: string;
  name: string;
  color?: string;
}

interface ColumnDefJson {
  id: string;
  name: string;
  type?: string;
  required?: boolean;
  options?: SelectOptionJson[];
  format?: string;
  ratingIcon?: string;
  ratingMin?: number;
  ratingMax?: number;
  allowMultiple?: boolean;
  currencySymbol?: string;
  currencySymbolAlign?: 'default' | 'left' | 'right';
  currencyPrecision?: number;
  hidden?: boolean;
}

interface SheetDataJson {
  type?: string;
  rowCount?: number;
  columnDefs?: ColumnDefJson[];
  rows?: Record<string, unknown>[];
  cells?: Record<string, unknown>;
  views?: BaseViewJson[];
}

interface WorkbookJson {
  sheets?: Array<{ id: string; data: SheetDataJson }>;
}

const SYSTEM_COLUMN_TYPES = new Set(['createdBy', 'updatedBy', 'createdTime', 'updatedTime']);

function isSystemColumnType(type?: string): boolean {
  return !!type && SYSTEM_COLUMN_TYPES.has(type);
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

function resolveFormTitle(formView: BaseViewJson): string {
  const formTitle = formView.config?.formTitle?.trim();
  if (formTitle) return formTitle;
  const viewName = formView.viewName?.trim();
  if (viewName) return viewName;
  return '表单';
}

function pickColumnForFill(col: ColumnDefJson): Record<string, unknown> {
  return {
    id: col.id,
    name: col.name,
    type: col.type ?? 'text',
    required: col.required,
    options: col.options,
    format: col.format,
    ratingIcon: col.ratingIcon,
    ratingMin: col.ratingMin,
    ratingMax: col.ratingMax,
    allowMultiple: col.allowMultiple,
    currencySymbol: col.currencySymbol,
    currencySymbolAlign: col.currencySymbolAlign,
    currencyPrecision: col.currencyPrecision,
  };
}

function formatCellDisplay(column: ColumnDefJson, value: CellValueJson | undefined): string {
  if (!value || value.type === 'empty') return '';
  switch (column.type) {
    case 'select': {
      const raw = value.type === 'text' && typeof value.text === 'string' ? value.text : '';
      const opt = column.options?.find(o => o.id === raw || o.name === raw);
      return opt?.name || raw;
    }
    case 'multiSelect': {
      if (value.type === 'text' && typeof value.text === 'string') {
        const ids = value.text.split(',').map(s => s.trim()).filter(Boolean);
        return ids.map(id => {
          const opt = column.options?.find(o => o.id === id || o.name === id);
          return opt?.name || id;
        }).join('、');
      }
      return '';
    }
    case 'boolean':
      return value.type === 'boolean' && value.value ? '是' : '否';
    case 'number':
    case 'currency':
    case 'percent':
      return value.type === 'number' ? String(value.value) : '';
    case 'date':
    case 'datetime':
      if (value.type === 'date' && typeof value.timestamp === 'number') {
        const d = new Date(value.timestamp);
        const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      }
      return '';
    default:
      if (value.type === 'text' && typeof value.text === 'string') return value.text;
      return '';
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatFormSubmissionTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export interface PublicFormSchemaFieldDto {
  fieldId: string;
  question: string;
  description?: string;
  required?: boolean;
  conditionalVisible?: boolean;
  displayConditions?: FormDisplayConditionJson[];
  column: Record<string, unknown>;
}

export interface PublicFormSchemaDto {
  sheetId: string;
  viewId: string;
  title: string;
  description: string;
  formShareLinkScope: 'internet' | 'organization' | 'collaborators';
  fields: PublicFormSchemaFieldDto[];
}

export interface PublicFormSubmissionSummaryDto {
  recordId: string;
  createdAt: number;
  createdBy: string;
  isLatest: boolean;
  fields: Array<{ label: string; value: string }>;
}

interface ResolvedFormSheet {
  sheet: SheetDataJson;
  formView: BaseViewJson;
  columnDefs: ColumnDefJson[];
  formItems: FormFieldItemJson[];
  formColIndices: number[];
}

function resolveFormSheet(
  workbookData: unknown,
  sheetId: string,
  viewId: string,
): ResolvedFormSheet {
  const wb = workbookData as WorkbookJson;
  const sheetEntry = wb.sheets?.find(s => s.id === sheetId);
  if (!sheetEntry) {
    throw new BusinessException(100004, '工作表不存在', HttpStatus.NOT_FOUND);
  }
  const sheet = sheetEntry.data;
  if (sheet.type !== 'base') {
    throw new BusinessException(100002, '不是多维表格', HttpStatus.BAD_REQUEST);
  }

  const formView = sheet.views?.find(v => v.viewId === viewId && v.viewType === 'form')
    ?? sheet.views?.find(v => v.viewType === 'form');
  if (!formView) {
    throw new BusinessException(100004, '表单视图不存在', HttpStatus.NOT_FOUND);
  }
  if (!formView.config?.formShareEnabled) {
    throw new BusinessException(100403, '表单分享未开启', HttpStatus.FORBIDDEN);
  }

  const columnDefs = sheet.columnDefs ?? [];
  const formItems = (formView.config.formFieldItems ?? []).filter(item => {
    const col = columnDefs.find(c => c.id === item.fieldId);
    if (!col || col.hidden || isSystemColumnType(col.type)) return false;
    return true;
  });
  const formColIndices = formItems
    .map(item => columnDefs.findIndex(c => c.id === item.fieldId))
    .filter(i => i >= 0);

  return { sheet, formView, columnDefs, formItems, formColIndices };
}

/** 抽取公开表单填写所需最小 schema（不含 rows/cells） */
export function extractPublicFormSchema(
  workbookData: unknown,
  sheetId: string,
  viewId: string,
): PublicFormSchemaDto {
  const { formView, columnDefs, formItems } = resolveFormSheet(workbookData, sheetId, viewId);

  const fields: PublicFormSchemaFieldDto[] = formItems.map(item => {
    const col = columnDefs.find(c => c.id === item.fieldId)!;
    return {
      fieldId: item.fieldId,
      question: (item.question || col.name || '字段').trim(),
      description: item.description,
      required: item.required,
      conditionalVisible: item.conditionalVisible,
      displayConditions: item.displayConditions,
      column: pickColumnForFill(col),
    };
  });

  return {
    sheetId,
    viewId: formView.viewId,
    title: resolveFormTitle(formView),
    description: formView.config?.formDescription ?? '',
    formShareLinkScope: formView.config?.formShareLinkScope ?? 'internet',
    fields,
  };
}

function listFilledRows(resolved: ResolvedFormSheet): Array<{
  rowIndex: number;
  recordId: string;
  createdAt: number;
  createdBy: string;
}> {
  const { sheet, formColIndices } = resolved;
  if (formColIndices.length === 0) return [];

  const cells = (sheet.cells ?? {}) as Record<string, unknown>;
  const rowCount = typeof sheet.rowCount === 'number' ? sheet.rowCount : 0;
  const rows: Array<{ rowIndex: number; recordId: string; createdAt: number; createdBy: string }> = [];

  for (let r = 0; r < rowCount; r++) {
    if (!rowHasFieldData(cells, r, formColIndices)) continue;
    const record = sheet.rows?.[r];
    const recordId = typeof record?._id === 'string' ? record._id : `row_${r}`;
    const createdAt = typeof record?._createdAt === 'number' ? record._createdAt : 0;
    const createdBy = typeof record?._createdBy === 'string' ? record._createdBy : '';
    rows.push({ rowIndex: r, recordId, createdAt, createdBy });
  }

  rows.sort((a, b) => b.createdAt - a.createdAt);
  return rows;
}

/** 提交记录摘要列表（倒序） */
export function listPublicFormSubmissions(
  workbookData: unknown,
  sheetId: string,
  viewId: string,
): PublicFormSubmissionSummaryDto[] {
  const resolved = resolveFormSheet(workbookData, sheetId, viewId);
  const { sheet, columnDefs, formItems } = resolved;
  const cells = (sheet.cells ?? {}) as Record<string, unknown>;
  const previewItems = formItems.slice(0, 3);
  const filled = listFilledRows(resolved);

  return filled.map((row, index) => {
    const fields = previewItems.map(item => {
      const colIndex = columnDefs.findIndex(c => c.id === item.fieldId);
      const col = columnDefs[colIndex];
      const label = (item.question || col?.name || '字段').trim();
      const value = col
        ? formatCellDisplay(col, getCellValue(cells, row.rowIndex, colIndex))
        : '';
      return { label, value: value || '—' };
    });
    return {
      recordId: row.recordId,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      isLatest: index === 0,
      fields,
    };
  });
}

export function countPublicFormSubmissions(
  workbookData: unknown,
  sheetId: string,
  viewId: string,
): number {
  return listFilledRows(resolveFormSheet(workbookData, sheetId, viewId)).length;
}

/** 单条提交的表单字段值 */
export function getPublicFormSubmissionValues(
  workbookData: unknown,
  sheetId: string,
  viewId: string,
  recordId: string,
): Record<string, CellValueJson> {
  const resolved = resolveFormSheet(workbookData, sheetId, viewId);
  const { sheet, columnDefs, formItems } = resolved;
  const cells = (sheet.cells ?? {}) as Record<string, unknown>;
  const filled = listFilledRows(resolved);
  const target = filled.find(r => r.recordId === recordId);
  if (!target) {
    throw new BusinessException(100004, '提交记录不存在', HttpStatus.NOT_FOUND);
  }

  const values: Record<string, CellValueJson> = {};
  for (const item of formItems) {
    const colIndex = columnDefs.findIndex(c => c.id === item.fieldId);
    if (colIndex < 0) continue;
    values[item.fieldId] = getCellValue(cells, target.rowIndex, colIndex) ?? { type: 'empty' };
  }
  return values;
}

export function listSubmissionCreatedBy(
  workbookData: unknown,
  sheetId: string,
  viewId: string,
): string[] {
  return listFilledRows(resolveFormSheet(workbookData, sheetId, viewId)).map(r => r.createdBy);
}

/** 校验 workbook 内表单分享已开启（供 assert 复用） */
export function assertFormViewShareEnabled(
  workbookData: unknown,
  sheetId: string,
  viewId: string,
): void {
  resolveFormSheet(workbookData, sheetId, viewId);
}
