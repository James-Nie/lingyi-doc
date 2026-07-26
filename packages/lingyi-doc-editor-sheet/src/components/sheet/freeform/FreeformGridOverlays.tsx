import React from 'react';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import type { CellCoord, CellRange, CellValue, ColumnDef } from '@lingyi-doc/core-types';
import type { ViewportManager } from '@lingyi-doc/core-sheet';
import { CellEditor } from '../../CellEditor';
import { ContextMenu } from '../../ContextMenu';
import { ColumnHeaderFilterPanel } from '../../ColumnHeaderFilterPanel';
import { FreeformDropdownEditor } from '../../FreeformDropdownEditor';
import { FreeformDateEditor } from '../../FreeformDateEditor';
import { AddRowsBar } from '../../AddRowsBar';
import { useSheetStore } from '../../../store/sheetStore';

export interface FreeformGridOverlaysProps {
  table: FreeTable;
  viewportRef: React.RefObject<ViewportManager>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  mergeRanges: CellRange[];
  columnDefs: ColumnDef[];
  effectiveRowHeights: Map<number, number>;
  sheetColumnWidths: Map<number, number>;
  sheetRowCount: number;
  scrollLeft: number;
  scrollTop: number;
  zoomLevel: number;
  containerSize: { width: number; height: number };
  addRowsBarHeight: number;
  resolveActiveRowHeights: () => Map<number, number>;
  scheduleRender: () => void;
  markFullRedraw: () => void;
  dropdownEditCell: CellCoord | null;
  dateEditCell: CellCoord | null;
  filterPanel: { col: number; rect: { left: number; top: number; width: number; height: number } } | null;
  contextMenu: {
    visible: boolean;
    x: number;
    y: number;
    coord: CellCoord | null;
    clickInSelection?: boolean;
  };
  checkedRows: number[];
  onEditCommit: (coord: CellCoord, value: string | boolean | number | CellValue | null, commitType?: string) => void;
  onEditCancel: () => void;
  onDropdownEditCommit: (coord: CellCoord, value: CellValue) => void;
  onDropdownEditClose: () => void;
  onDateEditCommit: (coord: CellCoord, value: CellValue) => void;
  onDateEditClose: () => void;
  onCloseContextMenu: () => void;
  onCloseFilterPanel: () => void;
  onRequestDeleteRows: (rows: number[]) => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onCopyAsImage: () => void;
  commentsEnabled?: boolean;
  onAddComment?: (rowIndex: number, colIndex: number) => void;
}

export const FreeformGridOverlays: React.FC<FreeformGridOverlaysProps> = ({
  table,
  viewportRef,
  containerRef,
  mergeRanges,
  columnDefs,
  effectiveRowHeights,
  sheetColumnWidths,
  sheetRowCount,
  scrollLeft,
  scrollTop,
  zoomLevel,
  containerSize,
  addRowsBarHeight,
  resolveActiveRowHeights,
  scheduleRender,
  markFullRedraw,
  dropdownEditCell,
  dateEditCell,
  filterPanel,
  contextMenu,
  checkedRows,
  onEditCommit,
  onEditCancel,
  onDropdownEditCommit,
  onDropdownEditClose,
  onDateEditCommit,
  onDateEditClose,
  onCloseContextMenu,
  onCloseFilterPanel,
  onRequestDeleteRows,
  onCopy,
  onCut,
  onPaste,
  onCopyAsImage,
  commentsEnabled = false,
  onAddComment,
}) => {
  const sheet = table.sheet;

  return (
    <>
      <CellEditor
        viewportManager={viewportRef.current!}
        columnWidths={sheetColumnWidths}
        rowHeights={effectiveRowHeights}
        mergeRanges={mergeRanges}
        columnDefs={columnDefs}
        getCellData={(coord) => table.getCell(coord.row, coord.col)}
        onCommit={onEditCommit}
        onCancel={onEditCancel}
      />

      {dropdownEditCell && (() => {
        const validation = table.getDropdownValidationAt(dropdownEditCell.row, dropdownEditCell.col);
        if (!validation) return null;
        const cellData = table.getCell(dropdownEditCell.row, dropdownEditCell.col);
        const cellRect = viewportRef.current!.getCellRect(dropdownEditCell, sheetColumnWidths, effectiveRowHeights);
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (!containerRect) return null;
        return (
          <FreeformDropdownEditor
            rect={{
              x: containerRect.left + cellRect.x,
              y: containerRect.top + cellRect.y,
              width: cellRect.width,
              height: cellRect.height,
            }}
            validation={validation}
            initialValue={cellData?.value || { type: 'empty' }}
            onCommit={value => onDropdownEditCommit(dropdownEditCell, value)}
            onClose={onDropdownEditClose}
          />
        );
      })()}

      {dateEditCell && (() => {
        const validation = table.getDateValidationAt(dateEditCell.row, dateEditCell.col);
        if (!validation) return null;
        const cellData = table.getCell(dateEditCell.row, dateEditCell.col);
        const cellRect = viewportRef.current!.getCellRect(dateEditCell, sheetColumnWidths, effectiveRowHeights);
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (!containerRect) return null;
        return (
          <FreeformDateEditor
            coord={dateEditCell}
            rect={{
              x: containerRect.left + cellRect.x,
              y: containerRect.top + cellRect.y,
              width: cellRect.width,
              height: cellRect.height,
            }}
            validation={validation}
            initialValue={cellData?.value || { type: 'empty' }}
            onCommit={value => onDateEditCommit(dateEditCell, value)}
            onClose={onDateEditClose}
          />
        );
      })()}

      {(() => {
        const config = viewportRef.current!.config;
        let dataColWidth = 0;
        for (let c = 0; c < sheet.colCount; c++) {
          dataColWidth += (sheetColumnWidths.get(c) || config.defaultColumnWidth) * zoomLevel;
        }
        const addColWidth = 32;
        const btnX = config.headerWidth + dataColWidth - scrollLeft;
        if (btnX + addColWidth < config.headerWidth || btnX > containerSize.width + addColWidth) return null;

        const handleAddColumn = () => {
          const newIndex = sheet.colCount;
          table.insertColumns(newIndex, 1);
          table.setColumnWidth(newIndex, 160);
          markFullRedraw();
          scheduleRender();
          useSheetStore.getState().setStatusText('已添加新列');
        };

        const clampedX = Math.min(Math.max(btnX, config.headerWidth), containerSize.width - addColWidth);
        return (
          <button
            key="add-col-btn"
            onClick={handleAddColumn}
            style={{
              position: 'absolute',
              top: 2,
              left: clampedX,
              zIndex: 60,
              width: addColWidth,
              height: config.headerHeight - 4,
              border: '1px dashed #ccc',
              borderRadius: 3,
              background: '#fafafa',
              color: '#999',
              cursor: 'pointer',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
            title="添加列"
          >
            +
          </button>
        );
      })()}

      {(() => {
        const vp = viewportRef.current!;
        const config = vp.config;
        const contentSize = vp.getTotalContentSize(
          sheetRowCount,
          table.colCount,
          sheetColumnWidths,
          resolveActiveRowHeights(),
        );
        // getTotalContentSize 已含 header；AddRowsBar 贴在内容底边
        const barY = contentSize.height - scrollTop;
        const barHeight = addRowsBarHeight;
        const barVisible = barY < containerSize.height && barY + barHeight > 0;
        if (!barVisible) return null;
        return (
          <AddRowsBar
            top={barY}
            headerWidth={config.headerWidth}
            height={barHeight}
            onAddRows={(count) => {
              table.insertRows(sheetRowCount, count);
              useSheetStore.getState().setStatusText(`已添加 ${count} 行`);
              markFullRedraw();
              scheduleRender();
            }}
          />
        );
      })()}

      <ContextMenu
        table={table}
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        clickInSelection={contextMenu.clickInSelection}
        checkedRows={checkedRows}
        isBaseSheet={false}
        onRequestDeleteRows={onRequestDeleteRows}
        onClose={onCloseContextMenu}
        onCopy={onCopy}
        onCut={onCut}
        onPaste={onPaste}
        onCopyAsImage={onCopyAsImage}
        commentsEnabled={commentsEnabled}
        onAddComment={onAddComment}
      />

      {filterPanel && (
        <ColumnHeaderFilterPanel
          table={table}
          col={filterPanel.col}
          anchorRect={filterPanel.rect}
          onClose={onCloseFilterPanel}
        />
      )}
    </>
  );
};
