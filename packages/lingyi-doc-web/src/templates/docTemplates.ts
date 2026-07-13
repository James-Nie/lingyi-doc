import type { RichDocumentJSON, MindNoteJSON, WhiteboardJSON, Workbook } from '@lingyi-doc/core';
import {
  createEmptyDocument,
  createEmptyMindNote,
  createEmptyWhiteboard,
  createFlowchartWhiteboard,
  createMindmapBoardWhiteboard,
  createQuestionnaireWorkbook,
  genBlockId,
  genMindNodeId,
} from '@lingyi-doc/core';
import {
  blankBaseWorkbook,
  blankFreeformWorkbook,
  calendar2026Workbook,
  ganttWorkbook,
  kanbanTrackerWorkbook,
  okrWeeklyWorkbook,
  taskTrackerWorkbook,
  todoSpreadsheetWorkbook,
  versionScheduleWorkbook,
} from './sheetTemplates';
import {
  eisenhowerQuadrantMindNoteJson,
  meetingMinutesMindNoteJson,
  projectKickoffMindNoteJson,
  projectPlanningMindNoteJson,
  readingNotesMindNoteJson,
  starMethodMindNoteJson,
  teamStandupMindNoteJson,
  testCaseMindNoteJson,
} from './mindNoteTemplates';

export type TemplateDocType = 'richtext' | 'freeform' | 'base' | 'questionnaire' | 'mindnote' | 'slides' | 'whiteboard' | 'mindmap' | 'flowchart';

export type TemplateCategoryId =
  | 'recommended'
  | 'latest'
  | 'hot'
  | 'project'
  | 'report'
  | 'meeting'
  | 'okr'
  | 'rd'
  | 'product'
  | 'design'
  | 'ops'
  | 'marketing'
  | 'sales'
  | 'hr'
  | 'admin';

export interface DocTemplate {
  id: string;
  title: string;
  subtitle: string;
  docType: TemplateDocType;
  categories: TemplateCategoryId[];
  usageLabel?: string;
  isNew?: boolean;
  thumbGradient: string;
  /** 创建时使用的文档标题 */
  documentTitle: string;
  /** 富文本文档内容（预览与创建共用） */
  richDocument?: RichDocumentJSON;
  /** 表格/多维表格初始数据（预览与创建共用） */
  buildWorkbook?: () => Workbook;
  /** 思维笔记初始数据（预览与创建共用） */
  mindNoteJson?: MindNoteJSON;
  /** 画板初始数据（预览与创建共用） */
  whiteboardJson?: WhiteboardJSON;
  isBlank?: boolean;
}

export const TEMPLATE_CATEGORIES: { id: TemplateCategoryId; label: string; badge?: string }[] = [
  { id: 'recommended', label: '推荐' },
  { id: 'latest', label: '最新', badge: 'NEW' },
  { id: 'hot', label: '热门模板' },
  { id: 'project', label: '项目管理' },
  { id: 'report', label: '周报日报' },
  { id: 'meeting', label: '会议' },
  { id: 'okr', label: 'OKR' },
  { id: 'rd', label: '研发' },
  { id: 'product', label: '产品' },
  { id: 'design', label: '设计' },
  { id: 'ops', label: '运营' },
  { id: 'marketing', label: '市场' },
  { id: 'sales', label: '销售' },
  { id: 'hr', label: '人事' },
  { id: 'admin', label: '行政' },
];

export const TEMPLATE_TYPE_OPTIONS: { id: 'all' | TemplateDocType; label: string }[] = [
  { id: 'all', label: '所有类型' },
  { id: 'richtext', label: '文档' },
  { id: 'freeform', label: '表格' },
  { id: 'slides', label: '幻灯片' },
  { id: 'base', label: '多维表格' },
  { id: 'questionnaire', label: '问卷' },
  { id: 'mindnote', label: '思维笔记' },
  { id: 'whiteboard', label: '画板' },
  { id: 'mindmap', label: '思维导图' },
  { id: 'flowchart', label: '流程图' },
];

function meetingDocJson(): RichDocumentJSON {
  return {
    documentId: '',
    title: '会议记录（简洁版）',
    content: [
      { type: 'heading', id: genBlockId(), level: 1, text: '会议记录（简洁版）', marks: [], align: 'left' },
      { type: 'paragraph', id: genBlockId(), text: '会议主题：', marks: [{ type: 'bold', start: 0, end: 5 }], align: 'left' },
      { type: 'paragraph', id: genBlockId(), text: '参会人：输入 @ + 人名提及参会人', marks: [], align: 'left' },
      { type: 'paragraph', id: genBlockId(), text: '会前必读：输入 @ 插入背景资料', marks: [], align: 'left' },
      { type: 'heading', id: genBlockId(), level: 2, text: '议程 1', marks: [], align: 'left' },
      { type: 'paragraph', id: genBlockId(), text: '讨论要点：', marks: [{ type: 'bold', start: 0, end: 5 }], align: 'left' },
      {
        type: 'list', id: genBlockId(), listType: 'bullet',
        items: [{ text: '记录关键结论', level: 1, marks: [] }, { text: '标注风险与依赖', level: 1, marks: [] }],
      },
      { type: 'heading', id: genBlockId(), level: 2, text: '待办管理', marks: [], align: 'left' },
      {
        type: 'list', id: genBlockId(), listType: 'task',
        items: [
          { text: '后续安排事项一', level: 1, checked: false, marks: [] },
          { text: '后续安排事项二', level: 1, checked: false, marks: [] },
        ],
      },
    ],
  };
}

function weeklyReportJson(): RichDocumentJSON {
  return {
    documentId: '',
    title: '业务经营周报',
    content: [
      { type: 'heading', id: genBlockId(), level: 1, text: '业务经营周报', marks: [], align: 'center' },
      { type: 'paragraph', id: genBlockId(), text: '汇报周期：____年__月__日 - __月__日', marks: [], align: 'left', firstLineIndent: true },
      { type: 'heading', id: genBlockId(), level: 2, text: '一、本周核心进展', marks: [], align: 'left' },
      { type: 'paragraph', id: genBlockId(), text: '填写本周最重要的 3 项成果…', marks: [], align: 'left', firstLineIndent: true },
      { type: 'heading', id: genBlockId(), level: 2, text: '二、数据概览', marks: [], align: 'left' },
      { type: 'paragraph', id: genBlockId(), text: '关键指标与环比变化…', marks: [], align: 'left', firstLineIndent: true },
      { type: 'heading', id: genBlockId(), level: 2, text: '三、下周计划', marks: [], align: 'left' },
      { type: 'paragraph', id: genBlockId(), text: '列出下周优先级与负责人…', marks: [], align: 'left', firstLineIndent: true },
    ],
  };
}

function projectPlanJson(): RichDocumentJSON {
  return {
    documentId: '',
    title: '长期项目方案与执行（含里程碑看板）',
    content: [
      { type: 'heading', id: genBlockId(), level: 1, text: '长期项目方案与执行（含里程碑看板）', marks: [], align: 'left' },
      { type: 'heading', id: genBlockId(), level: 2, text: '一、项目介绍', marks: [], align: 'left' },
      { type: 'paragraph', id: genBlockId(), text: '此模板适用于规划以季度、年度为时间维度的中长期项目。', marks: [], align: 'left', firstLineIndent: true },
      { type: 'heading', id: genBlockId(), level: 3, text: '项目背景', marks: [], align: 'left' },
      { type: 'paragraph', id: genBlockId(), text: '描述项目缘起与业务目标…', marks: [], align: 'left', firstLineIndent: true },
      { type: 'heading', id: genBlockId(), level: 2, text: '二、项目目标', marks: [], align: 'left' },
      {
        type: 'list', id: genBlockId(), listType: 'ordered',
        items: [
          { text: '目标一：', level: 1, marks: [] },
          { text: '目标二：', level: 1, marks: [] },
        ],
      },
    ],
  };
}

function todoListJson(): RichDocumentJSON {
  return {
    documentId: '',
    title: '待办清单',
    content: [
      { type: 'heading', id: genBlockId(), level: 1, text: '待办清单', marks: [], align: 'left' },
      {
        type: 'list', id: genBlockId(), listType: 'task',
        items: [
          { text: '今日必做事项', level: 1, checked: false, marks: [] },
          { text: '本周跟进事项', level: 1, checked: false, marks: [] },
          { text: '等待他人反馈', level: 1, checked: false, marks: [] },
        ],
      },
    ],
  };
}

function projectMindNoteJson(): MindNoteJSON {
  const json = createEmptyMindNote('', '项目脑图');
  json.root.text = '项目名称';
  json.root.children = [
    { id: genMindNodeId(), text: '目标', children: [] },
    { id: genMindNodeId(), text: '里程碑', children: [] },
    { id: genMindNodeId(), text: '风险', children: [] },
    { id: genMindNodeId(), text: '资源', children: [] },
  ];
  return json;
}

function blankQuestionnaireTemplate(): DocTemplate {
  return {
    id: 'blank-questionnaire',
    title: '新建空白问卷',
    subtitle: '从空白开始收集反馈',
    docType: 'questionnaire',
    categories: ['recommended', 'latest'],
    thumbGradient: 'linear-gradient(135deg, #fef9e6 0%, #ffe082 100%)',
    documentTitle: '未命名问卷',
    isBlank: true,
    buildWorkbook: () => createQuestionnaireWorkbook({ sheetTitle: '问卷', formTitle: '未命名问卷' }),
  };
}

function blankTemplate(docType: TemplateDocType, title: string, gradient: string): DocTemplate {
  return {
    id: `blank-${docType}`,
    title: docType === 'richtext' ? '新建空白文档' : `新建空白${TEMPLATE_TYPE_OPTIONS.find(t => t.id === docType)?.label ?? ''}`,
    subtitle: '从空白开始创作',
    docType,
    categories: ['recommended', 'latest'],
    thumbGradient: gradient,
    documentTitle: title,
    isBlank: true,
    richDocument: docType === 'richtext' ? createEmptyDocument('', title) : undefined,
    buildWorkbook: docType === 'freeform'
      ? () => blankFreeformWorkbook('普通表格')
      : docType === 'base'
        ? () => blankBaseWorkbook('多维表格')
        : undefined,
    mindNoteJson: docType === 'mindnote' ? createEmptyMindNote('', title) : undefined,
    whiteboardJson: docType === 'whiteboard'
      ? createEmptyWhiteboard('', title)
      : docType === 'mindmap'
        ? createMindmapBoardWhiteboard(title)
        : docType === 'flowchart'
          ? createFlowchartWhiteboard(title)
          : undefined,
  };
}

export const DOC_TEMPLATES: DocTemplate[] = [
  blankTemplate('richtext', '未命名文档', 'linear-gradient(135deg, #e8f0fe 0%, #f5f8ff 100%)'),
  {
    id: 'weekly-report',
    title: '业务经营周报',
    subtitle: '周报经营复盘与数据概览',
    docType: 'richtext',
    categories: ['recommended', 'hot', 'report'],
    usageLabel: '39.9 万人已使用',
    thumbGradient: 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)',
    documentTitle: '业务经营周报',
    richDocument: weeklyReportJson(),
  },
  {
    id: 'meeting-notes',
    title: '会议记录（简洁版）',
    subtitle: '会议随手记，清晰记录待办',
    docType: 'richtext',
    categories: ['recommended', 'hot', 'meeting'],
    usageLabel: '28.6 万人已使用',
    isNew: true,
    thumbGradient: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
    documentTitle: '会议记录（简洁版）',
    richDocument: meetingDocJson(),
  },
  {
    id: 'project-milestone',
    title: '长期项目方案与执行（含里程碑看板）',
    subtitle: '项目文档加看板，迈向每个里程碑',
    docType: 'richtext',
    categories: ['recommended', 'project', 'rd'],
    usageLabel: '12.3 万人已使用',
    thumbGradient: 'linear-gradient(135deg, #fce4ec 0%, #f8bbd0 100%)',
    documentTitle: '长期项目方案与执行（含里程碑看板）',
    richDocument: projectPlanJson(),
  },
  {
    id: 'todo-list',
    title: '待办清单',
    subtitle: '个人/团队待办快速管理',
    docType: 'richtext',
    categories: ['recommended', 'latest', 'ops'],
    usageLabel: '8.1 万人已使用',
    thumbGradient: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)',
    documentTitle: '待办清单',
    richDocument: todoListJson(),
  },
  blankTemplate('freeform', '未命名普通表格', 'linear-gradient(135deg, #e6f4ea 0%, #c8e6c9 100%)'),
  {
    id: 'sheet-gantt-pro',
    title: '项目甘特图 Pro',
    subtitle: '多 sheet 项目管理与甘特排期',
    docType: 'freeform',
    categories: ['recommended', 'project', 'hot'],
    usageLabel: '41 万人已使用',
    thumbGradient: 'linear-gradient(135deg, #e8f0fe 0%, #d2e3fc 100%)',
    documentTitle: '项目甘特图 Pro',
    buildWorkbook: ganttWorkbook,
  },
  {
    id: 'sheet-calendar-2026',
    title: '2026 年月度工作日历',
    subtitle: '全年工作日历与排期规划',
    docType: 'freeform',
    categories: ['recommended', 'latest', 'report'],
    usageLabel: '22.5 万人已使用',
    thumbGradient: 'linear-gradient(135deg, #fef7e0 0%, #fde293 100%)',
    documentTitle: '2026 年月度工作日历',
    buildWorkbook: calendar2026Workbook,
  },
  {
    id: 'sheet-okr-weekly',
    title: '部门 OKR 与周报',
    subtitle: '使用 OKR，进行战略制定和策略分解',
    docType: 'freeform',
    categories: ['recommended', 'okr', 'report'],
    usageLabel: '35.8 万人已使用',
    thumbGradient: 'linear-gradient(135deg, #e8f0fe 0%, #c5cae9 100%)',
    documentTitle: '部门 OKR 与周报',
    buildWorkbook: okrWeeklyWorkbook,
  },
  {
    id: 'sheet-kanban-tracker',
    title: '任务跟进看板',
    subtitle: '按状态分组跟进任务进度',
    docType: 'freeform',
    categories: ['recommended', 'project', 'ops'],
    usageLabel: '18.6 万人已使用',
    thumbGradient: 'linear-gradient(135deg, #e6f4ea 0%, #b7dfba 100%)',
    documentTitle: '任务跟进看板',
    buildWorkbook: kanbanTrackerWorkbook,
  },
  {
    id: 'sheet-todo-spreadsheet',
    title: '待办事项清单',
    subtitle: '分级罗列待办，从容完成任务',
    docType: 'freeform',
    categories: ['recommended', 'hot', 'ops'],
    usageLabel: '29.3 万人已使用',
    isNew: true,
    thumbGradient: 'linear-gradient(135deg, #fce8e6 0%, #f8bbd0 100%)',
    documentTitle: '待办事项清单',
    buildWorkbook: todoSpreadsheetWorkbook,
  },
  {
    id: 'sheet-version-schedule',
    title: '版本排期',
    subtitle: '功能模块版本规划与进度跟踪',
    docType: 'freeform',
    categories: ['recommended', 'rd', 'project'],
    usageLabel: '11.2 万人已使用',
    thumbGradient: 'linear-gradient(135deg, #f3e8fd 0%, #e1bee7 100%)',
    documentTitle: '版本排期',
    buildWorkbook: versionScheduleWorkbook,
  },
  {
    id: 'sheet-task-tracker',
    title: '任务跟踪表',
    subtitle: '表格化任务进度管理',
    docType: 'freeform',
    categories: ['recommended', 'project', 'hot'],
    usageLabel: '15.2 万人已使用',
    thumbGradient: 'linear-gradient(135deg, #e8f5e9 0%, #a5d6a7 100%)',
    documentTitle: '任务跟踪表',
    buildWorkbook: taskTrackerWorkbook,
  },
  blankTemplate('base', '未命名多维表格', 'linear-gradient(135deg, #f3e8fd 0%, #e1bee7 100%)'),
  blankQuestionnaireTemplate(),
  {
    id: 'base-crm',
    title: '客户信息管理',
    subtitle: '多维表格 CRM 模板',
    docType: 'base',
    categories: ['recommended', 'sales', 'hot'],
    usageLabel: '6.8 万人已使用',
    thumbGradient: 'linear-gradient(135deg, #ede7f6 0%, #d1c4e9 100%)',
    documentTitle: '客户信息管理',
    buildWorkbook: () => blankBaseWorkbook('客户信息管理'),
  },
  blankTemplate('mindnote', '未命名思维笔记', 'linear-gradient(135deg, #e0f7fa 0%, #b2ebf2 100%)'),
  blankTemplate('whiteboard', '未命名画板', 'linear-gradient(135deg, #e6f4ea 0%, #c8e6c9 100%)'),
  blankTemplate('mindmap', '未命名思维导图', 'linear-gradient(135deg, #e8f0fe 0%, #d2e3fc 100%)'),
  blankTemplate('flowchart', '未命名流程图', 'linear-gradient(135deg, #fef3e6 0%, #ffe0b2 100%)'),
  {
    id: 'mindnote-project',
    title: '项目脑图',
    subtitle: '快速梳理项目结构',
    docType: 'mindnote',
    categories: ['recommended', 'project', 'rd'],
    usageLabel: '4.5 万人已使用',
    thumbGradient: 'linear-gradient(135deg, #e0f7fa 0%, #80deea 100%)',
    documentTitle: '项目脑图',
    mindNoteJson: projectMindNoteJson(),
  },
  {
    id: 'mindnote-meeting-minutes',
    title: '会议纪要',
    subtitle: '会前有准备，会后有追踪',
    docType: 'mindnote',
    categories: ['recommended', 'hot', 'meeting'],
    usageLabel: '12.8 万人已使用',
    isNew: true,
    thumbGradient: 'linear-gradient(135deg, #e3f2fd 0%, #90caf9 100%)',
    documentTitle: '会议纪要',
    mindNoteJson: meetingMinutesMindNoteJson(),
  },
  {
    id: 'mindnote-project-planning',
    title: '项目规划',
    subtitle: '拆解项目，明晰分工',
    docType: 'mindnote',
    categories: ['recommended', 'project', 'product'],
    usageLabel: '9.6 万人已使用',
    isNew: true,
    thumbGradient: 'linear-gradient(135deg, #fce4ec 0%, #f48fb1 100%)',
    documentTitle: '项目规划',
    mindNoteJson: projectPlanningMindNoteJson(),
  },
  {
    id: 'mindnote-project-kickoff',
    title: '项目 kick off 宣讲',
    subtitle: '明确目标、计划与角色分工',
    docType: 'mindnote',
    categories: ['recommended', 'project', 'meeting'],
    usageLabel: '7.2 万人已使用',
    isNew: true,
    thumbGradient: 'linear-gradient(135deg, #e8eaf6 0%, #9fa8da 100%)',
    documentTitle: '项目 kick off 宣讲',
    mindNoteJson: projectKickoffMindNoteJson(),
  },
  {
    id: 'mindnote-team-standup',
    title: '团队早会',
    subtitle: '快速同步进展，明晰当日待办',
    docType: 'mindnote',
    categories: ['recommended', 'meeting', 'report'],
    usageLabel: '10.4 万人已使用',
    isNew: true,
    thumbGradient: 'linear-gradient(135deg, #e8f5e9 0%, #81c784 100%)',
    documentTitle: '团队早会',
    mindNoteJson: teamStandupMindNoteJson(),
  },
  {
    id: 'mindnote-test-case',
    title: '测试用例',
    subtitle: '全面梳理，测试万无一失',
    docType: 'mindnote',
    categories: ['recommended', 'rd', 'latest'],
    usageLabel: '5.3 万人已使用',
    isNew: true,
    thumbGradient: 'linear-gradient(135deg, #fff3e0 0%, #ffcc80 100%)',
    documentTitle: '测试用例',
    mindNoteJson: testCaseMindNoteJson(),
  },
  {
    id: 'mindnote-reading-notes',
    title: '读书笔记',
    subtitle: '记录书摘，留下感悟',
    docType: 'mindnote',
    categories: ['recommended', 'latest', 'ops'],
    usageLabel: '8.7 万人已使用',
    isNew: true,
    thumbGradient: 'linear-gradient(135deg, #f3e5f5 0%, #ce93d8 100%)',
    documentTitle: '读书笔记',
    mindNoteJson: readingNotesMindNoteJson(),
  },
  {
    id: 'mindnote-star-method',
    title: 'STAR 梳理法',
    subtitle: '明确事件要点，面试事半功倍',
    docType: 'mindnote',
    categories: ['recommended', 'hr', 'report'],
    usageLabel: '6.1 万人已使用',
    isNew: true,
    thumbGradient: 'linear-gradient(135deg, #e0f2f1 0%, #80cbc4 100%)',
    documentTitle: 'STAR 梳理法',
    mindNoteJson: starMethodMindNoteJson(),
  },
  {
    id: 'mindnote-eisenhower-quadrant',
    title: '四象限工作计划',
    subtitle: '判断好优先级再开始工作',
    docType: 'mindnote',
    categories: ['recommended', 'hot', 'ops'],
    usageLabel: '11.5 万人已使用',
    isNew: true,
    thumbGradient: 'linear-gradient(135deg, #fce4ec 0%, #b39ddb 100%)',
    documentTitle: '四象限工作计划',
    mindNoteJson: eisenhowerQuadrantMindNoteJson(),
  },
  blankTemplate('slides', '未命名幻灯片', 'linear-gradient(135deg, #fef3e6 0%, #ffe0b2 100%)'),
];

export function filterTemplates(
  templates: DocTemplate[],
  opts: { category: TemplateCategoryId; typeFilter: 'all' | TemplateDocType; query: string },
): DocTemplate[] {
  let list = templates;
  if (opts.typeFilter !== 'all') {
    list = list.filter(t => t.docType === opts.typeFilter);
  }
  if (opts.category !== 'recommended') {
    list = list.filter(t => t.categories.includes(opts.category));
  }
  const q = opts.query.trim().toLowerCase();
  if (q) {
    list = list.filter(t =>
      t.title.toLowerCase().includes(q) || t.subtitle.toLowerCase().includes(q),
    );
  }
  return list;
}

export function getBlankTemplate(docType: TemplateDocType): DocTemplate {
  return DOC_TEMPLATES.find(t => t.id === `blank-${docType}`)
    ?? blankTemplate(docType, '未命名文档', 'linear-gradient(135deg, #f5f6f7 0%, #eee 100%)');
}
