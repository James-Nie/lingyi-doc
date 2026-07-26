import { clipCanvasToScrollablePane, RENDER_LAYERS } from '@lingyi-doc/core-sheet';
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
  const { freezeState, useFreezeSplit, forEachVisibleCell } = helpers;
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
    // 先画可滚动区（固定冻结边界裁剪），再画冻结区文字；背景/网格仍走下层，样式与原先一致
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
    forEachVisibleCell(drawContentCell, 'frozen');
  } else {
    forEachVisibleCell(drawContentCell);
  }
}
