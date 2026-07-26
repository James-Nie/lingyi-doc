import { CellData, CellCoord, CellRange } from '@lingyi-doc/core-types';
import { resolveColumnWidth } from '../utils/columnLayout';
import { resolveRowHeight } from '../utils/rowLayout';
import type { ViewportManager } from './ViewportManager';
import type { RenderConfig, VisibleRange } from './types';
import { CellRenderer } from './CellRenderer';

/**
 * FreeformSheet (普通表格) 特定的渲染方法
 * 这些方法仅在普通表格模式下使用
 */
export class CellRendererFreeform extends CellRenderer {
  constructor(viewportManager: ViewportManager, options?: import('./CellRenderer').CellRendererOptions) {
    super(viewportManager, options);
  }
}
