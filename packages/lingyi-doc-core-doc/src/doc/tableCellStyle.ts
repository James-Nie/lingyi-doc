import type { TableCellStyle } from './types';

export interface TableCellTypography {
  fontSize: number;
  fontWeight: number;
  fontFamily?: string;
  lineHeight: number;
  paddingLeft?: number;
  background?: string;
}

const PRESETS: Record<TableCellStyle, TableCellTypography> = {
  paragraph: { fontSize: 14, fontWeight: 400, lineHeight: 1.6 },
  heading1: { fontSize: 22, fontWeight: 700, lineHeight: 1.4 },
  heading2: { fontSize: 18, fontWeight: 700, lineHeight: 1.4 },
  heading3: { fontSize: 16, fontWeight: 600, lineHeight: 1.5 },
  heading4: { fontSize: 15, fontWeight: 600, lineHeight: 1.5 },
  heading5: { fontSize: 14, fontWeight: 600, lineHeight: 1.5 },
  heading6: { fontSize: 13, fontWeight: 600, lineHeight: 1.5 },
  orderedList: { fontSize: 14, fontWeight: 400, lineHeight: 1.6, paddingLeft: 18 },
  bulletList: { fontSize: 14, fontWeight: 400, lineHeight: 1.6, paddingLeft: 18 },
  task: { fontSize: 14, fontWeight: 400, lineHeight: 1.6, paddingLeft: 18 },
  code: {
    fontSize: 13,
    fontWeight: 400,
    lineHeight: 1.5,
    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
    background: '#F7F8FA',
  },
};

export function getTableCellTypography(style: TableCellStyle = 'paragraph'): TableCellTypography {
  return PRESETS[style] ?? PRESETS.paragraph;
}

export const TABLE_CELL_STYLE_LABELS: Record<TableCellStyle, string> = {
  paragraph: '正文',
  heading1: '一级标题',
  heading2: '二级标题',
  heading3: '三级标题',
  heading4: '四级标题',
  heading5: '五级标题',
  heading6: '六级标题',
  orderedList: '有序列表',
  bulletList: '无序列表',
  task: '任务',
  code: '代码块',
};
