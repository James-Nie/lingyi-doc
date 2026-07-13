import type { MutableRefObject } from 'react';
import type {
  BaseCellRenderer,
  CellRenderer,
  CellValue,
  ClipboardManager,
  ColumnDef,
  DirtyTracker,
  FreeTable,
  GroupedLayoutResult,
  LayerManager,
  RecordRow,
  RecordTreeColumnMeta,
  SelectionManager,
  ViewportManager,
} from '@lingyi-doc/core';
import type { CellCoord, CellRange } from '@lingyi-doc/core';
import type { BaseSheetModel, FreeformSheetModel } from '@lingyi-doc/core';

export interface SheetInteractionDeps {
  table: FreeTable;
  sheet: BaseSheetModel | FreeformSheetModel;
  mode: 'base' | 'freeform';
  isBaseSheet: boolean;
  isFreeformSheet: boolean;
  previewMode: boolean;
  supportsAutofill: boolean;
  mergeRanges: CellRange[];
  columnDefs: ColumnDef[];
  sheetRows: RecordRow[];
  effectiveColCount: number;
  gridRowCount: number;
  displayRowHeights: Map<number, number>;
  effectiveRowHeights: Map<number, number>;
  groupLayout: GroupedLayoutResult | null;
  isGroupedView: boolean;
  rowTreeMeta?: RecordTreeColumnMeta[];
  checkedRecordRowSet: Set<number>;
  activeHoverRow: number | null;
  toolbarHoverRow: number | null;
  checkedRows: number[];

  canvasContainerRef: MutableRefObject<HTMLDivElement | null>;
  viewportRef: MutableRefObject<ViewportManager>;
  dirtyTrackerRef: MutableRefObject<DirtyTracker>;
  layerManagerRef: MutableRefObject<LayerManager | null>;
  cellRendererRef: MutableRefObject<CellRenderer>;
  baseCellRendererRef: MutableRefObject<BaseCellRenderer>;
  selectionManagerRef: MutableRefObject<SelectionManager>;
  lastColClickTimeRef: MutableRefObject<number>;
  formulaDragRef: MutableRefObject<{ active: boolean; startCoord: CellCoord; endCoord: CellCoord } | null>;
  formulaDragCursorRef: MutableRefObject<number>;
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
  axisHeaderSelectRef: MutableRefObject<{
    axis: 'col' | 'row';
    anchor: number;
    active: boolean;
    startX: number;
    startY: number;
  } | null>;
  axisAnchorRef: MutableRefObject<{ axis: 'col' | 'row'; index: number } | null>;
  discreteAxisColsRef: MutableRefObject<number[]>;
  discreteAxisRowsRef: MutableRefObject<number[]>;
  isDraggingRef: MutableRefObject<boolean>;
  isFillDraggingRef: MutableRefObject<boolean>;
  fillSourceRangeRef: MutableRefObject<CellRange | null>;

  editingCell: CellCoord | null;
  progressDrag: CellCoord | null;
  resizeState: { type: 'col' | 'row'; index: number } | null;
  discreteAxisCols: number[];
  discreteAxisRows: number[];

  scheduleRender: () => void;
  resolveActiveRowHeights: () => Map<number, number>;
  mapCoordToRecord: (coord: CellCoord) => CellCoord | null;
  getCellFromEvent: (e: React.MouseEvent) => CellCoord | null;
  getCellFromClientCoords: (clientX: number, clientY: number) => CellCoord | null;
  formatCellEditText: (value: CellValue) => string;
  handleEditCommit: (coord: CellCoord, value: string | boolean | number | CellValue | null, commitType?: string) => void;
  startCellEdit: (coord: CellCoord, fromKeyboard?: boolean) => void;

  setSelection: (range: CellRange | null, active: CellCoord | null) => void;
  setDiscreteSelections: (cells: CellCoord[], active?: CellCoord | null) => void;
  setEditingCell: (cell: CellCoord | null) => void;
  setFormulaBarText: (text: string) => void;
  setCheckedRows: React.Dispatch<React.SetStateAction<number[]>>;
  setCollapsedRowIds: React.Dispatch<React.SetStateAction<string[]>>;
  setHoveredCol: (col: number | null) => void;
  setHoveredRow: (row: number | null) => void;
  setCornerHovered: (hovered: boolean) => void;
  setHoverRatingCell: (cell: { row: number; col: number; value: number } | null) => void;
  setProgressDrag: (coord: CellCoord | null) => void;
  setDropdownEditCell: (coord: CellCoord | null) => void;
  setDateEditCell: (coord: CellCoord | null) => void;
  setFormulaDrag: React.Dispatch<React.SetStateAction<{ active: boolean; startCoord: CellCoord; endCoord: CellCoord } | null>>;
  setAxisDragTick: React.Dispatch<React.SetStateAction<number>>;
  setResizeState: (state: { type: 'col' | 'row'; index: number } | null) => void;
  setBaseColumnMenu: React.Dispatch<React.SetStateAction<{ colIndex: number; x: number; y: number } | null>>;
  setContextMenu: React.Dispatch<React.SetStateAction<{
    visible: boolean;
    x: number;
    y: number;
    coord: CellCoord | null;
    clickInSelection?: boolean;
  }>>;
  setCopiedRange: React.Dispatch<React.SetStateAction<CellRange | null>>;

  copiedRange: CellRange | null;
  clipboardManagerRef: MutableRefObject<ClipboardManager>;

  applyColumnRangeSelection: (fromCol: number, toCol: number, focusCol?: number) => void;
  applyRowRangeSelection: (fromRow: number, toRow: number, focusRow?: number) => void;
  applyExtendedSelection: (coord: CellCoord, activeCell?: CellCoord | null) => CellRange;
  normalizeRangeForMerges: (range: CellRange) => CellRange;
  clearAxisDiscreteSelection: () => void;
  syncDiscreteAxisCols: (next: number[]) => void;
  syncDiscreteAxisRows: (next: number[]) => void;
  startFillDrag: (sel: CellRange, e?: React.MouseEvent | globalThis.MouseEvent) => void;
  updateFillPreview: (preview: CellRange) => void;
  finishFillDrag: () => boolean;
  openFilterPanelForCol: (col: number) => void;
  startAxisResizeLongPress: (type: 'col' | 'row', index: number, clientX: number, clientY: number, size: number) => void;

  toggleGroupCollapse: (groupPathKey: string) => void;
  insertRecordInGroup: (groupContext: Record<string, unknown>, groupPathKey: string, addRecordDisplayRow: number) => void;
  toggleRowCollapse: (rowIndex: number) => void;
  resolveGroupedCardLeft: () => number;

  onSelectChart?: (chartId: string | null) => void;
  onOpenFieldConfig?: (fieldId?: string | null) => void;
}
