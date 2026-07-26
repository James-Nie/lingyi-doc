import { CellRange } from '@lingyi-doc/core-types';
import type { ViewportManager } from './ViewportManager';

// ==================== DirtyTracker ====================

interface DirtyRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class DirtyTracker {
  private _dirtyRects: DirtyRect[] = [];
  private _fullRedraw = false;

  markDirty(rect: DirtyRect): void {
    this._dirtyRects.push(rect);
  }

  markDirtyRange(
    range: CellRange,
    columnWidths: Map<number, number>,
    rowHeights: Map<number, number>,
    viewportManager: ViewportManager,
  ): void {
    const topLeft = viewportManager.getCellRect(range.start, columnWidths, rowHeights);
    const bottomRight = viewportManager.getCellRect(range.end, columnWidths, rowHeights);

    this._dirtyRects.push({
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x + bottomRight.width - topLeft.x,
      height: bottomRight.y + bottomRight.height - topLeft.y,
    });
  }

  markFullRedraw(): void {
    this._fullRedraw = true;
    this._dirtyRects = [];
  }

  get dirtyRects(): DirtyRect[] {
    return this._fullRedraw ? [] : this._mergeRects([...this._dirtyRects]);
  }

  get needsFullRedraw(): boolean {
    return this._fullRedraw;
  }

  clear(): void {
    this._dirtyRects = [];
    this._fullRedraw = false;
  }

  private _mergeRects(rects: DirtyRect[]): DirtyRect[] {
    if (rects.length <= 1) return rects;

    // 简单合并：如果两个矩形重叠或相邻，合并为一个
    const merged: DirtyRect[] = [];
    rects.sort((a, b) => a.y - b.y || a.x - b.x);

    for (const rect of rects) {
      const last = merged[merged.length - 1];
      if (last && this._overlaps(last, rect)) {
        const x1 = Math.min(last.x, rect.x);
        const y1 = Math.min(last.y, rect.y);
        const x2 = Math.max(last.x + last.width, rect.x + rect.width);
        const y2 = Math.max(last.y + last.height, rect.y + rect.height);
        last.x = x1;
        last.y = y1;
        last.width = x2 - x1;
        last.height = y2 - y1;
      } else {
        merged.push({ ...rect });
      }
    }
    return merged;
  }

  private _overlaps(a: DirtyRect, b: DirtyRect): boolean {
    return !(
      a.x + a.width < b.x ||
      b.x + b.width < a.x ||
      a.y + a.height < b.y ||
      b.y + b.height < a.y
    );
  }
}
