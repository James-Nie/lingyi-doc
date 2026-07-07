import type ExcelJS from 'exceljs';
import type { BorderStyle, CellStyle } from '../types/index';

export function argbToCss(argb?: string): string | undefined {
  if (!argb) return undefined;
  const hex = argb.replace(/^#?/, '').toUpperCase();
  if (hex.length === 8) return `#${hex.slice(2)}`;
  if (hex.length === 6) return `#${hex}`;
  return undefined;
}

export function cssToArgb(color?: string): string | undefined {
  if (!color) return undefined;
  const raw = color.trim();
  if (!raw || raw.toLowerCase() === 'transparent') return undefined;

  if (raw.startsWith('#')) {
    const hex = raw.slice(1).toUpperCase();
    if (hex.length === 3) {
      const expanded = hex.split('').map(ch => ch + ch).join('');
      return `FF${expanded}`;
    }
    if (hex.length === 6) return `FF${hex}`;
    if (hex.length === 8) return hex;
  }

  const rgbMatch = raw.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    const r = Number(rgbMatch[1]).toString(16).padStart(2, '0');
    const g = Number(rgbMatch[2]).toString(16).padStart(2, '0');
    const b = Number(rgbMatch[3]).toString(16).padStart(2, '0');
    return `FF${r}${g}${b}`.toUpperCase();
  }

  return undefined;
}

function normalizeFontFamily(fontFamily?: string): string | undefined {
  if (!fontFamily) return undefined;
  const first = fontFamily.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '');
  return first || undefined;
}

export function mapHorizontalAlignFromExcel(value?: string): CellStyle['horizontalAlign'] | undefined {
  switch (value) {
    case 'left': return 'left';
    case 'center': return 'center';
    case 'right': return 'right';
    case 'justify': return 'justify';
    default: return undefined;
  }
}

export function mapHorizontalAlignToExcel(value?: CellStyle['horizontalAlign']): ExcelJS.Alignment['horizontal'] | undefined {
  return value;
}

export function mapVerticalAlignFromExcel(value?: string): CellStyle['verticalAlign'] | undefined {
  switch (value) {
    case 'top': return 'top';
    case 'middle': return 'middle';
    case 'bottom': return 'bottom';
    default: return undefined;
  }
}

export function mapVerticalAlignToExcel(value?: CellStyle['verticalAlign']): ExcelJS.Alignment['vertical'] | undefined {
  return value;
}

export function mapExcelBorderStyle(style?: string): BorderStyle['style'] {
  switch (style) {
    case 'medium': return 'medium';
    case 'thick': return 'thick';
    case 'double': return 'double';
    case 'dotted': return 'dotted';
    case 'dashDot':
    case 'dashDotDot':
    case 'slantedDashDot':
    case 'hair':
    case 'dashed':
      return 'dashed';
    default:
      return 'thin';
  }
}

export function mapBorderStyleToExcel(style: BorderStyle['style']): ExcelJS.BorderStyle {
  switch (style) {
    case 'medium': return 'medium';
    case 'thick': return 'thick';
    case 'double': return 'double';
    case 'dotted': return 'dotted';
    case 'dashed': return 'dashed';
    case 'none':
    case 'thin':
    default:
      return 'thin';
  }
}

export function mapExcelBorderSide(side?: Partial<ExcelJS.Border>): BorderStyle | undefined {
  if (!side?.style) return undefined;
  const color = argbToCss(side.color?.argb) || '#000000';
  return { color, style: mapExcelBorderStyle(side.style) };
}

export function mapBorderSideToExcel(side?: BorderStyle): Partial<ExcelJS.Border> | undefined {
  if (!side || side.style === 'none') return undefined;
  return {
    style: mapBorderStyleToExcel(side.style),
    color: { argb: cssToArgb(side.color) || 'FF000000' },
  };
}

export function excelCellToStyle(cell: ExcelJS.Cell): Partial<CellStyle> | undefined {
  const style: Partial<CellStyle> = {};
  let hasStyle = false;

  const font = cell.font;
  if (font) {
    if (font.name) { style.fontFamily = font.name; hasStyle = true; }
    if (font.size) { style.fontSize = font.size; hasStyle = true; }
    if (font.bold) { style.bold = true; hasStyle = true; }
    if (font.italic) { style.italic = true; hasStyle = true; }
    if (font.underline && font.underline !== 'none') { style.underline = true; hasStyle = true; }
    if (font.strike) { style.strikethrough = true; hasStyle = true; }
    const fontColor = argbToCss(font.color?.argb);
    if (fontColor) { style.fontColor = fontColor; hasStyle = true; }
  }

  const fill = cell.fill;
  if (fill && fill.type === 'pattern') {
    const patternFill = fill as ExcelJS.FillPattern;
    if (patternFill.pattern && patternFill.pattern !== 'none') {
      const bg = argbToCss(patternFill.fgColor?.argb) || argbToCss(patternFill.bgColor?.argb);
      if (bg) {
        style.backgroundColor = bg;
        hasStyle = true;
      }
    }
  }

  const alignment = cell.alignment;
  if (alignment) {
    const horizontal = mapHorizontalAlignFromExcel(alignment.horizontal);
    if (horizontal) { style.horizontalAlign = horizontal; hasStyle = true; }
    const vertical = mapVerticalAlignFromExcel(alignment.vertical);
    if (vertical) { style.verticalAlign = vertical; hasStyle = true; }
    if (alignment.wrapText) { style.textWrap = true; hasStyle = true; }
  }

  const border = cell.border;
  if (border) {
    const top = mapExcelBorderSide(border.top);
    const right = mapExcelBorderSide(border.right);
    const bottom = mapExcelBorderSide(border.bottom);
    const left = mapExcelBorderSide(border.left);
    if (top) { style.borderTop = top; hasStyle = true; }
    if (right) { style.borderRight = right; hasStyle = true; }
    if (bottom) { style.borderBottom = bottom; hasStyle = true; }
    if (left) { style.borderLeft = left; hasStyle = true; }
  }

  return hasStyle ? style : undefined;
}

export function cellStyleToExcel(style?: CellStyle): Partial<ExcelJS.Style> | undefined {
  if (!style) return undefined;

  const result: Partial<ExcelJS.Style> = {};
  let hasStyle = false;

  const font: Partial<ExcelJS.Font> = {};
  const fontName = normalizeFontFamily(style.fontFamily);
  if (fontName) { font.name = fontName; hasStyle = true; }
  if (style.fontSize) { font.size = style.fontSize; hasStyle = true; }
  if (style.bold) { font.bold = true; hasStyle = true; }
  if (style.italic) { font.italic = true; hasStyle = true; }
  if (style.underline) { font.underline = true; hasStyle = true; }
  if (style.strikethrough) { font.strike = true; hasStyle = true; }
  if (style.fontColor) {
    const argb = cssToArgb(style.fontColor);
    if (argb) {
      font.color = { argb };
      hasStyle = true;
    }
  }
  if (Object.keys(font).length) result.font = font;

  if (style.backgroundColor) {
    const argb = cssToArgb(style.backgroundColor);
    if (argb) {
      result.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb },
      };
      hasStyle = true;
    }
  }

  const alignment: Partial<ExcelJS.Alignment> = {};
  const horizontal = mapHorizontalAlignToExcel(style.horizontalAlign);
  if (horizontal) { alignment.horizontal = horizontal; hasStyle = true; }
  const vertical = mapVerticalAlignToExcel(style.verticalAlign);
  if (vertical) { alignment.vertical = vertical; hasStyle = true; }
  if (style.textWrap) { alignment.wrapText = true; hasStyle = true; }
  if (Object.keys(alignment).length) result.alignment = alignment;

  const border: Partial<ExcelJS.Borders> = {};
  const top = mapBorderSideToExcel(style.borderTop);
  const right = mapBorderSideToExcel(style.borderRight);
  const bottom = mapBorderSideToExcel(style.borderBottom);
  const left = mapBorderSideToExcel(style.borderLeft);
  if (top) { border.top = top; hasStyle = true; }
  if (right) { border.right = right; hasStyle = true; }
  if (bottom) { border.bottom = bottom; hasStyle = true; }
  if (left) { border.left = left; hasStyle = true; }
  if (Object.keys(border).length) result.border = border;

  return hasStyle ? result : undefined;
}
