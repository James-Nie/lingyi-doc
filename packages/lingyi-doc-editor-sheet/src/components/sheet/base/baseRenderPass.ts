import { BASE_THEME, GROUP_INDENT_STEP, countCheckedInGroupSubtree, groupBoxRenderer, groupHeaderRenderer, groupedRowControlsRenderer, isColumnHidden, isRowVisible, recordTreeRenderer, resolveGroupRecordMetadataEndPx, resolveGroupedMetadataDividerX, resolveRowControlLevel, resolveTreeLayout, RENDER_LAYERS } from '@lingyi-doc/core-sheet';
import type { CellData } from '@lingyi-doc/core-types';
import { isSheetCommentCellSelected } from '@lingyi-doc/core-doc';
import type { SheetRenderHelpers, SheetRenderPassContext } from '../shared/sheetRenderTypes';
import { useSheetStore } from '../../../store/sheetStore';

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
      visibleStartRow: visibleRange.startRow,
      visibleEndRow: visibleRange.endRow,
      canvasHeight: containerSize.height,
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

  // 选中的整行评论(sheet_record)：整行铺浅米黄背景（对齐设计稿）
  const { sheetCommentCells, selectedCommentId } = ctx;
  if (selectedCommentId && sheetCommentCells?.length) {
    for (const cell of sheetCommentCells) {
      if (cell.anchorType !== 'sheet_record') continue;
      if (!isSheetCommentCellSelected(cell, selectedCommentId)) continue;
      if (cell.row < visibleRange.startRow || cell.row > visibleRange.endRow) continue;
      if (ctx.isGroupDisplayRow(cell.row)) continue;
      if (isGroupedView) {
        ctx.fillGroupedRowHighlight(bgCtx, cell.row, BASE_THEME.rowCommentHighlightBg, baseGridBounds.right, ctx.activeRowHeights);
      } else {
        const rowRect = ctx.viewportRef.current.getCellRect({ row: cell.row, col: 0 }, sheet.columnWidths, ctx.activeRowHeights);
        bgCtx.fillStyle = BASE_THEME.rowCommentHighlightBg;
        bgCtx.fillRect(0, rowRect.y, baseGridBounds.right, rowRect.height);
      }
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

  // 一次性获取 store 状态，避免在单元格循环内重复调用
  const activeCell = ctx.previewMode ? null : (useSheetStore.getState().activeCell ?? null);
  const hoverProgress = ctx.hoverProgressCell;
  const dragProgress = ctx.progressDragCell;

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
    // 空单元格快速跳过：无需绘制内容（背景层已处理），但 boolean/progress/rating 字段即使空值也需要绘制
    const isEmpty = !cellData || cellData.value.type === 'empty';
    if (isEmpty && columnDef.type !== 'boolean' && columnDef.type !== 'progress' && columnDef.type !== 'rating') {
      // 首列仍需绘制树形控件
      if (c === 0) {
        const treeMeta = !isGroupedView ? rowTreeMeta?.[recordRow] : undefined;
        if (treeMeta) {
          const cellRect = viewport.getCellRect({ row: displayRow, col: c }, sheet.columnWidths, ctx.activeRowHeights);
          recordTreeRenderer.drawTreeColumn(canvasCtx, cellRect, treeMeta, viewport.zoomLevel);
        }
      }
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
    const showProgressThumb = columnDef.type === 'progress' && (
      (!!activeCell && activeCell.row === displayRow && activeCell.col === c)
      || (!!hoverProgress && hoverProgress.row === displayRow && hoverProgress.col === c)
      || (!!dragProgress && dragProgress.row === displayRow && dragProgress.col === c)
    );
    baseCellRenderer.drawBaseCellContent(
      canvasCtx,
      { row: displayRow, col: c },
      cellData || emptyCellData,
      columnDef,
      sheet.columnWidths,
      ctx.activeRowHeights,
      mergeRanges,
      contentInset,
      { showProgressThumb },
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
      contentCtx.save();
      contentCtx.beginPath();
      contentCtx.rect(frozenBoundary, 0, containerSize.width - frozenBoundary, containerSize.height);
      contentCtx.clip();
      for (let r = visibleRange.startRow; r <= visibleRange.endRow; r++) {
        if (groupLayout.items[r]?.type !== 'record') continue;
        drawRecordRow(r, contentCtx, 'scrollable');
      }
      contentCtx.restore();

      for (let r = visibleRange.startRow; r <= visibleRange.endRow; r++) {
        if (groupLayout.items[r]?.type !== 'record') continue;
        drawRecordRow(r, contentCtx, 'frozen');
      }
    } else {
      for (let r = visibleRange.startRow; r <= visibleRange.endRow; r++) {
        if (groupLayout.items[r]?.type !== 'record') continue;
        drawRecordRow(r, contentCtx, 'all');
      }
    }
  } else if (frozenCols > 0) {
    contentCtx.save();
    contentCtx.beginPath();
    contentCtx.rect(frozenBoundary, 0, containerSize.width - frozenBoundary, containerSize.height);
    contentCtx.clip();
    for (let r = visibleRange.startRow; r <= visibleRange.endRow; r++) {
      drawRecordRow(r, contentCtx, 'scrollable');
    }
    contentCtx.restore();

    for (let r = visibleRange.startRow; r <= visibleRange.endRow; r++) {
      drawRecordRow(r, contentCtx, 'frozen');
    }
  } else {
    for (let r = visibleRange.startRow; r <= visibleRange.endRow; r++) {
      drawRecordRow(r, contentCtx, 'all');
    }
  }
}

export function drawBaseGroupedCardBorders(
  ctx: SheetRenderPassContext,
  helpers: SheetRenderHelpers,
): void {
  const { layerManager, viewport, groupLayout, isGroupedView, isBaseSheet } = ctx;
  const { baseGridBounds } = helpers;
  if (!isGroupedView || !isBaseSheet || !groupLayout || !baseGridBounds) return;

  const overlayCtx = layerManager.getLayer(RENDER_LAYERS.OVERLAY);
  const { visibleRange } = helpers;
  groupBoxRenderer.strokeGroupBoxes(overlayCtx, groupLayout.groupBoxRanges, {
    cardLeft: ctx.resolveGroupedCardLeft(),
    gridRight: baseGridBounds.right,
    rowHeights: ctx.activeRowHeights,
    defaultRowHeight: viewport.config.defaultRowHeight,
    zoom: viewport.zoomLevel,
    getRowScreenTop: (row, rh) => viewport.getRowScreenTop(row, rh),
    visibleStartRow: visibleRange.startRow,
    visibleEndRow: visibleRange.endRow,
    canvasHeight: ctx.containerSize.height,
  });
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
