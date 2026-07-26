import type { FlatRecordLayoutResult, FreeTable, GroupedLayoutResult, RecordTreeColumnMeta } from '@lingyi-doc/core-sheet';
import type { BaseSheetModel, ColumnDef, GroupRule, RecordRow } from '@lingyi-doc/core-types';
import type { RecordDrawerTab } from '../../RecordDetailDrawer';
import type { SheetGridHostValue } from '../shared/SheetGridContext';

export interface BaseGridContextValue {
  table: FreeTable;
  sheet: BaseSheetModel;
  columnDefs: ColumnDef[];
  sheetRows: RecordRow[];
  host: SheetGridHostValue;

  checkedRows: number[];
  setCheckedRows: React.Dispatch<React.SetStateAction<number[]>>;
  checkedRowsForRender: number[];

  collapsedRowIds: string[];
  collapsedRowIdSet: Set<string>;
  rowTreeMeta?: RecordTreeColumnMeta[];
  toggleRowCollapse: (rowIndex: number) => void;
  setCollapsedRowIds: React.Dispatch<React.SetStateAction<string[]>>;

  groupRules: GroupRule[];
  groupLayout: GroupedLayoutResult | null;
  flatSortedLayout: FlatRecordLayoutResult | null;
  gridRowCount: number;
  isGroupedView: boolean;
  displayRowHeights: Map<number, number>;
  resolveGridRecordRow: (displayRow: number) => number | null;
  skipGroupGridLine: (row: number) => boolean;
  isGroupDisplayRow: (row: number) => boolean;
  fillGroupedRowHighlight: (
    ctx: CanvasRenderingContext2D,
    displayRow: number,
    color: string,
    gridRight: number,
    rowHeights: Map<number, number>,
  ) => void;
  resolveGroupedCardLeft: () => number;
  toggleGroupCollapse: (groupPathKey: string) => void;
  insertRecordInGroup: (
    groupContext: Record<string, unknown>,
    groupPathKey: string,
    addRecordDisplayRow: number,
  ) => void;

  baseColumnMenu: { colIndex: number; x: number; y: number } | null;
  setBaseColumnMenu: React.Dispatch<React.SetStateAction<{ colIndex: number; x: number; y: number } | null>>;
  detailRowIndex: number | null;
  setDetailRowIndex: React.Dispatch<React.SetStateAction<number | null>>;
  detailDrawerTab: RecordDrawerTab;
  setDetailDrawerTab: React.Dispatch<React.SetStateAction<RecordDrawerTab>>;

  activeSort: { colIndex: number; order: 'asc' | 'desc' } | null;
  handleEditField: (colIndex: number) => void;
  handleEditDescription: (colIndex: number) => void;
  handleCopyField: (colIndex: number) => void;
  handleHideField: (colIndex: number) => void;
  handleInsertColumn: (colIndex: number, direction: 'left' | 'right') => void;
  handleFreezeColumn: (colIndex: number) => void;
  handleSort: (colIndex: number, order: 'asc' | 'desc') => void;
  handleGroupByField: (fieldId: string) => void;
  handleFilterByField: (fieldId: string) => void;
  handleCreateView: (fieldId: string, viewType: string) => void;
  handleDeleteField: (colIndex: number) => void;

  canShowRecordDetailActions: (recordRow: number) => boolean;
  openRecordDrawer: (rowIndex: number, tab?: RecordDrawerTab) => void;
  handleBaseInsertRowsAbove: (rowIndex: number, count: number) => void;
  handleBaseInsertRowsBelow: (rowIndex: number, count: number) => void;
  handleBaseAddChildRecord: (rowIndex: number) => void;
  handleBaseAddComment: (rowIndex: number, colIndex: number) => void;
  handleBaseFilterByCell: (rowIndex: number, colIndex: number) => void;
  commentsEnabled: boolean;
}

export type BaseGridHostRefs = Pick<
  SheetGridHostValue,
  'viewportRef' | 'dirtyTrackerRef' | 'scheduleRender' | 'layoutVersion'
>;
