import React from 'react';
import type { FreeTable, RecordTreeColumnMeta, ViewportManager } from '@lingyi-doc/core-sheet';
import type { BaseSheetModel, CellCoord, ColumnDef, RecordRow } from '@lingyi-doc/core-types';
import type { CellRange } from '@lingyi-doc/core-types';
import { useSheetStore } from '../../../store/sheetStore';
import type { RecordDrawerTab } from '../../RecordDetailDrawer';
import { BaseGridOverlays } from './BaseGridOverlays';
import { SheetSharedOverlays } from '../shared/SheetSharedOverlays';

/**
 * 仅本层订阅 scrollTop/scrollLeft，避免 BaseGridView 在滚动时整树重渲。
 * Canvas 滚动已由 viewport + scheduleRender 驱动，不依赖本组件。
 */
export interface BaseScrollSyncedLayerProps {
  table: FreeTable;
  sheet: BaseSheetModel;
  columnDefs: ColumnDef[];
  sheetRows: RecordRow[];
  viewportRef: React.RefObject<ViewportManager>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  effectiveRowHeights: Map<number, number>;
  displayRowHeights: Map<number, number>;
  sheetColumnWidths: Map<number, number>;
  zoomLevel: number;
  containerSize: { width: number; height: number };
  addRowsBarHeight: number;
  gridRowCount: number;
  isGroupedView: boolean;
  resolveActiveRowHeights: () => Map<number, number>;
  mapCoordToRecord: (coord: CellCoord) => CellCoord | null;
  scheduleRender: () => void;
  markFullRedraw: () => void;
  setFormulaBarText: (text: string) => void;
  setEditingCell: (cell: CellCoord | null) => void;
  baseColumnMenu: { colIndex: number; x: number; y: number } | null;
  onCloseColumnMenu: () => void;
  activeSort: { colIndex: number; order: 'asc' | 'desc' } | null;
  onEditField: (colIndex: number) => void;
  onEditDescription: (colIndex: number) => void;
  onCopyField: (colIndex: number) => void;
  onHideField: (colIndex: number) => void;
  onInsertColumn: (colIndex: number, direction: 'left' | 'right') => void;
  onFreezeColumn: (colIndex: number) => void;
  onSort: (colIndex: number, order: 'asc' | 'desc') => void;
  onGroupByField: (fieldId: string) => void;
  onFilterByField: (fieldId: string) => void;
  onCreateView: (fieldId: string, viewType: string) => void;
  onDeleteField: (colIndex: number) => void;
  onOpenFieldConfig?: (fieldId?: string | null) => void;
  editingCell: CellCoord | null;
  activeCell: CellCoord | null;
  rowTreeMeta?: Record<number, RecordTreeColumnMeta>;
  collapsedRowIdSet: Set<string>;
  contextMenu: {
    visible: boolean;
    x: number;
    y: number;
    coord: CellCoord | null;
  };
  onCloseContextMenu: () => void;
  onInsertRowsAbove: (rowIndex: number, count: number) => void;
  onInsertRowsBelow: (rowIndex: number, count: number) => void;
  onViewDetail: (row: number) => void;
  onViewHistory: (row: number) => void;
  onAddChildRecord: (rowIndex: number) => void;
  onAddComment: (rowIndex: number, colIndex: number) => void;
  onFilterByCell: (rowIndex: number, colIndex: number) => void;
  onDeleteRecord: (rowIndex: number) => void;
  checkedRows?: number[];
  detailRowIndex: number | null;
  detailDrawerTab: RecordDrawerTab;
  onCloseDetailDrawer: () => void;
  onNavigateDetail: (row: number) => void;
  activeHoverRow: number | null;
  toolbarHoverRow: number | null;
  onToolbarHoverEnter: (row: number) => void;
  onToolbarHoverLeave: () => void;
  onAddChildFromToolbar: (rowIndex: number) => void;
  onExpandCellRecord: (row: number) => void;
  canShowRecordDetailActions: (recordRow: number) => boolean;
  commentsEnabled?: boolean;
  isPreview: boolean;
  selectedChartId?: string | null;
  onSelectChart?: (chartId: string | null) => void;
  hoverRatingCell: { row: number; col: number; value: number } | null;
  supportsAutofill: boolean;
  selectionRange: CellRange | null;
  sheetRowCount: number;
  sheetColCount: number;
  startFillDrag: (sel: CellRange, e?: React.MouseEvent | globalThis.MouseEvent) => void;
  deleteDialog: { visible: boolean; rows: number[] };
  onConfirmDeleteRows: () => void;
  onCancelDeleteRows: () => void;
  extraScrollBottom: number;
  applyScroll: (top: number, left: number) => void;
}

export const BaseScrollSyncedLayer: React.FC<BaseScrollSyncedLayerProps> = (props) => {
  const scrollLeft = useSheetStore(s => s.scrollLeft);
  const scrollTop = useSheetStore(s => s.scrollTop);

  const {
    isPreview,
    selectedChartId,
    onSelectChart,
    hoverRatingCell,
    supportsAutofill,
    selectionRange,
    sheetRowCount,
    sheetColCount,
    startFillDrag,
    deleteDialog,
    onConfirmDeleteRows,
    onCancelDeleteRows,
    extraScrollBottom,
    applyScroll,
    canvasContainerRef,
    ...overlayProps
  } = props;

  return (
    <>
      {!isPreview && (
        <BaseGridOverlays
          {...overlayProps}
          scrollLeft={scrollLeft}
          scrollTop={scrollTop}
        />
      )}

      <SheetSharedOverlays
        previewMode={isPreview}
        table={props.table}
        scrollLeft={scrollLeft}
        scrollTop={scrollTop}
        zoomLevel={props.zoomLevel}
        containerRef={props.containerRef}
        canvasContainerRef={canvasContainerRef}
        viewportRef={props.viewportRef}
        selectedChartId={selectedChartId}
        onSelectChart={onSelectChart}
        hoverRatingCell={hoverRatingCell}
        sheetColumnWidths={props.sheetColumnWidths}
        sheetRowHeights={props.table.sheet.rowHeights}
        supportsAutofill={supportsAutofill}
        selectionRange={selectionRange}
        editingCell={props.editingCell}
        sheetRowCount={sheetRowCount}
        sheetColCount={sheetColCount}
        displayRowHeights={props.displayRowHeights}
        containerSize={props.containerSize}
        startFillDrag={startFillDrag}
        deleteDialog={deleteDialog}
        onConfirmDeleteRows={onConfirmDeleteRows}
        onCancelDeleteRows={onCancelDeleteRows}
        extraScrollBottom={extraScrollBottom}
        scrollRowCount={props.gridRowCount}
        applyScroll={applyScroll}
      />
    </>
  );
};
