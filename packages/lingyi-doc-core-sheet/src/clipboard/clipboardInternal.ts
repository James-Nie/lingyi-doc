import type { CellData, SelectOption } from '@lingyi-doc/core-types';
import type { ClipboardPasteMerge } from './externalClipboard';

export const SHEET_CLIPBOARD_MIME = 'application/x-lingyi-sheet';

export interface ClipboardCellValidation {
  type: 'dropdownList' | 'date';
  mode?: 'single' | 'multi';
  showOptionColor?: boolean;
  options?: SelectOption[];
  includeTime?: boolean;
  allowReminder?: boolean;
}

export interface ClipboardCellMeta {
  validation?: ClipboardCellValidation;
}

export interface SheetClipboardPayload {
  version: 1;
  cells: [string, CellData][];
  rows: number;
  cols: number;
  merges: ClipboardPasteMerge[];
  meta?: [string, ClipboardCellMeta][];
}

export function serializeSheetClipboard(payload: SheetClipboardPayload): string {
  return JSON.stringify(payload);
}

export function deserializeSheetClipboard(raw: string): SheetClipboardPayload | null {
  try {
    const parsed = JSON.parse(raw) as SheetClipboardPayload;
    if (parsed?.version !== 1 || !Array.isArray(parsed.cells)) return null;
    if (typeof parsed.rows !== 'number' || typeof parsed.cols !== 'number') return null;
    if (!Array.isArray(parsed.merges)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readInternalFromDataTransfer(dt: DataTransfer): SheetClipboardPayload | null {
  try {
    const raw = dt.getData(SHEET_CLIPBOARD_MIME);
    if (raw) return deserializeSheetClipboard(raw);
  } catch {
    // ignore
  }
  return null;
}

/** 从 paste 事件的 DataTransfer 同步读取内部剪贴板 */
export function parseSheetClipboardInternal(dt: DataTransfer | null | undefined): SheetClipboardPayload | null {
  if (!dt) return null;
  return readInternalFromDataTransfer(dt);
}

/** 异步读取系统剪贴板中的内部格式 */
export async function readSheetClipboardInternalAsync(
  dt?: DataTransfer | null,
): Promise<SheetClipboardPayload | null> {
  const fromEvent = dt ? readInternalFromDataTransfer(dt) : null;
  if (fromEvent) return fromEvent;

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (!item.types.includes(SHEET_CLIPBOARD_MIME)) continue;
        const blob = await item.getType(SHEET_CLIPBOARD_MIME);
        const raw = await blob.text();
        const payload = deserializeSheetClipboard(raw);
        if (payload) return payload;
      }
    }
  } catch {
    // 权限或环境不支持
  }

  return null;
}
