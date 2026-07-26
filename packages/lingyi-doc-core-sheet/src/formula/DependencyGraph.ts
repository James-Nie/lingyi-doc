// ============================================================
// 公式 DependencyGraph（依赖图）
// 管理"公式格 → 引用格"的依赖关系，支持拓扑排序增量重算
// ============================================================

export type CellKey = string; // "R0C0" format

/** 将行列转为 CellKey */
export function toKey(row: number, col: number): CellKey {
  return `R${row}C${col}`;
}

/** 将 CellKey 解析为行列 */
export function fromKey(key: CellKey): { row: number; col: number } {
  const m = key.match(/^R(\d+)C(\d+)$/);
  if (!m) throw new Error(`Invalid cell key: ${key}`);
  return { row: parseInt(m[1]), col: parseInt(m[2]) };
}

export class DependencyGraph {
  /** deps[formulaCellKey] = set of cell keys that this formula depends on */
  private _deps = new Map<CellKey, Set<CellKey>>();

  /** dependents[cellKey] = set of formula cell keys that depend on this cell */
  private _dependents = new Map<CellKey, Set<CellKey>>();

  // ─── Registration ─────────────────────────────────────────

  /** Register a formula cell and its dependencies */
  setDependencies(formulaKey: CellKey, depKeys: CellKey[]): void {
    // Clear old dependencies if re-evaluating
    this.removeFormula(formulaKey);

    const depSet = new Set(depKeys);
    this._deps.set(formulaKey, depSet);

    for (const depKey of depKeys) {
      if (!this._dependents.has(depKey)) {
        this._dependents.set(depKey, new Set());
      }
      this._dependents.get(depKey)!.add(formulaKey);
    }
  }

  /** Remove a formula and all its dependency relations */
  removeFormula(formulaKey: CellKey): void {
    const oldDeps = this._deps.get(formulaKey);
    if (oldDeps) {
      for (const depKey of oldDeps) {
        const dependents = this._dependents.get(depKey);
        if (dependents) {
          dependents.delete(formulaKey);
          if (dependents.size === 0) this._dependents.delete(depKey);
        }
      }
    }
    this._deps.delete(formulaKey);
  }

  /** Get all formula cells that depend on a given cell */
  getDependents(cellKey: CellKey): CellKey[] {
    return Array.from(this._dependents.get(cellKey) || []);
  }

  /** Get all cells that a given formula depends on */
  getDependencies(formulaKey: CellKey): CellKey[] {
    return Array.from(this._deps.get(formulaKey) || []);
  }

  /** Check if a cell is a formula cell */
  isFormula(cellKey: CellKey): boolean {
    return this._deps.has(cellKey);
  }

  // ─── Topological Recalculation Order ──────────────────────

  /**
   * Given a set of changed cell keys, compute the topological
   * order of formulas that need to be recalculated.
   *
   * Also detects circular references: if a formula's transitive
   * dependencies include itself, it's marked with a cycle flag.
   */
  computeRecalcOrder(changedKeys: CellKey[]): { order: CellKey[]; hasCycle: boolean } {
    const visited = new Set<CellKey>();
    const inStack = new Set<CellKey>();
    const order: CellKey[] = [];
    let hasCycle = false;

    const dfs = (key: CellKey): void => {
      if (inStack.has(key)) {
        hasCycle = true;
        return;
      }
      if (visited.has(key)) return;

      visited.add(key);
      inStack.add(key);

      // Only recurse into formula cells
      if (this._deps.has(key)) {
        // Visit formula cells that depend on this cell
        const dependents = this._dependents.get(key);
        if (dependents) {
          for (const depKey of dependents) {
            dfs(depKey);
          }
        }
      }

      inStack.delete(key);

      // Only add formula cells to the recalc order
      if (this._deps.has(key)) {
        order.push(key);
      }
    };

    for (const key of changedKeys) {
      dfs(key);
    }

    return { order, hasCycle };
  }

  /** Clear all dependency information */
  clear(): void {
    this._deps.clear();
    this._dependents.clear();
  }

  /** Get total formula count */
  get formulaCount(): number {
    return this._deps.size;
  }
}
