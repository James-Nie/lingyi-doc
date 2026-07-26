import React from 'react';
import { useSheetStore } from '../store/sheetStore';

export const FormulaBar: React.FC = () => {
  const formulaBarText = useSheetStore(s => s.formulaBarText);
  const activeCell = useSheetStore(s => s.activeCell);
  const editingCell = useSheetStore(s => s.editingCell);
  const setFormulaBarText = useSheetStore(s => s.setFormulaBarText);
  const setEditingCell = useSheetStore(s => s.setEditingCell);
  const markKeyboardEditOpened = useSheetStore(s => s.markKeyboardEditOpened);

  const cellLabel = activeCell
    ? `${String.fromCharCode(65 + activeCell.col)}${activeCell.row + 1}`
    : '';

  return (
    <div
      data-sheet-keep-selection
      style={{
      display: 'flex',
      alignItems: 'center',
      borderBottom: '1px solid #e0e0e0',
      background: '#fff',
      minHeight: 28,
    }}>
      {/* 单元格引用标签 */}
      <div style={{
        width: 80,
        padding: '2px 8px',
        borderRight: '1px solid #e0e0e0',
        fontSize: 12,
        color: '#333',
        textAlign: 'center',
        userSelect: 'none',
        background: '#fafafa',
        lineHeight: '24px',
      }}>
        {cellLabel}
      </div>

      {/* 编辑区 */}
      <input
        type="text"
        value={formulaBarText}
        onChange={e => setFormulaBarText(e.target.value)}
        onKeyDown={e => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (activeCell && !editingCell) {
            markKeyboardEditOpened();
            setEditingCell(activeCell);
            return;
          }
          (e.target as HTMLInputElement).blur();
        }}
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          padding: '2px 8px',
          fontSize: 12,
          fontFamily: 'inherit',
          background: '#fff',
        }}
        placeholder="输入内容或公式（以 = 开头）"
      />
    </div>
  );
};
