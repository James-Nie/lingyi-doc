import type { WhiteboardElement } from '@lingyi-doc/core-whiteboard';

export type WhiteboardExportHooks = {
  resolveElementsForExport: (elements: WhiteboardElement[]) => Promise<WhiteboardElement[]>;
  renderElementsToDataUrl: (elements: WhiteboardElement[]) => Promise<string | null>;
};

let hooks: WhiteboardExportHooks | null = null;

/** 由 editor 门面在加载 whiteboard 后注入，避免 editor-doc → whiteboard 硬依赖 */
export function setWhiteboardExportHooks(next: WhiteboardExportHooks): void {
  hooks = next;
}

export function getWhiteboardExportHooks(): WhiteboardExportHooks {
  if (!hooks) {
    throw new Error('[editor-doc] WhiteboardExportHooks 未注册（请先加载 @lingyi-doc/editor 门面）');
  }
  return hooks;
}

export async function resolveWhiteboardElementsForExport(elements: WhiteboardElement[]) {
  return getWhiteboardExportHooks().resolveElementsForExport(elements);
}

export async function renderWhiteboardElementsToDataUrl(elements: WhiteboardElement[]) {
  return getWhiteboardExportHooks().renderElementsToDataUrl(elements);
}
