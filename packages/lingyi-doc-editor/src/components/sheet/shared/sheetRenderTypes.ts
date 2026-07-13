import type { MutableRefObject } from 'react';
import type {
  BaseCellRenderer,
  CellData,
  CellRange,
  CellRenderer,
  ColumnDef,
  DirtyTracker,
  FreeTable,
  GroupedLayoutResult,
  GroupRule,
  LayerManager,
  RecordRow,
  RecordTreeColumnMeta,
  ViewportManager,
} from '@lingyi-doc/core';
import type { CellCoord } from '@lingyi-doc/core';
import type { BaseSheetModel, FreeformSheetModel, SheetCommentCellRef } from '@lingyi-doc/core';

export interface SheetRenderPassContext {
  layerManager: LayerManager;
  viewport: ViewportManager;
  renderer: CellRenderer;
  baseCellRenderer: BaseCellRenderer;
  tracker: DirtyTracker;
  table: FreeTable;
  sheet: BaseSheetModel | FreeformSheetModel;
  mode: 'base' | 'freeform';
  isBaseSheet: boolean;
  isFreeformSheet: boolean;
  containerSize: { width: number; height: number };
  zoomLevel: number;
  previewMode: boolean;
  supportsAutofill: boolean;
  activeRowHeights: Map<number, number>;
  gridRowCount: number;
  columnDefs: ColumnDef[];
  sheetRows: RecordRow[];
  mergeRanges: CellRange[];
  groupLayout: GroupedLayoutResult | null;
  isGroupedView: boolean;
  groupRules: GroupRule[];
  rowTreeMeta?: RecordTreeColumnMeta[];
  collapsedRowIdSet: Set<string>;
  checkedRows: number[];
  checkedRowsForRender: number[];
  checkedRecordRowSet: Set<number>;
  hoveredCol: number | null;
  activeHoverRow: number | null;
  cornerHovered: boolean;
  fillPreviewRange: CellRange | null;
  discreteAxisCols: number[];
  discreteAxisRows: number[];
  copiedRange: CellRange | null;
  copyDashOffsetRef: MutableRefObject<number>;
  formulaDragRef: MutableRefObject<{ active: boolean; startCoord: CellCoord; endCoord: CellCoord } | null>;
  axisDragRef: MutableRefObject<{
    axis: 'col' | 'row';
    sourceStart: number;
    sourceEnd: number;
    sourceIndex: number;
    insertIndex: number;
    active: boolean;
    startX: number;
    startY: number;
  } | null>;
  columnFilters?: import('@lingyi-doc/core').ColumnFilterCondition[];
  resolveGridRecordRow: (displayRow: number) => number | null;
  skipGroupGridLine: (row: number) => boolean;
  isGroupDisplayRow: (row: number) => boolean;
  fillGroupedRowHighlight: (
    ctx: CanvasRenderingContext2D,
    displayRow: number,
    color: string,
    gridRight: number,
    rowHeights: Map<number, number>,
  ) => void;
  resolveGroupedCardLeft: () => number;
  viewportRef: MutableRefObject<ViewportManager>;
  /** 当前 sheet 上有评论的单元格 */
  sheetCommentCells?: SheetCommentCellRef[];
  /** 评论面板中选中的 threadId */
  selectedCommentId?: string | null;
}

export type VisibleCellRegion = 'all' | 'frozen' | 'scrollable';

export interface SheetRenderHelpers {
  visibleRange: ReturnType<ViewportManager['calculateVisibleRange']>;
  freezeState: { frozenRows: number; frozenCols: number };
  useFreezeSplit: boolean;
  baseGridBounds: ReturnType<typeof import('@lingyi-doc/core').computeBaseGridScreenBounds> | null;
  forEachVisibleCell: (draw: (row: number, col: number) => void, region?: VisibleCellRegion) => void;
  forEachVisibleCellWithFreezeSplit: (ctx: CanvasRenderingContext2D, draw: (row: number, col: number) => void) => void;
}
