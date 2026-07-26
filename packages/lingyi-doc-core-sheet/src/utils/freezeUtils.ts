import { colToName, type CellCoord, type FreezeState } from '@lingyi-doc/core-types';

export function freezeRowsForCell(row: number): number {
  return row + 1;
}

export function freezeColsForCell(col: number): number {
  return col + 1;
}

export function hasActiveFreeze(freeze: FreezeState): boolean {
  return freeze.frozenRows > 0 || freeze.frozenCols > 0;
}

export function isCellInFrozenRegion(cell: CellCoord, freeze: FreezeState): boolean {
  return cell.row < freeze.frozenRows || cell.col < freeze.frozenCols;
}

export type FreezeMenuAction = 'rows' | 'cols' | 'both' | 'clear';

export interface FreezeMenuItem {
  key: FreezeMenuAction;
  label: string;
  disabled?: boolean;
  danger?: boolean;
}

export function buildFreezeMenuItems(
  cell: CellCoord,
  rowCount: number,
  colCount: number,
  freeze: FreezeState,
): FreezeMenuItem[] {
  if (hasActiveFreeze(freeze) && isCellInFrozenRegion(cell, freeze)) {
    return [{ key: 'clear', label: '取消冻结' }];
  }

  const row = cell.row;
  const col = cell.col;
  const colLabel = colToName(col);
  const isLastRow = row >= rowCount - 1;
  const isLastCol = col >= colCount - 1;

  const rowLabel = row === 0
    ? '冻结首行'
    : `冻结至当前行（1-${row + 1}行）`;

  const colItemLabel = col === 0
    ? '冻结首列'
    : `冻结至当前列（A-${colLabel}列）`;

  const bothLabel = row === 0 && col === 0
    ? '冻结至当前行列（1行A列）'
    : row === 0
      ? `冻结至当前行列（1行${colLabel}列）`
      : col === 0
        ? `冻结至当前行列（${row + 1}行A列）`
        : `冻结至当前行列（${row + 1}行${colLabel}列）`;

  return [
    { key: 'rows', label: rowLabel, disabled: isLastRow },
    { key: 'cols', label: colItemLabel, disabled: isLastCol },
    { key: 'both', label: bothLabel, disabled: isLastRow || isLastCol },
  ];
}

export function applyFreezeAction(
  action: FreezeMenuAction,
  cell: CellCoord,
): FreezeState {
  if (action === 'clear') {
    return { frozenRows: 0, frozenCols: 0 };
  }
  if (action === 'rows') {
    return { frozenRows: freezeRowsForCell(cell.row), frozenCols: 0 };
  }
  if (action === 'cols') {
    return { frozenRows: 0, frozenCols: freezeColsForCell(cell.col) };
  }
  return {
    frozenRows: freezeRowsForCell(cell.row),
    frozenCols: freezeColsForCell(cell.col),
  };
}
