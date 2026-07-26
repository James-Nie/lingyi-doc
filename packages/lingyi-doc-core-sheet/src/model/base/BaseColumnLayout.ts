import type { BaseSheetModel } from '@lingyi-doc/core-types';

export function syncBaseColumnLayout(sheet: BaseSheetModel): void {
  const defs = sheet.columnDefs;
  if (defs.length === 0) return;
  sheet.colCount = defs.length;
  for (let i = 0; i < defs.length; i++) {
    if (!sheet.columnWidths.has(i)) {
      sheet.columnWidths.set(i, defs[i].width || 120);
    }
  }
  for (const col of sheet.columnWidths.keys()) {
    if (col >= defs.length) sheet.columnWidths.delete(col);
  }
  applyBaseColumnVisibility(sheet);
}

export function applyBaseColumnVisibility(sheet: BaseSheetModel): void {
  const defs = sheet.columnDefs;
  for (let i = 0; i < defs.length; i++) {
    if (defs[i].hidden) {
      sheet.columnWidths.set(i, 0);
    } else if (sheet.columnWidths.get(i) === 0) {
      sheet.columnWidths.set(i, defs[i].width || 120);
    }
  }
}
