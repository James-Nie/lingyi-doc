import React from 'react';
import { BASE_THEME, getTreeContentRect, isRowVisible, isSystemColumnType, type FreeTable, type RecordTreeColumnMeta } from '@lingyi-doc/core-sheet';
import { getEditText, type BaseSheetModel, type CellCoord, type ColumnDef, type RecordRow } from '@lingyi-doc/core-types';
import type { ViewportManager } from '@lingyi-doc/core-sheet';
import { getActiveBaseView, isFieldGrouped } from '../../base/formViewUtils';
import { ColumnHeaderMenu } from '../../ColumnHeaderMenu';
import { BaseCellEditor } from '../../editors/BaseCellEditor';
import { BaseRecordContextMenu } from '../../BaseRecordContextMenu';
import { BaseRecordRowToolbar } from '../../BaseRecordRowToolbar';
import { BaseRecordCellExpandBtn } from '../../BaseRecordCellExpandBtn';
import { RecordDetailDrawer, type RecordDrawerTab } from '../../RecordDetailDrawer';
import { BaseAddRowsBar } from '../../BaseAddRowsBar';
import { BaseAxisAddCell, BASE_ADD_COLUMN_WIDTH } from '../../BaseAxisAddCell';
import { useSheetStore } from '../../../store/sheetStore';

export interface BaseGridOverlaysProps {
  table: FreeTable;
  sheet: BaseSheetModel;
  columnDefs: ColumnDef[];
  sheetRows: RecordRow[];
  viewportRef: React.RefObject<ViewportManager>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  effectiveRowHeights: Map<number, number>;
  displayRowHeights: Map<number, number>;
  sheetColumnWidths: Map<number, number>;
  scrollLeft: number;
  scrollTop: number;
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
  /** 勾选的记录行（模型行索引），用于右键批量删除 */
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
}

export const BaseGridOverlays: React.FC<BaseGridOverlaysProps> = ({
  table,
  sheet,
  columnDefs,
  sheetRows,
  viewportRef,
  containerRef,
  effectiveRowHeights,
  displayRowHeights,
  sheetColumnWidths,
  scrollLeft,
  scrollTop,
  zoomLevel,
  containerSize,
  addRowsBarHeight,
  gridRowCount,
  isGroupedView,
  resolveActiveRowHeights,
  mapCoordToRecord,
  scheduleRender,
  markFullRedraw,
  setFormulaBarText,
  setEditingCell,
  baseColumnMenu,
  onCloseColumnMenu,
  activeSort,
  onEditField,
  onEditDescription,
  onCopyField,
  onHideField,
  onInsertColumn,
  onFreezeColumn,
  onSort,
  onGroupByField,
  onFilterByField,
  onCreateView,
  onDeleteField,
  onOpenFieldConfig,
  editingCell,
  activeCell,
  rowTreeMeta,
  collapsedRowIdSet,
  contextMenu,
  onCloseContextMenu,
  onInsertRowsAbove,
  onInsertRowsBelow,
  onViewDetail,
  onViewHistory,
  onAddChildRecord,
  onAddComment,
  onFilterByCell,
  onDeleteRecord,
  checkedRows = [],
  detailRowIndex,
  detailDrawerTab,
  onCloseDetailDrawer,
  onNavigateDetail,
  activeHoverRow,
  onToolbarHoverEnter,
  onToolbarHoverLeave,
  onAddChildFromToolbar,
  onExpandCellRecord,
  canShowRecordDetailActions,
  commentsEnabled = false,
}) => (
  <>
    {baseColumnMenu && columnDefs[baseColumnMenu.colIndex] && (
      <ColumnHeaderMenu
        visible
        x={baseColumnMenu.x}
        y={baseColumnMenu.y}
        columnDef={columnDefs[baseColumnMenu.colIndex]}
        colIndex={baseColumnMenu.colIndex}
        isLocked={baseColumnMenu.colIndex === 0}
        frozenCols={sheet.freezeState?.frozenCols || 0}
        activeSort={activeSort}
        activeGroup={isFieldGrouped(getActiveBaseView(sheet), columnDefs[baseColumnMenu.colIndex]?.id ?? '') ? columnDefs[baseColumnMenu.colIndex]?.id ?? null : null}
        onClose={onCloseColumnMenu}
        onEditField={onEditField}
        onEditDescription={onEditDescription}
        onCopyField={onCopyField}
        onHideField={onHideField}
        onInsertColumn={onInsertColumn}
        onFreezeColumn={onFreezeColumn}
        onSort={onSort}
        onGroupByField={onGroupByField}
        onFilterByField={onFilterByField}
        onCreateView={onCreateView}
        onDeleteField={onDeleteField}
      />
    )}

    {editingCell && (() => {
      const columnDef = columnDefs[editingCell.col];
      if (!columnDef) return null;
      if (isSystemColumnType(columnDef.type)) {
        queueMicrotask(() => {
          setEditingCell(null);
          useSheetStore.getState().setStatusText('系统字段不可编辑');
        });
        return null;
      }
      const recordCoord = mapCoordToRecord(editingCell);
      if (!recordCoord) return null;
      const cellData = table.getCell(recordCoord.row, editingCell.col);
      const cellRect = viewportRef.current!.getCellRect(editingCell, sheetColumnWidths, effectiveRowHeights);
      const contentRect = getTreeContentRect(
        cellRect,
        editingCell.col,
        !isGroupedView ? rowTreeMeta?.[recordCoord.row] : undefined,
        viewportRef.current!.zoomLevel,
      );
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return null;
      const isChildCol0 = editingCell.col === 0 && !isGroupedView && (rowTreeMeta?.[recordCoord.row]?.depth ?? 0) > 0;
      const editorWidth = isChildCol0 ? Math.max(40, contentRect.width - 28) : contentRect.width;
      return (
        <BaseCellEditor
          key={`base-edit-${editingCell.row}-${editingCell.col}-${columnDef.type}`}
          coord={editingCell}
          rect={{
            x: containerRect.left + contentRect.x,
            y: containerRect.top + contentRect.y,
            width: editorWidth,
            height: contentRect.height,
          }}
          columnDef={columnDef}
          initialValue={cellData?.value || { type: 'empty' }}
          onCommit={(value) => {
            table.setCellValue(recordCoord.row, editingCell.col, value);
            setFormulaBarText(getEditText(value));
            setEditingCell(null);
            markFullRedraw();
            scheduleRender();
          }}
          onCancel={() => setEditingCell(null)}
        />
      );
    })()}

    {(() => {
      const vp = viewportRef.current!;
      const config = vp.config;
      const activeRowHeights = resolveActiveRowHeights();
      let dataColWidth = 0;
      for (let c = 0; c < sheet.colCount; c++) {
        dataColWidth += (sheetColumnWidths.get(c) || config.defaultColumnWidth) * zoomLevel;
      }
      const addColWidth = BASE_ADD_COLUMN_WIDTH;
      const btnX = config.headerWidth + dataColWidth - scrollLeft;
      if (btnX + addColWidth < config.headerWidth || btnX > containerSize.width + addColWidth) return null;

      // O(1) 总高：前缀和，避免按 sheet.rowCount 线性累加
      const totalDataHeight = vp.getTotalContentSize(
        gridRowCount,
        sheet.colCount,
        sheetColumnWidths,
        activeRowHeights,
      ).height;
      const addColBodyTop = config.headerHeight;
      const addColBodyHeight = Math.max(0, totalDataHeight - config.headerHeight - scrollTop);

      return (
        <>
          {addColBodyHeight > 0 && (
            <div
              key="base-add-col-body"
              style={{
                position: 'absolute',
                top: addColBodyTop,
                left: btnX,
                width: addColWidth,
                height: addColBodyHeight,
                zIndex: 55,
                pointerEvents: 'none',
                background: BASE_THEME.addCellBg,
                borderRight: `1px solid ${BASE_THEME.addCellBorder}`,
                boxSizing: 'border-box',
              }}
            />
          )}
          <div
            key="add-col-btn"
            style={{
              position: 'absolute',
              top: 0,
              left: btnX,
              zIndex: 60,
              pointerEvents: 'auto',
            }}
          >
            <BaseAxisAddCell
              width={addColWidth}
              height={config.headerHeight}
              title="添加字段"
              variant="column"
              onClick={() => onOpenFieldConfig?.(null)}
            />
          </div>
        </>
      );
    })()}

    {!isGroupedView && (() => {
      const vp = viewportRef.current!;
      const config = vp.config;
      const activeRowHeights = resolveActiveRowHeights();
      const contentSize = vp.getTotalContentSize(
        gridRowCount,
        sheet.colCount,
        sheetColumnWidths,
        activeRowHeights,
      );
      let dataOnlyW = 0;
      for (let c = 0; c < sheet.colCount; c++) {
        dataOnlyW += (sheetColumnWidths.get(c) || config.defaultColumnWidth) * zoomLevel;
      }
      const barY = contentSize.height - scrollTop;
      const barHeight = addRowsBarHeight;
      const barVisible = barY < containerSize.height && barY + barHeight > 0;
      if (!barVisible) return null;
      return (
        <BaseAddRowsBar
          key="base-add-row"
          top={barY}
          headerWidth={config.headerWidth}
          dataWidth={dataOnlyW}
          addColumnWidth={BASE_ADD_COLUMN_WIDTH}
          height={barHeight}
          onAddRow={() => {
            table.insertRows(sheet.rowCount, 1);
            useSheetStore.getState().setStatusText('已添加新行');
            markFullRedraw();
            scheduleRender();
          }}
        />
      );
    })()}

    {contextMenu.visible && contextMenu.coord && (() => {
      const recordCoord = mapCoordToRecord(contextMenu.coord);
      const menuRecordRow = recordCoord?.row ?? contextMenu.coord.row;
      const showRecordDetailActions = !isGroupedView || (
        recordCoord !== null && canShowRecordDetailActions(recordCoord.row)
      );
      return (
        <BaseRecordContextMenu
          visible
          x={contextMenu.x}
          y={contextMenu.y}
          rowIndex={menuRecordRow}
          colIndex={contextMenu.coord.col}
          table={table}
          onClose={onCloseContextMenu}
          onInsertRowsAbove={onInsertRowsAbove}
          onInsertRowsBelow={onInsertRowsBelow}
          onViewDetail={onViewDetail}
          onViewHistory={onViewHistory}
          onAddChildRecord={onAddChildRecord}
          onAddComment={(row, col) => onAddComment(row, col)}
          onFilterByCell={onFilterByCell}
          onDeleteRecord={onDeleteRecord}
          selectedRowIndices={checkedRows}
          showRecordDetailActions={showRecordDetailActions}
          commentsEnabled={commentsEnabled}
        />
      );
    })()}

    {(() => {
      const coord = editingCell ?? activeCell;
      if (!coord || coord.col !== 0) return null;
      const recordRow = mapCoordToRecord(coord)?.row ?? coord.row;
      if ((rowTreeMeta?.[recordRow]?.depth ?? 0) <= 0) return null;
      const cellRect = viewportRef.current!.getCellRect(coord, sheetColumnWidths, displayRowHeights);
      const contentRect = getTreeContentRect(cellRect, 0, rowTreeMeta?.[recordRow], viewportRef.current!.zoomLevel);
      if (contentRect.y + contentRect.height < 0 || contentRect.y > containerSize.height) return null;
      return (
        <BaseRecordCellExpandBtn
          rowIndex={recordRow}
          contentRect={contentRect}
          onExpand={onExpandCellRecord}
        />
      );
    })()}

    {activeHoverRow !== null && (() => {
      let toolbarRecordRow = activeHoverRow;
      let showViewDetail = true;
      let showAddChild = true;

      if (isGroupedView) {
        const recordCoord = mapCoordToRecord({ row: activeHoverRow, col: 0 });
        if (!recordCoord || !canShowRecordDetailActions(recordCoord.row)) return null;
        toolbarRecordRow = recordCoord.row;
      } else {
        const recordRow = mapCoordToRecord({ row: activeHoverRow, col: 0 })?.row ?? activeHoverRow;
        if (!rowTreeMeta?.[recordRow] || !isRowVisible(recordRow, sheetRows, collapsedRowIdSet)) {
          return null;
        }
        toolbarRecordRow = recordRow;
      }

      const cellRect = viewportRef.current!.getCellRect(
        { row: activeHoverRow, col: 0 },
        sheetColumnWidths,
        displayRowHeights,
      );
      if (cellRect.y + cellRect.height < 0 || cellRect.y > containerSize.height) return null;
      return (
        <BaseRecordRowToolbar
          rowIndex={toolbarRecordRow}
          cellRect={cellRect}
          onMouseEnter={() => onToolbarHoverEnter(activeHoverRow)}
          onMouseLeave={onToolbarHoverLeave}
          onViewDetail={onViewDetail}
          onAddChild={onAddChildFromToolbar}
          showViewDetail={showViewDetail}
          showAddChild={showAddChild}
        />
      );
    })()}

    <RecordDetailDrawer
      visible={detailRowIndex !== null}
      rowIndex={detailRowIndex}
      table={table}
      initialTab={detailDrawerTab}
      onClose={onCloseDetailDrawer}
      onNavigate={onNavigateDetail}
    />
  </>
);
