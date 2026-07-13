export * from './types';
export * from './constants';
export * from './categories';
export * from './registry';
export * from './builtin';

import { getShapeRegistry } from './registry';
import { registerBuiltinShapeCatalog } from './builtin';

/** 确保内置图形目录已注册（幂等） */
export function ensureShapeCatalog(): ReturnType<typeof getShapeRegistry> {
  registerBuiltinShapeCatalog();
  return getShapeRegistry();
}

export { getShapeRegistry } from './registry';
