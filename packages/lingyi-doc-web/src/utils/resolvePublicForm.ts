import { Workbook, isBaseSheet, type BaseView, type FreeTable } from '@lingyi-doc/core';

export interface ResolvedPublicForm {
  table: FreeTable;
  formView: BaseView;
}

export function resolvePublicFormFromWorkbook(
  data: unknown,
  sheetId: string,
  viewId: string,
): ResolvedPublicForm {
  const wb = Workbook.fromJSON(data);
  wb.normalizeAfterLoad('base');

  if (!wb.getSheet(sheetId)) {
    throw new Error('表单不存在或链接无效');
  }
  wb.switchSheet(sheetId);

  const table = wb.activeSheet;
  if (!table || !isBaseSheet(table.sheet)) {
    throw new Error('不是有效的表单文档');
  }

  const sheet = table.sheet;
  const formView = sheet.views?.find(v => v.viewId === viewId && v.viewType === 'form')
    ?? sheet.views?.find(v => v.viewType === 'form');
  if (!formView) {
    throw new Error('表单视图不存在');
  }
  if (!formView.config.formShareEnabled) {
    throw new Error('表单分享未开启');
  }

  return { table, formView };
}
