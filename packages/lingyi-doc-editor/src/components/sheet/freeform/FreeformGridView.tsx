import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getSheetCellEditText,
  resetStandardRenderConfig,
  resolveColumnWidth,
  computeFreeformEffectiveRowHeights,
  DEFAULT_ROW_HEIGHT,
  getCellText,
  cellRefLabel,
  resolveSheetCommentCells,
  type FreeformSheetModel,
} from '@lingyi-doc/core';
import type { CellCoord, CellValue, ColumnDef } from '@lingyi-doc/core';
import { useSheetStore } from '../../../store/sheetStore';
import type { SheetContainerProps } from '../SheetContainer.types';
import { FreeformGridOverlays } from './FreeformGridOverlays';
import { useSheetGridContext } from '../shared/SheetGridContext';
import { SheetCanvasSurface } from '../shared/SheetCanvasSurface';
import { SheetSharedOverlays } from '../shared/SheetSharedOverlays';
import { runSheetRenderPass } from '../shared/runSheetRenderPass';
import type { SheetRenderPassContext } from '../shared/sheetRenderTypes';
import type { SheetInteractionDeps } from '../shared/sheetInteraction.types';
import { useSheetSelection } from '../shared/useSheetSelection';
import { useSheetClipboard } from '../shared/useSheetClipboard';
import { useSheetCellHitTest } from '../shared/useSheetCellHitTest';
import { useSheetEditing } from '../shared/useSheetEditing';
import { useSheetMouseHandlers } from '../shared/useSheetMouseHandlers';
import { useSheetKeyboard } from '../shared/useSheetKeyboard';
import { useSheetCanvasLifecycle } from '../shared/useSheetCanvasLifecycle';
import { useSheetAxisResize } from '../shared/useSheetAxisResize';
import { useSheetPointerEffects } from '../shared/useSheetPointerEffects';
import { useSheetPreviewReset } from '../shared/useSheetPreviewReset';

export type FreeformGridViewProps = SheetContainerProps;

export const FreeformGridView: React.FC<FreeformGridViewProps> = ({
  table,
  style,
  selectedChartId,
  onSelectChart,
  previewMode = false,
  onAddSheetComment,
  commentsEnabled = false,
  sheetCommentThreads,
  selectedCommentId,
}) => {
  const host = useSheetGridContext();
  const {
    containerRef,
    canvasContainerRef,
    viewportRef,
    layerManagerRef,
    cellRendererRef,
    baseCellRendererRef,
    dirtyTrackerRef,
    layoutVersion,
    containerSize,
    scheduleRender,
  } = host;

  const lastColClickTimeRef = useRef<number>(0);

  const setSelection = useSheetStore(s => s.setSelection);
  const setDiscreteSelections = useSheetStore(s => s.setDiscreteSelections);
  const setEditingCell = useSheetStore(s => s.setEditingCell);
  const setFormulaBarText = useSheetStore(s => s.setFormulaBarText);
  const zoomLevel = useSheetStore(s => s.zoomLevel);
  const editingCell = useSheetStore(s => s.editingCell);
  const selectionRange = useSheetStore(s => s.selectionRange);
  const scrollLeft = useSheetStore(s => s.scrollLeft);
  const scrollTop = useSheetStore(s => s.scrollTop);

  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    coord: CellCoord | null;
    clickInSelection?: boolean;
  }>({ visible: false, x: 0, y: 0, coord: null });

  useSheetPreviewReset(previewMode, setContextMenu);

  const [hoveredCol, setHoveredCol] = useState<number | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [cornerHovered, setCornerHovered] = useState(false);
  const [hoverRatingCell, setHoverRatingCell] = useState<{ row: number; col: number; value: number } | null>(null);
  const [filterPanel, setFilterPanel] = useState<{ col: number; rect: { left: number; top: number; width: number; height: number } } | null>(null);
  const [checkedRows, setCheckedRows] = useState<number[]>([]);

  const [deleteDialog, setDeleteDialog] = useState<{ visible: boolean; rows: number[] }>({
    visible: false,
    rows: [],
  });

  const sheet = table.sheet as FreeformSheetModel;
  const mergeRanges = sheet.mergeRanges ?? [];
  const columnDefs: ColumnDef[] = [];
  const columnFilters = sheet.columnFilters;
  const columnFilterCols = sheet.columnFilterCols;

  const formatCellEditText = useCallback(
    (value: CellValue) => getSheetCellEditText(value, true),
    [],
  );
  const supportsAutofill = true;
  const effectiveColCount = Math.max(sheet.colCount, columnDefs.length);
  const gridRowCount = sheet.rowCount;

  const sheetCommentCells = useMemo(
    () => resolveSheetCommentCells(sheetCommentThreads ?? [], sheet.sheetId),
    [sheetCommentThreads, sheet.sheetId],
  );

  useEffect(() => {
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [selectedCommentId, sheetCommentCells, scheduleRender, dirtyTrackerRef]);

  const effectiveRowHeights = useMemo(() => {
    return computeFreeformEffectiveRowHeights(
      sheet.rowCount,
      sheet.rowHeights,
      DEFAULT_ROW_HEIGHT,
      sheet,
      (r, c) => table.getCell(r, c),
    );
  }, [sheet, sheet.rowCount, sheet.rowHeights, columnFilters, columnFilterCols, table, layoutVersion]);

  const addRowsBarHeight = useMemo(() => {
    return viewportRef.current.config.defaultRowHeight * zoomLevel;
  }, [zoomLevel, viewportRef]);

  const addRowsExtraScrollBottom = addRowsBarHeight;

  const resolveActiveRowHeights = useCallback((): Map<number, number> => {
    return computeFreeformEffectiveRowHeights(
      table.sheet.rowCount,
      table.sheet.rowHeights,
      DEFAULT_ROW_HEIGHT,
      { columnFilterEnabled: sheet.columnFilterEnabled, columnFilters },
      (r, c) => table.getCell(r, c),
    );
  }, [table, sheet.columnFilterEnabled, columnFilters]);

  const applyViewportConfig = useCallback(() => {
    const vpConfig = viewportRef.current.config;
    resetStandardRenderConfig(vpConfig);
    vpConfig.headerWidth = 46;
    viewportRef.current.setFreezeState(sheet.freezeState || { frozenRows: 0, frozenCols: 0 });
  }, [viewportRef, sheet]);

  const openFilterPanelForCol = useCallback((col: number) => {
    if (!canvasContainerRef.current) return;
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
  }, [canvasContainerRef, viewportRef, sheet.columnWidths]);

  const columnFilterPanelRequest = useSheetStore(s => s.columnFilterPanelRequest);
  useEffect(() => {
    if (previewMode || !columnFilterPanelRequest) return;
    openFilterPanelForCol(columnFilterPanelRequest.col);
    useSheetStore.getState().clearColumnFilterPanelRequest();
  }, [columnFilterPanelRequest, openFilterPanelForCol, previewMode]);

  const noop = useCallback(() => {}, []);
  const noopRecordInsert = useCallback((_ctx: Record<string, unknown>, _key: string, _row: number) => {}, []);
  const identityGridRow = useCallback((row: number) => row, []);

  const {
    selectionManagerRef,
    isDraggingRef,
    isFillDraggingRef,
    fillSourceRangeRef,
    fillPreviewRange,
    axisDragRef,
    axisHeaderSelectRef,
    axisAnchorRef,
    setAxisDragTick,
    discreteAxisCols,
    discreteAxisRows,
    discreteAxisColsRef,
    discreteAxisRowsRef,
    setFormulaDrag,
    formulaDragRef,
    formulaDragCursorRef,
    syncDiscreteAxisCols,
    syncDiscreteAxisRows,
    clearAxisDiscreteSelection,
    applyColumnRangeSelection,
    applyRowRangeSelection,
    applyExtendedSelection,
    normalizeRangeForMerges,
    updateFillPreview,
    finishFillDrag,
    startFillDrag,
  } = useSheetSelection({
    table,
    sheet,
    isBaseSheet: false,
    previewMode,
    mergeRanges,
    dirtyTrackerRef,
    scheduleRender,
    formatCellEditText,
  });

  const {
    clipboardManagerRef,
    copiedRange,
    setCopiedRange,
    copyDashOffsetRef,
    handleCopy,
    handleCut,
    handlePaste,
    handleCopyAsImage,
  } = useSheetClipboard({
    table,
    isBaseSheet: false,
    previewMode,
    dirtyTrackerRef,
    scheduleRender,
    viewportRef,
    sheetColumnWidths: sheet.columnWidths,
    resolveActiveRowHeights,
  });

  const {
    resizeState,
    setResizeState,
    axisResizeGuide,
    startAxisResizeLongPress,
  } = useSheetAxisResize({
    table,
    sheetColumnWidths: sheet.columnWidths,
    sheetRowHeights: sheet.rowHeights,
    zoomLevel,
    containerSize,
    host,
    resolveActiveRowHeights,
    allowRowResize: true,
  });

  const performRender = useCallback(() => {
    const layerManager = layerManagerRef.current;
    const viewport = viewportRef.current;
    const renderer = cellRendererRef.current;
    const tracker = dirtyTrackerRef.current;

    if (!layerManager || containerSize.width === 0 || containerSize.height === 0) return;

    const renderCtx: SheetRenderPassContext = {
      layerManager,
      viewport,
      renderer,
      baseCellRenderer: baseCellRendererRef.current,
      tracker,
      table,
      sheet,
      mode: 'freeform',
      isBaseSheet: false,
      isFreeformSheet: true,
      containerSize,
      zoomLevel,
      previewMode,
      supportsAutofill,
      activeRowHeights: resolveActiveRowHeights(),
      gridRowCount,
      columnDefs,
      sheetRows: [],
      mergeRanges,
      groupLayout: null,
      isGroupedView: false,
      groupRules: [],
      rowTreeMeta: undefined,
      collapsedRowIdSet: new Set(),
      checkedRows: [],
      checkedRowsForRender: [],
      checkedRecordRowSet: new Set(),
      hoveredCol,
      activeHoverRow: hoveredRow,
      cornerHovered,
      fillPreviewRange,
      discreteAxisCols,
      discreteAxisRows,
      copiedRange,
      copyDashOffsetRef,
      formulaDragRef,
      axisDragRef,
      columnFilters,
      resolveGridRecordRow: identityGridRow,
      skipGroupGridLine: () => false,
      isGroupDisplayRow: () => false,
      fillGroupedRowHighlight: noop,
      resolveGroupedCardLeft: () => 0,
      viewportRef,
      sheetCommentCells,
      selectedCommentId,
    };
    runSheetRenderPass(renderCtx);
  }, [
    table,
    containerSize,
    sheet,
    supportsAutofill,
    hoveredCol,
    hoveredRow,
    cornerHovered,
    resolveActiveRowHeights,
    fillPreviewRange,
    discreteAxisCols,
    discreteAxisRows,
    previewMode,
    copiedRange,
    gridRowCount,
    columnDefs,
    mergeRanges,
    columnFilters,
    zoomLevel,
    identityGridRow,
    noop,
    layerManagerRef,
    viewportRef,
    cellRendererRef,
    baseCellRendererRef,
    dirtyTrackerRef,
    copyDashOffsetRef,
    formulaDragRef,
    axisDragRef,
    sheetCommentCells,
    selectedCommentId,
  ]);

  useSheetCanvasLifecycle({
    table,
    sheetId: sheet.sheetId,
    sheetColumnWidths: sheet.columnWidths,
    previewMode,
    host,
    performRender,
    resolveActiveRowHeights,
    effectiveRowHeights,
    gridRowCount,
    effectiveColCount,
    addRowsExtraScrollBottom,
    applyViewportConfig,
    syncToolbarOnActiveCell: true,
  });

  const {
    mapCoordToRecord,
    getCellFromClientCoords,
    getCellFromEvent,
  } = useSheetCellHitTest({
    canvasContainerRef,
    viewportRef,
    gridRowCount,
    effectiveColCount,
    sheetColumnWidths: sheet.columnWidths,
    mergeRanges,
    resolveActiveRowHeights,
    resolveGridRecordRow: identityGridRow,
    table,
  });

  const {
    dropdownEditCell,
    dateEditCell,
    setDropdownEditCell,
    setDateEditCell,
    handleEditCommit,
    handleEditCancel,
    handleDropdownEditClose,
    handleDateEditClose,
    handleDropdownEditCommit,
    handleDateEditCommit,
    startCellEdit,
  } = useSheetEditing({
    table,
    isBaseSheet: false,
    isFreeformSheet: true,
    columnDefs,
    mapCoordToRecord,
    selectionManagerRef,
    dirtyTrackerRef,
    scheduleRender,
    formatCellEditText,
  });

  const interactionDeps: SheetInteractionDeps = {
    table,
    sheet,
    mode: 'freeform',
    isBaseSheet: false,
    isFreeformSheet: true,
    previewMode,
    supportsAutofill,
    mergeRanges,
    columnDefs,
    sheetRows: [],
    effectiveColCount,
    gridRowCount,
    displayRowHeights: sheet.rowHeights,
    effectiveRowHeights,
    groupLayout: null,
    isGroupedView: false,
    checkedRecordRowSet: new Set(),
    activeHoverRow: hoveredRow,
    toolbarHoverRow: null,
    checkedRows,
    canvasContainerRef,
    viewportRef,
    dirtyTrackerRef,
    layerManagerRef,
    cellRendererRef,
    baseCellRendererRef,
    selectionManagerRef,
    lastColClickTimeRef,
    formulaDragRef,
    formulaDragCursorRef,
    axisDragRef,
    axisHeaderSelectRef,
    axisAnchorRef,
    discreteAxisColsRef,
    discreteAxisRowsRef,
    isDraggingRef,
    isFillDraggingRef,
    fillSourceRangeRef,
    editingCell,
    progressDrag: null,
    resizeState,
    discreteAxisCols,
    discreteAxisRows,
    scheduleRender,
    resolveActiveRowHeights,
    mapCoordToRecord,
    getCellFromEvent,
    getCellFromClientCoords,
    formatCellEditText,
    handleEditCommit,
    startCellEdit,
    setSelection,
    setDiscreteSelections,
    setEditingCell,
    setFormulaBarText,
    setCheckedRows,
    setCollapsedRowIds: noop as React.Dispatch<React.SetStateAction<string[]>>,
    setHoveredCol,
    setHoveredRow,
    setCornerHovered,
    setHoverRatingCell,
    setProgressDrag: noop as (coord: CellCoord | null) => void,
    setDropdownEditCell,
    setDateEditCell,
    setFormulaDrag,
    setAxisDragTick,
    setResizeState,
    setBaseColumnMenu: noop as React.Dispatch<React.SetStateAction<{ colIndex: number; x: number; y: number } | null>>,
    setContextMenu,
    applyColumnRangeSelection,
    applyRowRangeSelection,
    applyExtendedSelection,
    normalizeRangeForMerges,
    clearAxisDiscreteSelection,
    syncDiscreteAxisCols,
    syncDiscreteAxisRows,
    startFillDrag,
    updateFillPreview,
    finishFillDrag,
    openFilterPanelForCol,
    startAxisResizeLongPress,
    toggleGroupCollapse: noop,
    insertRecordInGroup: noopRecordInsert,
    toggleRowCollapse: noop,
    resolveGroupedCardLeft: () => 0,
    onSelectChart,
    onOpenFieldConfig: undefined,
    clipboardManagerRef,
    copiedRange,
    setCopiedRange,
  };

  const {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDoubleClick,
    handleContextMenu,
  } = useSheetMouseHandlers(interactionDeps);

  useSheetKeyboard({ previewMode, deps: interactionDeps });

  useSheetPointerEffects({
    previewMode,
    host,
    selectionManagerRef,
    clearAxisDiscreteSelection,
    isFillDraggingRef,
    fillSourceRangeRef,
    getCellFromClientCoords,
    updateFillPreview,
    finishFillDrag,
  });

  const handleRequestDeleteRows = useCallback((rows: number[]) => {
    if (rows.length === 0) return;
    setDeleteDialog({ visible: true, rows: [...new Set(rows)].sort((a, b) => a - b) });
  }, []);

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
  }, [deleteDialog.rows, table, scheduleRender, dirtyTrackerRef]);

  const handleCancelDeleteRows = useCallback(() => {
    setDeleteDialog({ visible: false, rows: [] });
  }, []);

  const handleFreeformAddComment = useCallback((rowIndex: number, colIndex: number) => {
    if (!commentsEnabled || !onAddSheetComment) return;
    const cell = table.getCell(rowIndex, colIndex);
    const cellText = cell ? getCellText(cell.value).trim() : '';
    const address = cellRefLabel(rowIndex, colIndex);
    const quote = cellText
      ? `${address}: ${cellText}`.slice(0, 200)
      : address;
    onAddSheetComment({ rowIndex, colIndex, quote });
  }, [commentsEnabled, onAddSheetComment, table]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        height: '100%',
        minHeight: 0,
        background: '#fff',
        ...style,
      }}
    >
      <SheetCanvasSurface
        canvasContainerRef={canvasContainerRef}
        previewMode={previewMode}
        axisResizeGuide={axisResizeGuide}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setHoveredRow(null); setHoveredCol(null); }}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      />

      {!previewMode && (
        <FreeformGridOverlays
          table={table}
          viewportRef={viewportRef}
          containerRef={containerRef}
          mergeRanges={mergeRanges}
          columnDefs={columnDefs}
          effectiveRowHeights={effectiveRowHeights}
          sheetColumnWidths={sheet.columnWidths}
          sheetRowCount={sheet.rowCount}
          scrollLeft={scrollLeft}
          scrollTop={scrollTop}
          zoomLevel={zoomLevel}
          containerSize={containerSize}
          addRowsBarHeight={addRowsBarHeight}
          resolveActiveRowHeights={resolveActiveRowHeights}
          scheduleRender={scheduleRender}
          markFullRedraw={() => dirtyTrackerRef.current.markFullRedraw()}
          dropdownEditCell={dropdownEditCell}
          dateEditCell={dateEditCell}
          filterPanel={filterPanel}
          contextMenu={contextMenu}
          checkedRows={checkedRows}
          onEditCommit={handleEditCommit}
          onEditCancel={handleEditCancel}
          onDropdownEditCommit={handleDropdownEditCommit}
          onDropdownEditClose={handleDropdownEditClose}
          onDateEditCommit={handleDateEditCommit}
          onDateEditClose={handleDateEditClose}
          onCloseContextMenu={() => setContextMenu({ visible: false, x: 0, y: 0, coord: null })}
          onCloseFilterPanel={() => setFilterPanel(null)}
          onRequestDeleteRows={handleRequestDeleteRows}
          onCopy={handleCopy}
          onCut={handleCut}
          onPaste={handlePaste}
          onCopyAsImage={handleCopyAsImage}
          commentsEnabled={commentsEnabled}
          onAddComment={handleFreeformAddComment}
        />
      )}

      <SheetSharedOverlays
        previewMode={previewMode}
        table={table}
        scrollLeft={scrollLeft}
        scrollTop={scrollTop}
        zoomLevel={zoomLevel}
        containerRef={containerRef}
        canvasContainerRef={canvasContainerRef}
        viewportRef={viewportRef}
        selectedChartId={selectedChartId}
        onSelectChart={onSelectChart}
        hoverRatingCell={hoverRatingCell}
        sheetColumnWidths={sheet.columnWidths}
        sheetRowHeights={sheet.rowHeights}
        supportsAutofill={supportsAutofill}
        selectionRange={selectionRange}
        editingCell={editingCell}
        sheetRowCount={sheet.rowCount}
        sheetColCount={sheet.colCount}
        displayRowHeights={sheet.rowHeights}
        containerSize={containerSize}
        startFillDrag={startFillDrag}
        deleteDialog={deleteDialog}
        onConfirmDeleteRows={handleConfirmDeleteRows}
        onCancelDeleteRows={handleCancelDeleteRows}
      />
    </div>
  );
};
