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


export function handleSheetMouseUp(d: SheetInteractionDeps) {
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
      const normalized = normalizeSelectionForMerges(store.selectionRange, mergeRanges);
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
}
