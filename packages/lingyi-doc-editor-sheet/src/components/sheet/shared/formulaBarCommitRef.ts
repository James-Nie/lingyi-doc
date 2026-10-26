/**
 * 模块级 ref：让 FormulaBar 能够调用 handleEditCommit 提交值到单元格
 *
 * FormulaBar 是独立的纯组件，没有 table 实例或 handleEditCommit。
 * 通过这个 ref，GridView 可以在初始化时把 commit 函数注入进来，
 * FormulaBar 的 Enter 处理直接读取并调用。
 */
import type { CellCoord } from '@lingyi-doc/core-types';

type CommitFn = (coord: CellCoord, value: string, commitType?: 'enter' | 'tab') => void;

let _commit: CommitFn | null = null;

export function setFormulaBarCommit(fn: CommitFn | null) {
  _commit = fn;
}

export function getFormulaBarCommit(): CommitFn | null {
  return _commit;
}
