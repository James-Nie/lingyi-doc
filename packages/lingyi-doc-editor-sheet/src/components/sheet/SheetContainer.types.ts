import type { FreeTable } from '@lingyi-doc/core-sheet';
import type { DocCommentThread } from '@lingyi-doc/core-doc';
import type { SheetCommentRequest } from '@lingyi-doc/editor-shared';

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
  /**
   * 仪表盘嵌入：只读展示 + 本地滚动（不写全局 scroll store）。
   * 开启时视同 previewMode 禁编辑，但允许滚轮浏览。
   */
  embedMode?: boolean;
  /** 使用指定 Base 视图的筛选/分组/排序（默认当前 activeView） */
  viewIdOverride?: string;
  /** 表格评论：右键添加评论 */
  onAddSheetComment?: (request: SheetCommentRequest) => void;
  commentsEnabled?: boolean;
  /** 当前 sheet 的评论线程（用于单元格高亮） */
  sheetCommentThreads?: DocCommentThread[];
  /** 评论面板选中的 threadId */
  selectedCommentId?: string | null;
  /** 点击评论标记时选中对应评论 */
  onSelectComment?: (threadId: string) => void;
}
