import { FreeTable } from '../model/index';
import type { BaseView } from '../types/index';
import type { BaseBlock, BaseEmbedViewType } from './types';
import { genBlockId } from './utils';

const VIEW_LABELS: Record<BaseEmbedViewType, string> = {
  grid: '表格',
  kanban: '看板',
  gantt: '甘特图',
  gallery: '画册',
};

function defaultBaseViews(): BaseView[] {
  return [
    { viewId: 'view_grid', viewName: '表格', viewType: 'grid', config: { rowHeight: 40 } },
    {
      viewId: 'view_kanban',
      viewName: '看板',
      viewType: 'kanban',
      config: { kanbanGroupFieldId: 'col_select', rowHeight: 40 },
    },
    {
      viewId: 'view_gantt',
      viewName: '甘特图',
      viewType: 'gantt',
      config: {
        ganttStartDateFieldId: 'col_date',
        ganttTaskNameFieldId: 'col_text',
        ganttTimeUnit: 'week',
        rowHeight: 40,
      },
    },
    {
      viewId: 'view_gallery',
      viewName: '画册',
      viewType: 'gallery',
      config: { galleryCoverFieldId: 'col_text', rowHeight: 40 },
    },
  ];
}

/** 创建文档内嵌多维表格块 */
export function createEmptyBaseBlock(initialView: BaseEmbedViewType = 'grid'): BaseBlock {
  const table = new FreeTable({
    sheetId: `base_embed_${genBlockId()}`,
    name: '表格',
    type: 'base',
    rowCount: 3,
    colCount: 4,
  });

  table.sheet.columnDefs = [
    { id: 'col_text', name: '文本', type: 'text', width: 180, required: true },
    { id: 'col_text2', name: '文本 2', type: 'text', width: 160 },
    {
      id: 'col_select',
      name: '单选',
      type: 'select',
      width: 120,
      options: [
        { id: 'opt1', name: '选项1', color: '#7c6cff' },
        { id: 'opt2', name: '选项2', color: '#ff9f43' },
      ],
    },
    { id: 'col_date', name: '日期', type: 'date', width: 120 },
  ];
  table.sheet.colCount = 4;
  table.syncColumnLayout();

  const views = defaultBaseViews();
  table.sheet.views = views;
  const active = views.find(v => v.viewType === initialView) ?? views[0];
  table.sheet.activeViewId = active.viewId;

  return {
    type: 'base',
    id: genBlockId(),
    title: VIEW_LABELS[initialView] ?? '表格',
    activeViewType: initialView,
    sheetData: table.toJSON() as Record<string, unknown>,
  };
}

export function baseBlockViewLabel(view: BaseEmbedViewType): string {
  return VIEW_LABELS[view];
}
