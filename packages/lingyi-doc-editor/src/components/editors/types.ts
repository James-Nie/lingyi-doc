import type { FreeTable, BaseView, DocCommentThread } from '@lingyi-doc/core';
import type { BaseViewType } from '@lingyi-doc/core';
import type { FormSharePanelContext } from '../base/FormViewToolbar';
import type { SheetCommentRequest } from '../../doc/comments/sheetCommentTypes';

export interface SheetEditorProps {
  table: FreeTable;
  previewMode?: boolean;
  selectedChartId?: string | null;
  onSelectChart?: (id: string | null) => void;
  onOpenFieldConfig?: (fieldId?: string | null) => void;
  onToggleFieldVisibility?: (fieldId: string, visible: boolean) => void;
  onDeleteField?: (fieldId: string) => void;
  /** 切换 sheet 时 remount SheetContainer */
  containerKey?: string;
  onAddSheetComment?: (request: SheetCommentRequest) => void;
  commentsEnabled?: boolean;
  sheetCommentThreads?: DocCommentThread[];
  selectedCommentId?: string | null;
}

export interface BaseSheetEditorProps extends SheetEditorProps {
  currentView: BaseViewType;
  activeFormView: BaseView | null;
  onSelectView: (viewId: string) => void;
  onFormViewChange: () => void;
  readOnly?: boolean;
  renderFormSharePanel?: (ctx: FormSharePanelContext) => React.ReactNode;
}
