import type { CellRange } from '@lingyi-doc/core-types';
import { getRatingConfig, hitTestRating, hitTestBaseRowHeader, hitTestFillHandle, computeFillTargetRange, normalizeSelectionForMerges, shouldShowFillHandle, hitTestRecordTreeColumn, groupHeaderRenderer, groupedRowControlsRenderer, resolveRowControlLevel, isLayoutRowSelectable, expandRowDragBlock, getSiblingInsertBounds, resolveColumnWidth } from '@lingyi-doc/core-sheet';
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


export function handleSheetDoubleClick(e: React.MouseEvent, d: SheetInteractionDeps) {
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
  } = d;

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

      if (isBaseSheet) {
        const colHeaderCol = viewportRef.current.findColumnAtX(e.clientX, canvasRect, sheet.colCount, sheet.columnWidths);
        if (colHeaderCol !== null && e.clientY >= canvasRect.top && e.clientY < canvasRect.top + config.headerHeight) {
          const fieldId = columnDefs[colHeaderCol]?.id;
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

    if (isFreeformSheet && table.getDropdownValidationAt(coord.row, coord.col)) {
      setDateEditCell(null);
      setDropdownEditCell(coord);
      setEditingCell(null);
      setFormulaBarText(cellData ? formatCellEditText(cellData.value) : '');
      return;
    }

    if (isFreeformSheet && table.getDateValidationAt(coord.row, coord.col)) {
      setDropdownEditCell(null);
      setDateEditCell(coord);
      setEditingCell(null);
      setFormulaBarText(cellData ? formatCellEditText(cellData.value) : '');
      return;
    }

    if (isFreeformSheet && cellData?.value.type === 'boolean') {
      const newValue = !cellData.value.value;
      table.setCellValue(coord.row, coord.col, { type: 'boolean', value: newValue });
      setFormulaBarText(formatCellEditText({ type: 'boolean', value: newValue }));
      dirtyTrackerRef.current.markFullRedraw();
      scheduleRender();
      return;
    }

    // 多维表/标准表：根据字段类型决定交互方式
    const columnDef = columnDefs[coord.col];
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
}
