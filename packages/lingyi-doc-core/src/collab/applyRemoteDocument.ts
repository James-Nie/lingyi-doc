import { applyDocumentPatch } from '../io/patch/applyOps';
import type { DocumentPatchKind, DocumentPatchOp } from '../io/patch/types';

/** 将 patch 应用到 JSON 快照，返回新快照 */
export function applyRemoteDocumentPatches(
  kind: DocumentPatchKind,
  snapshot: Record<string, unknown>,
  ops: DocumentPatchOp[],
): Record<string, unknown> {
  if (ops.length === 0) return snapshot;
  return applyDocumentPatch(kind, snapshot, ops);
}
