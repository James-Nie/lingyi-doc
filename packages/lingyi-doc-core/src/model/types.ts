import type { CellRange } from '../types/index';

/** 撤销/重做操作记录 */
export interface Operation {
  type: string;
  undo: () => void;
  redo: () => void;
}

export interface SetCellOptions {
  /** 跳过行历史记录（如新行默认值填充） */
  skipHistory?: boolean;
}

/** 表格变更宿主（供子模块回调） */
export interface TableMutationHost {
  notifyChange(range: CellRange | null): void;
  pushUndo(op: Operation): void;
}
