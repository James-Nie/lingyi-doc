import {
  BASE_THEME,
  GROUP_INDENT_STEP,
  countCheckedInGroupSubtree,
  groupBoxRenderer,
  groupHeaderRenderer,
  groupedRowControlsRenderer,
  isColumnHidden,
  isRowVisible,
  recordTreeRenderer,
  resolveGroupRecordMetadataEndPx,
  resolveGroupedMetadataDividerX,
  resolveRowControlLevel,
  resolveTreeLayout,
  RENDER_LAYERS,
  type CellData,
} from '@lingyi-doc/core';
import type { SheetRenderHelpers, SheetRenderPassContext } from '../shared/sheetRenderTypes';

export function drawBaseBackgroundLayer(
  ctx: SheetRenderPassContext,
  helpers: SheetRenderHelpers,
): void {
  const { layerManager, viewport, sheet, containerSize, groupLayout, isGroupedView } = ctx;
  const { visibleRange, baseGridBounds, activeRowHeights } = {
    ...helpers,
    activeRowHeights: ctx.activeRowHeights,
  };
  const bgCtx = layerManager.getLayer(RENDER_LAYERS.BACKGROUND);

  bgCtx.fillStyle = BASE_THEME.pageBg;
  bgCtx.fillRect(0, 0, containerSize.width, containerSize.height);
  if (baseGridBounds && !isGroupedView) {
    bgCtx.fillStyle = BASE_THEME.cellBgColor;
    bgCtx.fillRect(0, 0, baseGridBounds.right, baseGridBounds.bottom);
  }

  if (isGroupedView && groupLayout && baseGridBounds) {
    const cardLeft = ctx.resolveGroupedCardLeft();
    groupBoxRenderer.drawGroupBoxes(bgCtx, groupLayout.groupBoxRanges, {
      cardLeft,
      gridRight: baseGridBounds.right,
      rowHeights: ctx.activeRowHeights,
      defaultRowHeight: viewport.config.defaultRowHeight,
      zoom: viewport.zoomLevel,
      getRowScreenTop: (row, rh) => viewport.getRowScreenTop(row, rh),
      items: groupLayout.items,
    });
    for (let r = visibleRange.startRow; r <= visibleRange.endRow; r++) {
      if (groupLayout.items[r]?.type !== 'group-gap') continue;
      const rowRect = viewport.getCellRect({ row: r, col: 0 }, sheet.columnWidths, ctx.activeRowHeights);
      bgCtx.fillStyle = BASE_THEME.pageBg;
      bgCtx.fillRect(0, rowRect.y, baseGridBounds.right, rowRect.height);
    }
  }
}

export function drawBaseRowHighlightLayer(
  ctx: SheetRenderPassContext,
  helpers: SheetRenderHelpers,
  activeCellRow: number | null,
): void {
  const { layerManager, sheet, checkedRowsForRender, isGroupedView, activeHoverRow } = ctx;
  const { visibleRange, baseGridBounds } = helpers;
  if (!baseGridBounds) return;
  const bgCtx = layerManager.getLayer(RENDER_LAYERS.BACKGROUND);

  if (checkedRowsForRender.length > 0) {
    const checkedSet = new Set(checkedRowsForRender);
    for (let r = visibleRange.startRow; r <= visibleRange.endRow; r++) {
      if (!checkedSet.has(r)) continue;
      if (isGroupedView) {
        ctx.fillGroupedRowHighlight(bgCtx, r, BASE_THEME.rowCheckedBg, baseGridBounds.right, ctx.activeRowHeights);
      } else {
        const rowRect = ctx.viewportRef.current.getCellRect({ row: r, col: 0 }, sheet.columnWidths, ctx.activeRowHeights);
        bgCtx.fillStyle = BASE_THEME.rowCheckedBg;
        bgCtx.fillRect(0, rowRect.y, baseGridBounds.right, rowRect.height);
      }
    }
  }

  const highlightRow = activeHoverRow ?? activeCellRow;
  if (highlightRow !== null && !ctx.isGroupDisplayRow(highlightRow)) {
    const color = activeHoverRow === highlightRow ? BASE_THEME.rowHoverBg : BASE_THEME.selectionHeaderBg;
    if (isGroupedView) {
      ctx.fillGroupedRowHighlight(bgCtx, highlightRow, color, baseGridBounds.right, ctx.activeRowHeights);
    } else {
      const rowRect = ctx.viewportRef.current.getCellRect({ row: highlightRow, col: 0 }, sheet.columnWidths, ctx.activeRowHeights);
      bgCtx.fillStyle = color;
      bgCtx.fillRect(0, rowRect.y, baseGridBounds.right, rowRect.height);
    }
  }
}

export function drawBaseContentLayer(
  ctx: SheetRenderPassContext,
  helpers: SheetRenderHelpers,
): void {
  const {
    layerManager, viewport, renderer, baseCellRenderer, table, sheet,
    columnDefs, mergeRanges, isGroupedView, groupLayout, rowTreeMeta,
    collapsedRowIdSet, sheetRows, containerSize, checkedRecordRowSet,
    resolveGridRecordRow,
  } = ctx;
  const { visibleRange, baseGridBounds } = helpers;
  if (columnDefs.length === 0) return;

  const contentCtx = layerManager.getLayer(RENDER_LAYERS.CONTENT);
  const frozenCols = sheet.freezeState?.frozenCols || 0;
  const frozenBoundary = viewport.config.headerWidth + viewport.getFrozenWidth(sheet.columnWidths);
  const dataRight = baseGridBounds?.right ?? containerSize.width;
  const cardLeft = ctx.resolveGroupedCardLeft();
  const cardWidth = Math.max(0, dataRight - cardLeft);
  const metadataDividerX = resolveGroupedMetadataDividerX(viewport.config.headerWidth);

  const resolveLevelCardRect = (level: number) => {
    const levelIndent = level * GROUP_INDENT_STEP * viewport.zoomLevel;
    return { x: cardLeft + levelIndent, width: Math.max(0, cardWidth - levelIndent) };
  };

  const drawBaseCellAt = (displayRow: number, recordRow: number, c: number, canvasCtx: CanvasRenderingContext2D) => {
    if (isColumnHidden(c, columnDefs, sheet.columnWidths)) return;
    const cellData = table.getCell(recordRow, c);
    const columnDef = columnDefs[c];
    if (!columnDef) {
      if (cellData) renderer.drawCellContent(canvasCtx, { row: displayRow, col: c }, cellData, sheet.columnWidths, ctx.activeRowHeights, mergeRanges);
      return;
    }
    const emptyCellData: CellData = { value: { type: 'empty' } };
    const cellRect = viewport.getCellRect({ row: displayRow, col: c }, sheet.columnWidths, ctx.activeRowHeights);
    const treeMeta = !isGroupedView ? rowTreeMeta?.[recordRow] : undefined;
    if (c === 0 && treeMeta) {
      recordTreeRenderer.drawTreeColumn(canvasCtx, cellRect, treeMeta, viewport.zoomLevel);
    }
    let contentInset = c === 0 && treeMeta
      ? resolveTreeLayout(treeMeta, cellRect.width, viewport.zoomLevel).contentInset
      : 0;
    if (isGroupedView && groupLayout && c === 0) {
      const level = resolveRowControlLevel(groupLayout.items, displayRow);
      const metaEnd = resolveGroupRecordMetadataEndPx(level) * viewport.zoomLevel;
      contentInset = Math.max(contentInset, Math.max(0, cardLeft + metaEnd - cellRect.x));
    }
    baseCellRenderer.drawBaseCellContent(
      canvasCtx,
      { row: displayRow, col: c },
      cellData || emptyCellData,
      columnDef,
      sheet.columnWidths,
      ctx.activeRowHeights,
      mergeRanges,
      contentInset,
    );
  };

  const drawGroupLayoutRow = (displayRow: number, canvasCtx: CanvasRenderingContext2D) => {
    const layoutItem = groupLayout?.items[displayRow];
    if (!layoutItem) return;
    const rowRect = viewport.getCellRect({ row: displayRow, col: 0 }, sheet.columnWidths, ctx.activeRowHeights);

    if (layoutItem.type === 'group-gap') {
      canvasCtx.fillStyle = BASE_THEME.pageBg;
      canvasCtx.fillRect(0, rowRect.y, dataRight, rowRect.height);
      return;
    }

    if (layoutItem.type === 'group-header') {
      const selectedCount = countCheckedInGroupSubtree(
        groupLayout!.items,
        displayRow,
        layoutItem.level,
        checkedRecordRowSet,
      );
      const cardRect = resolveLevelCardRect(layoutItem.level);
      groupHeaderRenderer.drawGroupHeader(
        canvasCtx,
        { x: cardRect.x, y: rowRect.y, width: cardRect.width, height: rowRect.height },
        layoutItem,
        columnDefs.find(col => col.id === layoutItem.fieldId),
        viewport.zoomLevel,
        selectedCount,
        metadataDividerX,
      );
      return;
    }
    if (layoutItem.type === 'add-record') {
      const cardRect = resolveLevelCardRect(layoutItem.level);
      groupHeaderRenderer.drawAddRecordRow(
        canvasCtx,
        { x: cardRect.x, y: rowRect.y, width: cardRect.width, height: rowRect.height },
        layoutItem.level,
        viewport.zoomLevel,
        metadataDividerX,
      );
    }
  };

  const drawRecordRow = (displayRow: number, canvasCtx: CanvasRenderingContext2D, colRange: 'frozen' | 'scrollable' | 'all') => {
    const rowHeight = ctx.activeRowHeights.get(displayRow) ?? 0;
    if (rowHeight <= 0) return;
    const recordRow = resolveGridRecordRow(displayRow);
    if (recordRow === null) return;
    if (!isGroupedView && !isRowVisible(recordRow, sheetRows, collapsedRowIdSet)) return;

    if (colRange === 'frozen' || colRange === 'all') {
      for (let c = 0; c < (colRange === 'all' ? sheet.colCount : frozenCols); c++) {
        if (colRange === 'all' || c < frozenCols) {
          drawBaseCellAt(displayRow, recordRow, c, canvasCtx);
        }
      }
    }
    if (colRange === 'scrollable' || colRange === 'all') {
      const startCol = colRange === 'all' ? visibleRange.startCol : Math.max(visibleRange.startCol, frozenCols);
      for (let c = startCol; c <= visibleRange.endCol; c++) {
        if (colRange === 'scrollable' && c < frozenCols) continue;
        drawBaseCellAt(displayRow, recordRow, c, canvasCtx);
      }
    }
  };

  if (isGroupedView && groupLayout) {
    for (let r = visibleRange.startRow; r <= visibleRange.endRow; r++) {
      const item = groupLayout.items[r];
      if (item?.type === 'group-gap' || item?.type === 'group-header' || item?.type === 'add-record') {
        drawGroupLayoutRow(r, contentCtx);
      }
    }
    if (frozenCols > 0) {
      for (let r = visibleRange.startRow; r <= visibleRange.endRow; r++) {
        if (groupLayout.items[r]?.type !== 'record') continue;
        drawRecordRow(r, contentCtx, 'frozen');
      }
      contentCtx.save();
      contentCtx.beginPath();
      contentCtx.rect(frozenBoundary, 0, containerSize.width - frozenBoundary, containerSize.height);
      contentCtx.clip();
      for (let r = visibleRange.startRow; r <= visibleRange.endRow; r++) {
        if (groupLayout.items[r]?.type !== 'record') continue;
        drawRecordRow(r, contentCtx, 'scrollable');
      }
      contentCtx.restore();
    } else {
      for (let r = visibleRange.startRow; r <= visibleRange.endRow; r++) {
        if (groupLayout.items[r]?.type !== 'record') continue;
        drawRecordRow(r, contentCtx, 'all');
      }
    }
  } else if (frozenCols > 0) {
    for (let r = visibleRange.startRow; r <= visibleRange.endRow; r++) {
      drawRecordRow(r, contentCtx, 'frozen');
    }
    contentCtx.save();
    contentCtx.beginPath();
    contentCtx.rect(frozenBoundary, 0, containerSize.width - frozenBoundary, containerSize.height);
    contentCtx.clip();
    for (let r = visibleRange.startRow; r <= visibleRange.endRow; r++) {
      drawRecordRow(r, contentCtx, 'scrollable');
    }
    contentCtx.restore();
  } else {
    for (let r = visibleRange.startRow; r <= visibleRange.endRow; r++) {
      drawRecordRow(r, contentCtx, 'all');
    }
  }
}

export function drawBaseGroupedRowControls(
  ctx: SheetRenderPassContext,
  helpers: SheetRenderHelpers,
  activeCellRow: number | null,
  selectedRows: number[],
): void {
  const { layerManager, viewport, sheet, groupLayout, columnDefs, isGroupedView, checkedRecordRowSet, activeHoverRow } = ctx;
  const { visibleRange, baseGridBounds } = helpers;
  if (!isGroupedView || !groupLayout || columnDefs.length === 0 || !baseGridBounds) return;

  const overlayCtx = layerManager.getLayer(RENDER_LAYERS.OVERLAY);
  const overlayCardLeft = ctx.resolveGroupedCardLeft();
  const metadataDividerX = resolveGroupedMetadataDividerX(viewport.config.headerWidth);
  const selectedRowSet = new Set(selectedRows);

  for (let r = visibleRange.startRow; r <= visibleRange.endRow; r++) {
    const item = groupLayout.items[r];
    if (item?.type !== 'record') continue;
    const recordRow = item.recordIndex;
    const rowRect = viewport.getCellRect({ row: r, col: 0 }, sheet.columnWidths, ctx.activeRowHeights);
    const level = resolveRowControlLevel(groupLayout.items, r);
    const isChecked = checkedRecordRowSet.has(recordRow);
    const showControls = isChecked
      || r === activeHoverRow
      || r === activeCellRow
      || selectedRowSet.has(r);
    const metaDividerX = metadataDividerX;
    groupedRowControlsRenderer.drawRecordRowControls(overlayCtx, {
      cardLeft: overlayCardLeft,
      y: rowRect.y,
      height: rowRect.height,
      level,
      zoom: viewport.zoomLevel,
      localIndex: item.localIndex,
      isChecked,
      showControls,
      metadataDividerX: metaDividerX,
    });
  }
}
