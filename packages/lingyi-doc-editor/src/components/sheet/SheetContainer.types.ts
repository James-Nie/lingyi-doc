import type { FreeTable, DocCommentThread } from '@lingyi-doc/core';
import type { SheetCommentRequest } from '../../doc/comments/sheetCommentTypes';

export interface SheetContainerProps {
  table: FreeTable;
  style?: React.CSSProperties;
  selectedChartId?: string | null;
  onSelectChart?: (chartId: string | null) => void;
  onOpenFieldConfig?: (fieldId?: string | null) => void;
  onToggleFieldVisibility?: (fieldId: string, visible: boolean) => void;
  onDeleteField?: (fieldId: string) => void;
  /** 只读预览：不读写全局 sheetStore，不挂载编辑/菜单等交互层 */
  previewMode?: boolean;
  /** 表格评论：右键添加评论 */
  onAddSheetComment?: (request: SheetCommentRequest) => void;
  commentsEnabled?: boolean;
  /** 当前 sheet 的评论线程（用于单元格高亮） */
  sheetCommentThreads?: DocCommentThread[];
  /** 评论面板选中的 threadId */
  selectedCommentId?: string | null;
}
