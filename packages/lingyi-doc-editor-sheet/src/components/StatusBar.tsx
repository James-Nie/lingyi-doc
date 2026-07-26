import React, { useState } from 'react';
import { useSheetStore } from '../store/sheetStore';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import { isBaseSheet } from '@lingyi-doc/core-types';

interface StatusBarProps {
  table?: FreeTable;
}

export const StatusBar: React.FC<StatusBarProps> = ({ table }) => {
  const statusText = useSheetStore(s => s.statusText);
  const selectionRange = useSheetStore(s => s.selectionRange);
  const activeCell = useSheetStore(s => s.activeCell);
  const zoomLevel = useSheetStore(s => s.zoomLevel);
  const currentView = useSheetStore(s => s.currentView);

  const isBase = table ? isBaseSheet(table.sheet) : false;
  const rowCount = table?.rowCount || 0;
  const colCount = table?.colCount || 0;

  // 计算选中记录数
  let selectedCount = 0;
  if (selectionRange) {
    const selRows = selectionRange.end.row - selectionRange.start.row + 1;
    const selCols = selectionRange.end.col - selectionRange.start.col + 1;
    selectedCount = selRows * selCols;
  }

  // 当前单元格位置
  const cellPos = activeCell
    ? `${String.fromCharCode(65 + activeCell.col)}${activeCell.row + 1}`
    : '';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '2px 12px',
      borderTop: '1px solid #e0e0e0',
      background: '#fafafa',
      fontSize: 11,
      color: '#666',
      minHeight: 22,
    }}>
      {/* 左侧：状态文字 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span>{statusText}</span>
      </div>

      {/* 中间：记录统计 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {isBase && (
          <span>
            {selectedCount > 0 ? `${selectedCount} 条已选中 / ` : ''}
            {rowCount} 条记录
          </span>
        )}
        {!isBase && cellPos && (
          <span>
            {cellPos}
            {selectedCount > 1 && ` (${selectedCount} 个单元格)`}
          </span>
        )}
        {isBase && currentView !== 'grid' && (
          <span style={{ color: '#1a73e8' }}>
            {currentView === 'kanban' ? '看板视图' : currentView === 'gantt' ? '甘特视图' : currentView === 'calendar' ? '日历视图' : currentView === 'gallery' ? '画廊视图' : '表单视图'}
          </span>
        )}
      </div>

      {/* 右侧：缩放 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>缩放: {Math.round(zoomLevel * 100)}%</span>
      </div>
    </div>
  );
};
