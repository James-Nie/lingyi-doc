import type { CellRange } from '@lingyi-doc/core';
import {
  getRatingConfig,
  hitTestRating,
  hitTestBaseRowHeader,
  hitTestFillHandle,
  computeFillTargetRange,
  normalizeSelectionForMerges,
  shouldShowFillHandle,
  hitTestRecordTreeColumn,
  groupHeaderRenderer,
  groupedRowControlsRenderer,
  resolveRowControlLevel,
  isLayoutRowSelectable,
  expandRowDragBlock,
  getSiblingInsertBounds,
  resolveColumnWidth,
} from '@lingyi-doc/core';
import { useSheetStore } from '../../../../store/sheetStore';
import {
  buildFullColumnRange,
  buildFullRowRange,
  getContiguousColumnIndices,
  getContiguousRowIndices,
  isColumnAxisSelected,
  isRowAxisSelected,
  resolveSelectedRowIndices,
  toggleDiscreteIndex,
  getAxisDragBlock,
  computeAxisBlockDestStart,
  isClickInCurrentSelection,
} from '../../../../utils/axisSelection';
import type { SheetInteractionDeps } from '../sheetInteraction.types';


export function handleSheetContextMenu(e: React.MouseEvent, d: SheetInteractionDeps) {
  const {
    table,
    sheet,
    isBaseSheet,
    isFreeformSheet,
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
  } = d;

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
}
