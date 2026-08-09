import { Workbook, type FreeTable } from '@lingyi-doc/core';

type Sheet = FreeTable;

function styledCell(
  sheet: Sheet,
  row: number,
  col: number,
  text: string,
  style?: { bg?: string; bold?: boolean; color?: string; align?: 'left' | 'center' | 'right' },
) {
  sheet.setCell(row, col, text);
  if (style) {
    sheet.setCellStyle(row, col, {
      backgroundColor: style.bg,
      bold: style.bold,
      fontColor: style.color,
      horizontalAlign: style.align,
    });
  }
}

function headerRow(sheet: Sheet, row: number, headers: string[], bg = '#E8EAED') {
  headers.forEach((h, c) => styledCell(sheet, row, c, h, { bg, bold: true }));
}

function mergeRange(sheet: Sheet, startRow: number, startCol: number, endRow: number, endCol: number) {
  sheet.mergeCells({
    sheetId: sheet.sheetId,
    start: { row: startRow, col: startCol },
    end: { row: endRow, col: endCol },
  });
}

function addSheet(wb: Workbook, name: string): Sheet {
  const id = wb.addSheet(name, 'freeform');
  return wb.getSheet(id)!;
}

/** 任务跟踪表 */
export function taskTrackerWorkbook(): Workbook {
  const wb = Workbook.create();
  wb.renameSheet(wb.activeSheetId, '任务跟踪表');
  const sheet = wb.activeSheet!;
  headerRow(sheet, 0, ['任务', '负责人', '状态', '截止日期']);
  styledCell(sheet, 1, 0, '示例任务');
  styledCell(sheet, 1, 1, '@张三');
  styledCell(sheet, 1, 2, '进行中', { bg: '#E6F4EA', color: '#137333' });
  styledCell(sheet, 1, 3, '2026-03-01');
  return wb;
}

/** 项目甘特图 Pro */
export function ganttWorkbook(): Workbook {
  const wb = Workbook.create();
  wb.renameSheet(wb.activeSheetId, '项目管理');
  const pm = wb.activeSheet!;
  styledCell(pm, 0, 0, 'ABC项目', { bold: true });
  styledCell(pm, 1, 0, '开始日期'); styledCell(pm, 1, 1, '2026-01-06');
  styledCell(pm, 2, 0, '项目负责人'); styledCell(pm, 2, 1, '@黄泡泡');
  headerRow(pm, 4, ['任务名称', '描述', '跟进人', '开始日期', '结束日期', '工期', '完成度']);
  const tasks = [
    ['1 需求分析', '梳理业务需求', '@李四', '2026-01-06', '2026-01-17', '10', '100%'],
    ['1.1 用户调研', '', '@王五', '2026-01-06', '2026-01-10', '5', '100%'],
    ['1.2 竞品分析', '', '@赵六', '2026-01-11', '2026-01-17', '5', '80%'],
    ['2 方案设计', '输出 PRD 与原型', '@李四', '2026-01-20', '2026-02-07', '15', '40%'],
  ];
  tasks.forEach((row, i) => row.forEach((v, c) => styledCell(pm, 5 + i, c, v)));

  const gantt = addSheet(wb, '项目甘特图');
  headerRow(gantt, 0, ['任务', 'W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'], '#D2E3FC');
  const bars = [
    { task: '需求分析', start: 1, len: 2, color: '#4285F4' },
    { task: '方案设计', start: 3, len: 3, color: '#4285F4' },
    { task: '开发实现', start: 5, len: 4, color: '#AECBFA' },
  ];
  bars.forEach((b, i) => {
    styledCell(gantt, 1 + i, 0, b.task);
    for (let w = 0; w < 8; w++) {
      const inBar = w >= b.start && w < b.start + b.len;
      styledCell(gantt, 1 + i, 1 + w, inBar ? '█' : '', inBar ? { bg: b.color, color: '#fff', align: 'center' } : undefined);
    }
  });

  addSheet(wb, '项目进展分析');
  addSheet(wb, '【必读】使用指南');
  addSheet(wb, '节假日一览表');
  wb.switchSheet(wb.sheets[0].id);
  return wb;
}

/** 部门 OKR 与周报 */
export function okrWeeklyWorkbook(): Workbook {
  const wb = Workbook.create();
  wb.renameSheet(wb.activeSheetId, '部门OKR');
  const sheet = wb.activeSheet!;
  mergeRange(sheet, 0, 0, 0, 4);
  styledCell(sheet, 0, 0, '部门 OKR 与进度管理', { bg: '#4285F4', bold: true, color: '#fff', align: 'center' });
  headerRow(sheet, 2, ['关键目标 (O)', '关键结果 (KR)', '负责人', '完成进度', '本周周报'], '#E8F0FE');
  const rows = [
    ['O1：提升产品体验', 'KR1：填写关键结果1', '@相关同学', '10%', '本周进展…'],
    ['', 'KR2：填写关键结果2', '@相关同学', '70%', ''],
    ['O2：扩大市场份额', 'KR1：填写关键结果1', '@相关同学', '60%', ''],
  ];
  rows.forEach((row, i) => {
    row.forEach((v, c) => {
      styledCell(sheet, 3 + i, c, v);
      if (c === 3 && v.includes('%')) {
        const pct = parseInt(v, 10) || 0;
        styledCell(sheet, 3 + i, c, v, { bg: pct >= 60 ? '#E6F4EA' : '#FEF7E0', color: pct >= 60 ? '#137333' : '#E37400' });
      }
    });
  });

  addSheet(wb, 'OKR进度看板');
  addSheet(wb, '全年目标管理');
  wb.switchSheet(wb.sheets[0].id);
  return wb;
}

/** 待办事项清单（表格版） */
export function todoSpreadsheetWorkbook(): Workbook {
  const wb = Workbook.create();
  wb.renameSheet(wb.activeSheetId, '待办事项清单');
  const sheet = wb.activeSheet!;
  mergeRange(sheet, 0, 0, 0, 7);
  styledCell(sheet, 0, 0, '待办事项清单', { bold: true, align: 'center' });
  mergeRange(sheet, 1, 0, 1, 7);
  styledCell(sheet, 1, 0, '分级罗列待办，从容完成任务', { bg: '#FEF7E0', color: '#5F6368' });
  headerRow(sheet, 2, ['', '任务名称', '状态', '优先级', '工作/生活', '进度', '截止日期', '备注'], '#FCE8E6');
  const items = [
    ['☑', '完成产品方案评审', '已完成', 'P0', '工作', '100%', '2026-01-15', ''],
    ['☐', '整理 Q1 路线图', '进行中', 'P1', '工作', '60%', '2026-01-20', ''],
    ['☐', '预约体检', '未开始', 'P2', '生活', '0%', '2026-02-01', ''],
  ];
  items.forEach((row, i) => {
    row.forEach((v, c) => {
      styledCell(sheet, 3 + i, c, v);
      if (c === 3) {
        const color = v === 'P0' ? '#1967D2' : v === 'P1' ? '#E37400' : '#5F6368';
        const bg = v === 'P0' ? '#E8F0FE' : v === 'P1' ? '#FEF7E0' : '#F1F3F4';
        styledCell(sheet, 3 + i, c, v, { bg, color, align: 'center' });
      }
      if (c === 4) {
        const bg = v === '工作' ? '#FCE8E6' : '#E6F4EA';
        styledCell(sheet, 3 + i, c, v, { bg, align: 'center' });
      }
    });
  });

  addSheet(wb, '待办事项-优先级');
  wb.switchSheet(wb.sheets[0].id);
  return wb;
}

/** 2026 年月度工作日历 */
export function calendar2026Workbook(): Workbook {
  const wb = Workbook.create();
  wb.renameSheet(wb.activeSheetId, '2026工作日历');
  const sheet = wb.activeSheet!;
  mergeRange(sheet, 0, 0, 0, 6);
  styledCell(sheet, 0, 0, '2026 年月度工作日历', { bg: '#4285F4', bold: true, color: '#fff', align: 'center' });
  headerRow(sheet, 2, ['周一', '周二', '周三', '周四', '周五', '周六', '周日'], '#E8F0FE');
  let day = 1;
  for (let r = 3; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      if ((r === 3 && c < 2) || day > 31) continue;
      styledCell(sheet, r, c, String(day), c >= 5 ? { bg: '#F8F9FA', color: '#80868B' } : undefined);
      day++;
    }
  }
  return wb;
}

/** 任务跟进看板 */
export function kanbanTrackerWorkbook(): Workbook {
  const wb = Workbook.create();
  wb.renameSheet(wb.activeSheetId, '任务跟进看板');
  const sheet = wb.activeSheet!;
  headerRow(sheet, 0, ['任务', '状态', '优先级', '负责人', '截止日期'], '#E6F4EA');
  const rows = [
    ['登录流程优化', '进行中', 'P0', '@张三', '2026-01-20'],
    ['数据报表导出', '待开始', 'P1', '@李四', '2026-01-25'],
    ['移动端适配', '进行中', 'P0', '@王五', '2026-02-01'],
  ];
  rows.forEach((row, i) => {
    row.forEach((v, c) => {
      styledCell(sheet, 1 + i, c, v);
      if (c === 1) {
        const bg = v === '进行中' ? '#E8F0FE' : '#FEF7E0';
        const color = v === '进行中' ? '#1967D2' : '#E37400';
        styledCell(sheet, 1 + i, c, v, { bg, color, align: 'center' });
      }
      if (c === 2) {
        styledCell(sheet, 1 + i, c, v, { bg: v === 'P0' ? '#FCE8E6' : '#FEF7E0', color: v === 'P0' ? '#C5221F' : '#E37400', align: 'center' });
      }
    });
  });
  return wb;
}

/** 版本排期 */
export function versionScheduleWorkbook(): Workbook {
  const wb = Workbook.create();
  wb.renameSheet(wb.activeSheetId, '版本排期');
  const sheet = wb.activeSheet!;
  headerRow(sheet, 0, ['功能模块', '优先级', '负责人', '计划版本', '状态', '备注'], '#F3E8FD');
  const rows = [
    ['用户权限重构', 'P0', '@张三', 'v2.1', '开发中', ''],
    ['导出 PDF', 'P1', '@李四', 'v2.2', '设计中', ''],
    ['性能优化', 'P0', '@王五', 'v2.1', '测试中', ''],
  ];
  rows.forEach((row, i) => row.forEach((v, c) => styledCell(sheet, 1 + i, c, v)));
  return wb;
}

export function blankFreeformWorkbook(sheetTitle = '普通表格'): Workbook {
  const wb = Workbook.create();
  wb.renameSheet(wb.activeSheetId, sheetTitle);
  return wb;
}

export function blankBaseWorkbook(sheetTitle = '多维表格'): Workbook {
  const wb = Workbook.create();
  const defaultId = wb.activeSheetId;
  const newId = wb.addSheet(sheetTitle, 'base');
  wb.removeSheet(defaultId);
  wb.switchSheet(newId);
  return wb;
}
