import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getSheetCellEditText,
  BASE_THEME,
  DEFAULT_BASE_ROW_HEIGHT,
  resolveSheetCommentCells,
  type BaseSheetModel,
} from '@lingyi-doc/core';
import { ensureBaseViewportConfig } from './baseViewportConfig';
import type { CellCoord, CellValue } from '@lingyi-doc/core';
import { useSheetStore } from '../../../store/sheetStore';
import type { SheetContainerProps } from '../SheetContainer.types';
import { useBaseGridContext } from './BaseGridContext';
import { BaseGridOverlays } from './BaseGridOverlays';
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

export type BaseGridViewProps = SheetContainerProps;

export const BaseGridView: React.FC<BaseGridViewProps> = ({
  table,
  style,
  selectedChartId,
  onSelectChart,
  onOpenFieldConfig,
  previewMode = false,
  sheetCommentThreads,
  selectedCommentId,
}) => {
  const host = useSheetGridContext();
  const base = useBaseGridContext();
  const {
    containerRef,
    canvasContainerRef,
    viewportRef,
    layerManagerRef,
    cellRendererRef,
    baseCellRendererRef,
    dirtyTrackerRef,
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
  const activeCell = useSheetStore(s => s.activeCell);
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
  const [toolbarHoverRow, setToolbarHoverRow] = useState<number | null>(null);
  const activeHoverRow = hoveredRow ?? toolbarHoverRow;
  const [cornerHovered, setCornerHovered] = useState(false);
  const [progressDrag, setProgressDrag] = useState<CellCoord | null>(null);
  const [hoverRatingCell, setHoverRatingCell] = useState<{ row: number; col: number; value: number } | null>(null);

  const [deleteDialog, setDeleteDialog] = useState<{ visible: boolean; rows: number[] }>({
    visible: false,
    rows: [],
  });

  const sheet = table.sheet as BaseSheetModel;
  const columnDefs = base.columnDefs;
  const sheetRows = base.sheetRows;
  const mergeRanges: never[] = [];
  const defaultRowHeight = sheet.defaultRowHeight;

  const sheetCommentCells = useMemo(
    () => resolveSheetCommentCells(sheetCommentThreads ?? [], sheet.sheetId, {
      rows: sheetRows,
      columnDefs,
    }),
    [sheetCommentThreads, sheet.sheetId, sheetRows, columnDefs],
  );

  useEffect(() => {
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [selectedCommentId, sheetCommentCells, scheduleRender, dirtyTrackerRef]);

  const {
    checkedRows,
    setCheckedRows,
    collapsedRowIds,
    collapsedRowIdSet,
    rowTreeMeta,
    toggleRowCollapse,
    setCollapsedRowIds,
    groupRules,
    groupLayout,
    flatSortedLayout,
    gridRowCount,
    isGroupedView,
    resolveGridRecordRow,
    checkedRowsForRender,
    skipGroupGridLine,
    isGroupDisplayRow,
    fillGroupedRowHighlight,
    toggleGroupCollapse,
    insertRecordInGroup,
    resolveGroupedCardLeft,
    displayRowHeights,
    baseColumnMenu,
    setBaseColumnMenu,
    detailRowIndex,
    setDetailRowIndex,
    detailDrawerTab,
    activeSort,
    handleEditField,
    handleEditDescription,
    handleCopyField,
    handleHideField,
    handleInsertColumn,
    handleFreezeColumn,
    handleSort,
    handleGroupByField,
    handleFilterByField,
    handleCreateView,
    handleDeleteField,
    openRecordDrawer,
    handleBaseInsertRowsAbove,
    handleBaseInsertRowsBelow,
    handleBaseAddChildRecord,
    handleBaseAddComment,
    handleBaseFilterByCell,
    canShowRecordDetailActions,
    commentsEnabled,
  } = base;

  const rowTreeMetaForRender = useMemo(() => {
    if (!flatSortedLayout || !rowTreeMeta) return rowTreeMeta;
    return flatSortedLayout.recordIndexByDisplayRow.map((recordIdx: number) => rowTreeMeta[recordIdx]);
  }, [flatSortedLayout, rowTreeMeta]);

  const formatCellEditText = useCallback(
    (value: CellValue) => getSheetCellEditText(value, false),
    [],
  );
  const supportsAutofill = true;
  const effectiveColCount = Math.max(sheet.colCount, columnDefs.length);
  const effectiveRowHeights = displayRowHeights;

  const addRowsBarHeight = useMemo(() => {
    const defaultH = defaultRowHeight ?? DEFAULT_BASE_ROW_HEIGHT;
    return defaultH * zoomLevel;
  }, [defaultRowHeight, zoomLevel]);

  const addRowsExtraScrollBottom = useMemo(() => {
    return addRowsBarHeight + BASE_THEME.gridPaddingBottom;
  }, [addRowsBarHeight]);

  const resolveActiveRowHeights = useCallback((): Map<number, number> => {
    return displayRowHeights;
  }, [displayRowHeights]);

  const applyViewportConfig = useCallback(() => {
    ensureBaseViewportConfig(viewportRef.current, sheet, previewMode);
  }, [viewportRef, sheet, previewMode]);

  const openFilterPanelForCol = useCallback((_col: number) => {}, []);

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
    isBaseSheet: true,
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
  } = useSheetClipboard({
    table,
    isBaseSheet: true,
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
    allowRowResize: false,
  });

  const checkedRecordRowSet = useMemo(() => new Set(checkedRows), [checkedRows]);

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
      mode: 'base',
      isBaseSheet: true,
      isFreeformSheet: false,
      containerSize,
      zoomLevel,
      previewMode,
      supportsAutofill,
      activeRowHeights: resolveActiveRowHeights(),
      gridRowCount,
      columnDefs,
      sheetRows,
      mergeRanges,
      groupLayout,
      isGroupedView,
      groupRules,
      rowTreeMeta: rowTreeMetaForRender,
      collapsedRowIdSet,
      checkedRows,
      checkedRowsForRender,
      checkedRecordRowSet,
      hoveredCol,
      activeHoverRow,
      cornerHovered,
      fillPreviewRange,
      discreteAxisCols,
      discreteAxisRows,
      copiedRange,
      copyDashOffsetRef,
      formulaDragRef,
      axisDragRef,
      columnFilters: undefined,
      resolveGridRecordRow,
      skipGroupGridLine,
      isGroupDisplayRow,
      fillGroupedRowHighlight,
      resolveGroupedCardLeft,
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
    checkedRows,
    checkedRowsForRender,
    checkedRecordRowSet,
    activeHoverRow,
    hoveredCol,
    cornerHovered,
    resolveActiveRowHeights,
    rowTreeMetaForRender,
    collapsedRowIdSet,
    fillPreviewRange,
    discreteAxisCols,
    discreteAxisRows,
    previewMode,
    copiedRange,
    groupLayout,
    gridRowCount,
    isGroupedView,
    groupRules,
    resolveGridRecordRow,
    skipGroupGridLine,
    isGroupDisplayRow,
    fillGroupedRowHighlight,
    resolveGroupedCardLeft,
    columnDefs,
    zoomLevel,
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
    collapsedRowIds,
    ensureRowRecords: true,
    syncToolbarOnActiveCell: false,
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
    resolveGridRecordRow,
    table,
  });

  const {
    setDropdownEditCell,
    setDateEditCell,
    handleEditCommit,
    startCellEdit,
  } = useSheetEditing({
    table,
    isBaseSheet: true,
    isFreeformSheet: false,
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
    mode: 'base',
    isBaseSheet: true,
    isFreeformSheet: false,
    previewMode,
    supportsAutofill,
    mergeRanges,
    columnDefs,
    sheetRows,
    effectiveColCount,
    gridRowCount,
    displayRowHeights,
    effectiveRowHeights,
    groupLayout,
    isGroupedView,
    rowTreeMeta,
    checkedRecordRowSet,
    activeHoverRow,
    toolbarHoverRow,
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
    progressDrag,
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
    setCollapsedRowIds,
    setHoveredCol,
    setHoveredRow,
    setCornerHovered,
    setHoverRatingCell,
    setProgressDrag,
    setDropdownEditCell,
    setDateEditCell,
    setFormulaDrag,
    setAxisDragTick,
    setResizeState,
    setBaseColumnMenu,
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
    toggleGroupCollapse,
    insertRecordInGroup,
    toggleRowCollapse,
    resolveGroupedCardLeft,
    onSelectChart,
    onOpenFieldConfig,
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
    clearCheckedRows: () => setCheckedRows([]),
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
  }, [deleteDialog.rows, table, scheduleRender, setCheckedRows, dirtyTrackerRef]);

  const handleCancelDeleteRows = useCallback(() => {
    setDeleteDialog({ visible: false, rows: [] });
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        height: '100%',
        minHeight: 0,
        background: BASE_THEME.pageBg,
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
        <BaseGridOverlays
          table={table}
          sheet={sheet}
          columnDefs={columnDefs}
          sheetRows={sheetRows}
          viewportRef={viewportRef}
          containerRef={containerRef}
          effectiveRowHeights={effectiveRowHeights}
          displayRowHeights={displayRowHeights}
          sheetColumnWidths={sheet.columnWidths}
          scrollLeft={scrollLeft}
          scrollTop={scrollTop}
          zoomLevel={zoomLevel}
          containerSize={containerSize}
          addRowsBarHeight={addRowsBarHeight}
          gridRowCount={gridRowCount}
          isGroupedView={isGroupedView}
          resolveActiveRowHeights={resolveActiveRowHeights}
          mapCoordToRecord={mapCoordToRecord}
          scheduleRender={scheduleRender}
          markFullRedraw={() => dirtyTrackerRef.current.markFullRedraw()}
          setFormulaBarText={setFormulaBarText}
          setEditingCell={setEditingCell}
          baseColumnMenu={baseColumnMenu}
          onCloseColumnMenu={() => setBaseColumnMenu(null)}
          activeSort={activeSort}
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
          onOpenFieldConfig={onOpenFieldConfig}
          editingCell={editingCell}
          activeCell={activeCell}
          rowTreeMeta={rowTreeMeta}
          collapsedRowIdSet={collapsedRowIdSet}
          contextMenu={contextMenu}
          onCloseContextMenu={() => setContextMenu({ visible: false, x: 0, y: 0, coord: null })}
          onInsertRowsAbove={handleBaseInsertRowsAbove}
          onInsertRowsBelow={handleBaseInsertRowsBelow}
          onViewDetail={row => openRecordDrawer(row, 'detail')}
          onViewHistory={row => openRecordDrawer(row, 'history')}
          onAddChildRecord={handleBaseAddChildRecord}
          onAddComment={handleBaseAddComment}
          onFilterByCell={handleBaseFilterByCell}
          onDeleteRecord={handleBaseDeleteRecord}
          detailRowIndex={detailRowIndex}
          detailDrawerTab={detailDrawerTab}
          onCloseDetailDrawer={() => setDetailRowIndex(null)}
          onNavigateDetail={row => setDetailRowIndex(row)}
          activeHoverRow={activeHoverRow}
          toolbarHoverRow={toolbarHoverRow}
          onToolbarHoverEnter={setToolbarHoverRow}
          onToolbarHoverLeave={() => setToolbarHoverRow(null)}
          onAddChildFromToolbar={handleBaseAddChildRecord}
          onExpandCellRecord={row => openRecordDrawer(row, 'detail')}
          canShowRecordDetailActions={canShowRecordDetailActions}
          commentsEnabled={commentsEnabled}
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
        displayRowHeights={displayRowHeights}
        containerSize={containerSize}
        startFillDrag={startFillDrag}
        deleteDialog={deleteDialog}
        onConfirmDeleteRows={handleConfirmDeleteRows}
        onCancelDeleteRows={handleCancelDeleteRows}
      />
    </div>
  );
};
