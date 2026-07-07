import type { ChartData, ChartDataSource, ChartSeries } from './types';
import type { FreeTable } from '../model/index';
import { getCellText } from '../types/index';

export class ChartParser {
  static parse(table: FreeTable, dataSource: ChartDataSource): ChartData {
    const range = dataSource.range;
    const { minRow, maxRow, minCol, maxCol } = this.parseRangeString(range);

    const colCount = maxCol - minCol + 1;
    const rowCount = maxRow - minRow + 1;

    // Adjust hasCategories: if only one column, it can't be categories AND data
    const hasCategories = dataSource.hasCategories && colCount > 1;
    const hasHeader = dataSource.hasHeader && rowCount > 1;

    const categories: string[] = [];
    const seriesList: ChartSeries[] = [];

    // Collect categories from first column (or auto-generate)
    const dataStartRow = hasHeader ? minRow + 1 : minRow;
    if (hasCategories) {
      for (let r = dataStartRow; r <= maxRow; r++) {
        const cell = table.getCell(r, minCol);
        categories.push(cell ? getCellText(cell.value) : String(r + 1));
      }
    } else {
      for (let r = dataStartRow; r <= maxRow; r++) {
        categories.push(`项目${r - minRow + 1}`);
      }
    }

    // Collect data series
    const dataStartCol = hasCategories ? minCol + 1 : minCol;

    if (dataStartCol > maxCol) {
      // Single column with no data columns — treat the column as a single data series
      const data: number[] = [];
      for (let r = dataStartRow; r <= maxRow; r++) {
        const cell = table.getCell(r, minCol);
        data.push(cell ? this.cellToNumber(cell.value) : 0);
      }
      seriesList.push({ name: '数值', data });
    } else if (hasHeader) {
      for (let c = dataStartCol; c <= maxCol; c++) {
        const headerCell = table.getCell(minRow, c);
        const seriesName = headerCell ? getCellText(headerCell.value) : `系列${c - minCol + 1}`;
        const data: number[] = [];
        for (let r = minRow + 1; r <= maxRow; r++) {
          const cell = table.getCell(r, c);
          data.push(cell ? this.cellToNumber(cell.value) : 0);
        }
        seriesList.push({ name: seriesName, data });
      }
    } else {
      for (let c = dataStartCol; c <= maxCol; c++) {
        const data: number[] = [];
        for (let r = minRow; r <= maxRow; r++) {
          const cell = table.getCell(r, c);
          data.push(cell ? this.cellToNumber(cell.value) : 0);
        }
        seriesList.push({ name: `系列${c - dataStartCol + 1}`, data });
      }
    }

    return { categories, series: seriesList };
  }

  private static parseRangeString(range: string): { minRow: number; maxRow: number; minCol: number; maxCol: number } {
    const parts = range.split(':');
    const start = this.parseCellRef(parts[0]);
    const end = parts.length > 1 ? this.parseCellRef(parts[1]) : start;
    return {
      minRow: Math.min(start.row, end.row),
      maxRow: Math.max(start.row, end.row),
      minCol: Math.min(start.col, end.col),
      maxCol: Math.max(start.col, end.col),
    };
  }

  private static parseCellRef(ref: string): { row: number; col: number } {
    const match = ref.match(/^([A-Z]+)(\d+)$/);
    if (!match) return { row: 0, col: 0 };
    const colStr = match[1];
    const rowStr = match[2];
    let col = 0;
    for (let i = 0; i < colStr.length; i++) {
      col = col * 26 + (colStr.charCodeAt(i) - 64);
    }
    return { row: parseInt(rowStr, 10) - 1, col: col - 1 };
  }

  private static cellToNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const n = parseFloat(value);
      return isNaN(n) ? 0 : n;
    }
    if (typeof value === 'object' && value !== null) {
      const v = (value as any).value;
      if (typeof v === 'number') return v;
      if (typeof v === 'string') { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
    }
    return 0;
  }

  static rangeToString(minRow: number, maxRow: number, minCol: number, maxCol: number): string {
    const colToLetter = (col: number): string => {
      let result = '';
      let c = col + 1;
      while (c > 0) {
        c--;
        result = String.fromCharCode(65 + (c % 26)) + result;
        c = Math.floor(c / 26);
      }
      return result;
    };
    return `${colToLetter(minCol)}${minRow + 1}:${colToLetter(maxCol)}${maxRow + 1}`;
  }
}
