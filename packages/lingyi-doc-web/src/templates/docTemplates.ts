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
