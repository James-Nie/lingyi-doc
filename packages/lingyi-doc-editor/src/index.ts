export { useSheetStore } from '@lingyi-doc/editor-sheet';
export { SheetAntdProvider } from '@lingyi-doc/editor-shared';
export {
  registerEditor,
  getEditorLoader,
  requireEditorLoader,
  listRegisteredEditors,
  resolveEditorCapability,
  filterEditorsByModules,
  isEditorCapabilityAllowed,
  registerEditorEmbed,
  getEditorEmbed,
  hasEditorEmbed,
  listEditorEmbeds,
  DOC_PAGE_BG,
  readImageFile,
  fitMindNodeImageSize,
  isMacPlatform,
  DocImageInsertDialog,
  validateImageFile,
  ToolbarTooltip,
} from '@lingyi-doc/editor-shared';
export type {
  EditorCapabilityKey,
  EditorLoader,
  MembershipModuleKey,
  SheetCommentRequest,
  EditorEmbedKind,
  InsertImagePayload,
} from '@lingyi-doc/editor-shared';
export {
  SheetContainer,
  CellEditor,
  ContextMenu,
  Toolbar,
  BaseToolbar,
  ToolbarPopover,
  BaseSidebar,
  FieldManagePopover,
  FieldConfigPanel,
  RecordDetailModal,
  FormulaBar,
  StatusBar,
  SheetTabs,
  ChartInsertDialog,
  ChartOverlay,
  ChartRenderer,
  ChartEditor,
  BaseViewSidebar,
  FormViewEditor,
  PublicFormFillView,
  KanbanView,
  FreeformSheetEditor,
  BaseSheetEditor,
  ensureFormView,
  activateBaseView,
  getActiveBaseView,
  ensureActiveBaseView,
  applySheetStoreFromBaseView,
  syncAllFormViews,
  syncFormFieldRename,
  updateFormViewConfig,
  updateBaseViewGroupRules,
  updateBaseViewFilter,
  updateBaseViewFilterConjunction,
  updateBaseViewSort,
  updateCollapsedGroupKeys,
  expandGroupPathKeys,
  toggleGroupByField,
  isFieldGrouped,
  updateKanbanViewConfig,
  createKanbanView,
  createGridView,
  createAndActivateBaseView,
  renameBaseView,
  duplicateBaseView,
  deleteBaseView,
  ensureKanbanGroupField,
  pickDefaultKanbanGroupFieldId,
  DashboardEditor,
  ensureDashboardForSheet,
  registerWidgetConfigPanel,
  resolveWidgetConfigPanel,
  listRegisteredWidgetConfigPanels,
} from '@lingyi-doc/editor-sheet';
export type {
  SheetEditorProps,
  BaseSheetEditorProps,
  FormSharePanelContext,
  PublicFormSchemaField,
  DashboardEditorProps,
  WidgetConfigPanelDescriptor,
  WidgetConfigPanelContext,
  WidgetConfigTabKey,
} from '@lingyi-doc/editor-sheet';
export { BASE_THEME } from '@lingyi-doc/core-sheet';
export {
  RichDocEditor,
  RichDocPreview,
  DocToolbar,
  DocOutline,
  DocCommentPanel,
  prepareRichDocBlocksForExport,
  useDocCommentController,
} from '@lingyi-doc/editor-doc';
export type {
  RichDocEditorProps,
  RichDocEditorSaveRef,
  RichDocPreviewProps,
  ToolbarAction,
  DocCommentAuthor,
  UseDocCommentControllerOptions,
} from '@lingyi-doc/editor-doc';
export { MindNoteEditor } from '@lingyi-doc/editor-mindmap';
export type { MindNoteEditorProps } from '@lingyi-doc/editor-mindmap';
export {
  WhiteboardEditor,
  resolveCommentBindAtPoint,
  resolveLiveWhiteboardCommentPin,
  syncWhiteboardCommentPinsWithElements,
  downloadWhiteboardElementsAsPng,
  renderWhiteboardElementsToDataUrl,
  resolveWhiteboardElementsForExport,
  printWhiteboard,
} from '@lingyi-doc/editor-whiteboard';
export type { WhiteboardEditorProps } from '@lingyi-doc/editor-whiteboard';
export { printMindNoteMap } from '@lingyi-doc/editor-mindmap';

import { setWhiteboardExportHooks } from '@lingyi-doc/editor-doc';
import {
  renderWhiteboardElementsToDataUrl,
  resolveWhiteboardElementsForExport,
} from '@lingyi-doc/editor-whiteboard';

setWhiteboardExportHooks({
  resolveElementsForExport: resolveWhiteboardElementsForExport,
  renderElementsToDataUrl: renderWhiteboardElementsToDataUrl,
});

// 确保文档嵌入块 / 画板预览注册表在门面加载时就绪
import './embeds/registerEmbeds';
