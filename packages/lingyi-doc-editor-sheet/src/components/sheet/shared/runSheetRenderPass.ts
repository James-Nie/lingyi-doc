import { RENDER_LAYERS } from '@lingyi-doc/core-sheet';
import type { BaseSheetModel } from '@lingyi-doc/core-types';
import {
  drawBaseBackgroundLayer,
  drawBaseContentLayer,
  drawBaseGroupedCardBorders,
  drawBaseGroupedRowControls,
  drawBaseRowHighlightLayer,
} from '../base/baseRenderPass';
import { ensureBaseViewportConfig } from '../base/baseViewportConfig';
import {
  drawFreeformBackgroundLayer,
  drawFreeformContentLayer,
} from '../freeform/freeformRenderPass';
import { buildRenderHelpers } from './buildRenderHelpers';
import {
  drawCommentHighlightLayer,
  drawCommentMarkerLayer,
  drawFindHighlightLayer,
  drawGridlinesLayer,
  drawMergeCellsLayer,
  drawOverlayLayer,
  drawSelectionLayer,
  drawSharedBackgroundCells,
  resolveSelectionRenderState,
} from './sharedRenderPass';
import type { SheetRenderPassContext } from './sheetRenderTypes';

export function runSheetRenderPass(ctx: SheetRenderPassContext): void {
  const { layerManager, viewport, tracker, sheet, containerSize } = ctx;

  if (!layerManager || !layerManager.isAlive() || containerSize.width === 0 || containerSize.height === 0) {
    return;
  }

  if (ctx.isBaseSheet) {
    ensureBaseViewportConfig(viewport, sheet as BaseSheetModel, ctx.previewMode);
  } else {
    viewport.setFreezeState(sheet.freezeState || { frozenRows: 0, frozenCols: 0 });
  }

  const needsFull = tracker.needsFullRedraw;
  if (needsFull) layerManager.clearAll();

  const helpers = buildRenderHelpers(ctx);
  const selection = resolveSelectionRenderState(ctx);

  // Layer 1: Background
  const bgCtx = layerManager.getLayer(RENDER_LAYERS.BACKGROUND);
  bgCtx.clearRect(0, 0, containerSize.width, containerSize.height);

  if (ctx.isBaseSheet) {
    drawBaseBackgroundLayer(ctx, helpers);
  } else {
    drawFreeformBackgroundLayer(ctx, helpers);
  }
  drawSharedBackgroundCells(ctx, helpers);
  drawCommentHighlightLayer(ctx);
  drawFindHighlightLayer(ctx);

  if (ctx.isBaseSheet) {
    drawBaseRowHighlightLayer(ctx, helpers, selection.activeCellRow);
  }

  // Layer 2: Gridlines
  drawGridlinesLayer(ctx, helpers);

  // Layer 3: Merge cells
  drawMergeCellsLayer(ctx, helpers);

  // Layer 4: Content
  const contentCtx = layerManager.getLayer(RENDER_LAYERS.CONTENT);
  contentCtx.clearRect(0, 0, containerSize.width, containerSize.height);
  if (ctx.isBaseSheet && ctx.columnDefs.length > 0) {
    drawBaseContentLayer(ctx, helpers);
  } else {
    drawFreeformContentLayer(ctx, helpers);
  }

  // Layer 5: Selection
  drawSelectionLayer(ctx, selection);

  // Layer 7: Overlay
  drawOverlayLayer(ctx, helpers, selection);
  drawCommentMarkerLayer(ctx, helpers);
  if (ctx.isGroupedView && ctx.isBaseSheet) {
    // 内容层会盖住 BACKGROUND 上的卡片底边，在 overlay 重描边框
    drawBaseGroupedCardBorders(ctx, helpers);
    drawBaseGroupedRowControls(ctx, helpers, selection.activeCellRow, selection.selectedRows);
  }

  tracker.clear();
}
