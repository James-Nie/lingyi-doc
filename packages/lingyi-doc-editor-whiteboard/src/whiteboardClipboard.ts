import type { WhiteboardElement } from '@lingyi-doc/core-whiteboard';
import { cloneWhiteboardElement } from '@lingyi-doc/core-whiteboard';
import { renderSelectionToPngBlob } from './copySelectionImage';

/** 画板内部剪贴板 MIME：本系统粘贴时还原为可编辑图形 */
export const WHITEBOARD_CLIPBOARD_MIME = 'application/x-lingyi-whiteboard+json';

const CLIPBOARD_VERSION = 1;

export interface WhiteboardClipboardPayload {
  version: number;
  elements: WhiteboardElement[];
}

export function serializeWhiteboardClipboard(elements: WhiteboardElement[]): string {
  const payload: WhiteboardClipboardPayload = {
    version: CLIPBOARD_VERSION,
    elements: elements.map(cloneWhiteboardElement),
  };
  return JSON.stringify(payload);
}

export function parseWhiteboardClipboard(raw: string): WhiteboardElement[] | null {
  try {
    const data = JSON.parse(raw) as Partial<WhiteboardClipboardPayload>;
    if (!data || data.version !== CLIPBOARD_VERSION || !Array.isArray(data.elements)) return null;
    if (!data.elements.length) return null;
    return data.elements.map(cloneWhiteboardElement);
  } catch {
    return null;
  }
}

function isWhiteboardClipboardType(type: string): boolean {
  return type === WHITEBOARD_CLIPBOARD_MIME || type.includes('lingyi-whiteboard');
}

export function readWhiteboardClipboardFromDataTransfer(dt: DataTransfer): WhiteboardElement[] | null {
  for (const type of dt.types) {
    if (!isWhiteboardClipboardType(type)) continue;
    const raw = dt.getData(type);
    const parsed = parseWhiteboardClipboard(raw);
    if (parsed) return parsed;
  }
  return null;
}

export async function readWhiteboardClipboardFromSystem(): Promise<WhiteboardElement[] | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.read) return null;
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const customType = item.types.find(isWhiteboardClipboardType);
      if (!customType) continue;
      const blob = await item.getType(customType);
      const raw = await blob.text();
      const parsed = parseWhiteboardClipboard(raw);
      if (parsed) return parsed;
    }
  } catch {
    // 权限或环境不支持
  }
  return null;
}

/** 复制到系统剪贴板：自定义 JSON（本系统）+ PNG（外部应用） */
export async function writeWhiteboardClipboard(
  allElements: WhiteboardElement[],
  ids: string[],
): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.write) return false;

  const idSet = new Set(ids);
  const selected = allElements
    .filter(el => idSet.has(el.id))
    .map(el => cloneWhiteboardElement(el));
  if (!selected.length) return false;

  const json = serializeWhiteboardClipboard(selected);
  const items: Record<string, Blob> = {
    [WHITEBOARD_CLIPBOARD_MIME]: new Blob([json], { type: WHITEBOARD_CLIPBOARD_MIME }),
  };

  const pngBlob = await renderSelectionToPngBlob(allElements, ids);
  if (pngBlob) {
    items['image/png'] = pngBlob;
  }

  await navigator.clipboard.write([new ClipboardItem(items)]);
  return true;
}
