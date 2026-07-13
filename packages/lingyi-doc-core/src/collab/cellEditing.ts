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

export function cellRefLabel(row: number, col: number): string {
  let label = '';
  let c = col;
  while (c >= 0) {
    label = String.fromCharCode(65 + (c % 26)) + label;
    c = Math.floor(c / 26) - 1;
  }
  return `${label}${row + 1}`;
}
