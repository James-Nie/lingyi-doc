import type { CellCoord, CellRange } from '@lingyi-doc/core-types';
import { coordToKey } from '@lingyi-doc/core-types';

export class SelectionManager {
  private _anchorCell: CellCoord | null = null;
  private _activeCell: CellCoord | null = null;
  private _discreteCells: CellCoord[] = [];
  private _sheetId: string;

  constructor(sheetId: string) {
    this._sheetId = sheetId;
  }

  get selection(): CellRange | null {
    if (!this._anchorCell || !this._activeCell) return null;
    return {
      sheetId: this._sheetId,
      start: {
        row: Math.min(this._anchorCell.row, this._activeCell.row),
        col: Math.min(this._anchorCell.col, this._activeCell.col),
      },
      end: {
        row: Math.max(this._anchorCell.row, this._activeCell.row),
        col: Math.max(this._anchorCell.col, this._activeCell.col),
      },
    };
  }

  get discreteCells(): ReadonlyArray<CellCoord> {
    return this._discreteCells;
  }

  private _cellKey(coord: CellCoord): string {
    return coordToKey(coord);
  }

  clearDiscreteCells(): void {
    this._discreteCells = [];
  }

  private _toggleDiscreteCell(coord: CellCoord): void {
    const key = this._cellKey(coord);
    const idx = this._discreteCells.findIndex(c => this._cellKey(c) === key);
    if (idx >= 0) {
      this._discreteCells.splice(idx, 1);
    } else {
      this._discreteCells.push({ ...coord });
    }
  }

  /** Command/Ctrl + 点击：切换离散多选 */
  toggleDiscreteSelection(coord: CellCoord): CellCoord[] {
    if (this._discreteCells.length === 0 && this._activeCell) {
      const active = this._activeCell;
      if (this._cellKey(active) !== this._cellKey(coord)) {
        this._discreteCells.push({ ...active });
      }
    }
    this._toggleDiscreteCell(coord);
    this._activeCell = { ...coord };
    if (this._discreteCells.length > 0) {
      this._anchorCell = { ...this._discreteCells[0] };
    }
    return [...this._discreteCells];
  }

  startSelection(coord: CellCoord): CellRange {
    this.clearDiscreteCells();
    this._anchorCell = coord;
    this._activeCell = coord;
    return this.selection!;
  }

  extendSelection(coord: CellCoord): CellRange {
    this.clearDiscreteCells();
    if (!this._anchorCell) {
      this._anchorCell = coord;
    }
    this._activeCell = coord;
    return this.selection!;
  }

  endSelection(): CellRange | null {
    const sel = this.selection;
    // Don't clear — keep for rendering
    return sel;
  }

  moveActiveCell(direction: 'up' | 'down' | 'left' | 'right', rowCount: number, colCount: number): CellCoord | null {
    if (!this._activeCell) return null;
    this.clearDiscreteCells();
    switch (direction) {
      case 'up':    this._activeCell = { row: Math.max(0, this._activeCell.row - 1), col: this._activeCell.col }; break;
      case 'down':  this._activeCell = { row: Math.min(rowCount - 1, this._activeCell.row + 1), col: this._activeCell.col }; break;
      case 'left':  this._activeCell = { row: this._activeCell.row, col: Math.max(0, this._activeCell.col - 1) }; break;
      case 'right': this._activeCell = { row: this._activeCell.row, col: Math.min(colCount - 1, this._activeCell.col + 1) }; break;
    }
    this._anchorCell = this._activeCell;
    return this._activeCell;
  }

  get activeCell(): CellCoord | null { return this._activeCell; }
  get anchorCell(): CellCoord | null { return this._anchorCell; }

  setActiveCell(coord: CellCoord): void {
    this.clearDiscreteCells();
    this._activeCell = coord;
    this._anchorCell = coord;
  }

  clear(): void {
    this._anchorCell = null;
    this._activeCell = null;
    this._discreteCells = [];
  }
}
