import type { FreeTable } from '@lingyi-doc/core-sheet';
import type { BaseView, DashboardModel } from '@lingyi-doc/core-types';
import type { DocCommentThread } from '@lingyi-doc/core-doc';
import type { BaseViewType } from '@lingyi-doc/core-types';
import type { FormSharePanelContext } from '../base/FormViewToolbar';
import type { SheetCommentRequest } from '@lingyi-doc/editor-shared';

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
  /** 点击评论标记时选中对应评论 */
  onSelectComment?: (threadId: string) => void;
}

export interface BaseSheetEditorProps extends SheetEditorProps {
  currentView: BaseViewType;
  activeFormView: BaseView | null;
  activeKanbanView?: BaseView | null;
  onSelectView: (viewId: string) => void;
  onCreateView?: (viewType: BaseViewType) => void;
  onRenameView?: (viewId: string, name: string) => void;
  onDuplicateView?: (viewId: string) => void;
  onDeleteView?: (viewId: string) => void;
  onFormViewChange: () => void;
  onKanbanViewChange?: () => void;
  /** 当前视图顶部工具栏（与内容区同列，不含左侧视图切换） */
  toolbar?: React.ReactNode;
  readOnly?: boolean;
  renderFormSharePanel?: (ctx: FormSharePanelContext) => React.ReactNode;
  /** 工作簿级仪表盘列表 */
  dashboards?: DashboardModel[];
  activeDashboardId?: string | null;
  onSelectDashboard?: (dashboardId: string) => void;
  onCreateDashboard?: () => void;
  /** 侧栏需要仪表盘列表时拉取（打开文档不请求） */
  onPrefetchDashboards?: () => void;
  onRenameDashboard?: (dashboardId: string, name: string) => void;
  onDeleteDashboard?: (dashboardId: string) => void;
  onDashboardChange?: (dashboard: DashboardModel) => void;
}
