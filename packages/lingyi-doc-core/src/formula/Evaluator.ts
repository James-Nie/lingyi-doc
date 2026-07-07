// ============================================================
// 公式 Evaluator（AST 遍历求值器）
// 遍历 AST 求值，同时收集依赖引用信息
// ============================================================

import type {
  AstNode, NumberLiteralNode, StringLiteralNode, BooleanLiteralNode,
  CellRefNode, RangeRefNode, BinaryOpNode, UnaryOpNode,
  FunctionCallNode, ErrorNode,
} from './Parser';
import { toKey } from './DependencyGraph';

// ─── Helper Types ───────────────────────────────────────────

export type EvalValue = number | string | boolean | null | EvalValue[];

export interface EvalResult {
  value: EvalValue;
  error?: string;
  /** Cell keys that this formula depends on (for dependency graph) */
  dependencies: string[];
}

/** Interface that the table must provide to the evaluator */
export interface EvalContext {
  getCellRaw(row: number, col: number): EvalValue | null;
  getCellIsFormula(row: number, col: number): boolean;
  currentRow: number;
  currentCol: number;
}

// ─── Evaluator ──────────────────────────────────────────────

export class Evaluator {
  private _deps: string[] = [];

  evaluate(node: AstNode, context: EvalContext): EvalResult {
    this._deps = [];
    try {
      const value = this._eval(node, context);
      return { value, dependencies: [...new Set(this._deps)] };
    } catch (e: any) {
      return { value: null, error: e.message || '#ERROR!', dependencies: this._deps };
    }
  }

  private _eval(node: AstNode, ctx: EvalContext): EvalValue {
    switch (node.type) {
      case 'number':  return (node as NumberLiteralNode).value;
      case 'string':  return (node as StringLiteralNode).value;
      case 'boolean': return (node as BooleanLiteralNode).value;
      case 'cellRef': return this._evalCellRef(node as CellRefNode, ctx);
      case 'rangeRef': return this._evalRangeRef(node as RangeRefNode, ctx);
      case 'binaryOp': return this._evalBinaryOp(node as BinaryOpNode, ctx);
      case 'unaryOp': return this._evalUnaryOp(node as UnaryOpNode, ctx);
      case 'functionCall': return this._evalFunction(node as FunctionCallNode, ctx);
      case 'error': return (node as ErrorNode).error;
      default: throw new Error('#VALUE!');
    }
  }

  // ─── Cell Reference ───────────────────────────────────────

  private _evalCellRef(node: CellRefNode, ctx: EvalContext): EvalValue {
    const depKey = toKey(node.row, node.col);
    this._deps.push(depKey);

    // Check for self-reference (formula cell referencing itself)
    if (node.row === ctx.currentRow && node.col === ctx.currentCol) {
      throw new Error('#CYCLE!');
    }

    // Check if the referenced cell is itself a formula (potential cycle)
    if (ctx.getCellIsFormula(node.row, node.col)) {
      // We can't detect deep cycles in the evaluator alone — the recalc engine handles this
      // Just get the value and let the recalc engine worry about ordering
    }

    const raw = ctx.getCellRaw(node.row, node.col);
    return raw;
  }

  // ─── Range Reference ──────────────────────────────────────

  private _evalRangeRef(node: RangeRefNode, ctx: EvalContext): EvalValue {
    const startRow = Math.min(node.start.row, node.end.row);
    const endRow = Math.max(node.start.row, node.end.row);
    const startCol = Math.min(node.start.col, node.end.col);
    const endCol = Math.max(node.start.col, node.end.col);

    const values: EvalValue[] = [];
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const key = toKey(r, c);
        this._deps.push(key);
        const raw = ctx.getCellRaw(r, c);
        if (raw !== null && raw !== undefined) {
          values.push(raw);
        }
      }
    }
    return values;
  }

  // ─── Operators ────────────────────────────────────────────

  private _evalBinaryOp(node: BinaryOpNode, ctx: EvalContext): EvalValue {
    const left = this._eval(node.left, ctx);
    const right = this._eval(node.right, ctx);
    const op = node.operator;

    switch (op) {
      case '+': return this._toNum(left) + this._toNum(right);
      case '-': return this._toNum(left) - this._toNum(right);
      case '*': return this._toNum(left) * this._toNum(right);
      case '/': {
        const divisor = this._toNum(right);
        if (divisor === 0) throw new Error('#DIV/0!');
        return this._toNum(left) / divisor;
      }
      case '^': return Math.pow(this._toNum(left), this._toNum(right));
      case '&': return String(Array.isArray(left) ? (left[0] ?? '') : (left ?? '')) + String(Array.isArray(right) ? (right[0] ?? '') : (right ?? ''));

      // Comparison
      case '=':  return this._compare(left, right) === 0;
      case '<>': return this._compare(left, right) !== 0;
      case '<':  return this._compare(left, right) < 0;
      case '>':  return this._compare(left, right) > 0;
      case '<=': return this._compare(left, right) <= 0;
      case '>=': return this._compare(left, right) >= 0;

      default: throw new Error('#VALUE!');
    }
  }

  private _evalUnaryOp(node: UnaryOpNode, ctx: EvalContext): EvalValue {
    const operand = this._eval(node.operand, ctx);
    switch (node.operator) {
      case '+': return +this._toNum(operand);
      case '-': return -this._toNum(operand);
      default: throw new Error('#VALUE!');
    }
  }

  // ─── Functions ────────────────────────────────────────────

  private _evalFunction(node: FunctionCallNode, ctx: EvalContext): EvalValue {
    const args = node.arguments.map(arg => this._eval(arg, ctx));

    switch (node.name) {
      // ── Math ──
      case 'SUM': return this._fnSum(args);
      case 'AVERAGE': return this._fnAverage(args);
      case 'COUNT': return this._fnCount(args);
      case 'COUNTA': return this._fnCountA(args);
      case 'MAX': return this._fnMax(args);
      case 'MIN': return this._fnMin(args);
      case 'ABS': return Math.abs(this._toNum(args[0]));
      case 'ROUND': {
        const ndigits = args.length > 1 ? Math.round(this._toNum(args[1])) : 0;
        const factor = Math.pow(10, ndigits);
        return Math.round(this._toNum(args[0]) * factor) / factor;
      }
      case 'ROUNDUP': {
        const nd = args.length > 1 ? Math.round(this._toNum(args[1])) : 0;
        const f = Math.pow(10, nd);
        return Math.ceil(this._toNum(args[0]) * f) / f;
      }
      case 'ROUNDDOWN': {
        const nd = args.length > 1 ? Math.round(this._toNum(args[1])) : 0;
        const f = Math.pow(10, nd);
        return Math.floor(this._toNum(args[0]) * f) / f;
      }
      case 'INT': return Math.floor(this._toNum(args[0]));
      case 'MOD': return this._fnMod(args[0], args[1]);
      case 'POWER': return Math.pow(this._toNum(args[0]), this._toNum(args[1]));
      case 'SQRT': {
        const v = this._toNum(args[0]);
        if (v < 0) throw new Error('#NUM!');
        return Math.sqrt(v);
      }
      case 'PI': return Math.PI;
      case 'RAND': return Math.random();
      case 'RANDBETWEEN': return Math.floor(Math.random() * (this._toNum(args[1]) - this._toNum(args[0]) + 1)) + this._toNum(args[0]);

      // ── Statistical ──
      case 'MEDIAN': return this._fnMedian(args);
      case 'MODE': return this._fnMode(args);

      // ── Logic ──
      case 'IF': return this._fnIf(args, ctx);
      case 'AND': return args.every(a => !!a);
      case 'OR': return args.some(a => !!a);
      case 'NOT': return !args[0];
      case 'IFERROR': {
        const v = args[0];
        if (typeof v === 'string' && v.startsWith('#')) return args[1] ?? '';
        return v;
      }
      case 'IFNA': {
        return args[0] === '#N/A' ? (args[1] ?? '') : args[0];
      }
      case 'ISNUMBER': return typeof args[0] === 'number';
      case 'ISTEXT': return typeof args[0] === 'string';
      case 'ISBLANK': return args[0] === null || args[0] === undefined || args[0] === '';
      case 'ISERROR': return typeof args[0] === 'string' && (args[0] as string).startsWith('#');

      // ── Text ──
      case 'CONCAT':
      case 'CONCATENATE': return args.map(a => String(a ?? '')).join('');
      case 'LEN': return String(args[0] ?? '').length;
      case 'UPPER': return String(args[0] ?? '').toUpperCase();
      case 'LOWER': return String(args[0] ?? '').toLowerCase();
      case 'TRIM': return String(args[0] ?? '').trim();
      case 'LEFT':   return String(args[0] ?? '').slice(0, this._toNum(args[1] ?? 1));
      case 'RIGHT': {
        const s = String(args[0] ?? '');
        const n = this._toNum(args[1] ?? 1);
        return s.slice(-n);
      }
      case 'MID': {
        const s = String(args[0] ?? '');
        const start = this._toNum(args[1] ?? 1) - 1;
        const len = this._toNum(args[2] ?? 1);
        return s.slice(start, start + len);
      }
      case 'REPLACE': {
        const s = String(args[0] ?? '');
        const start = this._toNum(args[1] ?? 1) - 1;
        const len = this._toNum(args[2] ?? 0);
        const replacement = String(args[3] ?? '');
        return s.slice(0, start) + replacement + s.slice(start + len);
      }
      case 'SUBSTITUTE': {
        const text = String(args[0] ?? '');
        const oldText = String(args[1] ?? '');
        const newText = String(args[2] ?? '');
        const instance = args.length > 3 ? this._toNum(args[3]) : undefined;
        if (instance !== undefined) {
          let cnt = 0;
          return text.replace(new RegExp(oldText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), (m) => {
            cnt++;
            return cnt === instance ? newText : m;
          });
        }
        return text.split(oldText).join(newText);
      }
      case 'TEXT': {
        const v = args[0];
        const fmt = String(args[1] ?? '');
        // Simple formatting
        if (typeof v === 'number') {
          return v.toLocaleString();
        }
        return String(v ?? '');
      }
      case 'VALUE': {
        const n = Number(args[0]);
        return isNaN(n) ? 0 : n;
      }
      case 'REPT': {
        const s = String(args[0] ?? '');
        const n = Math.max(0, Math.floor(this._toNum(args[1] ?? 1)));
        return s.repeat(n);
      }
      case 'FIND': {
        const find = String(args[0] ?? '');
        const within = String(args[1] ?? '');
        const start = this._toNum(args[2] ?? 1);
        const idx = within.indexOf(find, start - 1);
        return idx === -1 ? ('#VALUE!' as any) : idx + 1;
      }

      // ── Date/Time ──
      case 'TODAY': return this._today();
      case 'NOW': return new Date().toISOString();
      case 'YEAR':  return new Date(String(args[0])).getFullYear();
      case 'MONTH': return new Date(String(args[0])).getMonth() + 1;
      case 'DAY':   return new Date(String(args[0])).getDate();
      case 'HOUR':  return new Date(String(args[0])).getHours();
      case 'MINUTE':return new Date(String(args[0])).getMinutes();
      case 'SECOND':return new Date(String(args[0])).getSeconds();

      // ── Lookup ──
      case 'VLOOKUP': return this._fnVLookup(args, ctx);
      case 'HLOOKUP': return this._fnHLookup(args, ctx);
      case 'INDEX':   return this._fnIndex(args, ctx);
      case 'MATCH':   return this._fnMatch(args, ctx);

      // ── Conditional Aggregation ──
      case 'COUNTIF': return this._fnCountIf(args, ctx);
      case 'SUMIF':   return this._fnSumIf(args, ctx);
      case 'AVERAGEIF': return this._fnAverageIf(args, ctx);

      default: throw new Error(`#NAME?`);
    }
  }

  // ─── Function Implementations ─────────────────────────────

  private _fnSum(args: EvalValue[]): number {
    return this._flattenNumbers(args).reduce((s, v) => s + v, 0);
  }

  private _fnAverage(args: EvalValue[]): number {
    const nums = this._flattenNumbers(args);
    if (nums.length === 0) throw new Error('#DIV/0!');
    return nums.reduce((s, v) => s + v, 0) / nums.length;
  }

  private _fnCount(args: EvalValue[]): number {
    return this._flattenAll(args).filter(v => typeof v === 'number').length;
  }

  private _fnCountA(args: EvalValue[]): number {
    return this._flattenAll(args).filter(v => v !== null && v !== undefined && v !== '').length;
  }

  private _fnMax(args: EvalValue[]): number {
    const nums = this._flattenNumbers(args);
    if (nums.length === 0) return 0;
    return Math.max(...nums);
  }

  private _fnMin(args: EvalValue[]): number {
    const nums = this._flattenNumbers(args);
    if (nums.length === 0) return 0;
    return Math.min(...nums);
  }

  private _fnMedian(args: EvalValue[]): number {
    const nums = this._flattenNumbers(args).sort((a, b) => a - b);
    if (nums.length === 0) return 0;
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  }

  private _fnMode(args: EvalValue[]): number {
    const nums = this._flattenNumbers(args);
    if (nums.length === 0) return 0;
    const freq = new Map<number, number>();
    nums.forEach(n => freq.set(n, (freq.get(n) || 0) + 1));
    let maxCount = 0;
    let mode = nums[0];
    freq.forEach((count, num) => {
      if (count > maxCount) { maxCount = count; mode = num; }
    });
    return mode;
  }

  private _fnMod(a: EvalValue, b: EvalValue): number {
    return this._toNum(a) % this._toNum(b);
  }

  private _fnIf(args: EvalValue[], ctx: EvalContext): EvalValue {
    const condition = args[0];
    const trueVal = args[1];
    const falseVal = args.length > 2 ? args[2] : false;
    return condition ? trueVal : falseVal;
  }

  private _fnVLookup(args: EvalValue[], ctx: EvalContext): EvalValue {
    // VLOOKUP(lookup_value, table_array, col_index, [range_lookup])
    // Simplified: only works with range references
    if (args.length < 3) return '#N/A';
    // For now, return #N/A as VLOOKUP needs range context
    return '#N/A';
  }

  private _fnHLookup(args: EvalValue[], ctx: EvalContext): EvalValue {
    // HLOOKUP(lookup_value, table_array, row_index, [range_lookup])
    return '#N/A';
  }

  private _fnIndex(args: EvalValue[], ctx: EvalContext): EvalValue {
    // INDEX(range, row, [col])
    if (!Array.isArray(args[0]) || args.length < 2) return '#REF!';
    const arr = args[0] as EvalValue[];
    const row = this._toNum(args[1]) - 1;
    if (args.length > 2) {
      // 2D index — not supported in simplified mode
      return '#REF!';
    }
    return arr[row] ?? '#REF!';
  }

  private _fnMatch(args: EvalValue[], ctx: EvalContext): EvalValue {
    // MATCH(lookup_value, lookup_array, [match_type])
    if (!Array.isArray(args[1]) || args.length < 2) return '#N/A';
    const arr = args[1] as EvalValue[];
    const lookup = args[0];
    const matchType = args.length > 2 ? this._toNum(args[2]) : 1;

    for (let i = 0; i < arr.length; i++) {
      if (matchType === 0 && arr[i] === lookup) return i + 1;
      if (matchType === 1 && this._toNum(arr[i]) >= this._toNum(lookup)) return i + 1;
      if (matchType === -1 && this._toNum(arr[i]) <= this._toNum(lookup)) return i + 1;
    }
    return '#N/A';
  }

  private _fnCountIf(args: EvalValue[], ctx: EvalContext): number {
    // COUNTIF(range, criteria)
    if (!Array.isArray(args[0])) return 0;
    const arr = args[0] as EvalValue[];
    const criteria = args[1];
    if (typeof criteria === 'string' && criteria.startsWith('>')) {
      const threshold = parseFloat(criteria.slice(1));
      return arr.filter(v => this._toNum(v) > threshold).length;
    }
    if (typeof criteria === 'string' && criteria.startsWith('<')) {
      const threshold = parseFloat(criteria.slice(1));
      return arr.filter(v => this._toNum(v) < threshold).length;
    }
    return arr.filter(v => v === criteria).length;
  }

  private _fnSumIf(args: EvalValue[], ctx: EvalContext): number {
    // SUMIF(range, criteria, [sum_range])
    if (!Array.isArray(args[0])) return 0;
    const arr = args[0] as EvalValue[];
    const criteria = args[1];
    const sumRange = (args.length > 2 && Array.isArray(args[2])) ? (args[2] as EvalValue[]) : arr;
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      const sv = sumRange[i];
      let match = false;
      if (typeof criteria === 'string' && criteria.startsWith('>')) {
        match = this._toNum(v) > parseFloat(criteria.slice(1));
      } else if (typeof criteria === 'string' && criteria.startsWith('<')) {
        match = this._toNum(v) < parseFloat(criteria.slice(1));
      } else {
        match = v === criteria;
      }
      if (match && typeof sv === 'number') sum += sv;
    }
    return sum;
  }

  private _fnAverageIf(args: EvalValue[], ctx: EvalContext): number {
    if (!Array.isArray(args[0])) return 0;
    const arr = args[0] as EvalValue[];
    const criteria = args[1];
    const avgRange = (args.length > 2 && Array.isArray(args[2])) ? (args[2] as EvalValue[]) : arr;
    let sum = 0, count = 0;
    for (let i = 0; i < arr.length; i++) {
      let match = false;
      if (typeof criteria === 'string' && criteria.startsWith('>')) {
        match = this._toNum(arr[i]) > parseFloat(criteria.slice(1));
      } else {
        match = arr[i] === criteria;
      }
      if (match && typeof avgRange[i] === 'number') { sum += avgRange[i] as number; count++; }
    }
    return count > 0 ? sum / count : 0;
  }

  // ─── Helpers ──────────────────────────────────────────────

  private _today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private _toNum(v: EvalValue): number {
    if (Array.isArray(v)) return this._toNum(v[0] ?? 0);
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v === null || v === undefined || v === '') return 0;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  }

  private _compare(a: EvalValue, b: EvalValue): number {
    // Unwrap arrays
    const va = Array.isArray(a) ? (a[0] ?? null) : a;
    const vb = Array.isArray(b) ? (b[0] ?? null) : b;
    if (va === vb) return 0;
    if (va === null) return -1;
    if (vb === null) return 1;
    if (typeof va === 'number' && typeof vb === 'number') return va - vb;
    const sa = String(va);
    const sb = String(vb);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  }

  /** Flatten args (arrays from range references) into a single flat array, keep only numbers */
  private _flattenNumbers(args: EvalValue[]): number[] {
    const result: number[] = [];
    for (const arg of args) {
      if (Array.isArray(arg)) {
        for (const item of arg) {
          if (typeof item === 'number') result.push(item);
          else if (typeof item === 'string') { const n = Number(item); if (!isNaN(n)) result.push(n); }
          else if (typeof item === 'boolean') result.push(item ? 1 : 0);
        }
      } else if (typeof arg === 'number') {
        result.push(arg);
      } else if (typeof arg === 'string') {
        const n = Number(arg);
        if (!isNaN(n)) result.push(n);
      } else if (typeof arg === 'boolean') {
        result.push(arg ? 1 : 0);
      }
    }
    return result;
  }

  /** Flatten args into a single flat array, keep all values */
  private _flattenAll(args: EvalValue[]): EvalValue[] {
    const result: EvalValue[] = [];
    for (const arg of args) {
      if (Array.isArray(arg)) {
        result.push(...arg);
      } else {
        result.push(arg);
      }
    }
    return result;
  }
}
