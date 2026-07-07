import { FreeTable } from '../model/index';
import type { CellData, CellValue } from '../types/index';
import { getRawValue } from '../types/index';

type CalcValue = number | string | boolean | null;

export class FormulaEngine {
  /** Evaluate a formula string */
  evaluate(formula: string, table: FreeTable, currentRow: number, currentCol: number): CellData {
    const expr = formula.startsWith('=') ? formula.slice(1) : formula;
    
    try {
      const result = this._evaluateExpr(expr.trim(), table, currentRow, currentCol);
      return {
        value: {
          type: 'formula',
          formula,
          cached: typeof result === 'number' ? { type: 'number', value: result, format: { kind: 'general' } }
                : typeof result === 'boolean' ? { type: 'boolean', value: result }
                : { type: 'text', text: String(result ?? '') },
        },
      };
    } catch (e) {
      return { value: { type: 'error', error: '#ERROR!' } };
    }
  }

  private _evaluateExpr(expr: string, table: FreeTable, row: number, col: number): CalcValue {
    // Handle function calls
    const funcMatch = expr.match(/^(\w+)\((.*)\)$/s);
    if (funcMatch) {
      return this._evalFunction(funcMatch[1].toUpperCase(), funcMatch[2], table, row, col);
    }

    // Handle basic arithmetic
    // Simple number
    if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);

    // String literal
    if (expr.startsWith('"') && expr.endsWith('"')) {
      return expr.slice(1, -1);
    }

    // Boolean
    if (expr === 'TRUE') return true;
    if (expr === 'FALSE') return false;

    // Cell reference (like A1)
    const cellRef = expr.match(/^([A-Z]+)(\d+)$/);
    if (cellRef) {
      const c = this._colToNum(cellRef[1]);
      const r = parseInt(cellRef[2]) - 1;
      const cell = table.getCell(r, c);
      if (cell?.value.type === 'formula') return `#CYCLE!`;
      return cell ? getRawValue(cell.value) : null;
    }

    // Simple range (e.g. SUM range handling)
    const rangeMatch = expr.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (rangeMatch) {
      return null;
    }

    return expr;
  }

  private _evalFunction(name: string, args: string, table: FreeTable, row: number, col: number): CalcValue {
    const parsed = this._parseArgs(args, table, row, col);

    switch (name) {
      case 'SUM': return this._sum(parsed.flat(Infinity) as CalcValue[]);
      case 'AVERAGE': return this._average(parsed.flat(Infinity) as CalcValue[]);
      case 'COUNT': return this._count(parsed.flat(Infinity) as CalcValue[]);
      case 'MAX': return this._max(parsed.flat(Infinity) as CalcValue[]);
      case 'MIN': return this._min(parsed.flat(Infinity) as CalcValue[]);
      case 'ABS': return Math.abs(Number(parsed[0]) || 0);
      case 'ROUND': return Math.round(Number(parsed[0]) || 0);
      case 'IF': return this._if(parsed, table, row, col);
      case 'CONCAT': return parsed.map(p => String(p ?? '')).join('');
      case 'LEN': return String(parsed[0] ?? '').length;
      case 'UPPER': return String(parsed[0] ?? '').toUpperCase();
      case 'LOWER': return String(parsed[0] ?? '').toLowerCase();
      case 'TRIM': return String(parsed[0] ?? '').trim();
      case 'TODAY': return new Date().toISOString().split('T')[0];
      case 'NOW': return new Date().toISOString();
      case 'COUNTIF': return this._countIf(parsed, table);
      case 'SUMIF': return this._sumIf(parsed, table);
      default:
        // Simple math: try eval on numbers only
        return this._safeMath(parsed);
    }
  }

  private _parseArgs(argsStr: string, table: FreeTable, row: number, col: number): CalcValue[][] {
    const args: CalcValue[][] = [];
    let depth = 0;
    let current = '';
    const parts: string[] = [];

    for (let i = 0; i < argsStr.length; i++) {
      const ch = argsStr[i];
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current.trim());

    for (const part of parts) {
      // Check if this is a range
      const rangeMatch = part.trim().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
      if (rangeMatch) {
        args.push(this._getRangeValues(rangeMatch, table) as CalcValue[]);
      } else {
        args.push([this._evaluateExpr(part.trim(), table, row, col)]);
      }
    }

    return args;
  }

  private _getRangeValues(match: RegExpMatchArray, table: FreeTable): CalcValue[] {
    const c1 = this._colToNum(match[1]);
    const r1 = parseInt(match[2]) - 1;
    const c2 = this._colToNum(match[3]);
    const r2 = parseInt(match[4]) - 1;
    const values: CalcValue[] = [];
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
      for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
        const cell = table.getCell(r, c);
        const val = cell ? getRawValue(cell.value) : null;
        if (typeof val === 'number') values.push(val);
        else if (val !== null && val !== undefined && val !== '') {
          const n = Number(val);
          if (!isNaN(n)) values.push(n);
        }
      }
    }
    return values;
  }

  private _sum(values: CalcValue[]): number {
    return values.reduce<number>((sum, v) => sum + (typeof v === 'number' ? v : Number(v) || 0), 0);
  }
  private _average(values: CalcValue[]): number {
    const nums = values.filter(v => typeof v === 'number' || !isNaN(Number(v)));
    if (nums.length === 0) return 0;
    return this._sum(nums) / nums.length;
  }
  private _count(values: CalcValue[]): number {
    return values.filter(v => v !== null && v !== undefined && v !== '').length;
  }
  private _max(values: CalcValue[]): number {
    const nums = values.filter(v => typeof v === 'number' || !isNaN(Number(v))).map(Number);
    return nums.length ? Math.max(...nums) : 0;
  }
  private _min(values: CalcValue[]): number {
    const nums = values.filter(v => typeof v === 'number' || !isNaN(Number(v))).map(Number);
    return nums.length ? Math.min(...nums) : 0;
  }
  private _if(parsed: CalcValue[][], table: FreeTable, row: number, col: number): CalcValue {
    const condition = parsed[0]?.[0];
    const trueVal = parsed[1]?.[0];
    const falseVal = parsed[2]?.[0];
    return condition ? trueVal : falseVal;
  }
  private _countIf(parsed: CalcValue[][], table: FreeTable): number {
    // Simplified
    return 0;
  }
  private _sumIf(parsed: CalcValue[][], table: FreeTable): number {
    // Simplified
    return 0;
  }
  private _safeMath(parsed: CalcValue[][]): number {
    return Number(parsed[0]?.[0]) || 0;
  }

  private _colToNum(col: string): number {
    let n = 0;
    for (let i = 0; i < col.length; i++) n = n * 26 + (col.charCodeAt(i) - 64);
    return n - 1;
  }
}
