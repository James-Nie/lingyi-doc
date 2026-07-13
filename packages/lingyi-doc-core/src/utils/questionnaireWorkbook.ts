import { Workbook } from '../model/Workbook';
import type { BaseSheetModel, BaseView, ColumnDef } from '../types/index';
import { isBaseSheet } from '../types/sheetGuards';

export interface CreateQuestionnaireWorkbookOptions {
  sheetTitle?: string;
  formTitle?: string;
  /** 预置首题字段名，默认「您的姓名」 */
  initialFieldName?: string;
}

/** 创建问卷工作簿：多维表 + 默认表单视图（docType 仍为 base） */
export function createQuestionnaireWorkbook(options: CreateQuestionnaireWorkbookOptions = {}): Workbook {
  const {
    sheetTitle = '问卷',
    formTitle = '未命名问卷',
    initialFieldName = '您的姓名',
  } = options;

  const wb = Workbook.create();
  const defaultId = wb.activeSheetId;
  const newId = wb.addSheet(sheetTitle, 'base');
  wb.removeSheet(defaultId);
  wb.switchSheet(newId);

  const table = wb.activeSheet;
  if (!table || !isBaseSheet(table.sheet)) return wb;

  const sheet = table.sheet as BaseSheetModel;
  // addSheet('base') 会写入 4 列默认 schema，问卷只需自定义的首题字段
  sheet.cells.clear();
  sheet.columnWidths.clear();

  const colId = `col_${Date.now()}`;
  const columnDef: ColumnDef = {
    id: colId,
    name: initialFieldName,
    type: 'text',
    required: true,
    width: 200,
  };
  sheet.columnDefs = [columnDef];
  table.setColumnWidth(0, 200);
  table.ensureRowRecords();
  table.syncColumnLayout();

  const ts = Date.now();
  const gridViewId = `view_grid_${ts}`;
  const formViewId = `view_form_${ts + 1}`;

  const formFieldItem = {
    fieldId: colId,
    question: initialFieldName,
    description: '',
    required: true,
    conditionalVisible: false,
  };

  const views: BaseView[] = [
    { viewId: gridViewId, viewName: '表格', viewType: 'grid', config: {} },
    {
      viewId: formViewId,
      viewName: '问卷',
      viewType: 'form',
      config: {
        formTitle,
        formDescription: '',
        formFields: [colId],
        formFieldItems: [formFieldItem],
        formExcludedFieldIds: [],
      },
    },
  ];

  sheet.views = views;
  sheet.activeViewId = formViewId;

  return wb;
}
