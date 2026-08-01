import { clipCanvasToScrollablePane, computeBaseGridScreenBounds, hasActiveFreeze, isCellInFrozenRegion, isGroupLayoutRow, isRowLayoutHidden, isRowVisible } from '@lingyi-doc/core-sheet';
import { DEFAULT_ROW_HEIGHT } from '@lingyi-doc/core-types';
import type { SheetRenderHelpers, SheetRenderPassContext, VisibleCellRegion } from './sheetRenderTypes';

export function buildRenderHelpers(ctx: SheetRenderPassContext): SheetRenderHelpers {
  const { viewport, sheet, containerSize, gridRowCount, activeRowHeights, zoomLevel } = ctx;
  const isHiddenRow = (r: number) =>
    ctx.isFreeformSheet && isRowLayoutHidden(r, activeRowHeights, DEFAULT_ROW_HEIGHT);

  const visibleRange = viewport.calculateVisibleRange(
    containerSize.width,
    containerSize.height,
    gridRowCount,
    sheet.colCount,
    sheet.columnWidths,
    activeRowHeights,
  );

  const freezeState = sheet.freezeState || { frozenRows: 0, frozenCols: 0 };
  const useFreezeSplit = hasActiveFreeze(freezeState);

  const shouldDrawVisibleCell = (r: number, c: number, region: VisibleCellRegion) => {
    if (region === 'frozen') {
      return isCellInFrozenRegion({ row: r, col: c }, freezeState);
    }
    if (region === 'scrollable') {
      return r >= freezeState.frozenRows && c >= freezeState.frozenCols;
    }
    return true;
  };

  const forEachVisibleCell = (
    draw: (row: number, col: number) => void,
    region: VisibleCellRegion = 'all',
  ) => {
    for (let r = visibleRange.startRow; r <= visibleRange.endRow; r++) {
      if (isHiddenRow(r)) continue;
      const rowHeight = activeRowHeights.get(r) ?? DEFAULT_ROW_HEIGHT;
      if (rowHeight <= 0) continue;
      if (ctx.isBaseSheet && !ctx.isGroupedView) {
        const recordRow = ctx.resolveGridRecordRow(r);
        if (recordRow === null || !isRowVisible(recordRow, ctx.sheetRows, ctx.collapsedRowIdSet)) continue;
      }
      if (ctx.isGroupedView && ctx.groupLayout && isGroupLayoutRow(ctx.groupLayout.items[r])) continue;
      for (let c = visibleRange.startCol; c <= visibleRange.endCol; c++) {
        if (shouldDrawVisibleCell(r, c, region)) draw(r, c);
      }
    }
  };

  const forEachVisibleCellWithFreezeSplit = (
    canvasCtx: CanvasRenderingContext2D,
    draw: (row: number, col: number) => void,
  ) => {
    if (useFreezeSplit) {
      // 先可滚动区，再重绘冻结区（背景层按单元格原样绘制，不整块铺色）
      const restoreClip = clipCanvasToScrollablePane(
        canvasCtx,
        viewport,
        sheet.columnWidths,
        activeRowHeights,
        freezeState.frozenRows,
        freezeState.frozenCols,
        containerSize.width,
        containerSize.height,
      );
      forEachVisibleCell(draw, 'scrollable');
      restoreClip?.();
      forEachVisibleCell(draw, 'frozen');
    } else {
      forEachVisibleCell(draw);
    }
  };

  const baseGridBounds = ctx.isBaseSheet
    ? computeBaseGridScreenBounds(
      viewport.config.headerWidth,
      viewport.config.headerHeight,
      sheet.colCount,
      gridRowCount,
      sheet.columnWidths,
      activeRowHeights,
      viewport.config.defaultColumnWidth,
      viewport.config.defaultRowHeight,
      zoomLevel,
      viewport.scrollLeft,
      containerSize.width,
      containerSize.height,
      (row, rh) => viewport.getRowScreenTop(row, rh),
      !ctx.isGroupedView,
    )
    : null;

  return {
    visibleRange,
    freezeState,
    useFreezeSplit,
    baseGridBounds,
    forEachVisibleCell,
    forEachVisibleCellWithFreezeSplit,
  };
}
