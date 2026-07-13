import { Workbook } from '../model/Workbook';
import { applyDocumentPatch } from '../io/patch/applyOps';
import type { WorkbookPatchOp } from '../io/patch/types';
import { deriveWorkbookDocType } from '../utils/sheetType';

/** 将增量 patch 应用到内存中的 Workbook，返回新实例（不触发原实例 onChange） */
export function applyRemoteWorkbookPatches(
  workbook: Workbook,
  ops: WorkbookPatchOp[],
  _docType?: string,
): Workbook {
  if (ops.length === 0) return workbook;
  const json = workbook.toJSON() as Record<string, unknown>;
  const next = applyDocumentPatch('workbook', json, ops);
  const rebuilt = Workbook.fromJSON(next);
  rebuilt.normalizeAfterLoad(deriveWorkbookDocType(rebuilt.sheets.map(s => s.type)));
  return rebuilt;
}
