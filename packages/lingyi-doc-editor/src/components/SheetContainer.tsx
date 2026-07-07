import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { ViewportManager, LayerManager, CellRenderer, DirtyTracker, RENDER_LAYERS, FreeTable, SelectionManager, ClipboardManager, parseClipboardGrid, readClipboardGridAsync, readSheetClipboardInternalAsync, getEditText, getSheetCellEditText, parseFreeformBooleanInput, getCellText, parseCellValue, parseFieldValue, BaseCellRenderer, KanbanRenderer, GanttRenderer, CalendarRenderer, GalleryRenderer, getRatingConfig, hitTestRating, BASE_HEADER_WIDTH, hitTestBaseRowHeader, resolveColumnWidth, isColumnHidden, buildDisplayRowHeights, buildRowHeaderMeta, isRowVisible, hitTestFillHandle, computeFillTargetRange, applyAutofill, normalizeRange, normalizeSelectionForMerges, shouldShowFillHandle, FILL_HANDLE_SIZE, getFillHandleAnchor, drawFillHandle, recordTreeRenderer, resolveTreeLayout, getTreeContentRect, hitTestRecordTreeColumn, computeFreeformEffectiveRowHeights, getFilteredColumnIndices, isRowLayoutHidden, DEFAULT_ROW_HEIGHT, DEFAULT_BASE_ROW_HEIGHT, copyTableSelectionAsImage, resolveImageCaptureRange, applyBaseRenderConfig, resetStandardRenderConfig, BASE_THEME, computeBaseGridScreenBounds, expandRowDragBlock, getSiblingInsertBounds, clipCanvasToScrollablePane, resolveCellBackgroundFillColor, hasActiveFreeze, isCellInFrozenRegion } from '@lingyi-doc/core';
import type { CellCoord, CellRange, ColumnDef, BaseViewType, CellValue, CellData } from '@lingyi-doc/core';
import { useSheetStore } from '../store/sheetStore';
import { syncToolbarFromCell } from '../utils/syncToolbarFromCell';
import {
  buildFullColumnRange,
  buildFullRowRange,
  getContiguousColumnIndices,
  getContiguousRowIndices,
  isColumnAxisSelected,
  isRowAxisSelected,
  resolveSelectedColumnIndices,
  resolveSelectedRowIndices,
  toggleDiscreteIndex,
  groupContiguousIndices,
  getAxisDragBlock,
  computeAxisBlockDestStart,
  isClickInCurrentSelection,
} from '../utils/axisSelection';
import { CellEditor } from './CellEditor';
import { ContextMenu } from './ContextMenu';
import { ChartOverlay } from './chart/ChartOverlay';
import { parseFormulaRanges } from './FormulaRangeParser';
import { ColumnHeaderMenu } from './ColumnHeaderMenu';
import { ColumnHeaderFilterPanel } from './ColumnHeaderFilterPanel';
import { BaseCellEditor } from './editors/BaseCellEditor';
import { DeleteRecordsDialog } from './DeleteRecordsDialog';
import { BaseRecordContextMenu } from './BaseRecordContextMenu';
import { BaseRecordRowToolbar } from './BaseRecordRowToolbar';
import { BaseRecordCellExpandBtn } from './BaseRecordCellExpandBtn';
import { RecordDetailDrawer, type RecordDrawerTab } from './RecordDetailDrawer';
import { AddRowsBar } from './AddRowsBar';
import { BaseAddRowsBar } from './BaseAddRowsBar';
import { BaseAxisAddCell, BASE_ADD_COLUMN_WIDTH } from './BaseAxisAddCell';
import { AxisResizeGuide, type AxisResizeGuideProps } from './AxisResizeGuide';
import { FreeformDropdownEditor } from './FreeformDropdownEditor';
import { FreeformDateEditor } from './FreeformDateEditor';

interface SheetContainerProps {
  table: FreeTable;
  style?: React.CSSProperties;
  selectedChartId?: string | null;
  onSelectChart?: (chartId: string | null) => void;
  onOpenFieldConfig?: (fieldId?: string | null) => void;
  onToggleFieldVisibility?: (fieldId: string, visible: boolean) => void;
  onDeleteField?: (fieldId: string) => void;
  /** 只读预览：不读写全局 sheetStore，不挂载编辑/菜单等交互层 */
  previewMode?: boolean;
}

/** 焦点在可编辑区域时不拦截快捷键（避免 Backspace 无法删字） */
function shouldIgnoreSheetShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  if (target.closest('[data-freeform-dropdown-cell], [data-sheet-keep-selection]')) return true;
  if (target.closest('.ant-modal, .ant-select-dropdown, .ant-picker-dropdown, .sheet-select-dropdown, .sheet-select-dropdown-panel, [data-sheet-dropdown-config]')) return true;
  return false;
}

function resolveCopySourceRange(
  sheetId: string,
  selectionRange: CellRange | null,
  discreteSelections: CellCoord[],
): CellRange | null {
  if (discreteSelections.length > 1) {
    const minRow = Math.min(...discreteSelections.map(c => c.row));
    const maxRow = Math.max(...discreteSelections.map(c => c.row));
    const minCol = Math.min(...discreteSelections.map(c => c.col));
    const maxCol = Math.max(...discreteSelections.map(c => c.col));
    return { sheetId, start: { row: minRow, col: minCol }, end: { row: maxRow, col: maxCol } };
  }
  if (selectionRange) {
    const norm = normalizeRange(selectionRange);
    return {
      sheetId,
      start: { row: norm.startRow, col: norm.startCol },
      end: { row: norm.endRow, col: norm.endCol },
    };
  }
  return null;
}

function rangesEqual(a: CellRange, b: CellRange): boolean {
  const na = normalizeRange(a);
  const nb = normalizeRange(b);
  return na.startRow === nb.startRow
    && na.endRow === nb.endRow
    && na.startCol === nb.startCol
    && na.endCol === nb.endCol;
}

export const SheetContainer: React.FC<SheetContainerProps> = ({
  table,
  style,
  selectedChartId,
  onSelectChart,
  onOpenFieldConfig,
  onToggleFieldVisibility,
  onDeleteField,
  previewMode = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef(new ViewportManager());
  const layerManagerRef = useRef<LayerManager | null>(null);
  const cellRendererRef = useRef(new CellRenderer(viewportRef.current));
  const baseCellRendererRef = useRef(new BaseCellRenderer({ viewportManager: viewportRef.current }));
  const kanbanRendererRef = useRef<KanbanRenderer | null>(null);
  const ganttRendererRef = useRef<GanttRenderer | null>(null);
  const calendarRendererRef = useRef<CalendarRenderer | null>(null);
  const galleryRendererRef = useRef<GalleryRenderer | null>(null);
  const dirtyTrackerRef = useRef(new DirtyTracker());
  const selectionManagerRef = useRef(new SelectionManager(table.sheetId));
  const clipboardManagerRef = useRef(new ClipboardManager());
  const lastPasteHandledAtRef = useRef(0);
  const copyDashOffsetRef = useRef(0);
  const copyAnimFrameRef = useRef(0);
  const [copiedRange, setCopiedRange] = useState<CellRange | null>(null);
  const isDraggingRef = useRef(false);
  const isFillDraggingRef = useRef(false);
  const fillSourceRangeRef = useRef<CellRange | null>(null);
  const fillPreviewRangeRef = useRef<CellRange | null>(null);
  const [fillPreviewRange, setFillPreviewRange] = useState<CellRange | null>(null);
  const renderFrameRef = useRef<number>(0);
  const lastColClickTimeRef = useRef<number>(0);
  /** 记录 mousedown 是否发生在画布/保留选区区域外，用于拖拽选区时不误清除 */
  const pointerDownOutsideRef = useRef(false);

  const setScrollPosition = useSheetStore(s => s.setScrollPosition);
  const setSelection = useSheetStore(s => s.setSelection);
  const setDiscreteSelections = useSheetStore(s => s.setDiscreteSelections);
  const setEditingCell = useSheetStore(s => s.setEditingCell);
  const setFormulaBarText = useSheetStore(s => s.setFormulaBarText);
  const zoomLevel = useSheetStore(s => s.zoomLevel);
  const editingCell = useSheetStore(s => s.editingCell);
  const selectionRange = useSheetStore(s => s.selectionRange);
  const discreteSelections = useSheetStore(s => s.discreteSelections);
  const activeCell = useSheetStore(s => s.activeCell);
  const scrollLeft = useSheetStore(s => s.scrollLeft);
  const scrollTop = useSheetStore(s => s.scrollTop);
  const formulaBarText = useSheetStore(s => s.formulaBarText);

  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    coord: CellCoord | null;
    clickInSelection?: boolean;
  }>({ visible: false, x: 0, y: 0, coord: null });

  useEffect(() => {
    if (!previewMode) return;
    setEditingCell(null);
    setFormulaBarText('');
    setSelection(null, null);
    setContextMenu({ visible: false, x: 0, y: 0, coord: null });
  }, [previewMode, setEditingCell, setFormulaBarText, setSelection]);

  const [resizeState, setResizeState] = useState<{ type: 'col' | 'row'; index: number } | null>(null);
  const [axisResizeGuide, setAxisResizeGuide] = useState<AxisResizeGuideProps | null>(null);
  const axisResizeLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const axisResizeMovedRef = useRef(false);
  const [filterPanel, setFilterPanel] = useState<{ col: number; rect: { left: number; top: number; width: number; height: number } } | null>(null);
  const [baseColumnMenu, setBaseColumnMenu] = useState<{ colIndex: number; x: number; y: number } | null>(null);
  const [, setAxisDragTick] = useState(0);
  const axisDragRef = useRef<{
    axis: 'col' | 'row';
    sourceStart: number;
    sourceEnd: number;
    sourceIndex: number;
    insertIndex: number;
    active: boolean;
    startX: number;
    startY: number;
  } | null>(null);
  /** 列头/行头框选多列/多行 */
  const axisHeaderSelectRef = useRef<{
    axis: 'col' | 'row';
    anchor: number;
    active: boolean;
    startX: number;
    startY: number;
  } | null>(null);
  /** Shift 连选锚点（列/行） */
  const axisAnchorRef = useRef<{ axis: 'col' | 'row'; index: number } | null>(null);
  const [discreteAxisCols, setDiscreteAxisCols] = useState<number[]>([]);
  const [discreteAxisRows, setDiscreteAxisRows] = useState<number[]>([]);
  const discreteAxisColsRef = useRef<number[]>([]);
  const discreteAxisRowsRef = useRef<number[]>([]);

  // Hover states for headers
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [toolbarHoverRow, setToolbarHoverRow] = useState<number | null>(null);
  const activeHoverRow = hoveredRow ?? toolbarHoverRow;
  const [cornerHovered, setCornerHovered] = useState(false);

  // 多维表：行复选框选中状态（hover 时显示复选框）
  const [checkedRows, setCheckedRows] = useState<number[]>([]);
  const [deleteDialog, setDeleteDialog] = useState<{ visible: boolean; rows: number[] }>({
    visible: false,
    rows: [],
  });
  const [collapsedRowIds, setCollapsedRowIds] = useState<string[]>([]);
  const [detailRowIndex, setDetailRowIndex] = useState<number | null>(null);
  const [detailDrawerTab, setDetailDrawerTab] = useState<RecordDrawerTab>('detail');

  // Formula range selection mode: while editing a formula, drag-select inserts range refs
  const [formulaDrag, setFormulaDrag] = useState<{ active: boolean; startCoord: CellCoord; endCoord: CellCoord } | null>(null);
  const formulaDragRef = useRef(formulaDrag);
  formulaDragRef.current = formulaDrag;
  /** Saved cursor position at drag start, to avoid losing it when input blurs */
  const formulaDragCursorRef = useRef(0);

  // 多维表交互状态：进度条拖动、评分 hover 预览
  const [progressDrag, setProgressDrag] = useState<CellCoord | null>(null);
  const [hoverRatingCell, setHoverRatingCell] = useState<{ row: number; col: number; value: number } | null>(null);
  const [dropdownEditCell, setDropdownEditCell] = useState<CellCoord | null>(null);
  const [dateEditCell, setDateEditCell] = useState<CellCoord | null>(null);

  const sheet = table.sheet;
  const isBaseSheet = sheet.type === 'base' || (sheet.columnDefs?.length ?? 0) > 0;
  const isFreeformTable = sheet.type !== 'base' && (sheet.columnDefs?.length ?? 0) === 0;
  const formatCellEditText = useCallback(
    (value: CellValue) => getSheetCellEditText(value, isFreeformTable),
    [isFreeformTable],
  );
  /** 网格视图支持填充柄（普通表格与多维表） */
  const supportsAutofill = true;
  const effectiveColCount = Math.max(sheet.colCount, sheet.columnDefs.length);

  const collapsedRowIdSet = useMemo(() => new Set(collapsedRowIds), [collapsedRowIds]);

  const [layoutVersion, setLayoutVersion] = useState(0);

  const displayRowHeights = useMemo(() => {
    if (sheet.type !== 'base') return sheet.rowHeights;
    table.ensureRowRecords();
    return buildDisplayRowHeights(
      sheet.rowCount,
      sheet.rows,
      sheet.rowHeights,
      collapsedRowIdSet,
      table.getDefaultRowHeight(),
    );
  }, [sheet.type, sheet.rowCount, sheet.rows, sheet.rowHeights, collapsedRowIdSet, table]);

  const freeformFilterRowHeights = useMemo(() => {
    if (isBaseSheet) return sheet.rowHeights;
    return computeFreeformEffectiveRowHeights(
      sheet.rowCount,
      sheet.rowHeights,
      DEFAULT_ROW_HEIGHT,
      sheet,
      (r, c) => table.getCell(r, c),
    );
  }, [isBaseSheet, sheet.rowCount, sheet.rowHeights, sheet.columnFilters, sheet.columnFilterCols, table, layoutVersion]);

  const effectiveRowHeights = isBaseSheet ? displayRowHeights : freeformFilterRowHeights;

  /** 底部「添加行」栏高度，需纳入滚动范围 */
  const addRowsBarHeight = useMemo(() => {
    const defaultH = isBaseSheet
      ? (sheet.defaultRowHeight ?? DEFAULT_BASE_ROW_HEIGHT)
      : viewportRef.current.config.defaultRowHeight;
    return defaultH * zoomLevel;
  }, [isBaseSheet, sheet.defaultRowHeight, zoomLevel]);
  const addRowsExtraScrollBottom = useMemo(() => {
    const basePadding = isBaseSheet ? BASE_THEME.gridPaddingBottom : 0;
    return addRowsBarHeight + basePadding;
  }, [isBaseSheet, addRowsBarHeight]);

  /** 渲染/交互时实时计算行高，避免 onChange → rAF 早于 React 重渲染导致筛选不生效 */
  const resolveActiveRowHeights = useCallback((): Map<number, number> => {
    if (isBaseSheet) return displayRowHeights;
    return computeFreeformEffectiveRowHeights(
      table.sheet.rowCount,
      table.sheet.rowHeights,
      DEFAULT_ROW_HEIGHT,
      table.sheet,
      (r, c) => table.getCell(r, c),
    );
  }, [isBaseSheet, displayRowHeights, table]);

  const clearAxisResizeLongPress = useCallback(() => {
    if (axisResizeLongPressTimerRef.current) {
      clearTimeout(axisResizeLongPressTimerRef.current);
      axisResizeLongPressTimerRef.current = null;
    }
  }, []);

  const buildAxisResizeGuide = useCallback((
    type: 'col' | 'row',
    index: number,
    clientX: number,
    clientY: number,
    size: number,
  ): AxisResizeGuideProps | null => {
    const canvasRect = canvasContainerRef.current?.getBoundingClientRect();
    if (!canvasRect) return null;
    const config = viewportRef.current.config;
    const relX = clientX - canvasRect.left;
    const relY = clientY - canvasRect.top;

    if (type === 'col') {
      const left = viewportRef.current.getColumnScreenLeft(index, sheet.columnWidths);
      const w = resolveColumnWidth(index, sheet.columnWidths, config.defaultColumnWidth) * zoomLevel;
      const linePos = left + w;
      return {
        type: 'col',
        linePos,
        tooltipX: Math.max(config.headerWidth + 40, Math.min(linePos + 12, containerSize.width - 60)),
        tooltipY: Math.min(config.headerHeight * 0.65, Math.max(16, relY)),
        size,
        containerHeight: containerSize.height,
      };
    }

    const rowHeights = resolveActiveRowHeights();
    const rect = viewportRef.current.getCellRect({ row: index, col: 0 }, sheet.columnWidths, rowHeights);
    const linePos = rect.y + rect.height;
    return {
      type: 'row',
      linePos,
      linePosSecondary: rect.y,
      tooltipX: Math.max(config.headerWidth + 30, relX),
      tooltipY: linePos,
      size,
      containerHeight: containerSize.height,
    };
  }, [sheet.columnWidths, zoomLevel, containerSize.width, containerSize.height, resolveActiveRowHeights]);

  const startAxisResizeLongPress = useCallback((
    type: 'col' | 'row',
    index: number,
    clientX: number,
    clientY: number,
    size: number,
  ) => {
    clearAxisResizeLongPress();
    axisResizeMovedRef.current = false;
    axisResizeLongPressTimerRef.current = setTimeout(() => {
      if (!axisResizeMovedRef.current) {
        const guide = buildAxisResizeGuide(type, index, clientX, clientY, size);
        if (guide) setAxisResizeGuide(guide);
      }
    }, 400);
  }, [clearAxisResizeLongPress, buildAxisResizeGuide]);

  const openFilterPanelForCol = useCallback((col: number) => {
    if (isBaseSheet || !canvasContainerRef.current) return;
    const canvasRect = canvasContainerRef.current.getBoundingClientRect();
    const colLeft = viewportRef.current.getColumnScreenLeft(col, sheet.columnWidths);
    const colW = resolveColumnWidth(col, sheet.columnWidths, viewportRef.current.config.defaultColumnWidth)
      * viewportRef.current.zoomLevel;
    setFilterPanel({
      col,
      rect: {
        left: canvasRect.left + colLeft,
        top: canvasRect.top,
        width: colW,
        height: viewportRef.current.config.headerHeight,
      },
    });
  }, [isBaseSheet, sheet.columnWidths]);

  const columnFilterPanelRequest = useSheetStore(s => s.columnFilterPanelRequest);
  useEffect(() => {
    if (previewMode || !columnFilterPanelRequest || isBaseSheet) return;
    openFilterPanelForCol(columnFilterPanelRequest.col);
    useSheetStore.getState().clearColumnFilterPanelRequest();
  }, [columnFilterPanelRequest, isBaseSheet, openFilterPanelForCol, previewMode]);

  useEffect(() => () => clearAxisResizeLongPress(), [clearAxisResizeLongPress]);

  const syncDiscreteAxisCols = useCallback((next: number[]) => {
    discreteAxisColsRef.current = next;
    setDiscreteAxisCols(next);
    useSheetStore.getState().setAxisDiscreteCols(next);
  }, []);

  const syncDiscreteAxisRows = useCallback((next: number[]) => {
    discreteAxisRowsRef.current = next;
    setDiscreteAxisRows(next);
    useSheetStore.getState().setAxisDiscreteRows(next);
  }, []);

  const clearAxisDiscreteSelection = useCallback(() => {
    syncDiscreteAxisCols([]);
    syncDiscreteAxisRows([]);
  }, [syncDiscreteAxisCols, syncDiscreteAxisRows]);

  const applyColumnRangeSelection = useCallback((fromCol: number, toCol: number, focusCol?: number) => {
    syncDiscreteAxisCols([]);
    syncDiscreteAxisRows([]);
    const minCol = Math.min(fromCol, toCol);
    const maxCol = Math.max(fromCol, toCol);
    const range = buildFullColumnRange(table.sheetId, fromCol, toCol, sheet.rowCount);
    const focus = focusCol ?? toCol;
    setSelection(range, { row: 0, col: focus });
    selectionManagerRef.current.startSelection({ row: 0, col: minCol });
    selectionManagerRef.current.extendSelection({ row: sheet.rowCount - 1, col: maxCol });
    axisAnchorRef.current = { axis: 'col', index: focus };
    dirtyTrackerRef.current.markFullRedraw();
  }, [table.sheetId, sheet.rowCount, setSelection, syncDiscreteAxisCols, syncDiscreteAxisRows]);

  const applyRowRangeSelection = useCallback((fromRow: number, toRow: number, focusRow?: number) => {
    syncDiscreteAxisCols([]);
    syncDiscreteAxisRows([]);
    const minRow = Math.min(fromRow, toRow);
    const maxRow = Math.max(fromRow, toRow);
    const range = buildFullRowRange(table.sheetId, fromRow, toRow, sheet.colCount);
    const focus = focusRow ?? toRow;
    setSelection(range, { row: focus, col: 0 });
    selectionManagerRef.current.startSelection({ row: minRow, col: 0 });
    selectionManagerRef.current.extendSelection({ row: maxRow, col: sheet.colCount - 1 });
    axisAnchorRef.current = { axis: 'row', index: focus };
    dirtyTrackerRef.current.markFullRedraw();
  }, [table.sheetId, sheet.colCount, setSelection, syncDiscreteAxisCols, syncDiscreteAxisRows]);

  const rowTreeMeta = useMemo(() => {
    if (sheet.type !== 'base') return undefined;
    table.ensureRowRecords();
    return buildRowHeaderMeta(sheet.rowCount, sheet.rows, collapsedRowIdSet);
  }, [sheet.type, sheet.rowCount, sheet.rows, collapsedRowIdSet, table]);

  const toggleRowCollapse = useCallback((rowIndex: number) => {
    const record = table.getRowRecord(rowIndex);
    if (!record) return;
    setCollapsedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(record._id)) next.delete(record._id);
      else next.add(record._id);
      return Array.from(next);
    });
  }, [table]);

  // Column header menu states
  const [activeSort, setActiveSort] = useState<{ colIndex: number; order: 'asc' | 'desc' } | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  // Render function
  const performRender = useCallback(() => {
    const layerManager = layerManagerRef.current;
    const viewport = viewportRef.current;
    const renderer = cellRendererRef.current;
    const tracker = dirtyTrackerRef.current;

    if (!layerManager || containerSize.width === 0 || containerSize.height === 0) return;

    viewport.setFreezeState(sheet.freezeState || { frozenRows: 0, frozenCols: 0 });

    const needsFull = tracker.needsFullRedraw;
    const activeRowHeights = resolveActiveRowHeights();
    const isHiddenRow = (r: number) =>
      !isBaseSheet && isRowLayoutHidden(r, activeRowHeights, DEFAULT_ROW_HEIGHT);

    const visibleRange = viewport.calculateVisibleRange(
      containerSize.width, containerSize.height,
      sheet.rowCount, sheet.colCount,
      sheet.columnWidths, activeRowHeights,
    );

    if (needsFull) layerManager.clearAll();

    const freezeState = sheet.freezeState || { frozenRows: 0, frozenCols: 0 };
    const useFreezeSplit = hasActiveFreeze(freezeState);

    const shouldDrawVisibleCell = (r: number, c: number, region: 'all' | 'frozen' | 'scrollable') => {
      if (region === 'frozen') {
        return isCellInFrozenRegion({ row: r, col: c }, freezeState);
      }
      if (region === 'scrollable') {
        return r >= freezeState.frozenRows && c >= freezeState.frozenCols;
      }
      return true;
    };

    const forEachVisibleCell = (
      draw: (row: number, col: number) => void,
      region: 'all' | 'frozen' | 'scrollable' = 'all',
    ) => {
      for (let r = visibleRange.startRow; r <= visibleRange.endRow; r++) {
        if (isHiddenRow(r)) continue;
        if (isBaseSheet && !isRowVisible(r, sheet.rows, collapsedRowIdSet)) continue;
        for (let c = visibleRange.startCol; c <= visibleRange.endCol; c++) {
          if (shouldDrawVisibleCell(r, c, region)) draw(r, c);
        }
      }
    };

    const forEachVisibleCellWithFreezeSplit = (
      ctx: CanvasRenderingContext2D,
      draw: (row: number, col: number) => void,
    ) => {
      if (useFreezeSplit) {
        forEachVisibleCell(draw, 'frozen');
        const restoreClip = clipCanvasToScrollablePane(
          ctx,
          viewport,
          sheet.columnWidths,
          activeRowHeights,
          freezeState.frozenRows,
          freezeState.frozenCols,
          containerSize.width,
          containerSize.height,
        );
        forEachVisibleCell(draw, 'scrollable');
        restoreClip?.();
      } else {
        forEachVisibleCell(draw);
      }
    };

    // Layer 1: Background — always redraw to pick up background color changes
    const bgCtx = layerManager.getLayer(RENDER_LAYERS.BACKGROUND);
    bgCtx.clearRect(0, 0, containerSize.width, containerSize.height);

    const baseGridBounds = isBaseSheet
      ? computeBaseGridScreenBounds(
        viewport.config.headerWidth,
        viewport.config.headerHeight,
        sheet.colCount,
        sheet.rowCount,
        sheet.columnWidths,
        activeRowHeights,
        viewport.config.defaultColumnWidth,
        viewport.config.defaultRowHeight,
        zoomLevel,
        viewport.scrollLeft,
        containerSize.width,
        containerSize.height,
        (row, rh) => viewport.getRowScreenTop(row, rh),
      )
      : null;

    if (isBaseSheet) {
      bgCtx.fillStyle = BASE_THEME.pageBg;
      bgCtx.fillRect(0, 0, containerSize.width, containerSize.height);
      if (baseGridBounds) {
        bgCtx.fillStyle = BASE_THEME.cellBgColor;
        bgCtx.fillRect(0, 0, baseGridBounds.right, baseGridBounds.bottom);
      }
    } else {
      const headerH = viewport.config.headerHeight;
      const headerW = viewport.config.headerWidth;
      bgCtx.fillStyle = '#ffffff';
      bgCtx.fillRect(
        headerW,
        headerH,
        Math.max(0, containerSize.width - headerW),
        Math.max(0, containerSize.height - headerH),
      );
    }
    const drawBackgroundCell = (r: number, c: number) => {
      renderer.drawCellBackground(
        bgCtx,
        { row: r, col: c },
        table.getCell(r, c),
        sheet.columnWidths,
        activeRowHeights,
        sheet.mergeRanges,
      );
    };
    forEachVisibleCellWithFreezeSplit(bgCtx, drawBackgroundCell);

    // 多维表：已勾选行背景高亮
    if (isBaseSheet && checkedRows.length > 0 && baseGridBounds) {
      const rowHighlightWidth = baseGridBounds.right;
      const checkedSet = new Set(checkedRows);
      for (let r = visibleRange.startRow; r <= visibleRange.endRow; r++) {
        if (checkedSet.has(r)) {
          const rowRect = viewportRef.current.getCellRect({ row: r, col: 0 }, sheet.columnWidths, activeRowHeights);
          bgCtx.fillStyle = BASE_THEME.rowCheckedBg;
          bgCtx.fillRect(0, rowRect.y, rowHighlightWidth, rowRect.height);
        }
      }
    }

    // 多维表：hover / 选中行背景（覆盖整行含行头，不超出网格右缘）
    const activeCellRow = previewMode ? null : (useSheetStore.getState().activeCell?.row ?? null);
    if (sheet.type === 'base') {
      const highlightRow = activeHoverRow ?? activeCellRow;
      if (highlightRow !== null && baseGridBounds) {
        const rowHighlightWidth = baseGridBounds.right;
        const rowRect = viewportRef.current.getCellRect({ row: highlightRow, col: 0 }, sheet.columnWidths, activeRowHeights);
        bgCtx.fillStyle = activeHoverRow === highlightRow ? BASE_THEME.rowHoverBg : BASE_THEME.selectionHeaderBg;
        bgCtx.fillRect(0, rowRect.y, rowHighlightWidth, rowRect.height);
      }
    }

    // Always redraw headers (they were cleared above by bgCtx.clearRect)
    const selRange = previewMode ? null : useSheetStore.getState().selectionRange;
    const discreteCells = previewMode ? [] : useSheetStore.getState().discreteSelections;
    const selectedCols = resolveSelectedColumnIndices(discreteAxisCols, selRange, sheet.rowCount);
    const selectedRows = resolveSelectedRowIndices(discreteAxisRows, selRange, sheet.colCount);
    const isAllSelected = selRange?.start.row === 0 && selRange?.start.col === 0 &&
                          selRange?.end.row === sheet.rowCount - 1 && selRange?.end.col === sheet.colCount - 1;
    const allRowsChecked = isBaseSheet && sheet.rowCount > 0 && checkedRows.length === sheet.rowCount;

    // 列头/行号改在 OVERLAY 层绘制（不透明，覆盖滚动后的单元格内容）

    // Layer 2: Gridlines — always redraw so border changes are immediately visible
    const gridCtx = layerManager.getLayer(RENDER_LAYERS.GRIDLINES);
    gridCtx.clearRect(0, 0, containerSize.width, containerSize.height);

    renderer.drawGridlines(gridCtx, visibleRange, sheet.rowCount, sheet.colCount, sheet.columnWidths, activeRowHeights, sheet.freezeState);

    // 编辑区外填充 pageBg（多维表）或白色（普通表）
    if (isBaseSheet && baseGridBounds) {
      gridCtx.fillStyle = BASE_THEME.pageBg;
      if (baseGridBounds.right < containerSize.width) {
        gridCtx.fillRect(
          baseGridBounds.right,
          0,
          containerSize.width - baseGridBounds.right,
          containerSize.height,
        );
      }
      if (baseGridBounds.bottom < containerSize.height) {
        gridCtx.fillRect(
          0,
          baseGridBounds.bottom,
          containerSize.width,
          containerSize.height - baseGridBounds.bottom,
        );
      }
    } else {
      const contentSize = viewport.getTotalContentSize(sheet.rowCount, sheet.colCount, sheet.columnWidths, activeRowHeights);
      const emptyX = contentSize.width - viewport.scrollLeft;
      const emptyY = contentSize.height - viewport.scrollTop;
      if (emptyY < containerSize.height) {
        gridCtx.fillStyle = '#ffffff';
        gridCtx.fillRect(0, Math.max(0, emptyY), containerSize.width, containerSize.height - Math.max(0, emptyY));
      }
      if (emptyX < containerSize.width) {
        gridCtx.fillStyle = '#ffffff';
        gridCtx.fillRect(Math.max(0, emptyX), 0, containerSize.width - Math.max(0, emptyX), containerSize.height);
      }
    }

    // Draw cell borders (over gridlines) — non-merged cells only; merged borders drawn after merge fill
    forEachVisibleCellWithFreezeSplit(gridCtx, (r, c) => {
      if (table.isInMergedCell(r, c)) return;
      renderer.drawCellBorders(gridCtx, { row: r, col: c }, table.getCell(r, c), sheet.columnWidths, activeRowHeights);
    });

    // Layer 3 (MERGE_CELLS): 覆盖合并区域内部网格线
    const mergeCtx = layerManager.getLayer(RENDER_LAYERS.MERGE_CELLS);
    mergeCtx.clearRect(0, 0, containerSize.width, containerSize.height);
    const drawMergeFill = (range: CellRange) => {
      if (range.start.row === range.end.row && range.start.col === range.end.col) return;
      const master = range.master || range.start;
      const topLeft = viewportRef.current.getCellRect(master, sheet.columnWidths, activeRowHeights);
      const bottomRight = viewportRef.current.getCellRect(range.end, sheet.columnWidths, activeRowHeights);
      const w = bottomRight.x + bottomRight.width - topLeft.x;
      const h = bottomRight.y + bottomRight.height - topLeft.y;
      const cellData = table.getCell(master.row, master.col);
      mergeCtx.fillStyle = resolveCellBackgroundFillColor(cellData?.style, viewport.config, master);
      mergeCtx.fillRect(topLeft.x, topLeft.y, w, h);
    };
    if (useFreezeSplit) {
      for (const range of sheet.mergeRanges) {
        const master = range.master || range.start;
        if (master.col < freezeState.frozenCols) drawMergeFill(range);
      }
      const restoreMergeClip = clipCanvasToScrollablePane(
        mergeCtx,
        viewport,
        sheet.columnWidths,
        activeRowHeights,
        freezeState.frozenRows,
        freezeState.frozenCols,
        containerSize.width,
        containerSize.height,
      );
      for (const range of sheet.mergeRanges) {
        const master = range.master || range.start;
        if (master.col >= freezeState.frozenCols) drawMergeFill(range);
      }
      restoreMergeClip?.();
    } else {
      for (const range of sheet.mergeRanges) {
        drawMergeFill(range);
      }
    }

    // 合并单元格边框须在背景填充之后绘制，否则会被盖住
    forEachVisibleCellWithFreezeSplit(mergeCtx, (r, c) => {
      const merged = table.isInMergedCell(r, c);
      if (!merged) return;
      const master = merged.master || merged.start;
      if (r !== master.row || c !== master.col) return;
      renderer.drawCellBorders(
        mergeCtx,
        { row: r, col: c },
        table.getCell(r, c),
        sheet.columnWidths,
        activeRowHeights,
        sheet.mergeRanges,
      );
    });

    // Layer 4: Content — always redraw visible cells so edits show up
    const contentCtx = layerManager.getLayer(RENDER_LAYERS.CONTENT);
    contentCtx.clearRect(0, 0, containerSize.width, containerSize.height);

    // 多维表（Base）字段类型感知渲染
    if (sheet.type === 'base' && sheet.columnDefs.length > 0) {
      const baseRenderer = baseCellRendererRef.current;
      const frozenCols = sheet.freezeState?.frozenCols || 0;
      const frozenBoundary = viewport.config.headerWidth + viewport.getFrozenWidth(sheet.columnWidths);

      const drawBaseCell = (r: number, c: number, ctx: CanvasRenderingContext2D) => {
        if (isColumnHidden(c, sheet.columnDefs, sheet.columnWidths)) return;
        const cellData = table.getCell(r, c);
        const columnDef = sheet.columnDefs[c];
        if (!columnDef) {
          if (cellData) renderer.drawCellContent(ctx, { row: r, col: c }, cellData, sheet.columnWidths, activeRowHeights, sheet.mergeRanges);
          return;
        }
        const emptyCellData: CellData = { value: { type: 'empty' } };
        const cellRect = viewport.getCellRect({ row: r, col: c }, sheet.columnWidths, activeRowHeights);
        if (c === 0 && rowTreeMeta?.[r]) {
          recordTreeRenderer.drawTreeColumn(ctx, cellRect, rowTreeMeta[r], viewport.zoomLevel);
        }
        const contentInset = c === 0 && rowTreeMeta?.[r]
          ? resolveTreeLayout(rowTreeMeta[r], cellRect.width, viewport.zoomLevel).contentInset
          : 0;
        baseRenderer.drawBaseCellContent(
          ctx,
          { row: r, col: c },
          cellData || emptyCellData,
          columnDef,
          sheet.columnWidths,
          activeRowHeights,
          sheet.mergeRanges,
          contentInset,
        );
      };

      if (frozenCols > 0) {
        for (let r = visibleRange.startRow; r <= visibleRange.endRow; r++) {
          if (!isRowVisible(r, sheet.rows, collapsedRowIdSet)) continue;
          for (let c = 0; c < frozenCols; c++) {
            drawBaseCell(r, c, contentCtx);
          }
        }

        contentCtx.save();
        contentCtx.beginPath();
        contentCtx.rect(frozenBoundary, 0, containerSize.width - frozenBoundary, containerSize.height);
        contentCtx.clip();
        for (let r = visibleRange.startRow; r <= visibleRange.endRow; r++) {
          if (!isRowVisible(r, sheet.rows, collapsedRowIdSet)) continue;
          for (let c = Math.max(visibleRange.startCol, frozenCols); c <= visibleRange.endCol; c++) {
            drawBaseCell(r, c, contentCtx);
          }
        }
        contentCtx.restore();
      } else {
        for (let r = visibleRange.startRow; r <= visibleRange.endRow; r++) {
          if (!isRowVisible(r, sheet.rows, collapsedRowIdSet)) continue;
          for (let c = visibleRange.startCol; c <= visibleRange.endCol; c++) {
            drawBaseCell(r, c, contentCtx);
          }
        }
      }
    } else {
      const drawContentCell = (r: number, c: number) => {
        const cellValidation = isFreeformTable
          ? table.getFreeformSpecialValidationAt(r, c)
          : null;
        renderer.drawCellContent(
          contentCtx,
          { row: r, col: c },
          table.getCell(r, c),
          sheet.columnWidths,
          activeRowHeights,
          sheet.mergeRanges,
          cellValidation,
        );
      };
      if (useFreezeSplit) {
        forEachVisibleCell(drawContentCell, 'frozen');
        const restoreContentClip = clipCanvasToScrollablePane(
          contentCtx,
          viewport,
          sheet.columnWidths,
          activeRowHeights,
          freezeState.frozenRows,
          freezeState.frozenCols,
          containerSize.width,
          containerSize.height,
        );
        forEachVisibleCell(drawContentCell, 'scrollable');
        restoreContentClip?.();
      } else {
        forEachVisibleCell(drawContentCell);
      }
    }

    // Layer 5: Selection
    const selCtx = layerManager.getLayer(RENDER_LAYERS.SELECTION);
    selCtx.clearRect(0, 0, containerSize.width, containerSize.height);
    if (discreteAxisCols.length > 0) {
      for (const { start, end } of groupContiguousIndices(discreteAxisCols)) {
        renderer.drawColumnRangeSelection(selCtx, start, end, sheet.rowCount, sheet.columnWidths, activeRowHeights);
      }
    } else if (discreteAxisRows.length > 0) {
      for (const { start, end } of groupContiguousIndices(discreteAxisRows)) {
        renderer.drawRowRangeSelection(selCtx, start, end, sheet.colCount, sheet.columnWidths, activeRowHeights, containerSize.width);
      }
    } else if (discreteCells.length > 1) {
      for (const cell of discreteCells) {
        if (isBaseSheet && cell.col === 0 && rowTreeMeta) {
          renderer.drawBaseTreeColumnSelection(
            selCtx, cell.row, cell.row, sheet.columnWidths, activeRowHeights, rowTreeMeta, false,
          );
        } else {
          renderer.drawSelection(selCtx, {
            sheetId: sheet.sheetId,
            start: cell,
            end: cell,
          }, sheet.columnWidths, activeRowHeights, false);
        }
      }
    } else if (selRange) {
      const showFillHandle = false; // 填充柄改在 OVERLAY 层 + HTML 交互层绘制
      const norm = normalizeRange(selRange);
      const isFullRowRange = norm.startCol === 0 &&
        norm.endCol === sheet.colCount - 1 &&
        sheet.colCount > 1;
      const isFullColRange = norm.startRow === 0 &&
        norm.endRow === sheet.rowCount - 1 &&
        sheet.rowCount > 1;
      const isCol0OnlyRange = norm.startCol === 0 && norm.endCol === 0;

      if (isFullRowRange) {
        renderer.drawRowRangeSelection(
          selCtx, norm.startRow, norm.endRow, sheet.colCount, sheet.columnWidths, activeRowHeights, containerSize.width,
        );
      } else if (isFullColRange) {
        renderer.drawColumnRangeSelection(
          selCtx, norm.startCol, norm.endCol, sheet.rowCount, sheet.columnWidths, activeRowHeights,
        );
      } else if (isBaseSheet && isCol0OnlyRange && rowTreeMeta) {
        renderer.drawBaseTreeColumnSelection(
          selCtx, norm.startRow, norm.endRow, sheet.columnWidths, activeRowHeights, rowTreeMeta, showFillHandle,
        );
      } else {
        renderer.drawSelection(selCtx, selRange, sheet.columnWidths, activeRowHeights, showFillHandle);
      }
    }

    if (fillPreviewRange && supportsAutofill) {
      renderer.drawFillPreview(selCtx, fillPreviewRange, sheet.columnWidths, activeRowHeights);
    }

    if (!previewMode && !isBaseSheet && copiedRange) {
      const copyActiveCell = previewMode ? null : (useSheetStore.getState().activeCell ?? null);
      const copyOverlapsSelection = !!selRange && rangesEqual(copiedRange, selRange);
      renderer.drawCopyMarquee(
        selCtx,
        copiedRange,
        sheet.columnWidths,
        activeRowHeights,
        copyDashOffsetRef.current,
        copyActiveCell,
        !copyOverlapsSelection,
      );
    }

    // Formula range highlighting: when editing a formula, show referenced ranges
    // Also show the live drag range when selecting a range for formula
    const state = useSheetStore.getState();
    if (!previewMode && state.editingCell) {
      const formulaText = state.formulaBarText;
      if (formulaText && formulaText.startsWith('=')) {
        // Show ranges already in the formula
        const parsedRanges = parseFormulaRanges(formulaText);
        const formulaLayer = layerManager.getLayer(RENDER_LAYERS.SELECTION);
        formulaLayer.save();
        for (const range of parsedRanges) {
          renderer.drawFormulaRangeHighlight(formulaLayer, range, sheet.columnWidths, activeRowHeights);
        }
        // Show the currently-being-dragged range
        const fd = formulaDragRef.current;
        if (fd?.active) {
          const dragRange = {
            startRow: Math.min(fd.startCoord.row, fd.endCoord.row),
            endRow: Math.max(fd.startCoord.row, fd.endCoord.row),
            startCol: Math.min(fd.startCoord.col, fd.endCoord.col),
            endCol: Math.max(fd.startCoord.col, fd.endCoord.col),
          };
          renderer.drawFormulaRangeHighlight(formulaLayer, dragRange, sheet.columnWidths, activeRowHeights);
        }
        formulaLayer.restore();
      }
    }

    // Layer 7: Overlay — 不透明列头/行号 + 填充柄
    const overlayCtx = layerManager.getLayer(RENDER_LAYERS.OVERLAY);
    overlayCtx.clearRect(0, 0, containerSize.width, containerSize.height);

    if (isBaseSheet && baseGridBounds) {
      overlayCtx.fillStyle = BASE_THEME.pageBg;
      if (baseGridBounds.right < containerSize.width) {
        overlayCtx.fillRect(
          baseGridBounds.right,
          0,
          containerSize.width - baseGridBounds.right,
          containerSize.height,
        );
      }
      if (baseGridBounds.bottom < containerSize.height) {
        overlayCtx.fillRect(
          0,
          baseGridBounds.bottom,
          baseGridBounds.right,
          containerSize.height - baseGridBounds.bottom,
        );
      }
    }

    // 列标区、行号区、左上角：不透明背景，防止滚动时单元格内容透出
    const filterIconCols = !isBaseSheet ? table.getColumnFilterIconCols() : undefined;
    const activeFilterCols = filterIconCols?.length
      ? getFilteredColumnIndices(sheet.columnFilters ?? [])
      : undefined;
    renderer.drawColumnHeaders(overlayCtx, visibleRange, sheet.colCount, sheet.columnWidths, sheet.columnDefs, hoveredCol, selectedCols, undefined, filterIconCols, activeFilterCols);
    renderer.drawRowHeaders(
      overlayCtx,
      visibleRange,
      sheet.rowCount,
      activeRowHeights,
      activeHoverRow,
      selectedRows,
      checkedRows,
      sheet.type === 'base',
      rowTreeMeta,
      activeCellRow,
      isBaseSheet ? baseGridBounds?.bottom : undefined,
    );
    renderer.drawCornerHeader(overlayCtx, isBaseSheet ? allRowsChecked : isAllSelected, cornerHovered);

    // 行/列拖拽排序指示（图2）
    const axisDrag = axisDragRef.current;
    if (axisDrag?.active) {
      if (axisDrag.axis === 'col') {
        renderer.drawColumnInsertIndicator(overlayCtx, axisDrag.insertIndex, sheet.colCount, sheet.columnWidths, containerSize.height);
        renderer.drawColumnRangeDragPreview(
          overlayCtx, axisDrag.sourceStart, axisDrag.sourceEnd,
          sheet.rowCount, sheet.columnWidths, activeRowHeights, containerSize.height,
        );
      } else {
        renderer.drawRowInsertIndicator(overlayCtx, axisDrag.insertIndex, sheet.rowCount, activeRowHeights, containerSize.width);
        renderer.drawRowRangeDragPreview(
          overlayCtx, axisDrag.sourceStart, axisDrag.sourceEnd,
          sheet.colCount, sheet.columnWidths, activeRowHeights, containerSize.width,
        );
      }
    }

    // 冻结行列分隔线（单元格内容/选区/网格已在下层绘制，此处仅画分隔线避免遮挡）
    const frozenCols = sheet.freezeState?.frozenCols || 0;
    const frozenRows = sheet.freezeState?.frozenRows || 0;
    if (frozenCols > 0 || frozenRows > 0) {
      overlayCtx.strokeStyle = viewport.config.frozenLineColor;
      overlayCtx.lineWidth = 1.5;
      const frozenLineBottom = isBaseSheet && baseGridBounds
        ? baseGridBounds.bottom
        : containerSize.height;
      const frozenLineRight = isBaseSheet && baseGridBounds
        ? baseGridBounds.right
        : containerSize.width;
      if (frozenCols > 0) {
        const frozenBoundaryX = viewport.config.headerWidth + viewport.getFrozenWidth(sheet.columnWidths);
        overlayCtx.beginPath();
        overlayCtx.moveTo(frozenBoundaryX, viewport.config.headerHeight);
        overlayCtx.lineTo(frozenBoundaryX, frozenLineBottom);
        overlayCtx.stroke();
      }
      if (frozenRows > 0) {
        const frozenBoundaryY = viewport.getRowScreenTop(frozenRows, activeRowHeights);
        overlayCtx.beginPath();
        overlayCtx.moveTo(viewport.config.headerWidth, frozenBoundaryY);
        overlayCtx.lineTo(frozenLineRight, frozenBoundaryY);
        overlayCtx.stroke();
      }
    }

    if (
      !previewMode &&
      supportsAutofill &&
      selRange &&
      !state.editingCell &&
      shouldShowFillHandle(selRange, sheet.rowCount, sheet.colCount)
    ) {
      const anchor = getFillHandleAnchor(selRange);
      drawFillHandle(overlayCtx, anchor, viewport, sheet.columnWidths, activeRowHeights);
    }

    tracker.clear();
  }, [table, containerSize, sheet, isBaseSheet, supportsAutofill, checkedRows, hoveredRow, toolbarHoverRow, activeHoverRow, hoveredCol, cornerHovered, resolveActiveRowHeights, rowTreeMeta, collapsedRowIdSet, fillPreviewRange, discreteAxisCols, discreteAxisRows, previewMode, copiedRange]);

  const scheduleRender = useCallback(() => {
    if (renderFrameRef.current) return;
    renderFrameRef.current = requestAnimationFrame(() => {
      renderFrameRef.current = 0;
      performRender();
    });
  }, [performRender]);

  // 复制来源区域蚂蚁线动画
  useEffect(() => {
    if (previewMode || isBaseSheet || !copiedRange) return;
    let running = true;
    const tick = () => {
      if (!running) return;
      copyDashOffsetRef.current = (copyDashOffsetRef.current + 1) % 20;
      scheduleRender();
      copyAnimFrameRef.current = requestAnimationFrame(tick);
    };
    copyAnimFrameRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(copyAnimFrameRef.current);
    };
  }, [copiedRange, previewMode, isBaseSheet, scheduleRender]);

  useEffect(() => {
    setCopiedRange(null);
  }, [table.sheetId]);

  // Initialize
  useEffect(() => {
    if (canvasContainerRef.current) {
      layerManagerRef.current = new LayerManager(canvasContainerRef.current);
    }
    return () => layerManagerRef.current?.destroy();
  }, []);

  // Resize
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Resize + render
  useEffect(() => {
    layerManagerRef.current?.resize(containerSize.width, containerSize.height);
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [containerSize]);

  useEffect(() => {
    if (isBaseSheet) table.ensureRowRecords();
  }, [isBaseSheet, table, sheet.rowCount]);

  useEffect(() => {
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [collapsedRowIds, scheduleRender]);

  // Zoom
  useEffect(() => {
    viewportRef.current.setZoomLevel(zoomLevel);
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [zoomLevel, scheduleRender]);

  // 多维表行头宽度 & 冻结首列 & 视觉主题
  useEffect(() => {
    const vpConfig = viewportRef.current.config;
    if (sheet.type === 'base') {
      applyBaseRenderConfig(vpConfig);
      vpConfig.headerWidth = BASE_HEADER_WIDTH;
      if (!previewMode && (sheet.freezeState?.frozenCols ?? 0) < 1) {
        sheet.freezeState = { frozenRows: 0, frozenCols: 1 };
      }
    } else {
      resetStandardRenderConfig(vpConfig);
      vpConfig.headerWidth = 46;
    }
    viewportRef.current.setFreezeState(sheet.freezeState || { frozenRows: 0, frozenCols: 0 });
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [sheet.type, sheet.freezeState?.frozenCols, sheet.freezeState?.frozenRows, scheduleRender, previewMode]);

  // 缩放 / 尺寸 / 数据变化后，将滚动位置限制在合法范围
  useEffect(() => {
    if (containerSize.width === 0 || containerSize.height === 0) return;
    const vp = viewportRef.current;
    const rowHeights = effectiveRowHeights;
    vp.clampScrollToBounds(
      containerSize.width,
      containerSize.height,
      sheet.rowCount,
      effectiveColCount,
      sheet.columnWidths,
      rowHeights,
      addRowsExtraScrollBottom,
    );
    if (!previewMode) {
      setScrollPosition(vp.scrollTop, vp.scrollLeft);
    }
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [
    containerSize.width,
    containerSize.height,
    zoomLevel,
    sheet.sheetId,
    sheet.rowCount,
    effectiveColCount,
    sheet.columnWidths,
    effectiveRowHeights,
    addRowsExtraScrollBottom,
    setScrollPosition,
    scheduleRender,
    previewMode,
  ]);

  // 滚轮滚动（native 监听以支持 preventDefault，避免越界滑动）
  useEffect(() => {
    if (previewMode) return;
    const el = canvasContainerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const vp = viewportRef.current;
      const rowHeights = effectiveRowHeights;
      vp.setScrollPosition(
        vp.scrollTop + e.deltaY,
        vp.scrollLeft + e.deltaX,
        {
          canvasWidth: containerSize.width,
          canvasHeight: containerSize.height,
          rowCount: sheet.rowCount,
          colCount: effectiveColCount,
          columnWidths: sheet.columnWidths,
          rowHeights,
          extraScrollBottom: addRowsExtraScrollBottom,
        },
      );
      setScrollPosition(vp.scrollTop, vp.scrollLeft);
      dirtyTrackerRef.current.markFullRedraw();
      scheduleRender();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [
    containerSize.width,
    containerSize.height,
    sheet.sheetId,
    sheet.rowCount,
    effectiveColCount,
    sheet.columnWidths,
    effectiveRowHeights,
    addRowsExtraScrollBottom,
    setScrollPosition,
    scheduleRender,
  ]);

  // Data changes
  useEffect(() => {
    const unsub = table.onChange((range) => {
      setLayoutVersion(v => v + 1);
      if (range) {
        dirtyTrackerRef.current.markDirtyRange(range, sheet.columnWidths, sheet.rowHeights, viewportRef.current);
      } else {
        dirtyTrackerRef.current.markFullRedraw();
      }
      scheduleRender();
    });
    return unsub;
  }, [table, scheduleRender, sheet]);

  // 筛选/行高变化后强制重绘
  useEffect(() => {
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [layoutVersion, effectiveRowHeights, scheduleRender]);

  // Formula editing: re-render on formula text changes to show range highlights
  useEffect(() => {
    if (previewMode) return;
    if (editingCell && formulaBarText.startsWith('=')) {
      dirtyTrackerRef.current.markFullRedraw();
      scheduleRender();
    }
  }, [formulaBarText, editingCell, scheduleRender, previewMode]);

  // 选区变化时重绘（含 OVERLAY 层填充柄）
  useEffect(() => {
    if (previewMode) return;
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [selectionRange, discreteSelections, activeCell, scheduleRender, previewMode]);

  // 普通表格：无选中单元格时默认选中 A1
  useEffect(() => {
    if (previewMode) return;
    if (isBaseSheet || editingCell) return;
    if (discreteSelections.length > 0) return;
    if (selectionRange && activeCell && selectionRange.sheetId === table.sheetId) return;

    const coord = { row: 0, col: 0 };
    const range = { sheetId: table.sheetId, start: coord, end: coord };
    selectionManagerRef.current = new SelectionManager(table.sheetId);
    selectionManagerRef.current.startSelection(coord);
    setSelection(range, coord);
    const cellData = table.getCell(coord.row, coord.col);
    setFormulaBarText(cellData ? formatCellEditText(cellData.value) : '');
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [
    isBaseSheet,
    table.sheetId,
    selectionRange,
    activeCell,
    discreteSelections.length,
    editingCell,
    setSelection,
    setFormulaBarText,
    scheduleRender,
    previewMode,
  ]);

  // 普通表格：选中单元格时同步工具栏属性
  useEffect(() => {
    if (previewMode) return;
    if (sheet.type === 'base' || !activeCell) return;
    syncToolbarFromCell(table.getCell(activeCell.row, activeCell.col));
  }, [activeCell, table, sheet.type]);

  // Get cell from mouse event
  const getCellFromClientCoords = useCallback((clientX: number, clientY: number): CellCoord | null => {
    if (!canvasContainerRef.current) return null;
    const rect = canvasContainerRef.current.getBoundingClientRect();
    return viewportRef.current.hitTest(
      clientX, clientY, rect, sheet.rowCount, effectiveColCount,
      sheet.columnWidths, resolveActiveRowHeights(), sheet.mergeRanges,
    );
  }, [sheet, effectiveColCount, resolveActiveRowHeights]);

  const getCellFromEvent = useCallback((e: React.MouseEvent): CellCoord | null => {
    return getCellFromClientCoords(e.clientX, e.clientY);
  }, [getCellFromClientCoords]);

  /** 扩展选区并按合并区域归一化，避免只选中合并格的一部分 */
  const applyExtendedSelection = useCallback((coord: CellCoord, activeCell?: CellCoord | null) => {
    const selMgr = selectionManagerRef.current;
    const raw = selMgr.extendSelection(coord);
    const normalized = normalizeSelectionForMerges(raw, sheet.mergeRanges);
    const active = activeCell ?? selMgr.activeCell ?? coord;
    setSelection(normalized, active);
    return normalized;
  }, [sheet.mergeRanges, setSelection]);

  const normalizeRangeForMerges = useCallback((range: CellRange): CellRange => {
    return normalizeSelectionForMerges(range, sheet.mergeRanges);
  }, [sheet.mergeRanges]);

  const updateFillPreview = useCallback((preview: CellRange) => {
    fillPreviewRangeRef.current = preview;
    setFillPreviewRange(preview);
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [scheduleRender]);

  const finishFillDrag = useCallback(() => {
    if (!isFillDraggingRef.current || !fillSourceRangeRef.current) return false;

    const preview = fillPreviewRangeRef.current;
    if (preview) {
      const src = normalizeRange(fillSourceRangeRef.current);
      const tgt = normalizeRange(preview);
      const expanded = (
        tgt.endRow > src.endRow || tgt.startRow < src.startRow ||
        tgt.endCol > src.endCol || tgt.startCol < src.startCol
      );
      if (expanded) {
        applyAutofill(table, fillSourceRangeRef.current, preview);
        setSelection(preview, preview.end);
        selectionManagerRef.current.startSelection(preview.start);
        selectionManagerRef.current.extendSelection(preview.end);
        useSheetStore.getState().setStatusText('已填充');
      }
    }

    isFillDraggingRef.current = false;
    fillSourceRangeRef.current = null;
    fillPreviewRangeRef.current = null;
    setFillPreviewRange(null);
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    return true;
  }, [table, setSelection, scheduleRender]);

  const startFillDrag = useCallback((sel: CellRange, e?: React.MouseEvent | MouseEvent) => {
    fillSourceRangeRef.current = sel;
    isFillDraggingRef.current = true;
    isDraggingRef.current = false;
    fillPreviewRangeRef.current = sel;
    setFillPreviewRange(sel);
    e?.preventDefault();
    e?.stopPropagation();
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [scheduleRender]);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 右键由 handleContextMenu 处理，避免 mousedown 抢先重置选区
    if (e.button === 2) return;

    // Deselect any selected chart when clicking on canvas
    if (onSelectChart) onSelectChart(null);

    // Check for column/row resize handles first
    const canvasRect = canvasContainerRef.current?.getBoundingClientRect();
    const store = useSheetStore.getState();
    if (canvasRect) {
      const colResize = viewportRef.current.hitTestColumnResize(e.clientX, canvasRect, sheet.colCount, sheet.columnWidths);
      if (colResize !== null && e.clientY - canvasRect.top < viewportRef.current.config.headerHeight) {
        const config = viewportRef.current.config;
        const size = sheet.columnWidths.get(colResize) ?? config.defaultColumnWidth;
        startAxisResizeLongPress('col', colResize, e.clientX, e.clientY, size);
        setResizeState({ type: 'col', index: colResize });
        return;
      }
      if (!isBaseSheet) {
        const rowResize = viewportRef.current.hitTestRowResize(e.clientY, canvasRect, sheet.rowCount, sheet.rowHeights);
        if (rowResize !== null && e.clientX - canvasRect.left < viewportRef.current.config.headerWidth) {
          const config = viewportRef.current.config;
          const activeHeights = resolveActiveRowHeights();
          const size = activeHeights.get(rowResize) ?? config.defaultRowHeight;
          startAxisResizeLongPress('row', rowResize, e.clientX, e.clientY, size);
          setResizeState({ type: 'row', index: rowResize });
          return;
        }
      }

      // 普通表格：填充柄拖动
      if (supportsAutofill && store.selectionRange) {
        const sel = store.selectionRange;
        if (shouldShowFillHandle(sel, sheet.rowCount, sheet.colCount) && hitTestFillHandle(
          e.clientX, e.clientY, canvasRect, sel,
          viewportRef.current, sheet.columnWidths, displayRowHeights,
        )) {
          startFillDrag(sel, e);
          return;
        }
      }

      // Corner click (row+col header intersection) → select all / toggle all row checks
      if (e.clientX >= canvasRect.left && e.clientX < canvasRect.left + viewportRef.current.config.headerWidth &&
          e.clientY >= canvasRect.top && e.clientY < canvasRect.top + viewportRef.current.config.headerHeight) {
        if (isBaseSheet) {
          setCheckedRows(prev =>
            prev.length === sheet.rowCount
              ? []
              : Array.from({ length: sheet.rowCount }, (_, i) => i),
          );
          dirtyTrackerRef.current.markFullRedraw();
          scheduleRender();
          return;
        }
        const allRange: CellRange = {
          sheetId: table.sheetId,
          start: { row: 0, col: 0 },
          end: { row: sheet.rowCount - 1, col: sheet.colCount - 1 },
        };
        clearAxisDiscreteSelection();
        setSelection(allRange, { row: 0, col: 0 });
        selectionManagerRef.current.startSelection({ row: 0, col: 0 });
        selectionManagerRef.current.extendSelection({ row: sheet.rowCount - 1, col: sheet.colCount - 1 });
        dirtyTrackerRef.current.markFullRedraw();
        scheduleRender();
        return;
      }

      // 列头筛选图标点击（筛选功能开启时）
      if (!isBaseSheet && table.getColumnFilterIconCols().length > 0) {
        const filterCol = viewportRef.current.hitTestColumnFilterIcon(
          e.clientX, e.clientY, canvasRect, sheet.colCount, sheet.columnWidths, table.getColumnFilterIconCols(),
        );
        if (filterCol !== null) {
          openFilterPanelForCol(filterCol);
          return;
        }
      }

      // Check column header click → select entire column
      const colHeaderCol = viewportRef.current.findColumnAtX(e.clientX, canvasRect, sheet.colCount, sheet.columnWidths);
      if (colHeaderCol !== null && e.clientY >= canvasRect.top && e.clientY < canvasRect.top + 25) {
        const now = Date.now();
        if (now - lastColClickTimeRef.current < 300) {
          // 双击列头：不执行列选中，留给 handleDoubleClick 处理字段编辑
          lastColClickTimeRef.current = 0;
          return;
        }
        lastColClickTimeRef.current = now;

        const prevSel = useSheetStore.getState().selectionRange;
        const discreteCols = discreteAxisColsRef.current;

        if (e.shiftKey && !(e.ctrlKey || e.metaKey)) {
          const anchor = axisAnchorRef.current?.axis === 'col'
            ? axisAnchorRef.current.index
            : (useSheetStore.getState().activeCell?.col ?? colHeaderCol);
          applyColumnRangeSelection(anchor, colHeaderCol, colHeaderCol);
          scheduleRender();
          return;
        }

        if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
          const contiguous = getContiguousColumnIndices(prevSel, sheet.rowCount);
          syncDiscreteAxisRows([]);
          syncDiscreteAxisCols(toggleDiscreteIndex(discreteCols, colHeaderCol, contiguous));
          const range = buildFullColumnRange(table.sheetId, colHeaderCol, colHeaderCol, sheet.rowCount);
          setSelection(range, { row: 0, col: colHeaderCol });
          axisAnchorRef.current = { axis: 'col', index: colHeaderCol };
          dirtyTrackerRef.current.markFullRedraw();
          scheduleRender();
          return;
        }

        const canDragCol = !isBaseSheet || colHeaderCol > 0;
        if (canDragCol) {
          const alreadySelected = isColumnAxisSelected(colHeaderCol, discreteCols, prevSel, sheet.rowCount);
          if (alreadySelected) {
            const block = getAxisDragBlock(
              colHeaderCol, 'col', discreteCols, discreteAxisRowsRef.current,
              prevSel, sheet.rowCount, sheet.colCount,
            );
            if (!isBaseSheet || block.start > 0) {
              axisDragRef.current = {
                axis: 'col',
                sourceStart: block.start,
                sourceEnd: block.end,
                sourceIndex: colHeaderCol,
                insertIndex: block.start,
                active: false,
                startX: e.clientX,
                startY: e.clientY,
              };
            }
          } else {
            axisHeaderSelectRef.current = {
              axis: 'col',
              anchor: colHeaderCol,
              active: false,
              startX: e.clientX,
              startY: e.clientY,
            };
          }
        }
        applyColumnRangeSelection(colHeaderCol, colHeaderCol, colHeaderCol);
        scheduleRender();
        return;
      }

      // Check row header click → select entire row / toggle checkbox / add row
      const isRowHeader = viewportRef.current.hitTestRowHeader(e.clientX, e.clientY, canvasRect);
      if (isRowHeader) {
        const rowIndex = viewportRef.current.findRowAtY(e.clientY, canvasRect, sheet.rowCount, effectiveRowHeights);
        if (rowIndex !== null) {
          const relX = e.clientX - canvasRect.left;
          const headerW = viewportRef.current.config.headerWidth;

          if (sheet.type === 'base') {
            const meta = rowTreeMeta?.[rowIndex];
            const action = hitTestBaseRowHeader(relX, headerW, meta);
            if (action === 'checkbox') {
              setCheckedRows(prev => {
                const newSet = new Set(prev);
                if (newSet.has(rowIndex)) newSet.delete(rowIndex);
                else newSet.add(rowIndex);
                return Array.from(newSet);
              });
              dirtyTrackerRef.current.markFullRedraw();
              scheduleRender();
              return;
            }
            if (action === 'branchPlus') {
              const parent = table.getRowRecord(rowIndex);
              const newRowIndex = table.insertChildRow(rowIndex);
              if (parent) {
                setCollapsedRowIds(prev => prev.filter(id => id !== parent._id));
              }
              dirtyTrackerRef.current.markFullRedraw();
              scheduleRender();
              useSheetStore.getState().setStatusText(`已添加子记录（第 ${newRowIndex + 1} 行）`);
              return;
            }
            if (action === 'collapse') {
              toggleRowCollapse(rowIndex);
              dirtyTrackerRef.current.markFullRedraw();
              scheduleRender();
              return;
            }

            const prevSel = useSheetStore.getState().selectionRange;
            const discreteRows = discreteAxisRowsRef.current;
            const alreadySelected = isRowAxisSelected(rowIndex, discreteRows, prevSel, sheet.colCount);

            if (action === 'drag') {
              table.ensureRowRecords();
              let block = expandRowDragBlock(rowIndex, rowIndex, sheet.rows);
              axisDragRef.current = {
                axis: 'row',
                sourceStart: block.start,
                sourceEnd: block.end,
                sourceIndex: rowIndex,
                insertIndex: block.start,
                active: false,
                startX: e.clientX,
                startY: e.clientY,
              };
              applyRowRangeSelection(block.start, block.end, rowIndex);
              scheduleRender();
              return;
            }

            if (alreadySelected) {
              table.ensureRowRecords();
              let block = getAxisDragBlock(
                rowIndex, 'row', discreteAxisColsRef.current, discreteRows,
                prevSel, sheet.rowCount, sheet.colCount,
              );
              block = expandRowDragBlock(block.start, block.end, sheet.rows);
              axisDragRef.current = {
                axis: 'row',
                sourceStart: block.start,
                sourceEnd: block.end,
                sourceIndex: rowIndex,
                insertIndex: block.start,
                active: false,
                startX: e.clientX,
                startY: e.clientY,
              };
            } else {
              axisHeaderSelectRef.current = {
                axis: 'row',
                anchor: rowIndex,
                active: false,
                startX: e.clientX,
                startY: e.clientY,
              };
            }
            applyRowRangeSelection(rowIndex, rowIndex, rowIndex);
            scheduleRender();
            return;
          }

          const prevSel = useSheetStore.getState().selectionRange;
          const discreteRows = discreteAxisRowsRef.current;

          if (!isBaseSheet && e.shiftKey && !(e.ctrlKey || e.metaKey)) {
            const anchor = axisAnchorRef.current?.axis === 'row'
              ? axisAnchorRef.current.index
              : (useSheetStore.getState().activeCell?.row ?? rowIndex);
            applyRowRangeSelection(anchor, rowIndex, rowIndex);
            scheduleRender();
            return;
          }

          if (!isBaseSheet && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
            const contiguous = getContiguousRowIndices(prevSel, sheet.colCount);
            syncDiscreteAxisCols([]);
            syncDiscreteAxisRows(toggleDiscreteIndex(discreteRows, rowIndex, contiguous));
            const range = buildFullRowRange(table.sheetId, rowIndex, rowIndex, sheet.colCount);
            setSelection(range, { row: rowIndex, col: 0 });
            axisAnchorRef.current = { axis: 'row', index: rowIndex };
            dirtyTrackerRef.current.markFullRedraw();
            scheduleRender();
            return;
          }

          if (!isBaseSheet) {
            const alreadySelected = isRowAxisSelected(rowIndex, discreteRows, prevSel, sheet.colCount);
            if (alreadySelected) {
              const block = getAxisDragBlock(
                rowIndex, 'row', discreteAxisColsRef.current, discreteRows,
                prevSel, sheet.rowCount, sheet.colCount,
              );
              axisDragRef.current = {
                axis: 'row',
                sourceStart: block.start,
                sourceEnd: block.end,
                sourceIndex: rowIndex,
                insertIndex: block.start,
                active: false,
                startX: e.clientX,
                startY: e.clientY,
              };
            } else {
              axisHeaderSelectRef.current = {
                axis: 'row',
                anchor: rowIndex,
                active: false,
                startX: e.clientX,
                startY: e.clientY,
              };
            }
            applyRowRangeSelection(rowIndex, rowIndex, rowIndex);
            scheduleRender();
            return;
          }
        }
      }
    }

    const coord = getCellFromEvent(e);
    if (!coord) return;

    // 多维表第一列：子记录树形控件点击
    if (sheet.type === 'base' && coord.col === 0 && canvasRect) {
      const meta = rowTreeMeta?.[coord.row];
      const cellRect = viewportRef.current.getCellRect(
        coord, sheet.columnWidths, displayRowHeights,
      );
      const relX = e.clientX - canvasRect.left - cellRect.x;
      const relY = e.clientY - canvasRect.top - cellRect.y;
      const treeAction = hitTestRecordTreeColumn(
        relX, relY, cellRect.width, cellRect.height, meta, viewportRef.current.zoomLevel,
      );
      if (treeAction === 'collapse') {
        toggleRowCollapse(coord.row);
        dirtyTrackerRef.current.markFullRedraw();
        scheduleRender();
        return;
      }
    }

    // 进入单元格选区：清除列/行头离散多选
    clearAxisDiscreteSelection();

    // Shift+点击 / Command+点击 选区（优先于字段快捷交互）
    if (editingCell && sheet.type !== 'base') {
      const editText = useSheetStore.getState().formulaBarText;
      handleEditCommit(editingCell, editText);
    }

    if (e.shiftKey && !(e.ctrlKey || e.metaKey)) {
      const anchor = selectionManagerRef.current.anchorCell ?? useSheetStore.getState().activeCell;
      if (anchor) {
        if (!selectionManagerRef.current.anchorCell) {
          selectionManagerRef.current.startSelection(anchor);
        }
        applyExtendedSelection(coord);
        const cellData = table.getCell(coord.row, coord.col);
        if (sheet.type === 'base') {
          setTimeout(() => setFormulaBarText(cellData ? formatCellEditText(cellData.value) : ''), 10);
        } else {
          setFormulaBarText(cellData ? formatCellEditText(cellData.value) : '');
        }
        isDraggingRef.current = false;
        dirtyTrackerRef.current.markFullRedraw();
        scheduleRender();
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      const cells = selectionManagerRef.current.toggleDiscreteSelection(coord);
      if (cells.length === 0) {
        selectionManagerRef.current.clear();
        setSelection(null, null);
      } else if (cells.length === 1) {
        const c = cells[0];
        const singleRange: CellRange = {
          sheetId: table.sheetId,
          start: c,
          end: c,
        };
        selectionManagerRef.current.startSelection(c);
        setSelection(singleRange, c);
      } else {
        setDiscreteSelections(cells, coord);
      }
      const cellData = table.getCell(coord.row, coord.col);
      if (sheet.type === 'base') {
        setTimeout(() => setFormulaBarText(cellData ? formatCellEditText(cellData.value) : ''), 10);
      } else {
        setFormulaBarText(cellData ? formatCellEditText(cellData.value) : '');
      }
      isDraggingRef.current = false;
      dirtyTrackerRef.current.markFullRedraw();
      scheduleRender();
      return;
    }

    // 多维表/标准表：布尔字段单击直接切换（无需进入编辑态）
    const clickedColumnDef = sheet.columnDefs[coord.col];
    if (clickedColumnDef?.type === 'boolean') {
      const cellData = table.getCell(coord.row, coord.col);
      const currentValue = cellData?.value?.type === 'boolean' ? cellData.value.value : false;
      const newValue = !currentValue;
      table.setCellValue(coord.row, coord.col, { type: 'boolean', value: newValue });
      setFormulaBarText(newValue ? 'TRUE' : 'FALSE');
      const singleRange: CellRange = {
        sheetId: table.sheetId,
        start: coord,
        end: coord,
      };
      setSelection(singleRange, coord);
      selectionManagerRef.current.setActiveCell(coord);
      dirtyTrackerRef.current.markFullRedraw();
      scheduleRender();
      return;
    }

    // 普通表格：下拉列表 / 日期 / 复选框单元格单击
    if (isFreeformTable) {
      const freeformCellData = table.getCell(coord.row, coord.col);
      if (freeformCellData?.value.type === 'boolean') {
        if (editingCell && sheet.type !== 'base') {
          const editText = useSheetStore.getState().formulaBarText;
          handleEditCommit(editingCell, editText);
        }
        const newValue = !freeformCellData.value.value;
        table.setCellValue(coord.row, coord.col, { type: 'boolean', value: newValue });
        setFormulaBarText(formatCellEditText({ type: 'boolean', value: newValue }));
        setDropdownEditCell(null);
        setDateEditCell(null);
        setEditingCell(null);
        const singleRange: CellRange = {
          sheetId: table.sheetId,
          start: coord,
          end: coord,
        };
        setSelection(singleRange, coord);
        selectionManagerRef.current.setActiveCell(coord);
        isDraggingRef.current = false;
        dirtyTrackerRef.current.markFullRedraw();
        scheduleRender();
        return;
      }

      const dropdownValidation = table.getDropdownValidationAt(coord.row, coord.col);
      if (dropdownValidation) {
        if (editingCell && sheet.type !== 'base') {
          const editText = useSheetStore.getState().formulaBarText;
          handleEditCommit(editingCell, editText);
        }
        setDateEditCell(null);
        setDropdownEditCell(coord);
        setEditingCell(null);
        const cellData = table.getCell(coord.row, coord.col);
        setFormulaBarText(cellData ? formatCellEditText(cellData.value) : '');
        const singleRange: CellRange = {
          sheetId: table.sheetId,
          start: coord,
          end: coord,
        };
        setSelection(singleRange, coord);
        selectionManagerRef.current.setActiveCell(coord);
        isDraggingRef.current = false;
        dirtyTrackerRef.current.markFullRedraw();
        scheduleRender();
        return;
      }

      const dateValidation = table.getDateValidationAt(coord.row, coord.col);
      if (dateValidation) {
        if (editingCell && sheet.type !== 'base') {
          const editText = useSheetStore.getState().formulaBarText;
          handleEditCommit(editingCell, editText);
        }
        setDropdownEditCell(null);
        setDateEditCell(coord);
        setEditingCell(null);
        const cellData = table.getCell(coord.row, coord.col);
        setFormulaBarText(cellData ? formatCellEditText(cellData.value) : '');
        const singleRange: CellRange = {
          sheetId: table.sheetId,
          start: coord,
          end: coord,
        };
        setSelection(singleRange, coord);
        selectionManagerRef.current.setActiveCell(coord);
        isDraggingRef.current = false;
        dirtyTrackerRef.current.markFullRedraw();
        scheduleRender();
        return;
      }
    }

    // 多维表/标准表：评分字段单击直接设置值
    if (clickedColumnDef?.type === 'rating') {
      const cellRect = viewportRef.current.getCellRect(coord, sheet.columnWidths, sheet.rowHeights);
      const canvasRect = canvasContainerRef.current?.getBoundingClientRect();
      if (canvasRect) {
        const relX = e.clientX - canvasRect.left - cellRect.x;
        const relY = e.clientY - canvasRect.top - cellRect.y;
        const zoom = viewportRef.current.zoomLevel;
        const ratingConfig = getRatingConfig(clickedColumnDef);
        const newRating = hitTestRating(relX, relY, cellRect.width, cellRect.height, ratingConfig, zoom);
        if (newRating !== null) {
          table.setCellValue(coord.row, coord.col, { type: 'number', value: newRating, format: { kind: 'general' } });
          setFormulaBarText(String(newRating));
          const singleRange: CellRange = {
            sheetId: table.sheetId,
            start: coord,
            end: coord,
          };
          setSelection(singleRange, coord);
          selectionManagerRef.current.setActiveCell(coord);
          dirtyTrackerRef.current.markFullRedraw();
          scheduleRender();
          return;
        }
      }
    }

    // 多维表/标准表：进度条字段单击直接设置并开始拖动（多维表改为双击编辑）
    if (clickedColumnDef?.type === 'progress' && sheet.type !== 'base') {
      const cellRect = viewportRef.current.getCellRect(coord, sheet.columnWidths, sheet.rowHeights);
      const canvasRect = canvasContainerRef.current?.getBoundingClientRect();
      if (canvasRect) {
        const relX = e.clientX - canvasRect.left - cellRect.x;
        const zoom = viewportRef.current.zoomLevel;
        const padding = 4 * zoom;
        const barWidth = Math.max(1, cellRect.width - padding * 2);
        const progress = Math.round((Math.max(0, Math.min(barWidth, relX - padding)) / barWidth) * 100 / 5) * 5;
        const newProgress = Math.max(0, Math.min(100, progress));
        table.setCellValue(coord.row, coord.col, { type: 'number', value: newProgress, format: { kind: 'general' } });
        setFormulaBarText(String(newProgress) + '%');
        setProgressDrag(coord);
        const singleRange: CellRange = {
          sheetId: table.sheetId,
          start: coord,
          end: coord,
        };
        setSelection(singleRange, coord);
        selectionManagerRef.current.setActiveCell(coord);
        dirtyTrackerRef.current.markFullRedraw();
        scheduleRender();
        return;
      }
    }

    // 多维表：成员字段单击直接进入编辑（单选/多选/日期/进度/附件等改为双击编辑）
    if (isBaseSheet && clickedColumnDef?.type === 'user') {
      const cellData = table.getCell(coord.row, coord.col);
      setEditingCell(coord);
      setFormulaBarText(cellData ? formatCellEditText(cellData.value) : '');
      const singleRange: CellRange = {
        sheetId: table.sheetId,
        start: coord,
        end: coord,
      };
      setSelection(singleRange, coord);
      selectionManagerRef.current.setActiveCell(coord);
      dirtyTrackerRef.current.markFullRedraw();
      scheduleRender();
      return;
    }

    // Formula range selection mode: if editing a formula, don't commit — instead start range drag
    const storeState = useSheetStore.getState();
    if (editingCell && storeState.formulaBarText && storeState.formulaBarText.startsWith('=')) {
      const inputEl = (e.target as HTMLElement)?.closest?.('input');
      // Don't intercept clicks on the CellEditor input itself
      if (inputEl) return;

      e.preventDefault();
      // Save cursor position now, before input loses focus during drag
      const editorInput = document.querySelector<HTMLInputElement>('[data-cell-editor]');
      formulaDragCursorRef.current = editorInput?.selectionStart ?? 0;
      // Start formula range drag selection
      setFormulaDrag({ active: true, startCoord: coord, endCoord: coord });
      dirtyTrackerRef.current.markFullRedraw();
      scheduleRender();
      return;
    }

    // Commit any active editing before switching cells
    // 多维表使用 BaseCellEditor 自带 onBlur 提交，避免 mousedown 先于 blur 导致旧值覆盖
    if (editingCell && sheet.type !== 'base') {
      const editText = useSheetStore.getState().formulaBarText;
      handleEditCommit(editingCell, editText);
    }
    if (!isFreeformTable || !table.getFreeformSpecialValidationAt(coord.row, coord.col)) {
      setDropdownEditCell(null);
      setDateEditCell(null);
    }

    // 合并区域：选区扩展为整个合并范围
    let selRange: CellRange = {
      sheetId: table.sheetId,
      start: coord,
      end: coord,
      master: coord,
    };
    for (const range of sheet.mergeRanges) {
      const master = range.master || range.start;
      if (coord.row === master.row && coord.col === master.col) {
        selRange = range;
        break;
      }
    }

    const sel =     selectionManagerRef.current.startSelection(selRange.start);
    selectionManagerRef.current.extendSelection(selRange.end);
    const normalizedSel = normalizeRangeForMerges(selRange);
    setSelection(normalizedSel, selRange.start);
    canvasContainerRef.current?.focus({ preventScroll: true });
    const cellData = table.getCell(coord.row, coord.col);
    if (sheet.type === 'base') {
      // 延迟设置，确保在 BaseCellEditor onBlur 提交后应用新单元格值
      setTimeout(() => setFormulaBarText(cellData ? formatCellEditText(cellData.value) : ''), 10);
    } else {
      setFormulaBarText(cellData ? formatCellEditText(cellData.value) : '');
    }

    isDraggingRef.current = true;
    scheduleRender();
  }, [getCellFromEvent, table, setSelection, setDiscreteSelections, setFormulaBarText, scheduleRender, editingCell, setEditingCell, progressDrag, isBaseSheet, isFreeformTable, supportsAutofill, startFillDrag, sheet.rowCount, sheet.colCount, sheet.columnWidths, displayRowHeights, openFilterPanelForCol, applyColumnRangeSelection, applyRowRangeSelection, clearAxisDiscreteSelection, syncDiscreteAxisCols, syncDiscreteAxisRows, applyExtendedSelection, normalizeRangeForMerges]);

  const handleRequestDeleteRows = useCallback((rows: number[]) => {
    if (rows.length === 0) return;
    setDeleteDialog({ visible: true, rows: [...new Set(rows)].sort((a, b) => a - b) });
  }, []);

  const openRecordDrawer = useCallback((rowIndex: number, tab: RecordDrawerTab = 'detail') => {
    setDetailRowIndex(rowIndex);
    setDetailDrawerTab(tab);
  }, []);

  const handleBaseInsertRowsAbove = useCallback((rowIndex: number, count: number) => {
    table.runBatch(() => table.insertRows(rowIndex, count), 'insertRows');
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    useSheetStore.getState().setStatusText(`已在第 ${rowIndex + 1} 行上方插入 ${count} 行`);
  }, [table, scheduleRender]);

  const handleBaseInsertRowsBelow = useCallback((rowIndex: number, count: number) => {
    table.runBatch(() => table.insertRows(rowIndex + 1, count), 'insertRows');
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    useSheetStore.getState().setStatusText(`已在第 ${rowIndex + 1} 行下方插入 ${count} 行`);
  }, [table, scheduleRender]);

  const handleBaseAddChildRecord = useCallback((rowIndex: number) => {
    const parent = table.getRowRecord(rowIndex);
    const newRowIndex = table.insertChildRow(rowIndex);
    if (parent) {
      setCollapsedRowIds(prev => prev.filter(id => id !== parent._id));
    }
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    useSheetStore.getState().setStatusText(`已添加子记录（第 ${newRowIndex + 1} 行）`);
  }, [table, scheduleRender]);

  const handleBaseAddComment = useCallback((rowIndex: number) => {
    useSheetStore.getState().setStatusText(`已为第 ${rowIndex + 1} 行添加评论（待实现）`);
  }, []);

  const handleBaseFilterByCell = useCallback((rowIndex: number, colIndex: number) => {
    const colDef = sheet.columnDefs[colIndex];
    const cell = table.getCell(rowIndex, colIndex);
    const cellText = cell ? getCellText(cell.value) : '';
    const label = cellText.trim() || '空值';
    useSheetStore.getState().setStatusText(`已按「${label}」筛选字段「${colDef?.name || ''}」`);
  }, [sheet, table]);

  const handleBaseDeleteRecord = useCallback((rowIndex: number) => {
    handleRequestDeleteRows([rowIndex]);
  }, [handleRequestDeleteRows]);

  const handleConfirmDeleteRows = useCallback(() => {
    const rows = [...deleteDialog.rows].sort((a, b) => b - a);
    table.runBatch(() => {
      for (const row of rows) {
        table.deleteRows(row, 1);
      }
    }, 'deleteRows');
    setCheckedRows([]);
    setDeleteDialog({ visible: false, rows: [] });
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    useSheetStore.getState().setStatusText(`已删除 ${rows.length} 行记录`);
  }, [deleteDialog.rows, table, scheduleRender]);

  const handleCancelDeleteRows = useCallback(() => {
    setDeleteDialog({ visible: false, rows: [] });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvasRect = canvasContainerRef.current?.getBoundingClientRect();

    // 行/列头框选 或 拖拽排序
    const axisHeaderSelect = axisHeaderSelectRef.current;
    if (axisHeaderSelect && canvasRect && (!isBaseSheet || axisHeaderSelect.axis === 'col')) {
      const dx = Math.abs(e.clientX - axisHeaderSelect.startX);
      const dy = Math.abs(e.clientY - axisHeaderSelect.startY);
      if (!axisHeaderSelect.active && (dx > 4 || dy > 4)) {
        axisHeaderSelect.active = true;
      }
      if (axisHeaderSelect.active) {
        if (axisHeaderSelect.axis === 'col') {
          const targetCol = viewportRef.current.findColumnAtX(
            e.clientX, canvasRect, sheet.colCount, sheet.columnWidths,
          );
          if (targetCol !== null) {
            applyColumnRangeSelection(axisHeaderSelect.anchor, targetCol, targetCol);
          }
        } else {
          const targetRow = viewportRef.current.findRowAtY(
            e.clientY, canvasRect, sheet.rowCount, effectiveRowHeights,
          );
          if (targetRow !== null) {
            applyRowRangeSelection(axisHeaderSelect.anchor, targetRow, targetRow);
          }
        }
        dirtyTrackerRef.current.markFullRedraw();
        scheduleRender();
        return;
      }
    }

    const axisDrag = axisDragRef.current;
    if (axisDrag && canvasRect) {
      const dx = Math.abs(e.clientX - axisDrag.startX);
      const dy = Math.abs(e.clientY - axisDrag.startY);
      if (!axisDrag.active && (dx > 4 || dy > 4)) {
        axisDrag.active = true;
        setAxisDragTick(t => t + 1);
      }
      if (axisDrag.active) {
        const dragCanvas = canvasContainerRef.current;
        if (dragCanvas) dragCanvas.style.cursor = 'grabbing';
        if (axisDrag.axis === 'col') {
          const targetCol = viewportRef.current.findColumnAtX(
            e.clientX, canvasRect, sheet.colCount, sheet.columnWidths,
          );
          if (targetCol !== null) {
            const colLeft = viewportRef.current.getColumnScreenLeft(targetCol, sheet.columnWidths);
            const colW = resolveColumnWidth(targetCol, sheet.columnWidths, viewportRef.current.config.defaultColumnWidth)
              * viewportRef.current.zoomLevel;
            const relX = e.clientX - canvasRect.left;
            let insert = relX < colLeft + colW / 2
              ? targetCol
              : Math.min(targetCol + 1, sheet.colCount - 1);
            const { sourceStart, sourceEnd } = axisDrag;
            if (insert > sourceStart && insert <= sourceEnd) {
              insert = insert > Math.floor((sourceStart + sourceEnd) / 2) ? sourceEnd + 1 : sourceStart;
            }
            if (isBaseSheet) {
              insert = Math.max(1, insert);
            }
            axisDrag.insertIndex = insert;
          }
        } else {
          const targetRow = viewportRef.current.findRowAtY(
            e.clientY, canvasRect, sheet.rowCount, effectiveRowHeights,
          );
          if (targetRow !== null) {
            const rowRect = viewportRef.current.getCellRect(
              { row: targetRow, col: 0 }, sheet.columnWidths, effectiveRowHeights,
            );
            const relY = e.clientY - canvasRect.top;
            let insert = relY < rowRect.y + rowRect.height / 2
              ? targetRow
              : Math.min(targetRow + 1, sheet.rowCount - 1);
            const { sourceStart, sourceEnd } = axisDrag;
            if (insert > sourceStart && insert <= sourceEnd) {
              insert = insert > Math.floor((sourceStart + sourceEnd) / 2) ? sourceEnd + 1 : sourceStart;
            }
            if (isBaseSheet && sourceStart === sourceEnd) {
              table.ensureRowRecords();
              const bounds = getSiblingInsertBounds(sourceStart, sheet.rows);
              insert = Math.max(bounds.min, Math.min(insert, bounds.max));
            }
            axisDrag.insertIndex = insert;
          }
        }
        dirtyTrackerRef.current.markFullRedraw();
        scheduleRender();
        return;
      }
    }

    // Formula range drag mode
    if (formulaDragRef.current?.active) {
      const inputEl = (e.target as HTMLElement)?.closest?.('input');
      if (inputEl) return; // Don't interfere with CellEditor input interaction
      const coord = getCellFromEvent(e);
      if (!coord) return;
      setFormulaDrag(prev => prev ? { ...prev, endCoord: coord } : prev);
      dirtyTrackerRef.current.markFullRedraw();
      scheduleRender();
      return;
    }

    // 普通表格：填充柄拖动
    if (isFillDraggingRef.current && fillSourceRangeRef.current) {
      const canvasEl = canvasContainerRef.current;
      if (canvasEl) canvasEl.style.cursor = 'crosshair';
      const coord = getCellFromEvent(e);
      if (!coord) return;
      const preview = computeFillTargetRange(fillSourceRangeRef.current, coord);
      updateFillPreview(preview);
      return;
    }

    // Cursor change for resize handles + header hover detection
    const canvasEl = canvasContainerRef.current;
    if (canvasRect && !resizeState && canvasEl) {
      const colResize = viewportRef.current.hitTestColumnResize(e.clientX, canvasRect, sheet.colCount, sheet.columnWidths);
      if (colResize !== null && e.clientY - canvasRect.top < viewportRef.current.config.headerHeight) {
        canvasEl.style.cursor = 'col-resize';
        setHoveredCol(null);
        setHoveredRow(null);
        setCornerHovered(false);
        scheduleRender();
        return;
      }
      if (!isBaseSheet) {
        const rowResize = viewportRef.current.hitTestRowResize(e.clientY, canvasRect, sheet.rowCount, sheet.rowHeights);
        if (rowResize !== null && e.clientX - canvasRect.left < viewportRef.current.config.headerWidth) {
          canvasEl.style.cursor = 'row-resize';
          setHoveredCol(null);
          setHoveredRow(null);
          setCornerHovered(false);
          scheduleRender();
          return;
        }
      }
      canvasEl.style.cursor = 'cell';

      // 普通表格：填充柄 hover 十字光标
      if (supportsAutofill) {
        const selRange = useSheetStore.getState().selectionRange;
        if (selRange && shouldShowFillHandle(selRange, sheet.rowCount, sheet.colCount) && hitTestFillHandle(
          e.clientX, e.clientY, canvasRect, selRange,
          viewportRef.current, sheet.columnWidths, displayRowHeights,
        )) {
          canvasEl.style.cursor = 'crosshair';
          scheduleRender();
          return;
        }
      }

      // Column header hover
      const colHeaderCol = viewportRef.current.findColumnAtX(e.clientX, canvasRect, sheet.colCount, sheet.columnWidths);
      const inColHeader = colHeaderCol !== null && e.clientY - canvasRect.top < viewportRef.current.config.headerHeight && e.clientX - canvasRect.left >= viewportRef.current.config.headerWidth;
      if (inColHeader) {
        setHoveredCol(colHeaderCol);
        setHoveredRow(null);
        setCornerHovered(false);
        if (canvasEl) {
          const selRange = useSheetStore.getState().selectionRange;
          const canGrabCol = isColumnAxisSelected(colHeaderCol, discreteAxisCols, selRange, sheet.rowCount)
            && (!isBaseSheet || colHeaderCol > 0);
          if (canGrabCol) {
            canvasEl.style.cursor = axisDragRef.current?.active ? 'grabbing' : 'grab';
          }
        }
      } else {
        setHoveredCol(null);
      }

      // Row header hover
      const isRowHeader = viewportRef.current.hitTestRowHeader(e.clientX, e.clientY, canvasRect);
      if (isRowHeader) {
        const rowIndex = viewportRef.current.findRowAtY(e.clientY, canvasRect, sheet.rowCount, effectiveRowHeights);
        if (rowIndex !== null) {
          setHoveredRow(isBaseSheet ? rowIndex : rowIndex);
          setHoveredCol(null);
          setCornerHovered(false);
          if (canvasEl) {
            const selRange = useSheetStore.getState().selectionRange;
            const canGrabRow = isRowAxisSelected(rowIndex, discreteAxisRows, selRange, sheet.colCount);
            if (isBaseSheet) {
              const relX = e.clientX - canvasRect.left;
              const headerW = viewportRef.current.config.headerWidth;
              const action = hitTestBaseRowHeader(relX, headerW, rowTreeMeta?.[rowIndex]);
              if (action === 'drag' || canGrabRow) {
                canvasEl.style.cursor = axisDragRef.current?.active ? 'grabbing' : 'grab';
              }
            } else if (canGrabRow) {
              canvasEl.style.cursor = axisDragRef.current?.active ? 'grabbing' : 'grab';
            }
          }
        }
      } else if (!inColHeader) {
        // 内容区移动：检测所在行（仅多维表）
        const contentRow = viewportRef.current.findRowAtY(e.clientY, canvasRect, sheet.rowCount, sheet.rowHeights);
        if (contentRow !== null && sheet.type === 'base') {
          setHoveredRow(contentRow);
        } else {
          setHoveredRow(null);
        }
        setHoveredCol(null);
        setCornerHovered(false);
      }

      // Corner hover
      const inCorner = e.clientX >= canvasRect.left && e.clientX < canvasRect.left + viewportRef.current.config.headerWidth &&
                       e.clientY >= canvasRect.top && e.clientY < canvasRect.top + viewportRef.current.config.headerHeight;
      if (inCorner) {
        setCornerHovered(true);
        setHoveredCol(null);
        setHoveredRow(null);
      } else if (!inColHeader && !isRowHeader) {
        setCornerHovered(false);
      }
    }

    // 进度条拖动中：实时更新值
    if (progressDrag) {
      const cellRect = viewportRef.current.getCellRect(progressDrag, sheet.columnWidths, sheet.rowHeights);
      const canvasRect = canvasContainerRef.current?.getBoundingClientRect();
      if (canvasRect) {
        const relX = e.clientX - canvasRect.left - cellRect.x;
        const zoom = viewportRef.current.zoomLevel;
        const padding = 4 * zoom;
        const barWidth = Math.max(1, cellRect.width - padding * 2);
        const progress = Math.round((Math.max(0, Math.min(barWidth, relX - padding)) / barWidth) * 100 / 5) * 5;
        const newProgress = Math.max(0, Math.min(100, progress));
        table.setCellValue(progressDrag.row, progressDrag.col, { type: 'number', value: newProgress, format: { kind: 'general' } });
        setFormulaBarText(String(newProgress) + '%');
        dirtyTrackerRef.current.markFullRedraw();
        scheduleRender();
        return;
      }
    }

    // 评分 hover 预览
    if (!isDraggingRef.current) {
      const hoverCoord = getCellFromEvent(e);
      const hoverColDef = hoverCoord ? sheet.columnDefs[hoverCoord.col] : undefined;
      if (hoverCoord && hoverColDef?.type === 'rating') {
        const cellRect = viewportRef.current.getCellRect(hoverCoord, sheet.columnWidths, sheet.rowHeights);
        const canvasRect = canvasContainerRef.current?.getBoundingClientRect();
        if (canvasRect) {
          const relX = e.clientX - canvasRect.left - cellRect.x;
          const relY = e.clientY - canvasRect.top - cellRect.y;
          const zoom = viewportRef.current.zoomLevel;
          const ratingConfig = getRatingConfig(hoverColDef);
          const hoverValue = hitTestRating(relX, relY, cellRect.width, cellRect.height, ratingConfig, zoom);
          if (hoverValue !== null) {
            setHoverRatingCell({ row: hoverCoord.row, col: hoverCoord.col, value: hoverValue });
          } else {
            setHoverRatingCell(null);
          }
        }
      } else {
        setHoverRatingCell(null);
      }
    }

    if (!isDraggingRef.current) {
      scheduleRender();
      return;
    }
    const coord = getCellFromEvent(e);
    if (!coord) return;
    applyExtendedSelection(coord);
    scheduleRender();
  }, [getCellFromEvent, applyExtendedSelection, scheduleRender, resizeState, sheet, progressDrag, supportsAutofill, updateFillPreview, displayRowHeights, effectiveRowHeights, isBaseSheet, table, applyColumnRangeSelection, applyRowRangeSelection, discreteAxisCols, discreteAxisRows, rowTreeMeta]);

  const handleMouseUp = useCallback(() => {
    if (axisHeaderSelectRef.current) {
      axisHeaderSelectRef.current = null;
    }

    // 完成行/列拖拽排序
    const axisDrag = axisDragRef.current;
    if (axisDrag?.active) {
      const { sourceStart, sourceEnd, insertIndex, axis, sourceIndex } = axisDrag;
      const destStart = computeAxisBlockDestStart(sourceStart, sourceEnd, insertIndex);
      if (destStart !== sourceStart) {
        const checkedIds = isBaseSheet && axis === 'row'
          ? new Set(checkedRows.map(r => table.getRowRecord(r)?._id).filter((id): id is string => !!id))
          : null;
        if (axis === 'col') {
          table.moveColumnBlock(sourceStart, sourceEnd, insertIndex);
          table.syncColumnLayout();
          const newEnd = destStart + (sourceEnd - sourceStart);
          applyColumnRangeSelection(destStart, newEnd, sourceIndex);
          useSheetStore.getState().setStatusText(
            sourceStart === sourceEnd
              ? `已移动列 ${sourceStart + 1} → ${destStart + 1}`
              : `已移动列 ${sourceStart + 1}-${sourceEnd + 1} → ${destStart + 1}`,
          );
        } else {
          table.moveRowBlock(sourceStart, sourceEnd, insertIndex);
          const newEnd = destStart + (sourceEnd - sourceStart);
          applyRowRangeSelection(destStart, newEnd, sourceIndex);
          if (checkedIds && checkedIds.size > 0) {
            table.ensureRowRecords();
            const nextChecked: number[] = [];
            for (let r = 0; r < table.sheet.rowCount; r++) {
              const rec = table.getRowRecord(r);
              if (rec && checkedIds.has(rec._id)) nextChecked.push(r);
            }
            setCheckedRows(nextChecked);
          }
          useSheetStore.getState().setStatusText(
            sourceStart === sourceEnd
              ? `已移动行 ${sourceStart + 1} → ${destStart + 1}`
              : `已移动行 ${sourceStart + 1}-${sourceEnd + 1} → ${destStart + 1}`,
          );
        }
      }
      axisDragRef.current = null;
      setAxisDragTick(t => t + 1);
      dirtyTrackerRef.current.markFullRedraw();
      scheduleRender();
      return;
    }
    axisDragRef.current = null;

    // 结束填充柄拖动
    if (finishFillDrag()) return;

    // 结束进度条拖动
    if (progressDrag) {
      setProgressDrag(null);
    }

    // Complete formula range drag: insert reference into formula text
    const fd = formulaDragRef.current;
    if (fd?.active && editingCell) {
      const colToLetter = (c: number): string => {
        c += 1;
        let result = '';
        while (c > 0) { c--; result = String.fromCharCode(65 + (c % 26)) + result; c = Math.floor(c / 26); }
        return result;
      };

      const sr = Math.min(fd.startCoord.row, fd.endCoord.row);
      const er = Math.max(fd.startCoord.row, fd.endCoord.row);
      const sc = Math.min(fd.startCoord.col, fd.endCoord.col);
      const ec = Math.max(fd.startCoord.col, fd.endCoord.col);

      let rangeText: string;
      if (sr === er && sc === ec) {
        rangeText = `${colToLetter(sc)}${sr + 1}`;
      } else {
        rangeText = `${colToLetter(sc)}${sr + 1}:${colToLetter(ec)}${er + 1}`;
      }

      // Insert range ref at cursor position (saved at drag start to avoid blur-loss)
      const store = useSheetStore.getState();
      const currentFormula = store.formulaBarText;
      let cursorPos = formulaDragCursorRef.current;
      // Fallback: if cursor was at start (lost focus), append to end of formula
      if (cursorPos === 0 && currentFormula.length > 0) {
        cursorPos = currentFormula.length;
      }
      const inputEl = document.querySelector<HTMLInputElement>('[data-cell-editor]');

      const newFormula = currentFormula.slice(0, cursorPos) + rangeText + currentFormula.slice(cursorPos);

      // Update store and input
      store.setFormulaBarText(newFormula);
      if (inputEl) {
        inputEl.value = newFormula;
        const newPos = cursorPos + rangeText.length;
        // Set cursor after the inserted range
        requestAnimationFrame(() => {
          inputEl.setSelectionRange(newPos, newPos);
          inputEl.focus();
        });
      }

      setFormulaDrag(null);
      dirtyTrackerRef.current.markFullRedraw();
      scheduleRender();
      return;
    }

    isDraggingRef.current = false;

    const store = useSheetStore.getState();
    if (store.selectionRange) {
      const normalized = normalizeSelectionForMerges(store.selectionRange, sheet.mergeRanges);
      if (
        normalized.start.row !== store.selectionRange.start.row
        || normalized.start.col !== store.selectionRange.start.col
        || normalized.end.row !== store.selectionRange.end.row
        || normalized.end.col !== store.selectionRange.end.col
      ) {
        setSelection(normalized, store.activeCell);
        dirtyTrackerRef.current.markFullRedraw();
        scheduleRender();
      }
    }
  }, [editingCell, scheduleRender, progressDrag, finishFillDrag, isBaseSheet, table, applyColumnRangeSelection, applyRowRangeSelection, checkedRows, sheet.mergeRanges, setSelection]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const canvasRect = canvasContainerRef.current?.getBoundingClientRect();
    if (canvasRect) {
      const config = viewportRef.current.config;
      const colResize = viewportRef.current.hitTestColumnResize(
        e.clientX, canvasRect, sheet.colCount, sheet.columnWidths,
      );
      if (colResize !== null && e.clientY - canvasRect.top < config.headerHeight) {
        table.autoFitColumnWidth(colResize);
        dirtyTrackerRef.current.markFullRedraw();
        scheduleRender();
        useSheetStore.getState().setStatusText(`列 ${colResize + 1} 已自动调整宽度`);
        return;
      }
      if (!isBaseSheet) {
        const rowResize = viewportRef.current.hitTestRowResize(
          e.clientY, canvasRect, sheet.rowCount, sheet.rowHeights,
        );
        if (rowResize !== null && e.clientX - canvasRect.left < config.headerWidth) {
          table.autoFitRowHeight(rowResize);
          dirtyTrackerRef.current.markFullRedraw();
          scheduleRender();
          useSheetStore.getState().setStatusText(`行 ${rowResize + 1} 已自动调整高度`);
          return;
        }
      }

      if (sheet.type === 'base') {
        const colHeaderCol = viewportRef.current.findColumnAtX(e.clientX, canvasRect, sheet.colCount, sheet.columnWidths);
        if (colHeaderCol !== null && e.clientY >= canvasRect.top && e.clientY < canvasRect.top + config.headerHeight) {
          const fieldId = sheet.columnDefs[colHeaderCol]?.id;
          if (fieldId) {
            onOpenFieldConfig?.(fieldId);
            return;
          }
        }
      }
    }

    const coord = getCellFromEvent(e);
    if (!coord) return;
    // 子单元格拦截编辑
    const cellData = table.getCell(coord.row, coord.col);
    if (cellData?.isMergedChild) {
      useSheetStore.getState().setStatusText('合并单元格的子单元格不可编辑');
      return;
    }

    if (isFreeformTable && table.getDropdownValidationAt(coord.row, coord.col)) {
      setDateEditCell(null);
      setDropdownEditCell(coord);
      setEditingCell(null);
      setFormulaBarText(cellData ? formatCellEditText(cellData.value) : '');
      return;
    }

    if (isFreeformTable && table.getDateValidationAt(coord.row, coord.col)) {
      setDropdownEditCell(null);
      setDateEditCell(coord);
      setEditingCell(null);
      setFormulaBarText(cellData ? formatCellEditText(cellData.value) : '');
      return;
    }

    if (isFreeformTable && cellData?.value.type === 'boolean') {
      const newValue = !cellData.value.value;
      table.setCellValue(coord.row, coord.col, { type: 'boolean', value: newValue });
      setFormulaBarText(formatCellEditText({ type: 'boolean', value: newValue }));
      dirtyTrackerRef.current.markFullRedraw();
      scheduleRender();
      return;
    }

    // 多维表/标准表：根据字段类型决定交互方式
    const columnDef = sheet.columnDefs[coord.col];
    if (columnDef?.type === 'boolean') {
      const currentValue = cellData?.value;
      const newValue = !(currentValue?.type === 'boolean' && currentValue.value);
      table.setCellValue(coord.row, coord.col, { type: 'boolean', value: newValue });
      setFormulaBarText(newValue ? 'TRUE' : 'FALSE');
      dirtyTrackerRef.current.markFullRedraw();
      scheduleRender();
      return;
    }

    // 单选/多选/日期/进度/附件等：双击进入编辑
    setEditingCell(coord);
    setFormulaBarText(cellData ? formatCellEditText(cellData.value) : '');
  }, [getCellFromEvent, table, sheet, setEditingCell, setFormulaBarText, scheduleRender, onOpenFieldConfig, isBaseSheet, isFreeformTable, formatCellEditText]);

  // Context menu handler
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const canvasRect = canvasContainerRef.current?.getBoundingClientRect();
    const store = useSheetStore.getState();
    const prevRange = store.selectionRange;
    const discreteCells = store.discreteSelections;
    const discreteRows = discreteAxisRowsRef.current;
    let coord = getCellFromEvent(e);
    let clickInSelection = false;

    if (canvasRect && !isBaseSheet
      && viewportRef.current.hitTestRowHeader(e.clientX, e.clientY, canvasRect)) {
      const rowIndex = viewportRef.current.findRowAtY(
        e.clientY, canvasRect, sheet.rowCount, resolveActiveRowHeights(),
      );
      if (rowIndex !== null) {
        coord = { row: rowIndex, col: store.activeCell?.col ?? 0 };
        if (isRowAxisSelected(rowIndex, discreteRows, prevRange, sheet.colCount)) {
          clickInSelection = true;
          selectionManagerRef.current.setActiveCell(coord);
          if (prevRange) setSelection(prevRange, coord);
        } else {
          applyRowRangeSelection(rowIndex, rowIndex, rowIndex);
          clickInSelection = true;
        }
        scheduleRender();
        setContextMenu({ visible: true, x: e.clientX, y: e.clientY, coord, clickInSelection });
        return;
      }
    }

    if (canvasRect && !isBaseSheet) {
      const colHeaderCol = viewportRef.current.findColumnAtX(
        e.clientX, canvasRect, sheet.colCount, sheet.columnWidths,
      );
      if (colHeaderCol !== null && e.clientY >= canvasRect.top && e.clientY < canvasRect.top + 25) {
        const discreteCols = discreteAxisColsRef.current;
        coord = { row: store.activeCell?.row ?? 0, col: colHeaderCol };
        if (isColumnAxisSelected(colHeaderCol, discreteCols, prevRange, sheet.rowCount)) {
          clickInSelection = true;
          selectionManagerRef.current.setActiveCell(coord);
          if (prevRange) setSelection(prevRange, coord);
        } else {
          applyColumnRangeSelection(colHeaderCol, colHeaderCol, colHeaderCol);
          clickInSelection = true;
        }
        scheduleRender();
        setContextMenu({ visible: true, x: e.clientX, y: e.clientY, coord, clickInSelection });
        return;
      }
    }

    if (canvasRect && isBaseSheet) {
      const config = viewportRef.current.config;
      const colHeaderCol = viewportRef.current.findColumnAtX(
        e.clientX, canvasRect, sheet.colCount, sheet.columnWidths,
      );
      const inColHeader = colHeaderCol !== null
        && e.clientY >= canvasRect.top
        && e.clientY < canvasRect.top + config.headerHeight
        && e.clientX - canvasRect.left >= config.headerWidth;
      if (inColHeader && colHeaderCol !== null) {
        const discreteCols = discreteAxisColsRef.current;
        coord = { row: store.activeCell?.row ?? 0, col: colHeaderCol };
        if (isColumnAxisSelected(colHeaderCol, discreteCols, prevRange, sheet.rowCount)) {
          selectionManagerRef.current.setActiveCell(coord);
          if (prevRange) setSelection(prevRange, coord);
        } else {
          applyColumnRangeSelection(colHeaderCol, colHeaderCol, colHeaderCol);
        }
        setContextMenu({ visible: false, x: 0, y: 0, coord: null });
        setBaseColumnMenu({ colIndex: colHeaderCol, x: e.clientX, y: e.clientY });
        scheduleRender();
        return;
      }
    }

    if (!coord || coord.row < 0 || coord.col < 0) return;

    clickInSelection = isClickInCurrentSelection(
      coord,
      prevRange,
      discreteCells,
      discreteRows,
      discreteAxisColsRef.current,
      sheet.rowCount,
      sheet.colCount,
    );

    if (clickInSelection) {
      selectionManagerRef.current.setActiveCell(coord);
      if (prevRange) {
        setSelection(prevRange, coord);
      } else if (discreteCells.length > 1) {
        setDiscreteSelections(discreteCells, coord);
      }
    } else {
      selectionManagerRef.current.setActiveCell(coord);
      const sel = { sheetId: table.sheetId, start: coord, end: coord };
      setSelection(sel, coord);
    }
    scheduleRender();
    setBaseColumnMenu(null);
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, coord, clickInSelection });
  }, [getCellFromEvent, table, setSelection, setDiscreteSelections, scheduleRender, isBaseSheet, sheet.rowCount, sheet.colCount, applyRowRangeSelection, applyColumnRangeSelection, resolveActiveRowHeights]);

  // Copy/Cut/Paste handlers for context menu
  const markCopiedRange = useCallback(() => {
    if (isBaseSheet) return;
    const store = useSheetStore.getState();
    const range = resolveCopySourceRange(table.sheetId, store.selectionRange, store.discreteSelections);
    if (range) setCopiedRange(range);
  }, [table.sheetId, isBaseSheet]);

  const handleCopy = useCallback(() => {
    const store = useSheetStore.getState();
    const discrete = store.discreteSelections;
    if (discrete.length > 1) {
      clipboardManagerRef.current.copyDiscrete(table, discrete);
      markCopiedRange();
      store.setStatusText('已复制选区');
      scheduleRender();
      return;
    }
    const sel = store.selectionRange;
    if (sel) {
      clipboardManagerRef.current.copy(table, sel);
      markCopiedRange();
      store.setStatusText('已复制选区');
      scheduleRender();
    }
  }, [table, markCopiedRange, scheduleRender]);

  const handleCut = useCallback(() => {
    const store = useSheetStore.getState();
    const discrete = store.discreteSelections;
    if (discrete.length > 1) {
      clipboardManagerRef.current.cutDiscrete(table, discrete);
      markCopiedRange();
      store.setStatusText('已剪切选区');
      dirtyTrackerRef.current.markFullRedraw();
      scheduleRender();
      return;
    }
    const sel = store.selectionRange;
    if (sel) {
      clipboardManagerRef.current.cut(table, sel);
      markCopiedRange();
      store.setStatusText('已剪切选区');
      dirtyTrackerRef.current.markFullRedraw();
      scheduleRender();
    }
  }, [table, markCopiedRange, scheduleRender]);

  const applyPasteAt = useCallback(async (target: CellCoord, dt?: DataTransfer | null) => {
    const now = Date.now();
    if (now - lastPasteHandledAtRef.current < 80) return;
    lastPasteHandledAtRef.current = now;

    const store = useSheetStore.getState();
    const clip = clipboardManagerRef.current;

    const internalPayload = await readSheetClipboardInternalAsync(dt);
    if (internalPayload && !isBaseSheet) {
      try {
        const newRange = clip.pastePayload(table, target, internalPayload);
        setSelection(newRange, target);
        setCopiedRange(null);
        store.setStatusText('已粘贴');
        dirtyTrackerRef.current.markFullRedraw();
        scheduleRender();
      } catch {
        store.setStatusText('粘贴失败');
      }
      return;
    }

    if (clip.hasData() && !isBaseSheet) {
      try {
        const newRange = clip.paste(table, target);
        setSelection(newRange, target);
        setCopiedRange(null);
        store.setStatusText('已粘贴');
        dirtyTrackerRef.current.markFullRedraw();
        scheduleRender();
      } catch {
        store.setStatusText('粘贴失败');
      }
      return;
    }

    const externalPayload = dt ? parseClipboardGrid(dt) : await readClipboardGridAsync(dt);
    if (externalPayload && externalPayload.grid.length > 0) {
      if (isBaseSheet) {
        store.setStatusText('剪贴板为空');
        return;
      }
      try {
        const newRange = clip.pasteGrid(table, target, externalPayload);
        setSelection(newRange, target);
        setCopiedRange(null);
        store.setStatusText('已粘贴');
        dirtyTrackerRef.current.markFullRedraw();
        scheduleRender();
      } catch {
        store.setStatusText('粘贴失败');
      }
      return;
    }

    store.setStatusText('剪贴板为空');
  }, [table, setSelection, scheduleRender, isBaseSheet]);

  const handlePaste = useCallback(() => {
    const store = useSheetStore.getState();
    const target = store.activeCell;
    if (!target) return;
    void applyPasteAt(target);
  }, [applyPasteAt]);

  const handleCopyAsImage = useCallback(async () => {
    const store = useSheetStore.getState();
    const captureRange = resolveImageCaptureRange(
      table.sheetId,
      store.selectionRange,
      store.discreteSelections,
    );
    if (!captureRange) {
      store.setStatusText('请先选择要复制的区域');
      return;
    }
    await copyTableSelectionAsImage(
      table,
      captureRange,
      sheet.columnWidths,
      resolveActiveRowHeights(),
      viewportRef.current.zoomLevel,
    );
    store.setStatusText('已复制选区为图片');
  }, [table, sheet.columnWidths, resolveActiveRowHeights]);

  // Cell editing commit/cancel
  const handleEditCommit = useCallback((coord: CellCoord, value: string | boolean | number | CellValue | null, commitType?: string) => {
    // 多维表/标准表：根据字段类型解析值
    const columnDef = sheet.columnDefs[coord.col];
    const columnType = columnDef?.type;

    if (value === null || (typeof value === 'string' && value.trim() === '')) {
      const existing = table.getCell(coord.row, coord.col);
      if (existing?.value.type === 'boolean' && isFreeformTable && !columnType) {
        table.setCellValue(coord.row, coord.col, { type: 'boolean', value: false });
        setFormulaBarText('0');
      } else {
        table.clearCellContent(coord.row, coord.col);
        setFormulaBarText('');
      }
    } else if (typeof value === 'object' && value !== null) {
      // CellValue 对象直接写入（多维表 BaseCellEditor 提交）
      table.setCellValue(coord.row, coord.col, value);
      setFormulaBarText(formatCellEditText(value));
    } else if (typeof value === 'boolean') {
      // 布尔值直接设置
      table.setCellValue(coord.row, coord.col, { type: 'boolean', value });
      setFormulaBarText(isFreeformTable && !columnType ? (value ? '1' : '0') : (value ? 'TRUE' : 'FALSE'));
    } else if (typeof value === 'number') {
      const existing = table.getCell(coord.row, coord.col);
      const format = existing?.value.type === 'number'
        ? existing.value.format
        : { kind: 'general' as const };
      table.setCellValue(coord.row, coord.col, { type: 'number', value, format });
      setFormulaBarText(String(value));
    } else if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.startsWith('=')) {
        // 公式
        try {
          const result = table.recalcEngine.evaluateAndStore(trimmed, table, coord.row, coord.col);
          table.setCellValue(coord.row, coord.col, result);
        } catch {
          table.setCell(coord.row, coord.col, trimmed, trimmed);
        }
        setFormulaBarText(trimmed);
      } else if (columnType) {
        // 多维表/标准表：根据字段类型强制解析
        const parsedValue = parseFieldValue(trimmed, columnType);
        table.setCellValue(coord.row, coord.col, parsedValue);
        setFormulaBarText(formatCellEditText(parsedValue));
      } else {
        // 自由表：自动推断类型，保留已有数字/日期格式
        const existing = table.getCell(coord.row, coord.col);
        if (existing?.value.type === 'boolean') {
          const parsed = parseFreeformBooleanInput(trimmed);
          table.setCellValue(coord.row, coord.col, parsed);
          setFormulaBarText(formatCellEditText(parsed));
        } else {
          const parsed = parseCellValue(trimmed);
          if (parsed.type === 'number' && existing?.value.type === 'number') {
            const next = { ...parsed, format: existing.value.format };
            table.setCellValue(coord.row, coord.col, next);
            setFormulaBarText(formatCellEditText(next));
          } else if (parsed.type === 'date' && existing?.value.type === 'date') {
            const next = { ...parsed, format: existing.value.format };
            table.setCellValue(coord.row, coord.col, next);
            setFormulaBarText(formatCellEditText(next));
          } else {
            table.setCellValue(coord.row, coord.col, parsed);
            setFormulaBarText(formatCellEditText(parsed));
          }
        }
      }
    }
    setEditingCell(null);

    // Enter 提交后保持当前单元格选中（不下移到下一行）
    if (commitType === 'enter') {
      selectionManagerRef.current.setActiveCell(coord);
      setSelection(
        { sheetId: table.sheetId, start: coord, end: coord },
        coord,
      );
    }

    // Tab key: move to the right cell
    if (commitType === 'tab') {
      const nextCoord = { row: coord.row, col: coord.col + 1 };
      selectionManagerRef.current.setActiveCell(nextCoord);
      setSelection(
        { sheetId: table.sheetId, start: nextCoord, end: nextCoord },
        nextCoord,
      );
    }

    if (sheet.type !== 'base') {
      syncToolbarFromCell(table.getCell(coord.row, coord.col));
    }
  }, [table, sheet, setEditingCell, setFormulaBarText, setSelection, isFreeformTable, formatCellEditText]);

  const handleEditCancel = useCallback(() => {
    setEditingCell(null);
    setDropdownEditCell(null);
    setDateEditCell(null);
  }, [setEditingCell]);

  const handleDropdownEditClose = useCallback(() => {
    setDropdownEditCell(null);
  }, []);

  const handleDateEditClose = useCallback(() => {
    setDateEditCell(null);
  }, []);

  const handleDropdownEditCommit = useCallback((coord: CellCoord, value: CellValue) => {
    table.setCellValue(coord.row, coord.col, value);
    setFormulaBarText(formatCellEditText(value));
    setDropdownEditCell(null);
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    syncToolbarFromCell(table.getCell(coord.row, coord.col));
  }, [table, setFormulaBarText, scheduleRender, formatCellEditText]);

  const handleDateEditCommit = useCallback((coord: CellCoord, value: CellValue) => {
    table.setCellValue(coord.row, coord.col, value);
    setFormulaBarText(formatCellEditText(value));
    setDateEditCell(null);
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    syncToolbarFromCell(table.getCell(coord.row, coord.col));
  }, [table, setFormulaBarText, scheduleRender, formatCellEditText]);

  const startCellEdit = useCallback((coord: CellCoord, fromKeyboard = false) => {
    if (isFreeformTable && table.getDropdownValidationAt(coord.row, coord.col)) {
      setDateEditCell(null);
      setDropdownEditCell(coord);
      setEditingCell(null);
      const cellData = table.getCell(coord.row, coord.col);
      setFormulaBarText(cellData ? formatCellEditText(cellData.value) : '');
      return;
    }
    if (isFreeformTable && table.getDateValidationAt(coord.row, coord.col)) {
      setDropdownEditCell(null);
      setDateEditCell(coord);
      setEditingCell(null);
      const cellData = table.getCell(coord.row, coord.col);
      setFormulaBarText(cellData ? formatCellEditText(cellData.value) : '');
      return;
    }
    if (fromKeyboard) {
      useSheetStore.getState().markKeyboardEditOpened();
    }
    setDropdownEditCell(null);
    setDateEditCell(null);
    setEditingCell(coord);
    const cellData = table.getCell(coord.row, coord.col);
    setFormulaBarText(cellData ? formatCellEditText(cellData.value) : '');
  }, [table, setEditingCell, setFormulaBarText, isFreeformTable]);

  // ===== 列头菜单操作回调 =====
  const handleEditField = useCallback((colIndex: number) => {
    const fieldId = sheet.columnDefs[colIndex]?.id;
    if (fieldId) onOpenFieldConfig?.(fieldId);
  }, [sheet.columnDefs, onOpenFieldConfig]);

  const handleEditDescription = useCallback((colIndex: number) => {
    const fieldId = sheet.columnDefs[colIndex]?.id;
    if (fieldId) onOpenFieldConfig?.(fieldId);
  }, [sheet.columnDefs, onOpenFieldConfig]);

  const handleCopyField = useCallback((colIndex: number) => {
    const sourceDef = sheet.columnDefs[colIndex];
    if (!sourceDef) return;
    const newField: ColumnDef = {
      ...sourceDef,
      id: `col_${Date.now()}_${colIndex}`,
      name: `${sourceDef.name} 副本`,
    };
    sheet.columnDefs.splice(colIndex + 1, 0, newField);
    table.insertColumns(colIndex + 1, 1);
    table.setColumnWidth(colIndex + 1, newField.width || 160);
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    useSheetStore.getState().setStatusText(`已复制字段「${sourceDef.name}」`);
  }, [sheet, table, scheduleRender]);

  const handleHideField = useCallback((colIndex: number) => {
    const fieldId = sheet.columnDefs[colIndex]?.id;
    if (fieldId) {
      onToggleFieldVisibility?.(fieldId, false);
      dirtyTrackerRef.current.markFullRedraw();
      scheduleRender();
    }
  }, [sheet, onToggleFieldVisibility, scheduleRender]);

  const handleInsertColumn = useCallback((colIndex: number, direction: 'left' | 'right') => {
    const insertIndex = direction === 'left' ? colIndex : colIndex + 1;
    table.insertColumns(insertIndex, 1);
    table.setColumnWidth(insertIndex, 160);
    if (sheet.type === 'base') {
      const newField: ColumnDef = {
        id: `col_${Date.now()}_${insertIndex}`,
        name: '新字段',
        type: 'text',
        width: 160,
      };
      sheet.columnDefs.splice(insertIndex, 0, newField);
    }
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    useSheetStore.getState().setStatusText('已插入新字段');
  }, [sheet, table, scheduleRender]);

  const handleFreezeColumn = useCallback((colIndex: number) => {
    const currentFrozen = sheet.freezeState?.frozenCols || 0;
    const isFrozen = currentFrozen > colIndex;
    if (isFrozen) {
      sheet.freezeState = { ...sheet.freezeState, frozenCols: 0 };
    } else {
      sheet.freezeState = { ...sheet.freezeState, frozenCols: colIndex + 1 };
    }
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    useSheetStore.getState().setStatusText(isFrozen ? '已取消冻结' : `已冻结至「${sheet.columnDefs[colIndex]?.name || ''}」`);
  }, [sheet, scheduleRender]);

  const handleSort = useCallback((colIndex: number, order: 'asc' | 'desc') => {
    const fieldId = sheet.columnDefs[colIndex]?.id;
    if (!fieldId) return;
    setActiveSort({ colIndex, order });
    // 实际排序逻辑：按字段值排序行
    const rows = sheet.rows || [];
    if (rows.length > 0) {
      rows.sort((a, b) => {
        const aVal = a[fieldId];
        const bVal = b[fieldId];
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return order === 'asc' ? -1 : 1;
        if (bVal == null) return order === 'asc' ? 1 : -1;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return order === 'asc' ? aVal - bVal : bVal - aVal;
        }
        const aStr = String(aVal);
        const bStr = String(bVal);
        return order === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      });
    }
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    useSheetStore.getState().setStatusText(`已按「${sheet.columnDefs[colIndex]?.name}」${order === 'asc' ? '升序' : '降序'}排序`);
  }, [sheet, scheduleRender]);

  const handleGroupByField = useCallback((fieldId: string) => {
    if (activeGroup === fieldId) {
      setActiveGroup(null);
      useSheetStore.getState().setStatusText('已取消分组');
    } else {
      setActiveGroup(fieldId);
      const fieldName = sheet.columnDefs.find(c => c.id === fieldId)?.name || '';
      useSheetStore.getState().setStatusText(`已按「${fieldName}」分组`);
    }
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [activeGroup, sheet, scheduleRender]);

  const handleFilterByField = useCallback((fieldId: string) => {
    const fieldName = sheet.columnDefs.find(c => c.id === fieldId)?.name || '';
    useSheetStore.getState().setStatusText(`筛选面板：${fieldName}（待实现）`);
  }, [sheet]);

  const handleCreateView = useCallback((fieldId: string, viewType: string) => {
    const fieldName = sheet.columnDefs.find(c => c.id === fieldId)?.name || '';
    const viewName = `${fieldName} + ${viewType === 'calendar' ? '日历' : '看板'}`;
    const newView = {
      viewId: `view_${Date.now()}`,
      viewName,
      viewType: viewType as BaseViewType,
      config: {},
    };
    if (!sheet.views) sheet.views = [];
    sheet.views.push(newView);
    sheet.activeViewId = newView.viewId;
    useSheetStore.getState().setCurrentView(viewType as BaseViewType);
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
    useSheetStore.getState().setStatusText(`已创建「${viewName}」视图`);
  }, [sheet, scheduleRender]);

  const handleDeleteField = useCallback((colIndex: number) => {
    const fieldId = sheet.columnDefs[colIndex]?.id;
    if (fieldId) onDeleteField?.(fieldId);
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [sheet, onDeleteField, scheduleRender]);

  useEffect(() => {
    if (previewMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreSheetShortcut(e.target)) return;

      const t = table;
      const selMgr = selectionManagerRef.current;
      const clip = clipboardManagerRef.current;
      const store = useSheetStore.getState();
      const ctrl = e.ctrlKey || e.metaKey;

      // Don't handle if editing
      if (store.editingCell) return;

      // Esc：取消复制蚂蚁线
      if (e.key === 'Escape' && !isBaseSheet && copiedRange) {
        e.preventDefault();
        setCopiedRange(null);
        scheduleRender();
        return;
      }

      // Arrow keys for navigation
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const dir = e.key.replace('Arrow', '').toLowerCase() as 'up' | 'down' | 'left' | 'right';
        if (e.shiftKey) {
          const active = selMgr.activeCell;
          const newCoord: CellCoord = active ? {
            row: Math.max(0, Math.min(t.rowCount - 1, active.row + (dir === 'up' ? -1 : dir === 'down' ? 1 : 0))),
            col: Math.max(0, Math.min(t.colCount - 1, active.col + (dir === 'left' ? -1 : dir === 'right' ? 1 : 0))),
          } : { row: 0, col: 0 };
          applyExtendedSelection(newCoord, newCoord);
        } else {
          const newCoord = selMgr.moveActiveCell(dir, t.rowCount, t.colCount);
          if (newCoord) {
            setSelection(
              { sheetId: t.sheetId, start: newCoord, end: newCoord },
              newCoord,
            );
            const cellData = t.getCell(newCoord.row, newCoord.col);
            setFormulaBarText(cellData ? formatCellEditText(cellData.value) : '');
          }
        }
        scheduleRender();
        return;
      }

      // Ctrl+A: Select all cells
      if (ctrl && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        const allRange: CellRange = {
          sheetId: t.sheetId,
          start: { row: 0, col: 0 },
          end: { row: t.rowCount - 1, col: t.colCount - 1 },
        };
        setSelection(allRange, { row: 0, col: 0 });
        selMgr.startSelection({ row: 0, col: 0 });
        selMgr.extendSelection({ row: t.rowCount - 1, col: t.colCount - 1 });
        scheduleRender();
        return;
      }

      // Space: toggle boolean field value（纯空格，无修饰键）
      if (e.key === ' ' && !ctrl && !e.shiftKey) {
        e.preventDefault();
        const activeCell = store.activeCell;
        if (activeCell) {
          const colDef = sheet.columnDefs[activeCell.col];
          const cellData = t.getCell(activeCell.row, activeCell.col);
          if (colDef?.type === 'boolean' || (isFreeformTable && cellData?.value.type === 'boolean')) {
            const currentValue = cellData?.value?.type === 'boolean' ? cellData.value.value : false;
            const newValue = !currentValue;
            t.setCellValue(activeCell.row, activeCell.col, { type: 'boolean', value: newValue });
            setFormulaBarText(isFreeformTable && !colDef ? (newValue ? '1' : '0') : (newValue ? 'TRUE' : 'FALSE'));
            dirtyTrackerRef.current.markFullRedraw();
            scheduleRender();
            return;
          }
        }
        // 非布尔字段，不做任何事（避免页面滚动）
        return;
      }

      // Ctrl+Space: Select entire column
      if (ctrl && e.key === ' ') {
        e.preventDefault();
        const activeCell = store.activeCell;
        if (activeCell) {
          const colRange: CellRange = {
            sheetId: t.sheetId,
            start: { row: 0, col: activeCell.col },
            end: { row: t.rowCount - 1, col: activeCell.col },
          };
          setSelection(colRange, activeCell);
          selMgr.startSelection(activeCell);
          selMgr.extendSelection({ row: t.rowCount - 1, col: activeCell.col });
        } else {
          // Select first column
          const colRange: CellRange = {
            sheetId: t.sheetId,
            start: { row: 0, col: 0 },
            end: { row: t.rowCount - 1, col: 0 },
          };
          setSelection(colRange, { row: 0, col: 0 });
          selMgr.startSelection({ row: 0, col: 0 });
          selMgr.extendSelection({ row: t.rowCount - 1, col: 0 });
        }
        scheduleRender();
        return;
      }

      // Shift+Space: Select entire row
      if (e.key === ' ' && e.shiftKey && !ctrl) {
        e.preventDefault();
        const activeCell = store.activeCell;
        if (activeCell) {
          const rowRange: CellRange = {
            sheetId: t.sheetId,
            start: { row: activeCell.row, col: 0 },
            end: { row: activeCell.row, col: t.colCount - 1 },
          };
          setSelection(rowRange, activeCell);
          selMgr.startSelection(activeCell);
          selMgr.extendSelection({ row: activeCell.row, col: t.colCount - 1 });
        } else {
          const rowRange: CellRange = {
            sheetId: t.sheetId,
            start: { row: 0, col: 0 },
            end: { row: 0, col: t.colCount - 1 },
          };
          setSelection(rowRange, { row: 0, col: 0 });
          selMgr.startSelection({ row: 0, col: 0 });
          selMgr.extendSelection({ row: 0, col: t.colCount - 1 });
        }
        scheduleRender();
        return;
      }

      // Enter：下移选中到下一行；F2：进入编辑
      if (e.key === 'Enter') {
        e.preventDefault();
        const activeCell = store.activeCell;
        if (activeCell) {
          const newCoord = selMgr.moveActiveCell('down', t.rowCount, t.colCount);
          if (newCoord) {
            setSelection(
              { sheetId: t.sheetId, start: newCoord, end: newCoord },
              newCoord,
            );
            const cellData = t.getCell(newCoord.row, newCoord.col);
            setFormulaBarText(cellData ? formatCellEditText(cellData.value) : '');
          }
          scheduleRender();
        }
        return;
      }
      if (e.key === 'F2') {
        e.preventDefault();
        const activeCell = store.activeCell;
        if (activeCell) {
          startCellEdit(activeCell, false);
        }
        return;
      }

      // Delete / Backspace — 清除选区内所有单元格内容
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const discrete = store.discreteSelections;
        if (discrete.length > 1) {
          t.runBatch(() => {
            for (const cell of discrete) {
              t.clearCellContent(cell.row, cell.col);
            }
          }, 'clearCells');
          setFormulaBarText('');
          dirtyTrackerRef.current.markFullRedraw();
          scheduleRender();
          return;
        }
        const selRange = store.selectionRange;
        if (selRange) {
          t.clearRangeContent(selRange);
          setFormulaBarText('');
          dirtyTrackerRef.current.markFullRedraw();
          scheduleRender();
        } else {
          const activeCell = store.activeCell;
          if (activeCell) {
            t.clearCellContent(activeCell.row, activeCell.col);
            setFormulaBarText('');
            dirtyTrackerRef.current.markFullRedraw();
            scheduleRender();
          }
        }
        return;
      }

      // Ctrl+Z / Ctrl+Y
      if (ctrl && e.key === 'z') { e.preventDefault(); t.undo(); return; }
      if (ctrl && e.key === 'y') { e.preventDefault(); t.redo(); return; }

      // Ctrl+B / Ctrl+I / Ctrl+U
      if (ctrl && e.key === 'b') {
        e.preventDefault();
        const activeCell = store.activeCell;
        if (activeCell) {
          const cell = t.getCell(activeCell.row, activeCell.col);
          const isBold = cell?.style?.bold;
          t.setCellStyle(activeCell.row, activeCell.col, { bold: !isBold });
          store.setBoldActive(!isBold);
        }
        return;
      }
      if (ctrl && e.key === 'i') {
        e.preventDefault();
        const activeCell = store.activeCell;
        if (activeCell) {
          const cell = t.getCell(activeCell.row, activeCell.col);
          const isItalic = cell?.style?.italic;
          t.setCellStyle(activeCell.row, activeCell.col, { italic: !isItalic });
          store.setItalicActive(!isItalic);
        }
        return;
      }
      if (ctrl && e.key === 'u') {
        e.preventDefault();
        const activeCell = store.activeCell;
        if (activeCell) {
          const cell = t.getCell(activeCell.row, activeCell.col);
          const isUnderline = cell?.style?.underline;
          t.setCellStyle(activeCell.row, activeCell.col, { underline: !isUnderline });
          store.setUnderlineActive(!isUnderline);
        }
        return;
      }

      // Ctrl+C: Copy
      if (ctrl && e.key === 'c') {
        e.preventDefault();
        const discrete = store.discreteSelections;
        if (discrete.length > 1) {
          clip.copyDiscrete(t, discrete);
          if (!isBaseSheet) {
            const range = resolveCopySourceRange(t.sheetId, store.selectionRange, discrete);
            if (range) setCopiedRange(range);
          }
          store.setStatusText('已复制选区');
          scheduleRender();
          return;
        }
        const sel = store.selectionRange;
        if (sel) {
          clip.copy(t, sel);
          if (!isBaseSheet) {
            const range = resolveCopySourceRange(t.sheetId, sel, store.discreteSelections);
            if (range) setCopiedRange(range);
          }
          store.setStatusText('已复制选区');
          scheduleRender();
        }
        return;
      }

      // Ctrl+X: Cut
      if (ctrl && e.key === 'x') {
        e.preventDefault();
        const discrete = store.discreteSelections;
        if (discrete.length > 1) {
          clip.cutDiscrete(t, discrete);
          if (!isBaseSheet) {
            const range = resolveCopySourceRange(t.sheetId, store.selectionRange, discrete);
            if (range) setCopiedRange(range);
          }
          store.setStatusText('已剪切选区');
          dirtyTrackerRef.current.markFullRedraw();
          scheduleRender();
          return;
        }
        const sel = store.selectionRange;
        if (sel) {
          clip.cut(t, sel);
          if (!isBaseSheet) {
            const range = resolveCopySourceRange(t.sheetId, sel, store.discreteSelections);
            if (range) setCopiedRange(range);
          }
          store.setStatusText('已剪切选区');
          dirtyTrackerRef.current.markFullRedraw();
          scheduleRender();
        }
        return;
      }

      // Ctrl+V: Paste — 由 window paste 事件同步读取 clipboardData（含 Excel HTML 样式）
      if (ctrl && e.key === 'v') {
        if (store.editingCell) return;
        const target = store.activeCell;
        if (!target) return;
        canvasContainerRef.current?.focus({ preventScroll: true });
        return;
      }

      // Printable character → enter edit mode with that character
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const activeCell = store.activeCell;
        if (activeCell) {
          e.preventDefault();
          // 清空内容但保留样式，再进入编辑
          t.clearCellContent(activeCell.row, activeCell.col);
          setFormulaBarText(e.key);
          setEditingCell(activeCell);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [table, setSelection, setFormulaBarText, setEditingCell, scheduleRender, startCellEdit, previewMode, applyPasteAt, isBaseSheet, copiedRange, applyExtendedSelection, sheet]);

  // 浏览器原生 paste 事件（Excel / Numbers 等外部剪贴板）
  useEffect(() => {
    if (previewMode || isBaseSheet) return;

    const onPaste = (e: ClipboardEvent) => {
      if (shouldIgnoreSheetShortcut(e.target)) return;
      const store = useSheetStore.getState();
      if (store.editingCell) return;
      const target = store.activeCell;
      if (!target) return;
      e.preventDefault();
      void applyPasteAt(target, e.clipboardData);
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [previewMode, isBaseSheet, applyPasteAt]);

  // 点击画布外区域时取消单元格选中（保留工具栏/公式栏/编辑器等交互）
  useEffect(() => {
    if (previewMode) return;
    const isKeepSelectionTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof Node)) return false;
      const el = target as HTMLElement;
      if (el.closest?.('[data-sheet-canvas]')) return true;
      if (el.closest?.('[data-freeform-dropdown-cell]')) return true;
      if (el.closest?.('[data-sheet-keep-selection]')) return true;
      if (el.closest?.('.ant-modal, .ant-select-dropdown, .ant-picker-dropdown, .sheet-select-dropdown, .sheet-select-dropdown-panel, [data-sheet-dropdown-config], [data-sheet-keep-selection]')) return true;
      const canvasEl = canvasContainerRef.current;
      const sheetEl = containerRef.current;
      if (sheetEl?.contains(target) && canvasEl && !canvasEl.contains(target)) return true;
      return false;
    };

    const handlePointerDown = (e: MouseEvent) => {
      pointerDownOutsideRef.current = !isKeepSelectionTarget(e.target);
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (!pointerDownOutsideRef.current) return;
      if (isKeepSelectionTarget(e.target)) return;

      const store = useSheetStore.getState();
      if (!store.selectionRange && !store.activeCell && store.discreteSelections.length === 0) return;

      store.setSelection(null, null);
      discreteAxisColsRef.current = [];
      discreteAxisRowsRef.current = [];
      setDiscreteAxisCols([]);
      setDiscreteAxisRows([]);
      selectionManagerRef.current.clear();
      setCheckedRows([]);
      dirtyTrackerRef.current.markFullRedraw();
      scheduleRender();
    };

    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [scheduleRender, previewMode]);

  // 填充柄拖动：监听 window 级 mousemove/mouseup，避免拖出画布后丢失事件
  useEffect(() => {
    if (previewMode) return;
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!isFillDraggingRef.current || !fillSourceRangeRef.current) return;
      const coord = getCellFromClientCoords(e.clientX, e.clientY);
      if (!coord) return;
      const preview = computeFillTargetRange(fillSourceRangeRef.current, coord);
      updateFillPreview(preview);
    };

    const handleWindowMouseUp = () => {
      finishFillDrag();
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [getCellFromClientCoords, updateFillPreview, finishFillDrag, previewMode]);

  // Resize handler
  useEffect(() => {
    if (!resizeState) return;
    const config = viewportRef.current.config;
    const handleMove = (e: MouseEvent) => {
      axisResizeMovedRef.current = true;
      clearAxisResizeLongPress();
      let size = config.defaultColumnWidth;
      if (resizeState.type === 'col') {
        const deltaX = e.movementX / zoomLevel;
        const currentWidth = sheet.columnWidths.get(resizeState.index) ?? config.defaultColumnWidth;
        size = Math.max(20, currentWidth + deltaX);
        table.setColumnWidth(resizeState.index, size);
      } else if (resizeState.type === 'row' && sheet.type !== 'base') {
        const deltaY = e.movementY / zoomLevel;
        const currentHeight = sheet.rowHeights.get(resizeState.index) ?? config.defaultRowHeight;
        size = Math.max(10, currentHeight + deltaY);
        table.setRowHeight(resizeState.index, size);
      }
      const guide = buildAxisResizeGuide(resizeState.type, resizeState.index, e.clientX, e.clientY, size);
      if (guide) setAxisResizeGuide(guide);
      scheduleRender();
    };
    const handleUp = () => {
      clearAxisResizeLongPress();
      setResizeState(null);
      setAxisResizeGuide(null);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [resizeState, table, zoomLevel, scheduleRender, sheet, clearAxisResizeLongPress, buildAxisResizeGuide]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        height: '100%',
        minHeight: 0,
        background: isBaseSheet ? BASE_THEME.pageBg : '#fff',
        ...style,
      }}
    >
      <div
        ref={canvasContainerRef}
        data-sheet-canvas
        tabIndex={previewMode ? undefined : -1}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, outline: 'none' }}
        onMouseDown={previewMode ? undefined : handleMouseDown}
        onMouseMove={previewMode ? undefined : handleMouseMove}
        onMouseUp={previewMode ? undefined : handleMouseUp}
        onMouseLeave={previewMode ? undefined : () => { setHoveredRow(null); setHoveredCol(null); }}
        onDoubleClick={previewMode ? undefined : handleDoubleClick}
        onContextMenu={previewMode ? undefined : handleContextMenu}
      />
      {!previewMode && axisResizeGuide && <AxisResizeGuide {...axisResizeGuide} />}
      {!previewMode && sheet.type === 'base' && baseColumnMenu && sheet.columnDefs[baseColumnMenu.colIndex] && (
        <ColumnHeaderMenu
          visible
          x={baseColumnMenu.x}
          y={baseColumnMenu.y}
          columnDef={sheet.columnDefs[baseColumnMenu.colIndex]}
          colIndex={baseColumnMenu.colIndex}
          isLocked={baseColumnMenu.colIndex === 0}
          frozenCols={sheet.freezeState?.frozenCols || 0}
          activeSort={activeSort}
          activeGroup={activeGroup}
          onClose={() => setBaseColumnMenu(null)}
          onEditField={handleEditField}
          onEditDescription={handleEditDescription}
          onCopyField={handleCopyField}
          onHideField={handleHideField}
          onInsertColumn={handleInsertColumn}
          onFreezeColumn={handleFreezeColumn}
          onSort={handleSort}
          onGroupByField={handleGroupByField}
          onFilterByField={handleFilterByField}
          onCreateView={handleCreateView}
          onDeleteField={handleDeleteField}
        />
      )}

      {/* 通用 CellEditor —— 非多维表模式下使用；多维表使用 BaseCellEditor */}
      {!previewMode && sheet.type !== 'base' && (
        <CellEditor
          viewportManager={viewportRef.current}
          columnWidths={sheet.columnWidths}
          rowHeights={effectiveRowHeights}
          mergeRanges={sheet.mergeRanges}
          columnDefs={sheet.columnDefs}
          getCellData={(coord) => table.getCell(coord.row, coord.col)}
          onCommit={handleEditCommit}
          onCancel={handleEditCancel}
        />
      )}

      {!previewMode && isFreeformTable && dropdownEditCell && (() => {
        const validation = table.getDropdownValidationAt(dropdownEditCell.row, dropdownEditCell.col);
        if (!validation) return null;
        const cellData = table.getCell(dropdownEditCell.row, dropdownEditCell.col);
        const cellRect = viewportRef.current.getCellRect(dropdownEditCell, sheet.columnWidths, effectiveRowHeights);
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (!containerRect) return null;
        return (
          <FreeformDropdownEditor
            rect={{
              x: containerRect.left + cellRect.x,
              y: containerRect.top + cellRect.y,
              width: cellRect.width,
              height: cellRect.height,
            }}
            validation={validation}
            initialValue={cellData?.value || { type: 'empty' }}
            onCommit={value => handleDropdownEditCommit(dropdownEditCell, value)}
            onClose={handleDropdownEditClose}
          />
        );
      })()}


      {!previewMode && isFreeformTable && dateEditCell && (() => {
        const validation = table.getDateValidationAt(dateEditCell.row, dateEditCell.col);
        if (!validation) return null;
        const cellData = table.getCell(dateEditCell.row, dateEditCell.col);
        const cellRect = viewportRef.current.getCellRect(dateEditCell, sheet.columnWidths, effectiveRowHeights);
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (!containerRect) return null;
        return (
          <FreeformDateEditor
            coord={dateEditCell}
            rect={{
              x: containerRect.left + cellRect.x,
              y: containerRect.top + cellRect.y,
              width: cellRect.width,
              height: cellRect.height,
            }}
            validation={validation}
            initialValue={cellData?.value || { type: 'empty' }}
            onCommit={value => handleDateEditCommit(dateEditCell, value)}
            onClose={handleDateEditClose}
          />
        );
      })()}

      {/* 多维表（Base）BaseCellEditor 编辑器 */}
      {!previewMode && isBaseSheet && editingCell && (() => {
        const columnDef = sheet.columnDefs[editingCell.col];
        if (!columnDef) return null;
        const cellData = table.getCell(editingCell.row, editingCell.col);
        const editorRowHeights = effectiveRowHeights;
        const cellRect = viewportRef.current.getCellRect(editingCell, sheet.columnWidths, editorRowHeights);
        const contentRect = getTreeContentRect(
          cellRect,
          editingCell.col,
          rowTreeMeta?.[editingCell.row],
          viewportRef.current.zoomLevel,
        );
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (!containerRect) return null;
        const isChildCol0 = editingCell.col === 0 && (rowTreeMeta?.[editingCell.row]?.depth ?? 0) > 0;
        const editorWidth = isChildCol0 ? Math.max(40, contentRect.width - 28) : contentRect.width;
        return (
          <BaseCellEditor
            coord={editingCell}
            rect={{
              x: containerRect.left + contentRect.x,
              y: containerRect.top + contentRect.y,
              width: editorWidth,
              height: contentRect.height,
            }}
            columnDef={columnDef}
            initialValue={cellData?.value || { type: 'empty' }}
            onCommit={(value) => {
              table.setCellValue(editingCell.row, editingCell.col, value);
              setFormulaBarText(getEditText(value));
              setEditingCell(null);
              dirtyTrackerRef.current.markFullRedraw();
              scheduleRender();
            }}
            onCancel={() => {
              setEditingCell(null);
            }}
          />
        );
      })()}

      <ChartOverlay
        table={table}
        scrollLeft={previewMode ? viewportRef.current.scrollLeft : scrollLeft}
        scrollTop={previewMode ? viewportRef.current.scrollTop : scrollTop}
        zoomLevel={zoomLevel}
        containerRef={containerRef}
        selectedChartId={selectedChartId || null}
        onSelectChart={onSelectChart || (() => {})}
      />
      {!previewMode && (
      <div style={{
        position: 'absolute', bottom: 12, right: 12,
        background: '#f1f3f4', borderRadius: 4, padding: '2px 8px',
        fontSize: 12, color: '#666', zIndex: 100, pointerEvents: 'none',
      }}>
        {Math.round(zoomLevel * 100)}%
      </div>
      )}

      {/* 评分 hover 预览 tooltip */}
      {!previewMode && (() => {
        if (!hoverRatingCell) return null;
        const cellRect = viewportRef.current.getCellRect(
          { row: hoverRatingCell.row, col: hoverRatingCell.col },
          sheet.columnWidths, sheet.rowHeights
        );
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (!containerRect) return null;
        return (
          <div
            style={{
              position: 'fixed',
              left: containerRect.left + cellRect.x + cellRect.width / 2 - 20,
              top: containerRect.top + cellRect.y - 28,
              background: '#333',
              color: '#fff',
              padding: '3px 10px',
              borderRadius: 4,
              fontSize: 12,
              pointerEvents: 'none',
              zIndex: 1000,
              whiteSpace: 'nowrap',
            }}
          >
            {hoverRatingCell.value}
          </div>
        );
      })()}

      {/* 列头末尾：添加列 + 数据区右侧占位 */}
      {!previewMode && (() => {
        const config = viewportRef.current.config;
        let dataColWidth = 0;
        for (let c = 0; c < sheet.colCount; c++) {
          dataColWidth += (sheet.columnWidths.get(c) || config.defaultColumnWidth) * zoomLevel;
        }
        const addColWidth = isBaseSheet ? BASE_ADD_COLUMN_WIDTH : 32;
        const btnX = config.headerWidth + dataColWidth - scrollLeft;
        if (btnX + addColWidth < config.headerWidth || btnX > containerSize.width + addColWidth) return null;

        const handleAddColumn = () => {
          if (sheet.type === 'base') {
            onOpenFieldConfig?.(null);
          } else {
            const newIndex = sheet.colCount;
            table.insertColumns(newIndex, 1);
            table.setColumnWidth(newIndex, 160);
            dirtyTrackerRef.current.markFullRedraw();
            scheduleRender();
            useSheetStore.getState().setStatusText('已添加新列');
          }
        };

        if (isBaseSheet) {
          let totalDataHeight = config.headerHeight;
          const activeRowHeights = resolveActiveRowHeights();
          for (let r = 0; r < sheet.rowCount; r++) {
            totalDataHeight += (activeRowHeights.get(r) || config.defaultRowHeight) * zoomLevel;
          }
          const addColBodyTop = config.headerHeight;
          const addColBodyHeight = Math.max(0, totalDataHeight - config.headerHeight - scrollTop);

          return (
            <>
              {addColBodyHeight > 0 && (
                <div
                  key="base-add-col-body"
                  style={{
                    position: 'absolute',
                    top: addColBodyTop,
                    left: btnX,
                    width: addColWidth,
                    height: addColBodyHeight,
                    zIndex: 55,
                    pointerEvents: 'none',
                    background: BASE_THEME.addCellBg,
                    borderRight: `1px solid ${BASE_THEME.addCellBorder}`,
                    boxSizing: 'border-box',
                  }}
                />
              )}
              <div
                key="add-col-btn"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: btnX,
                  zIndex: 60,
                  pointerEvents: 'auto',
                }}
              >
                <BaseAxisAddCell
                  width={addColWidth}
                  height={config.headerHeight}
                  title="添加字段"
                  variant="column"
                  onClick={handleAddColumn}
                />
              </div>
            </>
          );
        }

        const clampedX = Math.min(Math.max(btnX, config.headerWidth), containerSize.width - addColWidth);
        return (
          <button
            key="add-col-btn"
            onClick={handleAddColumn}
            style={{
              position: 'absolute',
              top: 2,
              left: clampedX,
              zIndex: 60,
              width: addColWidth,
              height: config.headerHeight - 4,
              border: '1px dashed #ccc',
              borderRadius: 3,
              background: '#fafafa',
              color: '#999',
              cursor: 'pointer',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
            title="添加列"
          >
            +
          </button>
        );
      })()}

      {/* 多维表：底部添加行栏（行头 + 空白数据区 + 添加列占位） */}
      {!previewMode && isBaseSheet && (() => {
        const config = viewportRef.current.config;
        const activeRowHeights = resolveActiveRowHeights();
        let dataColWidth = 0;
        for (let c = 0; c < sheet.colCount; c++) {
          dataColWidth += (sheet.columnWidths.get(c) || config.defaultColumnWidth) * zoomLevel;
        }
        let totalH = config.headerHeight;
        for (let r = 0; r < sheet.rowCount; r++) {
          totalH += (activeRowHeights.get(r) || config.defaultRowHeight) * zoomLevel;
        }
        const barY = totalH - scrollTop;
        const barHeight = addRowsBarHeight;
        const barVisible = barY < containerSize.height && barY + barHeight > 0;
        if (!barVisible) return null;
        return (
          <BaseAddRowsBar
            key="base-add-row"
            top={barY}
            headerWidth={config.headerWidth}
            dataWidth={dataColWidth}
            addColumnWidth={BASE_ADD_COLUMN_WIDTH}
            height={barHeight}
            onAddRow={() => {
              table.insertRows(sheet.rowCount, 1);
              useSheetStore.getState().setStatusText('已添加新行');
              dirtyTrackerRef.current.markFullRedraw();
              scheduleRender();
            }}
          />
        );
      })()}

      {/* 普通表格：底部增加行 */}
      {!previewMode && !isBaseSheet && (() => {
        const config = viewportRef.current.config;
        const activeRowHeights = resolveActiveRowHeights();
        const headerH = config.headerHeight;
        let totalH = headerH;
        for (let r = 0; r < sheet.rowCount; r++) {
          totalH += (activeRowHeights.get(r) || config.defaultRowHeight) * zoomLevel;
        }
        const barY = totalH - scrollTop;
        const barHeight = addRowsBarHeight;
        const barVisible = barY < containerSize.height && barY + barHeight > 0;
        if (!barVisible) return null;
        return (
          <AddRowsBar
            top={barY}
            headerWidth={config.headerWidth}
            height={barHeight}
            onAddRows={(count) => {
              table.insertRows(sheet.rowCount, count);
              useSheetStore.getState().setStatusText(`已添加 ${count} 行`);
              dirtyTrackerRef.current.markFullRedraw();
              scheduleRender();
            }}
          />
        );
      })()}

      {/* 填充柄交互层（普通表格与多维表） */}
      {!previewMode && (() => {
        if (!supportsAutofill || !selectionRange || editingCell) return null;
        if (!shouldShowFillHandle(selectionRange, sheet.rowCount, sheet.colCount)) return null;

        const anchor = getFillHandleAnchor(selectionRange);
        const cellRect = viewportRef.current.getCellRect(anchor, sheet.columnWidths, displayRowHeights);
        if (cellRect.x + cellRect.width < 0 || cellRect.y + cellRect.height < 0) return null;
        if (cellRect.x > containerSize.width || cellRect.y > containerSize.height) return null;

        const half = FILL_HANDLE_SIZE / 2;
        return (
          <div
            style={{ position: 'absolute', inset: 0, zIndex: 1000, pointerEvents: 'none' }}
          >
            <div
              data-sheet-fill-handle
              style={{
                position: 'absolute',
                left: cellRect.x + cellRect.width - half - 4,
                top: cellRect.y + cellRect.height - half - 4,
                width: FILL_HANDLE_SIZE + 8,
                height: FILL_HANDLE_SIZE + 8,
                cursor: 'crosshair',
                pointerEvents: 'auto',
              }}
              onMouseDown={e => startFillDrag(selectionRange, e)}
              onMouseEnter={() => {
                if (canvasContainerRef.current) canvasContainerRef.current.style.cursor = 'crosshair';
              }}
              onMouseLeave={() => {
                if (canvasContainerRef.current) canvasContainerRef.current.style.cursor = 'cell';
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  right: 4,
                  bottom: 4,
                  width: FILL_HANDLE_SIZE,
                  height: FILL_HANDLE_SIZE,
                  background: '#000000',
                  border: '1px solid #ffffff',
                  boxSizing: 'border-box',
                  pointerEvents: 'none',
                }}
              />
            </div>
          </div>
        );
      })()}

      {!previewMode && (
      <ContextMenu
        table={table}
        visible={contextMenu.visible && !isBaseSheet}
        x={contextMenu.x}
        y={contextMenu.y}
        clickInSelection={contextMenu.clickInSelection}
        checkedRows={checkedRows}
        isBaseSheet={isBaseSheet}
        onRequestDeleteRows={handleRequestDeleteRows}
        onClose={() => setContextMenu({ visible: false, x: 0, y: 0, coord: null })}
        onCopy={handleCopy}
        onCut={handleCut}
        onPaste={handlePaste}
        onCopyAsImage={handleCopyAsImage}
      />
      )}
      {!previewMode && sheet.type === 'base' && contextMenu.visible && contextMenu.coord && (
        <BaseRecordContextMenu
          visible
          x={contextMenu.x}
          y={contextMenu.y}
          rowIndex={contextMenu.coord.row}
          colIndex={contextMenu.coord.col}
          table={table}
          onClose={() => setContextMenu({ visible: false, x: 0, y: 0, coord: null })}
          onInsertRowsAbove={handleBaseInsertRowsAbove}
          onInsertRowsBelow={handleBaseInsertRowsBelow}
          onViewDetail={row => openRecordDrawer(row, 'detail')}
          onViewHistory={row => openRecordDrawer(row, 'history')}
          onAddChildRecord={handleBaseAddChildRecord}
          onAddComment={handleBaseAddComment}
          onFilterByCell={handleBaseFilterByCell}
          onDeleteRecord={handleBaseDeleteRecord}
        />
      )}
      {!previewMode && (
      <DeleteRecordsDialog
        visible={deleteDialog.visible}
        count={deleteDialog.rows.length}
        onConfirm={handleConfirmDeleteRows}
        onCancel={handleCancelDeleteRows}
      />
      )}
      {!previewMode && isBaseSheet && (() => {
        const coord = editingCell ?? activeCell;
        if (!coord || coord.col !== 0) return null;
        if ((rowTreeMeta?.[coord.row]?.depth ?? 0) <= 0) return null;
        const cellRect = viewportRef.current.getCellRect(coord, sheet.columnWidths, displayRowHeights);
        const contentRect = getTreeContentRect(
          cellRect,
          0,
          rowTreeMeta?.[coord.row],
          viewportRef.current.zoomLevel,
        );
        if (contentRect.y + contentRect.height < 0 || contentRect.y > containerSize.height) return null;
        return (
          <BaseRecordCellExpandBtn
            rowIndex={coord.row}
            contentRect={contentRect}
            onExpand={row => openRecordDrawer(row, 'detail')}
          />
        );
      })()}

      {!previewMode && isBaseSheet && activeHoverRow !== null && rowTreeMeta?.[activeHoverRow] && isRowVisible(activeHoverRow, sheet.rows, collapsedRowIdSet) && (() => {
        const cellRect = viewportRef.current.getCellRect({ row: activeHoverRow, col: 0 }, sheet.columnWidths, displayRowHeights);
        if (cellRect.y + cellRect.height < 0 || cellRect.y > containerSize.height) return null;
        return (
          <BaseRecordRowToolbar
            rowIndex={activeHoverRow}
            cellRect={cellRect}
            onMouseEnter={() => setToolbarHoverRow(activeHoverRow)}
            onMouseLeave={() => setToolbarHoverRow(null)}
            onViewDetail={row => openRecordDrawer(row, 'detail')}
            onAddChild={rowIndex => {
              const parent = table.getRowRecord(rowIndex);
              const newRowIndex = table.insertChildRow(rowIndex);
              if (parent) {
                setCollapsedRowIds(prev => prev.filter(id => id !== parent._id));
              }
              dirtyTrackerRef.current.markFullRedraw();
              scheduleRender();
              useSheetStore.getState().setStatusText(`已添加子记录（第 ${newRowIndex + 1} 行）`);
            }}
          />
        );
      })()}

      {!previewMode && isBaseSheet && (
        <RecordDetailDrawer
          visible={detailRowIndex !== null}
          rowIndex={detailRowIndex}
          table={table}
          initialTab={detailDrawerTab}
          onClose={() => setDetailRowIndex(null)}
          onNavigate={row => setDetailRowIndex(row)}
        />
      )}

      {!previewMode && filterPanel && !isBaseSheet && (
        <ColumnHeaderFilterPanel
          table={table}
          col={filterPanel.col}
          anchorRect={filterPanel.rect}
          onClose={() => setFilterPanel(null)}
        />
      )}
    </div>
  );
};
