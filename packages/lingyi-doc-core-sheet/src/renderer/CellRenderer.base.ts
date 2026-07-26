import type { ViewportManager } from './ViewportManager';
import { CellRenderer } from './CellRenderer';

/**
 * BaseSheet (多维表) 特定的渲染方法
 * 目前所有方法已提升至 CellRenderer 基类，此类保留用于类型区分
 */
export class CellRendererBase extends CellRenderer {
  constructor(viewportManager: ViewportManager, options?: import('./CellRenderer').CellRendererOptions) {
    super(viewportManager, options);
  }
}
