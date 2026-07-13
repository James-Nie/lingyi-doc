import type { ActiveSheetType, SheetType } from '../types/index';

/**
 * 将任意 sheet 类型归一化为活跃类型。
 * `standard` 与 `freeform` 等价，统一为 `freeform`。
 */
export function normalizeSheetType(type?: string | null): ActiveSheetType {
  return type === 'base' ? 'base' : 'freeform';
}

/** 文档级 docType 归一化（与 sheet 类型规则一致） */
export function normalizeDocType(type?: string | null): ActiveSheetType {
  return normalizeSheetType(type);
}

/** 根据工作簿内 sheet 类型推导文档 docType（混合工作簿统一为 freeform，避免加载时误升级普通表） */
export function deriveWorkbookDocType(sheetTypes: Iterable<string | null | undefined>): ActiveSheetType {
  const types = [...sheetTypes].map(t => normalizeSheetType(t));
  if (types.length > 0 && types.every(t => t === 'base')) return 'base';
  return 'freeform';
}

export function isLegacyStandardType(type?: string | null): type is Extract<SheetType, 'standard'> {
  return type === 'standard';
}

export type { ActiveSheetType };
