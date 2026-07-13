import {
  applyBaseRenderConfig,
  BASE_HEADER_WIDTH,
  type BaseSheetModel,
  type ViewportManager,
} from '@lingyi-doc/core';

/** 渲染/交互前确保多维表 viewport 配置（行头宽、冻结首列）已就绪 */
export function ensureBaseViewportConfig(
  viewport: ViewportManager,
  sheet: BaseSheetModel,
  previewMode: boolean,
): void {
  applyBaseRenderConfig(viewport.config);
  viewport.config.headerWidth = BASE_HEADER_WIDTH;
  if (!previewMode && (sheet.freezeState?.frozenCols ?? 0) < 1) {
    sheet.freezeState = { frozenRows: 0, frozenCols: 1 };
  }
  viewport.setFreezeState(sheet.freezeState || { frozenRows: 0, frozenCols: 0 });
}
