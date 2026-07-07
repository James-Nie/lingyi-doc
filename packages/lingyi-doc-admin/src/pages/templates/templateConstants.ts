export type TemplateDocType = 'richtext' | 'freeform' | 'base' | 'mindnote' | 'slides' | 'whiteboard';
export type TemplateStatus = 'draft' | 'published' | 'archived';

export interface TemplateListItem {
  id: string;
  title: string;
  subtitle: string;
  docType: TemplateDocType;
  documentTitle: string;
  categories: string[];
  usageLabel: string | null;
  isNew: boolean;
  isBlank: boolean;
  thumbGradient: string;
  status: TemplateStatus;
  sortOrder: number;
  useCount: number;
  hasContent: boolean;
  createdAt: number;
  updatedAt: number;
  publishedAt: number | null;
}

export interface TemplateDetail extends TemplateListItem {
  contentJson: unknown | null;
  createdBy: string | null;
  updatedBy: string | null;
}

export const TEMPLATE_DOC_TYPE_LABELS: Record<TemplateDocType, string> = {
  richtext: '文档',
  freeform: '表格',
  base: '多维表格',
  mindnote: '思维笔记',
  slides: '幻灯片',
  whiteboard: '画板',
};

export const TEMPLATE_STATUS_LABELS: Record<TemplateStatus, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
};

export const TEMPLATE_STATUS_COLORS: Record<TemplateStatus, string> = {
  draft: 'default',
  published: 'green',
  archived: 'orange',
};

export const TEMPLATE_CATEGORY_OPTIONS = [
  { id: 'recommended', label: '推荐' },
  { id: 'latest', label: '最新' },
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

export const DEFAULT_THUMB_GRADIENT = 'linear-gradient(135deg, #e3f2fd 0%, #90caf9 100%)';
