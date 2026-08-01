import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BASE_THEME } from '@lingyi-doc/core-sheet';
import { getSheetCellEditText, DEFAULT_BASE_ROW_HEIGHT, type BaseSheetModel } from '@lingyi-doc/core-types';
import { resolveSheetCommentCells } from '@lingyi-doc/core-doc';
import { ensureBaseViewportConfig } from './baseViewportConfig';
import type { CellCoord, CellValue } from '@lingyi-doc/core-types';
import { useSheetStore } from '../../../store/sheetStore';
import type { SheetContainerProps } from '../SheetContainer.types';
import { useBaseGridContext } from './BaseGridContext';
import { BaseScrollSyncedLayer } from './BaseScrollSyncedLayer';
import { useSheetGridContext } from '../shared/SheetGridContext';
import { SheetCanvasSurface } from '../shared/SheetCanvasSurface';
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
  embedMode = false,
  sheetCommentThreads,
  selectedCommentId,
  onSelectComment,
}) => {
  // embed 视同只读预览（禁编辑），但允许本地滚动
  const isPreview = previewMode || embedMode;
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
  // scroll 由 BaseScrollSyncedLayer 单独订阅，避免本组件滚动整树重渲

  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    coord: CellCoord | null;
    clickInSelection?: boolean;
  }>({ visible: false, x: 0, y: 0, coord: null });

  useSheetPreviewReset(isPreview, setContextMenu);

  const [hoveredCol, setHoveredCol] = useState<number | null>(null);
  const [hoveredRow, setHoveredRowState] = useState<number | null>(null);
  const hoveredRowRef = useRef<number | null>(null);
  const setHoveredRow = useCallback((row: number | null) => {
    if (hoveredRowRef.current === row) return;
    hoveredRowRef.current = row;
    setHoveredRowState(row);
    scheduleRender();
  }, [scheduleRender]);
  const [toolbarHoverRow, setToolbarHoverRow] = useState<number | null>(null);
  const activeHoverRow = hoveredRow ?? toolbarHoverRow;
  const [cornerHovered, setCornerHovered] = useState(false);
  const [progressDrag, setProgressDrag] = useState<CellCoord | null>(null);
  const [hoverRatingCell, setHoverRatingCell] = useState<{ row: number; col: number; value: number } | null>(null);
  const [hoverProgressCell, setHoverProgressCell] = useState<CellCoord | null>(null);

  const [deleteDialog, setDeleteDialog] = useState<{ visible: boolean; rows: number[] }>({
    visible: false,
    rows: [],
  });

  const sheet = table.sheet as BaseSheetModel;
  const columnDefs = base.columnDefs;
  const sheetRows = base.sheetRows;
  const mergeRanges: never[] = [];
  const defaultRowHeight = sheet.defaultRowHeight;

  // 记录索引(record index)维度的评论单元格
  const sheetCommentCellsByRecord = useMemo(
    () => resolveSheetCommentCells(sheetCommentThreads ?? [], sheet.sheetId, {
      rows: sheetRows,
      columnDefs,
    }),
    [sheetCommentThreads, sheet.sheetId, sheetRows, columnDefs],
  );

  useEffect(() => {
    dirtyTrackerRef.current.markFullRedraw();
    scheduleRender();
  }, [selectedCommentId, sheetCommentCellsByRecord, scheduleRender, dirtyTrackerRef]);

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

  // 评论单元格的 row 是记录索引(record index)，渲染层用的是显示行(display row)，
  // 经过筛选/排序/分组后二者不一致，需要在此映射到显示行。
  const sheetCommentCells = useMemo(() => {
    if (!sheetCommentCellsByRecord.length) return sheetCommentCellsByRecord;
    // recordIndex -> displayRow 反向映射
    let recordToDisplay: Map<number, number> | null = null;
    if (groupLayout) {
      recordToDisplay = new Map();
      groupLayout.items.forEach((item, displayRow) => {
        if (item.type === 'record') recordToDisplay!.set(item.recordIndex, displayRow);
      });
    } else if (flatSortedLayout) {
      recordToDisplay = new Map(
        flatSortedLayout.recordIndexByDisplayRow.map(
          (recordIdx: number, displayRow: number) => [recordIdx, displayRow],
        ),
      );
    }
    if (!recordToDisplay) return sheetCommentCellsByRecord;
    const mapped: typeof sheetCommentCellsByRecord = [];
    for (const cell of sheetCommentCellsByRecord) {
      const displayRow = recordToDisplay.get(cell.row);
      // 记录被筛选/折叠隐藏时不渲染其评论标记
      if (displayRow === undefined) continue;
      mapped.push({ ...cell, row: displayRow });
    }
    return mapped;
  }, [sheetCommentCellsByRecord, groupLayout, flatSortedLayout]);

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
    ensureBaseViewportConfig(viewportRef.current, sheet, isPreview);
  }, [viewportRef, sheet, isPreview]);

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
    previewMode: isPreview,
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
    previewMode: isPreview,
    dirtyTrackerRef,
    scheduleRender,
    viewportRef,
    sheetColumnWidths: sheet.columnWidths,
    resolveActiveRowHeights,
    resolvePasteRecordRow: resolveGridRecordRow,
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

    if (!layerManager || !layerManager.isAlive() || containerSize.width === 0 || containerSize.height === 0) return;

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
      previewMode: isPreview,
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
      activeHoverRow: hoveredRowRef.current ?? toolbarHoverRow,
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
      hoverProgressCell,
      progressDragCell: progressDrag,
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
    toolbarHoverRow,
    hoveredCol,
    cornerHovered,
    resolveActiveRowHeights,
    rowTreeMetaForRender,
    collapsedRowIdSet,
    fillPreviewRange,
    discreteAxisCols,
    discreteAxisRows,
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
    hoverProgressCell,
    progressDrag,
  ]);

  const { applyScroll } = useSheetCanvasLifecycle({
    table,
    sheetId: sheet.sheetId,
    sheetColumnWidths: sheet.columnWidths,
    previewMode: isPreview,
    embedMode,
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
    previewMode: isPreview,
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
    hoveredRowRef,
    setCornerHovered,
    setHoverRatingCell,
    setHoverProgressCell,
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
    sheetCommentCells,
    onSelectComment,
  };

  const {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDoubleClick,
    handleContextMenu,
  } = useSheetMouseHandlers(interactionDeps);

  useSheetKeyboard({ previewMode: isPreview, deps: interactionDeps });

  useSheetPointerEffects({
    previewMode: isPreview,
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
    // 右键行在多选勾选集内时，批量删除全部勾选记录
    if (checkedRows.length > 1 && checkedRows.includes(rowIndex)) {
      handleRequestDeleteRows(checkedRows);
      return;
    }
    handleRequestDeleteRows([rowIndex]);
  }, [checkedRows, handleRequestDeleteRows]);

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
        previewMode={isPreview}
        axisResizeGuide={axisResizeGuide}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setHoveredRow(null); setHoveredCol(null); setHoverProgressCell(null); }}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      />

      <BaseScrollSyncedLayer
        table={table}
        sheet={sheet}
        columnDefs={columnDefs}
        sheetRows={sheetRows}
        viewportRef={viewportRef}
        containerRef={containerRef}
        canvasContainerRef={canvasContainerRef}
        effectiveRowHeights={effectiveRowHeights}
        displayRowHeights={displayRowHeights}
        sheetColumnWidths={sheet.columnWidths}
        zoomLevel={zoomLevel}
        containerSize={containerSize}
        addRowsBarHeight={addRowsBarHeight}
        gridRowCount={gridRowCount}
        isGroupedView={isGroupedView}
        groupLayout={groupLayout}
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
        checkedRows={checkedRows}
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
        isPreview={isPreview}
        selectedChartId={selectedChartId}
        onSelectChart={onSelectChart}
        hoverRatingCell={hoverRatingCell}
        supportsAutofill={supportsAutofill}
        selectionRange={selectionRange}
        sheetRowCount={sheet.rowCount}
        sheetColCount={sheet.colCount}
        startFillDrag={startFillDrag}
        deleteDialog={deleteDialog}
        onConfirmDeleteRows={handleConfirmDeleteRows}
        onCancelDeleteRows={handleCancelDeleteRows}
        extraScrollBottom={addRowsExtraScrollBottom}
        applyScroll={applyScroll}
      />
    </div>
  );
};
