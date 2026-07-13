import type { BorderStyle, CellStyle } from '../types/index';

export type BorderLineStyle = BorderStyle['style'];

const BORDER_SIDE_KEYS = ['borderTop', 'borderRight', 'borderBottom', 'borderLeft'] as const;

/** 工具栏线型选项（顺序与 UI 下拉一致） */
export const BORDER_LINE_STYLE_OPTIONS: { value: BorderLineStyle; label: string }[] = [
  { value: 'hair', label: '极细实线' },
  { value: 'thin', label: '细实线' },
  { value: 'dotted', label: '点线' },
  { value: 'dashed', label: '短虚线' },
  { value: 'mediumDashed', label: '长虚线' },
  { value: 'medium', label: '中等实线' },
  { value: 'thick', label: '粗实线' },
  { value: 'dashDot', label: '点划线' },
  { value: 'dashDotDot', label: '双点划线' },
  { value: 'double', label: '双线' },
];

export const DEFAULT_BORDER_SIDE: BorderStyle = { color: '#1F2329', style: 'thin' };

export function createBorderSide(color: string, style: BorderLineStyle): BorderStyle {
  if (style === 'none') return { color, style: 'none' };
  return { color, style };
}

export function resolveBorderLineWidth(style: BorderLineStyle, zoom: number): number {
  switch (style) {
    case 'hair': return 0.5 * zoom;
    case 'thin': return 1 * zoom;
    case 'medium': return 2 * zoom;
    case 'thick': return 3 * zoom;
    case 'double': return 1 * zoom;
    case 'dotted':
    case 'dashed':
    case 'mediumDashed':
    case 'dashDot':
    case 'dashDotDot':
      return 1 * zoom;
    default:
      return 1 * zoom;
  }
}

export function applyBorderLineDash(
  ctx: CanvasRenderingContext2D,
  style: BorderLineStyle,
  zoom: number,
): void {
  switch (style) {
    case 'dotted':
      ctx.setLineDash([1 * zoom, 2 * zoom]);
      break;
    case 'dashed':
      ctx.setLineDash([4 * zoom, 2 * zoom]);
      break;
    case 'mediumDashed':
      ctx.setLineDash([8 * zoom, 3 * zoom]);
      break;
    case 'dashDot':
      ctx.setLineDash([6 * zoom, 2 * zoom, 1 * zoom, 2 * zoom]);
      break;
    case 'dashDotDot':
      ctx.setLineDash([6 * zoom, 2 * zoom, 1 * zoom, 2 * zoom, 1 * zoom, 2 * zoom]);
      break;
    default:
      ctx.setLineDash([]);
      break;
  }
}

/** SVG / CSS 预览用 stroke-dasharray（相对 48px 宽） */
export function borderLinePreviewDash(style: BorderLineStyle): string | undefined {
  switch (style) {
    case 'hair':
    case 'thin':
    case 'medium':
    case 'thick':
    case 'double':
      return undefined;
    case 'dotted':
      return '1 3';
    case 'dashed':
      return '4 3';
    case 'mediumDashed':
      return '10 4';
    case 'dashDot':
      return '8 3 1 3';
    case 'dashDotDot':
      return '8 3 1 3 1 3';
    default:
      return undefined;
  }
}

export function borderLinePreviewWidth(style: BorderLineStyle): number {
  switch (style) {
    case 'hair': return 0.5;
    case 'thin': return 1;
    case 'medium': return 2;
    case 'thick': return 3;
    case 'double': return 1;
    default: return 1;
  }
}

/** 从单元格样式中取首个有效边框（用于工具栏回显） */
export function pickCellBorderSide(style?: CellStyle): BorderStyle | null {
  if (!style) return null;
  for (const key of BORDER_SIDE_KEYS) {
    const side = style[key];
    if (side && side.style !== 'none') return side;
  }
  return null;
}

/** 仅更新已有边框边的颜色/线型，保留各边是否存在 */
export function patchExistingBorderSides(
  style: CellStyle | undefined,
  color: string,
  lineStyle: BorderLineStyle,
): Partial<CellStyle> {
  if (!style) return {};
  const nextSide = createBorderSide(color, lineStyle);
  const patch: Partial<CellStyle> = {};
  for (const key of BORDER_SIDE_KEYS) {
    const side = style[key];
    if (side && side.style !== 'none') {
      patch[key] = nextSide;
    }
  }
  return patch;
}

export function cellHasVisibleBorder(style?: CellStyle): boolean {
  return pickCellBorderSide(style) !== null;
}

export function isVisibleBorderSide(side?: BorderStyle): boolean {
  return !!side && side.style !== 'none';
}

/**
 * 共享边只绘制一次，避免相邻单元格双边框叠加变粗。
 * 规则：垂直边由左侧单元格 borderRight 负责；水平边由上方单元格 borderBottom 负责。
 */
export function shouldDrawCellBorderSide(
  side: 'top' | 'right' | 'bottom' | 'left',
  self: BorderStyle | undefined,
  getNeighbor: (side: 'top' | 'right' | 'bottom' | 'left') => BorderStyle | undefined,
): boolean {
  if (!isVisibleBorderSide(self)) return false;
  switch (side) {
    case 'right':
    case 'bottom':
      return true;
    case 'left': {
      const neighborRight = getNeighbor('left');
      return !isVisibleBorderSide(neighborRight);
    }
    case 'top': {
      const neighborBottom = getNeighbor('top');
      return !isVisibleBorderSide(neighborBottom);
    }
  }
}
