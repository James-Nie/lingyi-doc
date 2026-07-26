import { ensureShapeCatalog } from '@lingyi-doc/core-whiteboard';
import { registerBuiltinShapeCapabilities } from './builtinCapabilities';

let initialized = false;

/** 初始化图形可插拔框架：core 目录 + editor 渲染能力 */
export function initShapeRegistry(): void {
  if (initialized) return;
  ensureShapeCatalog();
  registerBuiltinShapeCapabilities();
  initialized = true;
}

initShapeRegistry();
