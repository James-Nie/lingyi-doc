import { clipCanvasToScrollablePane, RENDER_LAYERS } from '@lingyi-doc/core';
import type { SheetRenderHelpers, SheetRenderPassContext } from '../shared/sheetRenderTypes';

export function drawFreeformBackgroundLayer(
  ctx: SheetRenderPassContext,
  helpers: SheetRenderHelpers,
): void {
  const { layerManager, viewport, containerSize } = ctx;
  const bgCtx = layerManager.getLayer(RENDER_LAYERS.BACKGROUND);
  const headerH = viewport.config.headerHeight;
  const headerW = viewport.config.headerWidth;
  bgCtx.fillStyle = '#ffffff';
  bgCtx.fillRect(
    headerW,
    headerH,
    Math.max(0, containerSize.width - headerW),
    Math.max(0, containerSize.height - headerH),
  );
}

export function drawFreeformContentLayer(
  ctx: SheetRenderPassContext,
  helpers: SheetRenderHelpers,
): void {
  const { layerManager, viewport, renderer, table, sheet, mergeRanges, isFreeformSheet } = ctx;
  const { visibleRange, freezeState, useFreezeSplit, forEachVisibleCell } = helpers;
  const contentCtx = layerManager.getLayer(RENDER_LAYERS.CONTENT);

  const drawContentCell = (r: number, c: number) => {
    const cellValidation = isFreeformSheet
      ? table.getFreeformSpecialValidationAt(r, c)
      : null;
    renderer.drawCellContent(
      contentCtx,
      { row: r, col: c },
      table.getCell(r, c),
      sheet.columnWidths,
      ctx.activeRowHeights,
      mergeRanges,
      cellValidation,
    );
  };

  if (useFreezeSplit) {
    forEachVisibleCell(drawContentCell, 'frozen');
    const restoreContentClip = clipCanvasToScrollablePane(
      contentCtx,
      viewport,
      sheet.columnWidths,
      ctx.activeRowHeights,
      freezeState.frozenRows,
      freezeState.frozenCols,
      ctx.containerSize.width,
      ctx.containerSize.height,
    );
    forEachVisibleCell(drawContentCell, 'scrollable');
    restoreContentClip?.();
  } else {
    forEachVisibleCell(drawContentCell);
  }
}
