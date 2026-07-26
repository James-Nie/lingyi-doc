import type { CellCoord, CellRange } from '@lingyi-doc/core-types';
import { DEFAULT_COLUMN_WIDTH, DEFAULT_ROW_HEIGHT } from '@lingyi-doc/core-types';
import type { FreeTable } from '../model/index';
import { ViewportManager, CellRenderer, DEFAULT_RENDER_CONFIG } from '../renderer/index';
import { getSheetMergeRanges } from '@lingyi-doc/core-types';
import { normalizeRange } from './autofill';
import { resolveColumnWidth } from './columnLayout';
import { isRowLayoutHidden, resolveRowHeight } from './rowLayout';

const MAX_IMAGE_EDGE_PX = 8192;

export function resolveImageCaptureRange(
  sheetId: string,
  range: CellRange | null,
  discreteCells: CellCoord[],
): CellRange | null {
  if (range) return range;
  if (discreteCells.length === 0) return null;
  if (discreteCells.length === 1) {
    return { sheetId, start: discreteCells[0], end: discreteCells[0] };
  }
  const minRow = Math.min(...discreteCells.map(c => c.row));
  const maxRow = Math.max(...discreteCells.map(c => c.row));
  const minCol = Math.min(...discreteCells.map(c => c.col));
  const maxCol = Math.max(...discreteCells.map(c => c.col));
  return {
    sheetId,
    start: { row: minRow, col: minCol },
    end: { row: maxRow, col: maxCol },
  };
}

function drawSelectionGridlines(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportManager,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
  columnWidths: Map<number, number>,
  rowHeights: Map<number, number>,
  cssWidth: number,
  cssHeight: number,
): void {
  const config = viewport.config;
  ctx.strokeStyle = config.gridColor;
  ctx.lineWidth = 0.5;
  ctx.setLineDash([]);

  const startRect = viewport.getCellRect({ row: startRow, col: startCol }, columnWidths, rowHeights);

  for (let r = startRow; r <= endRow + 1; r++) {
    let y: number;
    if (r === startRow) {
      y = startRect.y;
    } else if (r <= endRow) {
      const prev = viewport.getCellRect({ row: r - 1, col: startCol }, columnWidths, rowHeights);
      y = prev.y + prev.height;
    } else {
      const last = viewport.getCellRect({ row: endRow, col: startCol }, columnWidths, rowHeights);
      y = last.y + last.height;
    }
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cssWidth, y);
    ctx.stroke();
  }

  for (let c = startCol; c <= endCol + 1; c++) {
    let x: number;
    if (c === startCol) {
      x = startRect.x;
    } else if (c <= endCol) {
      const prev = viewport.getCellRect({ row: startRow, col: c - 1 }, columnWidths, rowHeights);
      x = prev.x + prev.width;
    } else {
      const last = viewport.getCellRect({ row: startRow, col: endCol }, columnWidths, rowHeights);
      x = last.x + last.width;
    }
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cssHeight);
    ctx.stroke();
  }
}

/** 将选区离屏渲染为 Canvas（不含选区高亮与表头） */
export function renderSelectionToCanvas(
  table: FreeTable,
  range: CellRange,
  columnWidths: Map<number, number>,
  rowHeights: Map<number, number>,
  zoomLevel = 1,
): HTMLCanvasElement {
  const { startRow, endRow, startCol, endCol } = normalizeRange(range);
  const sheet = table.sheet;
  const zoom = zoomLevel;

  const viewport = new ViewportManager({
    headerWidth: 0,
    headerHeight: 0,
    zoomLevel: zoom,
    gridColor: DEFAULT_RENDER_CONFIG.gridColor,
  });
  viewport.setFreezeState({ frozenRows: 0, frozenCols: 0 });

  let scrollTop = 0;
  for (let r = 0; r < startRow; r++) {
    scrollTop += resolveRowHeight(r, rowHeights, DEFAULT_ROW_HEIGHT) * zoom;
  }
  viewport.setScrollPosition(scrollTop, viewport.getColumnContentX(startCol, columnWidths));

  const topLeft = viewport.getCellRect({ row: startRow, col: startCol }, columnWidths, rowHeights);
  const bottomRight = viewport.getCellRect({ row: endRow, col: endCol }, columnWidths, rowHeights);
  const cssWidth = Math.max(1, Math.ceil(bottomRight.x + bottomRight.width - topLeft.x));
  const cssHeight = Math.max(1, Math.ceil(bottomRight.y + bottomRight.height - topLeft.y));

  if (cssWidth > MAX_IMAGE_EDGE_PX || cssHeight > MAX_IMAGE_EDGE_PX) {
    throw new Error('选区过大，无法复制为图片');
  }

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(cssWidth * dpr);
  canvas.height = Math.ceil(cssHeight * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布');

  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, cssWidth, cssHeight);
  ctx.clip();

  const renderer = new CellRenderer(viewport);

  const mergeRanges = getSheetMergeRanges(sheet);

  for (let r = startRow; r <= endRow; r++) {
    if (isRowLayoutHidden(r, rowHeights, DEFAULT_ROW_HEIGHT)) continue;
    for (let c = startCol; c <= endCol; c++) {
      if (resolveColumnWidth(c, columnWidths, DEFAULT_COLUMN_WIDTH) <= 0) continue;
      renderer.drawCellBackground(
        ctx, { row: r, col: c }, table.getCell(r, c), columnWidths, rowHeights, mergeRanges,
      );
    }
  }

  for (const mergeRange of mergeRanges) {
    if (mergeRange.start.row === mergeRange.end.row && mergeRange.start.col === mergeRange.end.col) continue;
    if (mergeRange.end.row < startRow || mergeRange.start.row > endRow
      || mergeRange.end.col < startCol || mergeRange.start.col > endCol) {
      continue;
    }
    const master = mergeRange.master || mergeRange.start;
    const mRect = viewport.getCellRect(master, columnWidths, rowHeights);
    const brRect = viewport.getCellRect(mergeRange.end, columnWidths, rowHeights);
    const w = brRect.x + brRect.width - mRect.x;
    const h = brRect.y + brRect.height - mRect.y;
    const cellData = table.getCell(master.row, master.col);
    ctx.fillStyle = cellData?.style?.backgroundColor || '#ffffff';
    ctx.fillRect(mRect.x, mRect.y, w, h);
  }

  drawSelectionGridlines(
    ctx, viewport, startRow, endRow, startCol, endCol, columnWidths, rowHeights, cssWidth, cssHeight,
  );

  for (let r = startRow; r <= endRow; r++) {
    if (isRowLayoutHidden(r, rowHeights, DEFAULT_ROW_HEIGHT)) continue;
    for (let c = startCol; c <= endCol; c++) {
      if (resolveColumnWidth(c, columnWidths, DEFAULT_COLUMN_WIDTH) <= 0) continue;
      if (table.isInMergedCell(r, c)) continue;
      renderer.drawCellBorders(
        ctx, { row: r, col: c }, table.getCell(r, c), columnWidths, rowHeights,
        undefined, (row, col) => table.getCell(row, col),
      );
    }
  }

  for (const mergeRange of mergeRanges) {
    if (mergeRange.start.row === mergeRange.end.row && mergeRange.start.col === mergeRange.end.col) continue;
    const master = mergeRange.master || mergeRange.start;
    if (master.row < startRow || master.row > endRow || master.col < startCol || master.col > endCol) continue;
    renderer.drawCellBorders(
      ctx, master, table.getCell(master.row, master.col), columnWidths, rowHeights, mergeRanges,
      (row, col) => table.getCell(row, col),
    );
  }

  for (let r = startRow; r <= endRow; r++) {
    if (isRowLayoutHidden(r, rowHeights, DEFAULT_ROW_HEIGHT)) continue;
    for (let c = startCol; c <= endCol; c++) {
      if (resolveColumnWidth(c, columnWidths, DEFAULT_COLUMN_WIDTH) <= 0) continue;
      renderer.drawCellContent(
        ctx, { row: r, col: c }, table.getCell(r, c), columnWidths, rowHeights, mergeRanges,
      );
    }
  }

  ctx.restore();
  return canvas;
}

export async function copyCanvasToClipboard(canvas: HTMLCanvasElement): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('当前环境不支持复制图片到剪贴板');
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });
  if (!blob) throw new Error('生成图片失败');

  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': blob }),
  ]);
}

export async function copyTableSelectionAsImage(
  table: FreeTable,
  range: CellRange,
  columnWidths: Map<number, number>,
  rowHeights: Map<number, number>,
  zoomLevel = 1,
): Promise<void> {
  const canvas = renderSelectionToCanvas(table, range, columnWidths, rowHeights, zoomLevel);
  await copyCanvasToClipboard(canvas);
}
