import type { BaseSheetModel, FreeformSheetModel, SheetModel } from './index';

export function isBaseSheet(sheet: SheetModel): sheet is BaseSheetModel {
  return sheet.type === 'base';
}

export function isFreeformSheet(sheet: SheetModel): sheet is FreeformSheetModel {
  return sheet.type === 'freeform';
}

export function assertBaseSheet(sheet: SheetModel): asserts sheet is BaseSheetModel {
  if (!isBaseSheet(sheet)) {
    throw new Error('Expected base sheet');
  }
}

export function assertFreeformSheet(sheet: SheetModel): asserts sheet is FreeformSheetModel {
  if (!isFreeformSheet(sheet)) {
    throw new Error('Expected freeform sheet');
  }
}
