export interface ActiveCellEditor {
  userId: string;
  displayName: string;
  sheetId: string;
  row: number;
  col: number;
}

export type CellEditingPayload =
  | { action: 'start'; sheetId: string; row: number; col: number }
  | { action: 'end'; sheetId: string; row: number; col: number };

export { cellRefLabel } from '@lingyi-doc/core-types';
