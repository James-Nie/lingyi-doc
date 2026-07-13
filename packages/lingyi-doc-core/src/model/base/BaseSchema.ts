import type { ColumnDef } from '../../types/index';
import { DEFAULT_BASE_ROW_HEIGHT } from '../../types/index';
import type { BaseSheetModel } from '../../types/index';
import { ensureSheetRows } from '../../utils/rowTree';

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

/** 应用多维表默认结构（resetRows=true 时按 sheet.rowCount 初始化行，未指定或过大时用 10 行） */
export function applyDefaultBaseSchema(
  sheet: BaseSheetModel,
  resetRows: boolean,
  applyRowDefaults: (row: number) => void,
): void {
  const defaultColumns = getDefaultBaseColumns();
  sheet.columnDefs = defaultColumns;
  sheet.colCount = defaultColumns.length;

  for (let i = 0; i < defaultColumns.length; i++) {
    if (!sheet.columnWidths.has(i)) {
      sheet.columnWidths.set(i, defaultColumns[i].width || 120);
    }
  }

  if (resetRows) {
    const configured = sheet.rowCount;
    const targetRows = configured > 0 && configured <= 50 ? configured : 10;
    sheet.rowCount = targetRows;
    sheet.cells.clear();
    sheet.defaultRowHeight = DEFAULT_BASE_ROW_HEIGHT;
    for (let r = 0; r < targetRows; r++) {
      sheet.rowHeights.set(r, DEFAULT_BASE_ROW_HEIGHT);
    }
    for (let r = 0; r < targetRows; r++) {
      applyRowDefaults(r);
    }
    sheet.rows = ensureSheetRows([], targetRows);
  } else if (sheet.defaultRowHeight == null) {
    sheet.defaultRowHeight = DEFAULT_BASE_ROW_HEIGHT;
  }

  if (!sheet.views?.length) {
    sheet.views = [
      {
        viewId: 'view_grid_default',
        viewName: '表格',
        viewType: 'grid',
        config: {},
      },
    ];
    sheet.activeViewId = 'view_grid_default';
  }

  sheet.freezeState = { frozenRows: 0, frozenCols: 1 };
}
