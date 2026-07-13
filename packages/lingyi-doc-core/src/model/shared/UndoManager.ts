import type { CellRange } from '../../types/index';
import type { Operation } from '../types';

export class UndoManager {
  private _undoStack: Operation[] = [];
  private _redoStack: Operation[] = [];
  private _maxUndoSteps = 100;
  private _undoBatchStack: Operation[][] = [];

  pushUndo(op: Operation): void {
    if (this._undoBatchStack.length > 0) {
      this._undoBatchStack[this._undoBatchStack.length - 1].push(op);
      return;
    }
    this._undoStack.push(op);
    if (this._undoStack.length > this._maxUndoSteps) {
      this._undoStack.shift();
    }
    this._redoStack = [];
  }

  beginUndoBatch(): void {
    this._undoBatchStack.push([]);
  }

  endUndoBatch(type: string, onNotify: (range: CellRange | null) => void): void {
    const batch = this._undoBatchStack.pop();
    if (!batch || batch.length === 0) return;

    const composite: Operation = {
      type,
      undo: () => {
        for (let i = batch.length - 1; i >= 0; i--) {
          batch[i].undo();
        }
        onNotify(null);
      },
      redo: () => {
        for (const op of batch) {
          op.redo();
        }
        onNotify(null);
      },
    };

    if (this._undoBatchStack.length > 0) {
      this._undoBatchStack[this._undoBatchStack.length - 1].push(composite);
    } else {
      this.pushUndo(composite);
    }
  }

  runBatch(fn: () => void, type: string, onNotify: (range: CellRange | null) => void): void {
    this.beginUndoBatch();
    try {
      fn();
    } finally {
      this.endUndoBatch(type, onNotify);
    }
  }

  undo(): boolean {
    const op = this._undoStack.pop();
    if (!op) return false;
    op.undo();
    this._redoStack.push(op);
    return true;
  }

  redo(): boolean {
    const op = this._redoStack.pop();
    if (!op) return false;
    op.redo();
    this._undoStack.push(op);
    return true;
  }

  get canUndo(): boolean { return this._undoStack.length > 0; }
  get canRedo(): boolean { return this._redoStack.length > 0; }
}
