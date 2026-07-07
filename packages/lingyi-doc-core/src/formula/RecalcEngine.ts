// ============================================================
// 公式 RecalcEngine（重算引擎）
// 当单元格值变更时，自动重算依赖的公式单元格
// ============================================================

import { DependencyGraph, toKey, fromKey } from './DependencyGraph';
import { Parser, AstNode } from './Parser';
import { Evaluator, EvalResult } from './Evaluator';
import type { FreeTable } from '../model/index';
import type { CellValue, FormulaError } from '../types/index';
import { getRawValue } from '../types/index';

/** 缓存的公式信息 */
interface FormulaCache {
  ast: AstNode;
  dependencies: string[];
}

export class RecalcEngine {
  private _depGraph = new DependencyGraph();
  private _parser = new Parser();
  private _evaluator = new Evaluator();
  /** formula cell key → parsed AST + deps */
  private _cache = new Map<string, FormulaCache>();

  // ─── Public API ───────────────────────────────────────────

  /**
   * 计算一个公式并存储结果。
   * 返回计算后的 CellValue。
   */
  evaluateAndStore(
    formula: string,
    table: FreeTable,
    row: number,
    col: number,
  ): CellValue {
    const cellKey = toKey(row, col);
    const formulaText = formula.startsWith('=') ? formula : '=' + formula;

    try {
      // 1. Parse
      const ast = this._parser.parse(formula);

      // 2. Evaluate
      const context = this._buildContext(table, row, col);
      const result = this._evaluator.evaluate(ast, context);

      if (result.error && result.error !== '#CYCLE!') {
        return { type: 'error', error: result.error as FormulaError };
      }

      // 3. Store dependency info
      this._depGraph.setDependencies(cellKey, result.dependencies);
      this._cache.set(cellKey, { ast, dependencies: result.dependencies });

      // 4. Build CellValue from result
      return this._toCellValue(result, formulaText);

    } catch (e: any) {
      // Parse error
      return { type: 'error', error: (e.message?.startsWith('#') ? e.message : '#ERROR!') as FormulaError };
    }
  }

  /**
   * 当单元格值变更时调用，自动重算所有依赖公式。
   * 返回需要更新的单元格列表 { row, col, value }。
   */
  recalcOnChange(
    changedRow: number,
    changedCol: number,
    table: FreeTable,
  ): Array<{ row: number; col: number; value: CellValue }> {
    const cellKey = toKey(changedRow, changedCol);
    const { order } = this._depGraph.computeRecalcOrder([cellKey]);

    const updates: Array<{ row: number; col: number; value: CellValue }> = [];

    for (const fKey of order) {
      const cache = this._cache.get(fKey);
      if (!cache) continue;

      const { row, col } = fromKey(fKey);
      const context = this._buildContext(table, row, col);

      try {
        const result = this._evaluator.evaluate(cache.ast, context);
        if (result.error) {
          updates.push({ row, col, value: { type: 'error', error: result.error as FormulaError } });
        } else {
          // Re-store dependency info (dependencies may have changed)
          this._depGraph.setDependencies(fKey, result.dependencies);
          this._cache.set(fKey, { ast: cache.ast, dependencies: result.dependencies });

          const cellData = table.getCell(row, col);
          const formula = cellData?.value.type === 'formula' ? cellData.value.formula : '';
          updates.push({ row, col, value: this._toCellValue(result, formula) });
        }
      } catch (e: any) {
        updates.push({ row, col, value: { type: 'error', error: '#ERROR!' as FormulaError } });
      }
    }

    return updates;
  }

  /**
   * 删除公式，清理依赖关系
   */
  removeFormula(row: number, col: number): void {
    const key = toKey(row, col);
    this._depGraph.removeFormula(key);
    this._cache.delete(key);
  }

  /** 检查单元格是否为公式格 */
  isFormula(row: number, col: number): boolean {
    return this._depGraph.isFormula(toKey(row, col));
  }

  /** 获取公式数量 */
  get formulaCount(): number {
    return this._depGraph.formulaCount;
  }

  /** 清除所有公式缓存 */
  clear(): void {
    this._depGraph.clear();
    this._cache.clear();
  }

  // ─── Internal ─────────────────────────────────────────────

  private _buildContext(table: FreeTable, currentRow: number, currentCol: number) {
    return {
      currentRow,
      currentCol,
      getCellRaw: (r: number, c: number) => {
        const cell = table.getCell(r, c);
        if (!cell) return null;
        // For formula cells, use the cached value
        if (cell.value.type === 'formula' && cell.value.cached) {
          return getRawValue(cell.value.cached);
        }
        if (cell.value.type === 'formula' && !cell.value.cached) {
          return null; // Formula not yet calculated
        }
        return getRawValue(cell.value);
      },
      getCellIsFormula: (r: number, c: number) => {
        return this._depGraph.isFormula(toKey(r, c));
      },
    };
  }

  private _toCellValue(result: EvalResult, formulaText: string): CellValue {
    if (result.error) {
      // #CYCLE! is a special case — we still treat it as a formula with error cached
      return { type: 'error', error: result.error as FormulaError };
    }

    const v = result.value;

    // Unwrap array values (range reference used as standalone)
    const val = Array.isArray(v) ? (v[0] ?? null) : v;

    if (typeof val === 'number') {
      return {
        type: 'formula',
        formula: formulaText,
        cached: { type: 'number', value: val, format: { kind: 'general' } },
      };
    }

    if (typeof val === 'boolean') {
      return {
        type: 'formula',
        formula: formulaText,
        cached: { type: 'boolean', value: val },
      };
    }

    // String or null
    return {
      type: 'formula',
      formula: formulaText,
      cached: { type: 'text', text: String(val ?? '') },
    };
  }
}
