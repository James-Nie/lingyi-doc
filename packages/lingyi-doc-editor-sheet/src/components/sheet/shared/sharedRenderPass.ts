import { BASE_THEME, clipCanvasToScrollablePane, drawFillHandle, fillFrozenPanesOpaque, getFillHandleAnchor, getFilteredColumnIndices, normalizeRange, RENDER_LAYERS, resolveCellBackgroundFillColor, resolveGroupedMetadataDividerX, shouldShowFillHandle, SHEET_FIND_ACTIVE_BG, SHEET_FIND_MATCH_BG } from '@lingyi-doc/core-sheet';
import type { CellRange } from '@lingyi-doc/core-types';
import { isSheetCommentCellSelected } from '@lingyi-doc/core-doc';
import { useSheetStore } from '../../../store/sheetStore';
import {
  groupContiguousIndices,
  resolveSelectedColumnIndices,
  resolveSelectedRowIndices,
} from '../../../utils/axisSelection';
import { parseFormulaRanges } from '../../FormulaRangeParser';
import { rangesEqual } from './sheetUtils';
import type { SheetRenderHelpers, SheetRenderPassContext } from './sheetRenderTypes';

/**
 * 绘制共享背景单元格
 * @param ctx 渲染上下文
 * @param helpers 渲染帮助函数
 * @description 绘制共享背景单元格
 * @returns 无
 */
export function drawSharedBackgroundCells(
  ctx: SheetRenderPassContext,
  helpers: SheetRenderHelpers,
): void {
  const { layerManager, viewport, renderer, table, sheet, mergeRanges, isGroupedView, containerSize } = ctx;
  const bgCtx = layerManager.getLayer(RENDER_LAYERS.BACKGROUND);

  const drawBackgroundCell = (r: number, c: number) => {
    if (isGroupedView) return;
    renderer.drawCellBackground(
      bgCtx,
      { row: r, col: c },
      table.getCell(r, c),
      sheet.columnWidths,
      ctx.activeRowHeights,
      mergeRanges,
    );
  };

  if (!isGroupedView) {
    // 如果有冻结行列，先填充冻结区域为不透明色，防止滚动区域背景透出
    if (helpers.useFreezeSplit) {
      const { frozenRows, frozenCols } = helpers.freezeState;
      fillFrozenPanesOpaque(
        bgCtx,
        viewport,
        sheet.columnWidths,
        ctx.activeRowHeights,
        frozenRows,
        frozenCols,
        containerSize.width,
        containerSize.height,
        BASE_THEME.pageBg,
      );
    }
    helpers.forEachVisibleCellWithFreezeSplit(bgCtx, drawBackgroundCell);
  }
}

/**
 * 绘制网格线
 * @param ctx 渲染上下文
 * @param helpers 渲染帮助函数
 * @description 绘制网格线
 * @returns 无
 */
export function drawGridlinesLayer(
  ctx: SheetRenderPassContext,
  helpers: SheetRenderHelpers,
): void {
  const { layerManager, viewport, renderer, table, sheet, gridRowCount, isGroupedView, isBaseSheet, containerSize } = ctx;
  const { visibleRange, baseGridBounds } = helpers;
  const gridCtx = layerManager.getLayer(RENDER_LAYERS.GRIDLINES);
  gridCtx.clearRect(0, 0, containerSize.width, containerSize.height);

  renderer.drawGridlines(
    gridCtx,
    visibleRange,
    gridRowCount,
    sheet.colCount,
    sheet.columnWidths,
    ctx.activeRowHeights,
    sheet.freezeState,
    isGroupedView ? ctx.skipGroupGridLine : undefined,
    isGroupedView ? ctx.isGroupDisplayRow : undefined,
    isGroupedView ? {
      horizontalLineLeft: viewport.config.headerWidth,
      skipRightEdge: true,
      gridColor: BASE_THEME.groupedGridColor,
    } : undefined,
  );

  drawGroupedGridExtras(ctx, helpers, gridCtx);

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
    const contentSize = viewport.getTotalContentSize(
      gridRowCount,
      sheet.colCount,
      sheet.columnWidths,
      ctx.activeRowHeights,
    );
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

  helpers.forEachVisibleCellWithFreezeSplit(gridCtx, (r, c) => {
    if (isGroupedView) return;
    const recordRow = ctx.resolveGridRecordRow(r);
    if (recordRow === null || table.isInMergedCell(recordRow, c)) return;
    renderer.drawCellBorders(
      gridCtx,
      { row: r, col: c },
      table.getCell(recordRow, c),
      sheet.columnWidths,
      ctx.activeRowHeights,
      undefined,
      (row, col) => table.getCell(row, col),
    );
  });
}

/**
 * 分组视图：记录行 metadata 竖线
 * @param ctx 渲染上下文
 * @param helpers 渲染帮助函数
 * @param gridCtx 网格线上下文
 * @description 绘制分组视图：记录行 metadata 竖线
 * @returns 无
 */
function drawGroupedGridExtras(
  ctx: SheetRenderPassContext,
  helpers: SheetRenderHelpers,
  gridCtx: CanvasRenderingContext2D,
): void {
  const { viewport, groupLayout, isGroupedView, isBaseSheet } = ctx;
  const { visibleRange, baseGridBounds } = helpers;
  if (!isGroupedView || !isBaseSheet || !groupLayout || !baseGridBounds) return;

  const headerW = viewport.config.headerWidth;
  const metadataX = resolveGroupedMetadataDividerX(headerW);
  const zoom = viewport.zoomLevel;
  const defaultH = viewport.config.defaultRowHeight;

  gridCtx.strokeStyle = BASE_THEME.groupedGridColor;
  gridCtx.lineWidth = 1;

  for (let r = visibleRange.startRow; r <= visibleRange.endRow; r++) {
    const item = groupLayout.items[r];
    if (item?.type !== 'record') continue;

    const rowTop = viewport.getRowScreenTop(r, ctx.activeRowHeights);
    const rowH = (ctx.activeRowHeights.get(r) ?? defaultH) * zoom;
    const rowBottom = rowTop + rowH;

    gridCtx.beginPath();
    gridCtx.moveTo(metadataX, rowTop);
    gridCtx.lineTo(metadataX, rowBottom);
    gridCtx.stroke();
  }
}

/**
 * 绘制合并单元格
 * @param ctx 渲染上下文
 * @param helpers 渲染帮助函数
 * @description 绘制合并单元格
 * @returns 无
 */
export function drawMergeCellsLayer(
  ctx: SheetRenderPassContext,
  helpers: SheetRenderHelpers,
): void {
  const { layerManager, viewport, renderer, table, sheet, mergeRanges, containerSize } = ctx;
  const { freezeState, useFreezeSplit } = helpers;
  const mergeCtx = layerManager.getLayer(RENDER_LAYERS.MERGE_CELLS);
  mergeCtx.clearRect(0, 0, containerSize.width, containerSize.height);

  const drawMergeFill = (range: CellRange) => {
    if (range.start.row === range.end.row && range.start.col === range.end.col) return;
    const master = range.master || range.start;
    const topLeft = ctx.viewportRef.current.getCellRect(master, sheet.columnWidths, ctx.activeRowHeights);
    const bottomRight = ctx.viewportRef.current.getCellRect(range.end, sheet.columnWidths, ctx.activeRowHeights);
    const w = bottomRight.x + bottomRight.width - topLeft.x;
    const h = bottomRight.y + bottomRight.height - topLeft.y;
    const cellData = table.getCell(master.row, master.col);
    mergeCtx.fillStyle = resolveCellBackgroundFillColor(cellData?.style, viewport.config, master);
    mergeCtx.fillRect(topLeft.x, topLeft.y, w, h);
  };

  if (useFreezeSplit) {
    const restoreMergeClip = clipCanvasToScrollablePane(
      mergeCtx,
      viewport,
      sheet.columnWidths,
      ctx.activeRowHeights,
      freezeState.frozenRows,
      freezeState.frozenCols,
      containerSize.width,
      containerSize.height,
    );
    for (const range of mergeRanges) {
      const master = range.master || range.start;
      if (master.row >= freezeState.frozenRows && master.col >= freezeState.frozenCols) {
        drawMergeFill(range);
      }
    }
    restoreMergeClip?.();

    for (const range of mergeRanges) {
      const master = range.master || range.start;
      if (master.row < freezeState.frozenRows || master.col < freezeState.frozenCols) {
        drawMergeFill(range);
      }
    }
  } else {
    for (const range of mergeRanges) {
      drawMergeFill(range);
    }
  }

  helpers.forEachVisibleCellWithFreezeSplit(mergeCtx, (r, c) => {
    const merged = table.isInMergedCell(r, c);
    if (!merged) return;
    const master = merged.master || merged.start;
    if (r !== master.row || c !== master.col) return;
    renderer.drawCellBorders(
      mergeCtx,
      { row: r, col: c },
      table.getCell(r, c),
      sheet.columnWidths,
      ctx.activeRowHeights,
      mergeRanges,
      (row, col) => table.getCell(row, col),
    );
  });
}

/**
 * 选择渲染状态
 */
export interface SelectionRenderState {
  selRange: ReturnType<typeof useSheetStore.getState>['selectionRange'];
  discreteCells: ReturnType<typeof useSheetStore.getState>['discreteSelections'];
  selectedCols: number[];
  selectedRows: number[];
  activeCellRow: number | null;
  isAllSelected: boolean;
  allRowsChecked: boolean;
}

/**
 * 解析选择渲染状态
 * @param ctx 渲染上下文
 * @description 解析选择渲染状态
 * @returns 选择渲染状态
 */
export function resolveSelectionRenderState(ctx: SheetRenderPassContext): SelectionRenderState {
  const { sheet, isBaseSheet, previewMode, discreteAxisCols, discreteAxisRows, checkedRows } = ctx;
  const selRange = previewMode ? null : useSheetStore.getState().selectionRange;
  const discreteCells = previewMode ? [] : useSheetStore.getState().discreteSelections;
  const selectedCols = resolveSelectedColumnIndices(discreteAxisCols, selRange, sheet.rowCount);
  const selectedRows = resolveSelectedRowIndices(discreteAxisRows, selRange, sheet.colCount);
  const isAllSelected = selRange?.start.row === 0 && selRange?.start.col === 0
    && selRange?.end.row === sheet.rowCount - 1 && selRange?.end.col === sheet.colCount - 1;
  const allRowsChecked = isBaseSheet && sheet.rowCount > 0 && checkedRows.length === sheet.rowCount;
  const activeCellRow = previewMode ? null : (useSheetStore.getState().activeCell?.row ?? null);
  return { selRange, discreteCells, selectedCols, selectedRows, activeCellRow, isAllSelected, allRowsChecked };
}

/**
 * 绘制评论高亮
 * @param ctx 渲染上下文
 * @description 绘制评论高亮
 * @returns 无
 */
export function drawCommentHighlightLayer(ctx: SheetRenderPassContext): void {
  const { layerManager, renderer, sheet, mergeRanges, sheetCommentCells, selectedCommentId } = ctx;
  if (!sheetCommentCells?.length) return;

  const bgCtx = layerManager.getLayer(RENDER_LAYERS.BACKGROUND);
  for (const cell of sheetCommentCells) {
    // 行级评论(sheet_record)的整行高亮在 drawBaseRowHighlightLayer 中处理
    if (cell.anchorType === 'sheet_record') continue;
    if (!isSheetCommentCellSelected(cell, selectedCommentId)) continue;
    renderer.drawCellCommentHighlight(
      bgCtx,
      { row: cell.row, col: cell.col },
      sheet.columnWidths,
      ctx.activeRowHeights,
      true,
      mergeRanges,
    );
  }
}

/**
 * 绘制评论标记
 * @param ctx 渲染上下文
 * @param helpers 渲染帮助函数
 * @description 绘制评论标记
 * @returns 无
 */
export function drawCommentMarkerLayer(
  ctx: SheetRenderPassContext,
  helpers: SheetRenderHelpers,
): void {
  const { layerManager, renderer, sheet, mergeRanges, containerSize, sheetCommentCells, isBaseSheet } = ctx;
  if (!sheetCommentCells?.length) return;

  const overlayCtx = layerManager.getLayer(RENDER_LAYERS.OVERLAY);
  const cellByRowCol = new Map(sheetCommentCells.map(c => [`${c.row},${c.col}`, c]));
  const drawMarker = (row: number, col: number) => {
    const cell = cellByRowCol.get(`${row},${col}`);
    // 多维表整行评论：在首字段列右侧画数量徽章（对齐设计稿）
    if (isBaseSheet && cell?.anchorType === 'sheet_record') {
      renderer.drawRowCommentBadge(
        overlayCtx,
        { row, col },
        cell.commentCount ?? 1,
        sheet.columnWidths,
        ctx.activeRowHeights,
        mergeRanges,
      );
      return;
    }
    renderer.drawCellCommentMarker(
      overlayCtx,
      { row, col },
      sheet.columnWidths,
      ctx.activeRowHeights,
      mergeRanges,
    );
  };

  if (helpers.useFreezeSplit) {
    for (const cell of sheetCommentCells) {
      if (cell.col < helpers.freezeState.frozenCols) drawMarker(cell.row, cell.col);
    }
    const restoreClip = clipCanvasToScrollablePane(
      overlayCtx,
      ctx.viewport,
      sheet.columnWidths,
      ctx.activeRowHeights,
      helpers.freezeState.frozenRows,
      helpers.freezeState.frozenCols,
      containerSize.width,
      containerSize.height,
    );
    for (const cell of sheetCommentCells) {
      if (cell.col >= helpers.freezeState.frozenCols) drawMarker(cell.row, cell.col);
    }
    restoreClip?.();
  } else {
    for (const cell of sheetCommentCells) {
      drawMarker(cell.row, cell.col);
    }
  }
}

/**
 * 绘制选择
 * @param ctx 渲染上下文
 * @param selection 选择渲染状态
 * @description 绘制选择
 * @returns 无
 */
export function drawSelectionLayer(
  ctx: SheetRenderPassContext,
  selection: SelectionRenderState,
): void {
  const {
    layerManager, renderer, sheet, isBaseSheet, rowTreeMeta, containerSize,
    discreteAxisCols, discreteAxisRows, fillPreviewRange, supportsAutofill,
    previewMode, copiedRange, copyDashOffsetRef, formulaDragRef,
  } = ctx;
  const { selRange, discreteCells } = selection;
  const selCtx = layerManager.getLayer(RENDER_LAYERS.SELECTION);
  selCtx.clearRect(0, 0, containerSize.width, containerSize.height);

  if (discreteAxisCols.length > 0) {
    for (const { start, end } of groupContiguousIndices(discreteAxisCols)) {
      renderer.drawColumnRangeSelection(selCtx, start, end, sheet.rowCount, sheet.columnWidths, ctx.activeRowHeights);
    }
  } else if (discreteAxisRows.length > 0) {
    for (const { start, end } of groupContiguousIndices(discreteAxisRows)) {
      renderer.drawRowRangeSelection(selCtx, start, end, sheet.colCount, sheet.columnWidths, ctx.activeRowHeights, containerSize.width);
    }
  } else if (discreteCells.length > 1) {
    for (const cell of discreteCells) {
      if (isBaseSheet && cell.col === 0 && rowTreeMeta) {
        renderer.drawBaseTreeColumnSelection(
          selCtx, cell.row, cell.row, sheet.columnWidths, ctx.activeRowHeights, rowTreeMeta, false,
        );
      } else {
        renderer.drawSelection(selCtx, {
          sheetId: sheet.sheetId,
          start: cell,
          end: cell,
        }, sheet.columnWidths, ctx.activeRowHeights, false);
      }
    }
  } else if (selRange) {
    const showFillHandle = false;
    const norm = normalizeRange(selRange);
    const isFullRowRange = norm.startCol === 0
      && norm.endCol === sheet.colCount - 1
      && sheet.colCount > 1;
    const isFullColRange = norm.startRow === 0
      && norm.endRow === sheet.rowCount - 1
      && sheet.rowCount > 1;
    const isCol0OnlyRange = norm.startCol === 0 && norm.endCol === 0;

    if (isFullRowRange) {
      renderer.drawRowRangeSelection(
        selCtx, norm.startRow, norm.endRow, sheet.colCount, sheet.columnWidths, ctx.activeRowHeights, containerSize.width,
      );
    } else if (isFullColRange) {
      renderer.drawColumnRangeSelection(
        selCtx, norm.startCol, norm.endCol, sheet.rowCount, sheet.columnWidths, ctx.activeRowHeights,
      );
    } else if (isBaseSheet && isCol0OnlyRange && rowTreeMeta) {
      renderer.drawBaseTreeColumnSelection(
        selCtx, norm.startRow, norm.endRow, sheet.columnWidths, ctx.activeRowHeights, rowTreeMeta, showFillHandle,
      );
    } else {
      renderer.drawSelection(selCtx, selRange, sheet.columnWidths, ctx.activeRowHeights, showFillHandle);
    }
  }

  if (fillPreviewRange && supportsAutofill) {
    renderer.drawFillPreview(selCtx, fillPreviewRange, sheet.columnWidths, ctx.activeRowHeights);
  }

  if (!previewMode && !isBaseSheet && copiedRange) {
    const copyActiveCell = previewMode ? null : (useSheetStore.getState().activeCell ?? null);
    const copyOverlapsSelection = !!selRange && rangesEqual(copiedRange, selRange);
    renderer.drawCopyMarquee(
      selCtx,
      copiedRange,
      sheet.columnWidths,
      ctx.activeRowHeights,
      copyDashOffsetRef.current,
      copyActiveCell,
      !copyOverlapsSelection,
    );
  }

  const state = useSheetStore.getState();
  if (!previewMode && state.editingCell) {
    const formulaText = state.formulaBarText;
    if (formulaText && formulaText.startsWith('=')) {
      const parsedRanges = parseFormulaRanges(formulaText);
      const formulaLayer = layerManager.getLayer(RENDER_LAYERS.SELECTION);
      formulaLayer.save();
      for (const range of parsedRanges) {
        renderer.drawFormulaRangeHighlight(formulaLayer, range, sheet.columnWidths, ctx.activeRowHeights);
      }
      const fd = formulaDragRef.current;
      if (fd?.active) {
        const dragRange = {
          startRow: Math.min(fd.startCoord.row, fd.endCoord.row),
          endRow: Math.max(fd.startCoord.row, fd.endCoord.row),
          startCol: Math.min(fd.startCoord.col, fd.endCoord.col),
          endCol: Math.max(fd.startCoord.col, fd.endCoord.col),
        };
        renderer.drawFormulaRangeHighlight(formulaLayer, dragRange, sheet.columnWidths, ctx.activeRowHeights);
      }
      formulaLayer.restore();
    }
  }
}

/**
 * 绘制查找高亮
 * @param ctx 渲染上下文
 * @description 绘制查找高亮
 * @returns 无
 */
export function drawFindHighlightLayer(ctx: SheetRenderPassContext): void {
  const { layerManager, renderer, sheet, mergeRanges, previewMode } = ctx;
  if (previewMode) return;

  const store = useSheetStore.getState();
  if (!store.findHighlightOpen || store.findMatches.length === 0) return;

  // 画在 BACKGROUND，位于文字 CONTENT 之下，避免遮挡单元格文字
  const bgCtx = layerManager.getLayer(RENDER_LAYERS.BACKGROUND);
  const activeIndex = store.findActiveIndex;
  const matches = store.findMatches;

  for (let i = 0; i < matches.length; i++) {
    renderer.drawFindMatchHighlight(
      bgCtx,
      matches[i],
      sheet.columnWidths,
      ctx.activeRowHeights,
      i === activeIndex,
      SHEET_FIND_MATCH_BG,
      SHEET_FIND_ACTIVE_BG,
      mergeRanges,
    );
  }
}

/**
 * 绘制 overlay
 * @param ctx 渲染上下文
 * @param helpers 渲染帮助函数
 * @param selection 选择渲染状态
 * @description 绘制 overlay
 * @returns 无
 */
export function drawOverlayLayer(
  ctx: SheetRenderPassContext,
  helpers: SheetRenderHelpers,
  selection: SelectionRenderState,
): void {
  const {
    layerManager, viewport, renderer, sheet, table, columnDefs, gridRowCount,
    isBaseSheet, isGroupedView, hoveredCol, activeHoverRow, cornerHovered,
    checkedRowsForRender, rowTreeMeta, columnFilters, axisDragRef, previewMode,
    supportsAutofill, containerSize,
  } = ctx;
  const { visibleRange, baseGridBounds } = helpers;
  const { selRange, selectedCols, selectedRows, activeCellRow, isAllSelected, allRowsChecked } = selection;
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

  const filterIconCols = !isBaseSheet ? table.getColumnFilterIconCols() : undefined;
  const activeFilterCols = filterIconCols?.length
    ? getFilteredColumnIndices(columnFilters ?? [])
    : undefined;
  renderer.drawColumnHeaders(
    overlayCtx, visibleRange, sheet.colCount, sheet.columnWidths, columnDefs,
    hoveredCol, selectedCols, undefined, filterIconCols, activeFilterCols,
  );
  
  renderer.drawRowHeaders(
    overlayCtx,
    visibleRange,
    gridRowCount,
    sheet.columnWidths,
    sheet.rowHeights,
    activeHoverRow,
    selectedRows,
    isGroupedView ? [] : checkedRowsForRender,
    isGroupedView ? undefined : rowTreeMeta,
    activeCellRow,
    isBaseSheet ? baseGridBounds?.bottom : undefined,
    isGroupedView,
    isGroupedView ? ctx.isGroupDisplayRow : undefined,
  );

  /** 绘制角头 */
  renderer.drawCornerHeader(overlayCtx, isBaseSheet ? allRowsChecked : isAllSelected, cornerHovered);

  const axisDrag = axisDragRef.current;
  if (axisDrag?.active) {
    if (axisDrag.axis === 'col') {
      renderer.drawColumnInsertIndicator(overlayCtx, axisDrag.insertIndex, sheet.colCount, sheet.columnWidths, containerSize.height);
      renderer.drawColumnRangeDragPreview(
        overlayCtx, axisDrag.sourceStart, axisDrag.sourceEnd,
        sheet.rowCount, sheet.columnWidths, ctx.activeRowHeights, containerSize.height,
      );
    } else {
      renderer.drawRowInsertIndicator(overlayCtx, axisDrag.insertIndex, sheet.rowCount, ctx.activeRowHeights, containerSize.width);
      renderer.drawRowRangeDragPreview(
        overlayCtx, axisDrag.sourceStart, axisDrag.sourceEnd,
        sheet.colCount, sheet.columnWidths, ctx.activeRowHeights, containerSize.width,
      );
    }
  }

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
      const frozenBoundaryY = viewport.config.headerHeight
        + viewport.getFrozenHeight(ctx.activeRowHeights);
      overlayCtx.beginPath();
      overlayCtx.moveTo(viewport.config.headerWidth, frozenBoundaryY);
      overlayCtx.lineTo(frozenLineRight, frozenBoundaryY);
      overlayCtx.stroke();
    }
  }

  const state = useSheetStore.getState();
  if (
    !previewMode
    && supportsAutofill
    && selRange
    && !state.editingCell
    && shouldShowFillHandle(selRange, sheet.rowCount, sheet.colCount)
  ) {
    const anchor = getFillHandleAnchor(selRange);
    drawFillHandle(overlayCtx, anchor, viewport, sheet.columnWidths, ctx.activeRowHeights);
  }
}
