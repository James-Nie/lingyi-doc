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


export function handleSheetMouseMove(e: React.MouseEvent, d: SheetInteractionDeps) {
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
              const bounds = getSiblingInsertBounds(sourceStart, sheetRows);
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
        const rowIndex = viewportRef.current.findRowAtY(e.clientY, canvasRect, gridRowCount, effectiveRowHeights);
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
              const recordRow = mapCoordToRecord({ row: rowIndex, col: 0 })?.row ?? rowIndex;
              const meta = isGroupedView ? undefined : rowTreeMeta?.[recordRow];
              const action = hitTestBaseRowHeader(relX, headerW, meta);
              if (!isGroupedView && (action === 'drag' || canGrabRow)) {
                canvasEl.style.cursor = axisDragRef.current?.active ? 'grabbing' : 'grab';
              }
            } else if (canGrabRow) {
              canvasEl.style.cursor = axisDragRef.current?.active ? 'grabbing' : 'grab';
            }
          }
        }
      } else if (!inColHeader) {
        // 内容区移动：检测所在行（仅多维表）
        const contentRow = viewportRef.current.findRowAtY(e.clientY, canvasRect, gridRowCount, effectiveRowHeights);
        if (contentRow !== null && isBaseSheet) {
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
      const hoverColDef = hoverCoord ? columnDefs[hoverCoord.col] : undefined;
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
}
