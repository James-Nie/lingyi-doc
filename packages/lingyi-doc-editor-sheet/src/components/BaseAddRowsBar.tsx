import React from 'react';
import { BASE_THEME } from '@lingyi-doc/core-sheet';
import { BaseAxisAddCell } from './BaseAxisAddCell';

/** 多维表底部添加行栏：行头「+」+ 空白数据区 + 添加列占位 */
export const BaseAddRowsBar: React.FC<{
  top: number;
  headerWidth: number;
  dataWidth: number;
  addColumnWidth: number;
  height: number;
  onAddRow: () => void;
}> = ({
  top,
  headerWidth,
  dataWidth,
  addColumnWidth,
  height,
  onAddRow,
}) => {
  const totalWidth = headerWidth + dataWidth + addColumnWidth;

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: 0,
        width: totalWidth,
        height,
        display: 'flex',
        alignItems: 'stretch',
        zIndex: 90,
        pointerEvents: 'auto',
        boxSizing: 'border-box',
      }}
      data-sheet-keep-selection
    >
      <BaseAxisAddCell
        width={headerWidth}
        height={height}
        title="添加记录"
        variant="row"
        onClick={onAddRow}
      />
      <div
        style={{
          width: dataWidth,
          flexShrink: 0,
          background: BASE_THEME.addCellBg,
          borderTop: `1px solid ${BASE_THEME.addCellBorder}`,
          borderBottom: `1px solid ${BASE_THEME.addCellBorder}`,
          boxSizing: 'border-box',
        }}
      />
      <div
        style={{
          width: addColumnWidth,
          flexShrink: 0,
          background: BASE_THEME.addCellBg,
          borderTop: `1px solid ${BASE_THEME.addCellBorder}`,
          borderRight: `1px solid ${BASE_THEME.addCellBorder}`,
          borderBottom: `1px solid ${BASE_THEME.addCellBorder}`,
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
};
