import type { CellRange } from '@lingyi-doc/core-types';
import type { SheetCommentCellRef } from '@lingyi-doc/core-doc';
import { getRatingConfig, hitTestRating, hitTestBaseRowHeader, hitTestFillHandle, computeFillTargetRange, normalizeSelectionForMerges, shouldShowFillHandle, hitTestRecordTreeColumn, groupHeaderRenderer, groupedRowControlsRenderer, resolveRowControlLevel, isLayoutRowSelectable, expandRowDragBlock, getSiblingInsertBounds, resolveColumnWidth, progressFromCellRelX } from '@lingyi-doc/core-sheet';
import { useSheetStore } from '../../../../store/sheetStore';
import { ANT_EDITOR_TYPES } from '../../../editors/BaseCellEditor';
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
import { handleGroupedViewRowClick } from './groupedViewClick';


export function handleSheetMouseDown(e: React.MouseEvent, d: SheetInteractionDeps) {
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
    sheetCommentCells,
    onSelectComment,
  } = d;

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

      // 评论标记点击检测：点击评论角标或行评论徽章时选中对应评论
      if (sheetCommentCells?.length && onSelectComment && isBaseSheet) {
        const commentHit = hitTestCommentMarker(
          e.clientX,
          e.clientY,
          canvasRect,
          viewportRef.current,
          sheet.columnWidths,
          displayRowHeights,
          sheetCommentCells,
          isGroupedView,
        );
        if (commentHit) {
          onSelectComment(commentHit.threadId);
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
        const rowIndex = viewportRef.current.findRowAtY(e.clientY, canvasRect, gridRowCount, effectiveRowHeights);
        if (rowIndex !== null) {
          const relX = e.clientX - canvasRect.left;
          const headerW = viewportRef.current.config.headerWidth;

          if (isBaseSheet) {
            if (isGroupedView && groupLayout) {
              const groupedResult = handleGroupedViewRowClick(
                e.clientX, e.clientY, canvasRect, rowIndex, d,
              );
              if (groupedResult === 'handled' || groupedResult === 'blocked') return;
              applyRowRangeSelection(rowIndex, rowIndex, rowIndex);
              scheduleRender();
              return;
            }
            const recordRow = mapCoordToRecord({ row: rowIndex, col: 0 })?.row;
            if (recordRow === undefined) return;
            const meta = rowTreeMeta?.[recordRow];
            const action = hitTestBaseRowHeader(relX, headerW, meta);
            if (action === 'checkbox') {
              setCheckedRows(prev => {
                const newSet = new Set(prev);
                if (newSet.has(recordRow)) newSet.delete(recordRow);
                else newSet.add(recordRow);
                return Array.from(newSet);
              });
              dirtyTrackerRef.current.markFullRedraw();
              scheduleRender();
              return;
            }
            if (action === 'branchPlus') {
              const parent = table.getRowRecord(recordRow);
              const newRowIndex = table.insertChildRow(recordRow);
              if (parent) {
                setCollapsedRowIds(prev => prev.filter(id => id !== parent._id));
              }
              dirtyTrackerRef.current.markFullRedraw();
              scheduleRender();
              useSheetStore.getState().setStatusText(`已添加子记录（第 ${newRowIndex + 1} 行）`);
              return;
            }
            if (action === 'collapse') {
              toggleRowCollapse(recordRow);
              dirtyTrackerRef.current.markFullRedraw();
              scheduleRender();
              return;
            }

            const prevSel = useSheetStore.getState().selectionRange;
            const discreteRows = discreteAxisRowsRef.current;
            const alreadySelected = isRowAxisSelected(rowIndex, discreteRows, prevSel, sheet.colCount);

            if (action === 'drag' && !isGroupedView) {
              table.ensureRowRecords();
              let block = expandRowDragBlock(recordRow, recordRow, sheetRows);
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

            if (alreadySelected && !isGroupedView) {
              table.ensureRowRecords();
              let block = getAxisDragBlock(
                rowIndex, 'row', discreteAxisColsRef.current, discreteRows,
                prevSel, sheet.rowCount, sheet.colCount,
              );
              block = expandRowDragBlock(block.start, block.end, sheetRows);
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

    // 分组视图：分组头折叠 / 添加记录 / 卡片内复选框（内容区 metadata 列）
    if (isGroupedView && groupLayout && canvasRect) {
      const groupedResult = handleGroupedViewRowClick(
        e.clientX, e.clientY, canvasRect, coord.row, d,
      );
      if (groupedResult === 'handled' || groupedResult === 'blocked') return;
    }

    if (isGroupedView && groupLayout && !isLayoutRowSelectable(groupLayout.items[coord.row])) {
      return;
    }

    const recordCoord = mapCoordToRecord(coord);
    if (!recordCoord) return;

    // 多维表第一列：子记录树形控件点击
    if (isBaseSheet && coord.col === 0 && canvasRect && !isGroupedView) {
      const meta = rowTreeMeta?.[recordCoord.row];
      const cellRect = viewportRef.current.getCellRect(
        coord, sheet.columnWidths, displayRowHeights,
      );
      const relX = e.clientX - canvasRect.left - cellRect.x;
      const relY = e.clientY - canvasRect.top - cellRect.y;
      const treeAction = hitTestRecordTreeColumn(
        relX, relY, cellRect.width, cellRect.height, meta, viewportRef.current.zoomLevel,
      );
      if (treeAction === 'collapse') {
        toggleRowCollapse(recordCoord.row);
        dirtyTrackerRef.current.markFullRedraw();
        scheduleRender();
        return;
      }
    }

    // 进入单元格选区：清除列/行头离散多选
    clearAxisDiscreteSelection();

    // Shift+点击 / Command+点击 选区（优先于字段快捷交互）
    if (editingCell && isFreeformSheet) {
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
        const cellData = table.getCell(recordCoord.row, recordCoord.col);
        if (isBaseSheet) {
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
      const cellData = table.getCell(recordCoord.row, recordCoord.col);
      if (isBaseSheet) {
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
    const clickedColumnDef = columnDefs[coord.col];
    if (clickedColumnDef?.type === 'boolean') {
      const cellData = table.getCell(recordCoord.row, recordCoord.col);
      const currentValue = cellData?.value?.type === 'boolean' ? cellData.value.value : false;
      const newValue = !currentValue;
      table.setCellValue(recordCoord.row, recordCoord.col, { type: 'boolean', value: newValue });
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

    // 普通表格：复选框单元格单击切换
    if (isFreeformSheet) {
      const freeformCellData = table.getCell(recordCoord.row, recordCoord.col);
      if (freeformCellData?.value.type === 'boolean') {
        if (editingCell && isFreeformSheet) {
          const editText = useSheetStore.getState().formulaBarText;
          handleEditCommit(editingCell, editText);
        }
        const newValue = !freeformCellData.value.value;
        table.setCellValue(recordCoord.row, recordCoord.col, { type: 'boolean', value: newValue });
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
          table.setCellValue(recordCoord.row, recordCoord.col, { type: 'number', value: newRating, format: { kind: 'general' } });
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

    // 多维表/标准表：进度条字段单击直接设置并开始拖动
    if (clickedColumnDef?.type === 'progress') {
      const cellRect = viewportRef.current.getCellRect(coord, sheet.columnWidths, sheet.rowHeights);
      const canvasRect = canvasContainerRef.current?.getBoundingClientRect();
      if (canvasRect) {
        const relX = e.clientX - canvasRect.left - cellRect.x;
        const zoom = viewportRef.current.zoomLevel;
        const newProgress = progressFromCellRelX(relX, cellRect.width, cellRect.height, zoom, 1);
        table.setCellValue(recordCoord.row, recordCoord.col, { type: 'number', value: newProgress, format: { kind: 'general' } });
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

    // 多维表：成员字段单击直接进入编辑（单选/多选/日期/附件等改为双击编辑）
    if (isBaseSheet && clickedColumnDef?.type === 'user') {
      const cellData = table.getCell(recordCoord.row, recordCoord.col);
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
    // 多维表文本类依赖 blur 提交；Ant 下拉类（单选/多选/日期等）无 blur 关闭，切换单元格时主动结束编辑
    if (editingCell && (editingCell.row !== coord.row || editingCell.col !== coord.col)) {
      if (isFreeformSheet) {
        const editText = useSheetStore.getState().formulaBarText;
        handleEditCommit(editingCell, editText);
      } else if (isBaseSheet) {
        const editingType = columnDefs[editingCell.col]?.type;
        if (editingType && ANT_EDITOR_TYPES.has(editingType)) {
          setEditingCell(null);
        }
      }
    }
    setDropdownEditCell(null);
    setDateEditCell(null);

    // 合并区域：选区扩展为整个合并范围
    let selRange: CellRange = {
      sheetId: table.sheetId,
      start: coord,
      end: coord,
      master: coord,
    };
    for (const range of mergeRanges) {
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
    const cellData = table.getCell(recordCoord.row, recordCoord.col);
    if (isBaseSheet) {
      // 延迟设置，确保在 BaseCellEditor onBlur 提交后应用新单元格值
      setTimeout(() => setFormulaBarText(cellData ? formatCellEditText(cellData.value) : ''), 10);
    } else {
      setFormulaBarText(cellData ? formatCellEditText(cellData.value) : '');
    }

    isDraggingRef.current = true;
    scheduleRender();
}

/**
 * 检测鼠标点击是否命中评论标记（单元格右上角三角 或 行评论徽章）。
 * 命中时返回对应的 SheetCommentCellRef，否则返回 null。
 */
function hitTestCommentMarker(
  clientX: number,
  clientY: number,
  canvasRect: DOMRect,
  viewport: import('@lingyi-doc/core-sheet').ViewportManager,
  columnWidths: Map<number, number>,
  rowHeights: Map<number, number>,
  commentCells: SheetCommentCellRef[],
  _isGroupedView: boolean,
): SheetCommentCellRef | null {
  if (!canvasRect) return null;

  for (const cell of commentCells) {
    const cellRect = viewport.getCellRect({ row: cell.row, col: cell.col }, columnWidths, rowHeights);
    const zoom = viewport.zoomLevel;

    if (cell.anchorType === 'sheet_record') {
      // 行评论徽章：位于首字段列右侧，方形区域
      const badgeSize = Math.max(14, Math.round(16 * zoom));
      const badgeX = cellRect.x + cellRect.width - badgeSize - 4;
      const badgeY = cellRect.y + (cellRect.height - badgeSize) / 2;
      if (
        clientX - canvasRect.left >= badgeX
        && clientX - canvasRect.left <= badgeX + badgeSize
        && clientY - canvasRect.top >= badgeY
        && clientY - canvasRect.top <= badgeY + badgeSize
      ) {
        return cell;
      }
    } else {
      // 单元格评论角标：右上角小三角
      const size = Math.max(6, 9 * zoom);
      const x2 = cellRect.x + cellRect.width;
      const y1 = cellRect.y;
      // 检测是否在三角形区域内（简化为矩形检测）
      if (
        clientX - canvasRect.left >= x2 - size
        && clientX - canvasRect.left <= x2
        && clientY - canvasRect.top >= y1
        && clientY - canvasRect.top <= y1 + size
      ) {
        return cell;
      }
    }
  }

  return null;
}
