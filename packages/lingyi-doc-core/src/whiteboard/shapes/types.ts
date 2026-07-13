import type { ShapeElement, ShapeKind } from '../types';

/** 图形在画布上的包围盒 */
export interface ShapeBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShapePoint {
  x: number;
  y: number;
}

/** 新建图形时的默认尺寸与样式（不含 id / 坐标 / zIndex） */
export interface ShapeElementDefaults {
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  text?: string;
  fontSize?: number;
  textColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  textVerticalAlign?: 'top' | 'center' | 'bottom';
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  seqLifelineLength?: number;
}

export type ShapeCapabilityMethod =
  | 'drawBody'
  | 'appendPath'
  | 'hitTest'
  | 'getVisualBounds'
  | 'getTextBounds'
  | 'getConnectorAnchorPoint'
  | 'getOutlinePoints'
  | 'createDefaults';

/**
 * 图形运行时能力（绘制、命中、布局等）。
 * 由 editor 或插件在启动时注入，core 框架不依赖 canvas / DOM。
 */
export interface ShapeCapabilities {
  drawBody?: (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    stroke: string,
    strokeWidth: number,
  ) => void;
  appendPath?: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void;
  hitTest?: (
    x: number,
    y: number,
    w: number,
    h: number,
    pt: ShapePoint,
    pad?: number,
  ) => boolean;
  getVisualBounds?: (x: number, y: number, w: number, h: number) => ShapeBox;
  getTextBounds?: (x: number, y: number, w: number, h: number) => ShapeBox;
  getConnectorAnchorPoint?: (
    x: number,
    y: number,
    w: number,
    h: number,
    anchor: string,
  ) => ShapePoint;
  getOutlinePoints?: (x: number, y: number, w: number, h: number) => ShapePoint[];
  createDefaults?: () => ShapeElementDefaults;
}

export interface ShapeLifecycleContext {
  kind: ShapeKind;
}

export interface ShapeLifecycleHooks {
  onRegister?: (ctx: ShapeLifecycleContext) => void;
  onUnregister?: (ctx: ShapeLifecycleContext) => void;
  onEnable?: (ctx: ShapeLifecycleContext) => void;
  onDisable?: (ctx: ShapeLifecycleContext) => void;
  onDestroy?: (ctx: ShapeLifecycleContext) => void;
}

export interface ShapeCategoryDefinition {
  id: string;
  label: string;
  order?: number;
  enabled?: boolean | (() => boolean);
  /** 分类下无图形时是否在列表中隐藏 */
  hideWhenEmpty?: boolean;
  description?: string;
}

/** 图形在某一分类下的展示位置（同一 kind 可出现在多个分类） */
export interface ShapeCatalogEntry {
  kind: ShapeKind;
  categoryId: string;
  order: number;
  /** 工具栏悬浮面板中的快捷图形（通常仅「基础」前 25 项） */
  quickPick?: boolean;
  /** 分类下的展示名称（默认同 ShapeDefinition.label） */
  label?: string;
}

export interface ShapeDefinition {
  kind: ShapeKind;
  label: string;
  /** @deprecated 请使用 catalog 条目；保留以兼容旧注册方式 */
  categoryId?: string;
  order?: number;
  enabled?: boolean | (() => boolean);
  /** @deprecated 请使用 catalog 条目的 quickPick */
  quickPick?: boolean;
  /** 仅描边、不填充 */
  strokeOnly?: boolean;
  /** 等比缩放图形（如圆形、加号） */
  uniformScaled?: boolean;
  capabilities?: ShapeCapabilities;
  hooks?: ShapeLifecycleHooks;
  /** 无 capabilities 时的静态默认（createShapeElement 使用） */
  defaults?: ShapeElementDefaults | (() => ShapeElementDefaults);
}

export interface ListShapeCategoriesOptions {
  enabledOnly?: boolean;
  includeEmpty?: boolean;
}

export interface ListShapesOptions {
  categoryId?: string;
  enabledOnly?: boolean;
  quickPickOnly?: boolean;
  query?: string;
}

export type ShapePreset = Pick<ShapeDefinition, 'kind' | 'label'>;

/** listShapes 返回项：图形定义 + 当前分类下的排序信息 */
export type ShapeListItem = ShapeDefinition & Required<Pick<ShapeCatalogEntry, 'categoryId' | 'order'>>;

export type { ShapeElement, ShapeKind };
