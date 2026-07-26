import React, { useRef, useEffect, useState } from 'react';
import { ViewportManager } from '@lingyi-doc/core-sheet';
import type { ColumnDef } from '@lingyi-doc/core-types';
import type { CellCoord, CellRange, CellData } from '@lingyi-doc/core-types';
import { getFreeformBooleanEditText } from '@lingyi-doc/core-types';
import { useSheetStore } from '../store/sheetStore';

interface CellEditorProps {
  viewportManager: ViewportManager;
  columnWidths: Map<number, number>;
  rowHeights: Map<number, number>;
  mergeRanges?: CellRange[];
  columnDefs?: ColumnDef[]; // 字段定义列表，用于多维表字段类型感知
  getCellData?: (coord: CellCoord) => CellData | undefined;
  onCommit: (coord: CellCoord, value: string | boolean | number | null, commitType?: 'enter' | 'tab') => void;
  onCancel: () => void;
}

export const CellEditor: React.FC<CellEditorProps> = ({
  viewportManager, columnWidths, rowHeights, mergeRanges, columnDefs, getCellData, onCommit, onCancel,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const checkboxRef = useRef<HTMLInputElement>(null);
  const editingCell = useSheetStore(s => s.editingCell);
  const zoomLevel = useSheetStore(s => s.zoomLevel);
  const formulaBarText = useSheetStore(s => s.formulaBarText);
  const [editorValue, setEditorValue] = useState(formulaBarText);

  // 根据当前编辑列查找字段定义
  const columnDef = editingCell ? columnDefs?.[editingCell.col] : undefined;
  const columnType = columnDef?.type;
  const isBoolean = columnType === 'boolean';
  const cellData = editingCell && getCellData ? getCellData(editingCell) : undefined;
  const isFreeformBoolean = !isBoolean && cellData?.value.type === 'boolean';
  const isDate = columnType === 'date' || columnType === 'datetime';
  const isNumber = columnType === 'number' || columnType === 'currency' || columnType === 'percent' || columnType === 'rating' || columnType === 'progress';

  // 合并区域：编辑器尺寸扩展到整个合并范围
  let position: { x: number; y: number; width: number; height: number } | null = null;
  if (editingCell) {
    pos: {
      for (const range of mergeRanges || []) {
        const master = range.master || range.start;
        if (editingCell.row === master.row && editingCell.col === master.col &&
            (range.start.row !== range.end.row || range.start.col !== range.end.col)) {
          const topLeft = viewportManager.getCellRect(range.start, columnWidths, rowHeights);
          const bottomRight = viewportManager.getCellRect(range.end, columnWidths, rowHeights);
          position = {
            x: topLeft.x,
            y: topLeft.y,
            width: bottomRight.x + bottomRight.width - topLeft.x,
            height: bottomRight.y + bottomRight.height - topLeft.y,
          };
          break pos;
        }
      }
      position = viewportManager.getCellRect(editingCell, columnWidths, rowHeights);
    }
  }

  // 仅在切换编辑单元格时初始化编辑器，避免输入过程中被 formulaBarText / cellData 刷新打断
  useEffect(() => {
    if (!editingCell) return;
    const nextValue = isFreeformBoolean && cellData
      ? getFreeformBooleanEditText(cellData.value)
      : formulaBarText;
    setEditorValue(nextValue);
    if (inputRef.current) {
      inputRef.current.value = nextValue;
      inputRef.current.focus();
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
    if (checkboxRef.current) {
      const checked = isFreeformBoolean && cellData?.value.type === 'boolean'
        ? cellData.value.value
        : formulaBarText.toUpperCase() === 'TRUE' || formulaBarText === '1' || formulaBarText === '是';
      checkboxRef.current.checked = checked;
      checkboxRef.current.focus();
    }
  }, [editingCell?.row, editingCell?.col, isFreeformBoolean]);

  if (!editingCell || !position) return null;

  const handleCommit = (val: string | boolean | number | null, commitType: 'enter' | 'tab' = 'enter') => {
    if (editingCell) onCommit(editingCell, val, commitType);
  };

  const handleCancel = () => {
    onCancel();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (useSheetStore.getState().shouldIgnoreKeyboardEditCommit()) return;
      if ((isBoolean || isFreeformBoolean) && checkboxRef.current) {
        handleCommit(checkboxRef.current.checked);
      } else if (inputRef.current) {
        handleCommit(inputRef.current.value);
      }
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      if ((isBoolean || isFreeformBoolean) && checkboxRef.current) {
        handleCommit(checkboxRef.current.checked, 'tab');
      } else if (inputRef.current) {
        handleCommit(inputRef.current.value, 'tab');
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleCancel();
      return;
    }
    e.stopPropagation();
  };

  const handleChange = () => {
    if (inputRef.current) {
      setEditorValue(inputRef.current.value);
      useSheetStore.getState().setFormulaBarText(inputRef.current.value);
    }
  };

  const handleCheckboxChange = () => {
    if (checkboxRef.current && editingCell) {
      const checked = checkboxRef.current.checked;
      checkboxRef.current.dataset.committed = 'true';
      onCommit(editingCell, checked, 'enter');
    }
  };

  const handleBlur = () => {
    if (!editingCell) return;
    if (useSheetStore.getState().shouldIgnoreKeyboardEditCommit()) return;
    if ((isBoolean || isFreeformBoolean) && checkboxRef.current) {
      if (checkboxRef.current.dataset.committed === 'true') return;
      onCommit(editingCell, checkboxRef.current.checked);
    } else if (inputRef.current) {
      onCommit(editingCell, inputRef.current.value);
    }
  };

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: Math.max(0, position.x),
    top: Math.max(0, position.y),
    width: position.width,
    height: position.height,
    zIndex: 200,
    border: `2px solid ${(isFreeformBoolean || isBoolean) ? '#3370FF' : '#1a73e8'}`,
    outline: 'none',
    padding: (isFreeformBoolean || isBoolean) ? 0 : '2px 4px',
    fontSize: 11 * zoomLevel,
    fontFamily: 'Arial, sans-serif',
    boxSizing: 'border-box',
    background: '#fff',
    minWidth: 0,
  };

  // 普通表格复选框：编辑态使用 checkbox，单击即可切换
  if (isFreeformBoolean || isBoolean) {
    const checked = isFreeformBoolean
      ? cellData?.value.type === 'boolean' && cellData.value.value
      : formulaBarText.toUpperCase() === 'TRUE' || formulaBarText === '1' || formulaBarText === '是';

    return (
      <div
        style={{
          ...baseStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (checkboxRef.current) {
            checkboxRef.current.checked = !checkboxRef.current.checked;
            checkboxRef.current.dataset.committed = 'true';
            onCommit(editingCell!, checkboxRef.current.checked, 'enter');
          }
        }}
      >
        <input
          ref={checkboxRef}
          type="checkbox"
          data-cell-editor="true"
          defaultChecked={checked}
          style={{
            width: 16 * zoomLevel,
            height: 16 * zoomLevel,
            cursor: 'pointer',
            margin: 0,
            accentColor: '#3370FF',
          }}
          onKeyDown={handleKeyDown}
          onChange={handleCheckboxChange}
          onBlur={handleBlur}
        />
      </div>
    );
  }

  // 日期类型：渲染 date/datetime-local 输入
  if (isDate) {
    const dateInputType = columnType === 'datetime' ? 'datetime-local' : 'date';
    let dateValue = '';
    if (editorValue) {
      const ts = Date.parse(editorValue);
      if (!isNaN(ts)) {
        const d = new Date(ts);
        const pad = (n: number) => String(n).padStart(2, '0');
        if (dateInputType === 'date') {
          dateValue = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        } else {
          dateValue = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
      }
    }

    return (
      <input
        ref={inputRef}
        type={dateInputType}
        data-cell-editor="true"
        defaultValue={dateValue}
        onKeyDown={handleKeyDown}
        onChange={handleChange}
        onBlur={handleBlur}
        style={baseStyle}
      />
    );
  }

  // 数字类型：渲染 number 输入
  if (isNumber) {
    return (
      <input
        ref={inputRef}
        type="number"
        data-cell-editor="true"
        defaultValue={editorValue}
        onKeyDown={handleKeyDown}
        onChange={handleChange}
        onBlur={handleBlur}
        style={{
          ...baseStyle,
          textAlign: 'right',
        }}
      />
    );
  }

  // 默认：文本输入
  return (
    <input
      ref={inputRef}
      type="text"
      data-cell-editor="true"
      defaultValue={editorValue}
      onKeyDown={handleKeyDown}
      onChange={handleChange}
      onBlur={handleBlur}
      style={baseStyle}
    />
  );
};
