export type TemplateDocType = 'richtext' | 'freeform' | 'base' | 'mindnote' | 'slides' | 'whiteboard';
export type TemplateStatus = 'draft' | 'published' | 'archived';

export interface DocTemplateSummary {
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

export interface DocTemplateDetail extends DocTemplateSummary {
  contentJson: unknown | null;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface DocTemplateCreateInput {
  id?: string;
  title: string;
  subtitle?: string;
  docType: TemplateDocType;
  documentTitle: string;
  categories?: string[];
  usageLabel?: string | null;
  isNew?: boolean;
  isBlank?: boolean;
  thumbGradient?: string;
  contentJson?: unknown | null;
  status?: TemplateStatus;
  sortOrder?: number;
}

export interface DocTemplateUpdateInput {
  title?: string;
  subtitle?: string;
  docType?: TemplateDocType;
  documentTitle?: string;
  categories?: string[];
  usageLabel?: string | null;
  isNew?: boolean;
  isBlank?: boolean;
  thumbGradient?: string;
  contentJson?: unknown | null;
  status?: TemplateStatus;
  sortOrder?: number;
}

export interface DocTemplateListQuery {
  keyword?: string;
  docType?: TemplateDocType;
  status?: TemplateStatus;
  category?: string;
  page?: number;
  pageSize?: number;
  includeContent?: boolean;
}
