import type { CellCoord, CellRange } from '@lingyi-doc/core';
import { useSheetStore } from '../../../store/sheetStore';
import { shouldIgnoreSheetShortcut, resolveCopySourceRange } from './sheetUtils';
import type { SheetInteractionDeps } from './sheetInteraction.types';

export function handleSheetKeyDown(e: KeyboardEvent, d: SheetInteractionDeps) {
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
          const colDef = columnDefs[activeCell.col];
          const cellData = t.getCell(activeCell.row, activeCell.col);
          if (colDef?.type === 'boolean' || (isFreeformSheet && cellData?.value.type === 'boolean')) {
            const currentValue = cellData?.value?.type === 'boolean' ? cellData.value.value : false;
            const newValue = !currentValue;
            t.setCellValue(activeCell.row, activeCell.col, { type: 'boolean', value: newValue });
            setFormulaBarText(isFreeformSheet && !colDef ? (newValue ? '1' : '0') : (newValue ? 'TRUE' : 'FALSE'));
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
}
