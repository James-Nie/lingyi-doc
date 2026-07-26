import {
  DEFAULT_CELL_STYLE,
  DEFAULT_BASE_ROW_HEIGHT,
  type CellData,
  type ColumnDef,
  type BaseSheetModel,
  type FreeformSheetModel,
  type SheetModel,
  type SheetModelBase,
} from '@lingyi-doc/core-types';
import { normalizeSheetType } from '../utils/sheetType';
import { isBaseSheet } from '@lingyi-doc/core-types';

const BASE_FIELD_TYPES = new Set([
  'select', 'multiSelect', 'date', 'datetime', 'rating', 'progress',
  'attachment', 'user', 'boolean', 'autoNumber',
  'createdBy', 'updatedBy', 'createdTime', 'updatedTime',
]);

export interface CreateSheetModelOptions {
  sheetId: string;
  name?: string;
  rowCount?: number;
  colCount?: number;
}

function createSheetModelBase(options: CreateSheetModelOptions): SheetModelBase {
  return {
    sheetId: options.sheetId,
    name: options.name || 'Sheet1',
    rowCount: options.rowCount || 200,
    colCount: options.colCount || 26,
    isHidden: false,
    cells: new Map<string, CellData>(),
    columnWidths: new Map<number, number>(),
    rowHeights: new Map<number, number>(),
    conditionalFormats: [],
    validations: [],
    defaultStyle: { ...DEFAULT_CELL_STYLE },
    freezeState: { frozenRows: 0, frozenCols: 0 },
    charts: [],
  };
}

export function createFreeformSheetModel(options: CreateSheetModelOptions): FreeformSheetModel {
  return {
    ...createSheetModelBase(options),
    type: 'freeform',
    mergeRanges: [],
  };
}

export function createBaseSheetModel(options: CreateSheetModelOptions): BaseSheetModel {
  return {
    ...createSheetModelBase({ ...options, colCount: options.colCount || 26 }),
    type: 'base',
    columnDefs: [],
    rows: [],
  };
}

export function createSheetModel(
  type: 'freeform' | 'base',
  options: CreateSheetModelOptions,
): SheetModel {
  return type === 'base'
    ? createBaseSheetModel(options)
    : createFreeformSheetModel(options);
}

function resolvePersistedSheetVariant(data: any): 'freeform' | 'base' {
  if (data.type === 'base') return 'base';
  if (data.type === 'freeform' || data.type === 'standard') return 'freeform';
  const defs = data.columnDefs;
  if (Array.isArray(defs) && defs.length > 0) {
    const hasStructured = defs.some((c: ColumnDef) => BASE_FIELD_TYPES.has(c.type));
    if (hasStructured) return 'base';
  }
  return 'freeform';
}

function readSharedFields(data: any, base: SheetModelBase): void {
  base.isHidden = data.isHidden ?? false;

  if (data.cells) {
    base.cells = new Map(Object.entries(data.cells) as [string, CellData][]);
  }

  if (data.columnWidths) {
    base.columnWidths = new Map(
      Object.entries(data.columnWidths).map(([k, v]) => [Number(k), v as number]),
    );
  }

  if (data.rowHeights) {
    base.rowHeights = new Map(
      Object.entries(data.rowHeights).map(([k, v]) => [Number(k), v as number]),
    );
  }

  if (Array.isArray(data.conditionalFormats)) {
    base.conditionalFormats = data.conditionalFormats;
  }

  if (Array.isArray(data.validations)) {
    base.validations = data.validations;
  }

  if (data.defaultStyle) {
    base.defaultStyle = data.defaultStyle;
  }

  if (Array.isArray(data.charts)) {
    base.charts = data.charts;
  }
}

/** 从持久化 JSON 恢复完整 SheetModel（含 variant 判定） */
export function hydrateSheetFromJSON(data: any): SheetModel {
  const variant = resolvePersistedSheetVariant(data);
  const sheet = createSheetModel(variant, {
    sheetId: data.sheetId,
    name: data.name,
    rowCount: data.rowCount,
    colCount: data.colCount,
  });

  readSharedFields(data, sheet);

  if (isBaseSheet(sheet)) {
    if (Array.isArray(data.columnDefs) && data.columnDefs.length > 0) {
      sheet.columnDefs = data.columnDefs;
    }
    if (Array.isArray(data.rows)) {
      sheet.rows = data.rows;
    }
    if (Array.isArray(data.views)) {
      sheet.views = data.views;
    }
    if (data.activeViewId) {
      sheet.activeViewId = data.activeViewId;
    }
    if (typeof data.defaultRowHeight === 'number') {
      sheet.defaultRowHeight = data.defaultRowHeight;
    } else {
      const heights = Object.values(data.rowHeights || {}) as number[];
      sheet.defaultRowHeight = heights.length > 0 ? heights[0] : DEFAULT_BASE_ROW_HEIGHT;
    }
    sheet.freezeState = data.freezeState ?? { frozenRows: 0, frozenCols: 1 };
  } else {
    if (data.mergeRanges) {
      sheet.mergeRanges = data.mergeRanges.map((v: any) => ({
        sheetId: v.sheetId,
        start: v.start,
        end: v.end,
        master: v.master,
      }));
    }
    if (data.freezeState) {
      sheet.freezeState = data.freezeState;
    }
    if (Array.isArray(data.columnFilters)) {
      sheet.columnFilters = data.columnFilters;
    }
    if (typeof data.columnFilterEnabled === 'boolean') {
      sheet.columnFilterEnabled = data.columnFilterEnabled;
    }
    if (Array.isArray(data.columnFilterCols)) {
      sheet.columnFilterCols = data.columnFilterCols;
    } else if (sheet.columnFilterEnabled && Array.isArray(data.columnFilters)) {
      const cols: number[] = data.columnFilters
        .filter((f: { col?: number }) => typeof f.col === 'number')
        .map((f: { col: number }) => f.col);
      sheet.columnFilterCols = Array.from(new Set(cols)).sort((a, b) => a - b);
    }
  }

  return sheet;
}

export function promoteFreeformToBase(
  sheet: FreeformSheetModel,
  columnDefs: ColumnDef[],
  rows: import('@lingyi-doc/core-types').RecordRow[] = [],
): BaseSheetModel {
  const { mergeRanges: _mergeRanges, columnFilters, columnFilterEnabled, columnFilterCols, ...shared } = sheet;
  void _mergeRanges;
  return {
    ...shared,
    type: 'base',
    columnDefs,
    rows,
    defaultRowHeight: DEFAULT_BASE_ROW_HEIGHT,
    freezeState: { frozenRows: 0, frozenCols: 1 },
  };
}

export { BASE_FIELD_TYPES };
