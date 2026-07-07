import { stableStringify } from './canonical';
import { PATCH_MAX_OPS } from './types';

type ElementJson = Record<string, unknown> & { id: string };

function elementsMap(doc: Record<string, unknown>): Map<string, ElementJson> {
  const map = new Map<string, ElementJson>();
  const list = Array.isArray(doc.elements) ? doc.elements : [];
  for (const raw of list) {
    if (raw && typeof raw === 'object' && typeof (raw as ElementJson).id === 'string') {
      map.set((raw as ElementJson).id, raw as ElementJson);
    }
  }
  return map;
}

function metaOps(before: Record<string, unknown>, after: Record<string, unknown>): import('./types').WhiteboardPatchOp[] {
  const ops: import('./types').WhiteboardPatchOp[] = [];
  const patch: { title?: string; documentId?: string } = {};
  if (before.title !== after.title) patch.title = after.title as string;
  if (before.documentId !== after.documentId) patch.documentId = after.documentId as string;
  if (Object.keys(patch).length > 0) {
    ops.push({ type: 'set_doc_meta', patch });
  }
  return ops;
}

function viewportOp(before: Record<string, unknown>, after: Record<string, unknown>): import('./types').WhiteboardPatchOp[] {
  if (stableStringify(before.viewport) === stableStringify(after.viewport)) return [];
  const viewport = after.viewport as { x: number; y: number; zoom: number };
  return [{ type: 'set_viewport', viewport: { ...viewport } }];
}

function replaceAllOp(after: Record<string, unknown>): import('./types').WhiteboardPatchOp {
  const viewport = (after.viewport ?? { x: 0, y: 0, zoom: 1 }) as { x: number; y: number; zoom: number };
  const elements = Array.isArray(after.elements) ? after.elements : [];
  return {
    type: 'replace_all',
    snapshot: {
      viewport: { ...viewport },
      elements: JSON.parse(JSON.stringify(elements)) as Record<string, unknown>[],
    },
  };
}

export function diffWhiteboard(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): import('./types').WhiteboardPatchOp[] {
  const ops: import('./types').WhiteboardPatchOp[] = [
    ...metaOps(before, after),
    ...viewportOp(before, after),
  ];

  const beforeMap = elementsMap(before);
  const afterMap = elementsMap(after);

  for (const id of beforeMap.keys()) {
    if (!afterMap.has(id)) {
      ops.push({ type: 'remove_element', id });
    }
  }

  for (const [id, element] of afterMap) {
    if (!beforeMap.has(id)) {
      ops.push({
        type: 'add_element',
        element: JSON.parse(JSON.stringify(element)) as Record<string, unknown>,
      });
    }
  }

  for (const [id, afterEl] of afterMap) {
    const beforeEl = beforeMap.get(id);
    if (!beforeEl) continue;
    if (stableStringify(beforeEl) !== stableStringify(afterEl)) {
      ops.push({
        type: 'set_element',
        id,
        element: JSON.parse(JSON.stringify(afterEl)) as Record<string, unknown>,
      });
    }
  }

  const elementOps = ops.filter(op =>
    op.type === 'add_element'
    || op.type === 'remove_element'
    || op.type === 'set_element',
  );

  if (elementOps.length > PATCH_MAX_OPS - 5) {
    return [
      ...metaOps(before, after),
      replaceAllOp(after),
    ];
  }

  return ops;
}

export function whiteboardSnapshotForDiff(doc: Record<string, unknown>): Record<string, unknown> {
  return {
    documentId: doc.documentId ?? '',
    title: doc.title ?? '',
    viewport: doc.viewport ?? { x: 0, y: 0, zoom: 1 },
    elements: Array.isArray(doc.elements) ? doc.elements : [],
  };
}
