import type { CellStyle } from '../types/index';
import {
  DEFAULT_CELL_STYLE,
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_ROW_HEIGHT,
  colToName,
  getCellText,
} from '../types/index';
import { resolveColumnWidth } from './columnLayout';
import type { FreeTable } from '../model/index';

const CELL_PADDING = 8;
const MIN_COL_WIDTH = 40;
const MAX_COL_WIDTH = 1000;
const MIN_ROW_HEIGHT = 20;
const MAX_ROW_HEIGHT = 500;
const LINE_HEIGHT_RATIO = 1.3;

function buildCellFont(style?: Partial<CellStyle>): string {
  const fontSize = style?.fontSize ?? DEFAULT_CELL_STYLE.fontSize ?? 13;
  const fontFamily = style?.fontFamily ?? DEFAULT_CELL_STYLE.fontFamily ?? 'Arial, sans-serif';
  const weight = style?.bold ? 'bold' : 'normal';
  const italic = style?.italic ? 'italic' : 'normal';
  return `${weight} ${italic} ${fontSize}px ${fontFamily}`;
}

function createMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  return canvas.getContext('2d');
}

function measureTextWidth(ctx: CanvasRenderingContext2D, text: string, font: string): number {
  ctx.font = font;
  return ctx.measureText(text || ' ').width;
}

function countWrappedLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: string,
): number {
  if (maxWidth <= 0) return 1;
  ctx.font = font;
  const words = text.split(/\s+/);
  if (words.length <= 1) {
    let lines = 0;
    let current = '';
    for (const ch of text) {
      const test = current + ch;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines++;
        current = ch;
      } else {
        current = test;
      }
    }
    return Math.max(1, lines + (current ? 1 : 0));
  }

  let lines = 1;
  let currentLine = '';
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines++;
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  return Math.max(1, lines);
}

/** 根据列头与单元格内容计算合适的列宽（像素，未缩放） */
export function computeColumnAutoWidth(table: FreeTable, col: number): number {
  const ctx = createMeasureContext();
  if (!ctx) return DEFAULT_COLUMN_WIDTH;

  const sheet = table.sheet;
  let maxW = 0;
  const colDef = sheet.columnDefs[col];
  const headerFont = '11px Arial, sans-serif';
  const headerText = colDef?.name || colToName(col);
  const headerExtra = colDef ? 14 + 8 : 8;
  maxW = Math.max(maxW, measureTextWidth(ctx, headerText, headerFont) + headerExtra);

  for (let r = 0; r < sheet.rowCount; r++) {
    const cell = table.getCell(r, col);
    if (cell?.isMergedChild) continue;
    const font = buildCellFont(cell?.style);
    const text = getCellText(cell?.value ?? { type: 'empty' });
    for (const line of text.split('\n')) {
      maxW = Math.max(maxW, measureTextWidth(ctx, line, font));
    }
  }

  return Math.ceil(Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, maxW + CELL_PADDING * 2)));
}

/** 根据行内单元格内容计算合适的行高（像素，未缩放） */
export function computeRowAutoHeight(
  table: FreeTable,
  row: number,
  columnWidths: Map<number, number>,
  defaultColWidth = DEFAULT_COLUMN_WIDTH,
  defaultRowHeight = DEFAULT_ROW_HEIGHT,
): number {
  const ctx = createMeasureContext();
  if (!ctx) return defaultRowHeight;

  const sheet = table.sheet;
  let maxH = defaultRowHeight;

  for (let c = 0; c < sheet.colCount; c++) {
    const cell = table.getCell(row, c);
    if (cell?.isMergedChild) continue;
    const font = buildCellFont(cell?.style);
    const fontSize = cell?.style?.fontSize ?? DEFAULT_CELL_STYLE.fontSize ?? 13;
    const lineHeight = fontSize * LINE_HEIGHT_RATIO;
    const colWidth = resolveColumnWidth(c, columnWidths, defaultColWidth);
    const maxTextWidth = colWidth - CELL_PADDING * 2;
    const text = getCellText(cell?.value ?? { type: 'empty' });
    const wrap = cell?.style?.textWrap;

    let lines: number;
    if (wrap && text) {
      lines = countWrappedLines(ctx, text, maxTextWidth, font);
    } else {
      lines = Math.max(1, text.split('\n').length);
    }

    const cellH = lines * lineHeight + CELL_PADDING * 2;
    maxH = Math.max(maxH, cellH);
  }

  return Math.ceil(Math.max(MIN_ROW_HEIGHT, Math.min(MAX_ROW_HEIGHT, maxH)));
}
