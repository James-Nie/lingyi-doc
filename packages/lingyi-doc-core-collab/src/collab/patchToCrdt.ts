import type { DocumentPatchKind, DocumentPatchOp } from '@lingyi-doc/core-io';
import type { WorkbookPatchOp } from '@lingyi-doc/core-io';
import type { CrdtOperation } from './index';
import { HybridLogicalClock } from './HybridLogicalClock';

const PATCH_TARGET_PREFIX: Record<DocumentPatchKind, string> = {
  workbook: 'workbook/patch:',
  richtext: 'richtext/patch:',
  whiteboard: 'whiteboard/patch:',
  mindnote: 'mindnote/patch:',
};

export function documentPatchToCrdt(
  kind: DocumentPatchKind,
  op: DocumentPatchOp,
  clock: HybridLogicalClock,
  dependencies: string[] = [],
): CrdtOperation {
  return {
    opId: clock.next(),
    type: 'set',
    target: `${PATCH_TARGET_PREFIX[kind]}${op.type}`,
    value: op,
    clock: Date.now(),
    dependencies,
  };
}

export function documentPatchesToCrdt(
  kind: DocumentPatchKind,
  ops: DocumentPatchOp[],
  clock: HybridLogicalClock,
): CrdtOperation[] {
  const result: CrdtOperation[] = [];
  // 只依赖前一条，避免全链路 dependencies 导致 O(n²) 拷贝与 JSON 膨胀
  let prevOpId: string | undefined;
  for (const op of ops) {
    const deps = prevOpId ? [prevOpId] : [];
    const crdt = documentPatchToCrdt(kind, op, clock, deps);
    result.push(crdt);
    prevOpId = crdt.opId;
  }
  return result;
}

export function crdtToDocumentPatch(kind: DocumentPatchKind, op: CrdtOperation): DocumentPatchOp | null {
  const prefix = PATCH_TARGET_PREFIX[kind];
  if (op.type !== 'set' || !op.target.startsWith(prefix)) return null;
  const value = op.value;
  if (!value || typeof value !== 'object' || !('type' in value)) return null;
  return value as DocumentPatchOp;
}

/** @deprecated 使用 documentPatchToCrdt('workbook', ...) */
export function workbookPatchToCrdt(
  op: WorkbookPatchOp,
  clock: HybridLogicalClock,
  dependencies: string[] = [],
): CrdtOperation {
  return documentPatchToCrdt('workbook', op, clock, dependencies);
}

export function workbookPatchesToCrdt(
  ops: WorkbookPatchOp[],
  clock: HybridLogicalClock,
): CrdtOperation[] {
  return documentPatchesToCrdt('workbook', ops, clock);
}

export function crdtToWorkbookPatch(op: CrdtOperation): WorkbookPatchOp | null {
  return crdtToDocumentPatch('workbook', op) as WorkbookPatchOp | null;
}
