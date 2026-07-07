import React, { useState } from 'react';
import { DOC_COLORS } from './styles';

const MAX_ROWS = 10;
const MAX_COLS = 10;

interface TableInsertPickerProps {
  onSelect: (rows: number, cols: number) => void;
  onClose?: () => void;
}

export const TableInsertPicker: React.FC<TableInsertPickerProps> = ({ onSelect, onClose }) => {
  const [hover, setHover] = useState({ rows: 3, cols: 3 });

  return (
    <div
      data-doc-table-picker
      style={{
        padding: 12,
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
        border: `1px solid ${DOC_COLORS.border}`,
        minWidth: 220,
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
        fontSize: 13,
        color: DOC_COLORS.text,
      }}>
        <span>插入支持富文本的表格</span>
        <span style={{ color: DOC_COLORS.muted, fontWeight: 500 }}>
          {hover.cols} × {hover.rows}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${MAX_COLS}, 18px)`,
          gap: 4,
        }}
      >
        {Array.from({ length: MAX_ROWS * MAX_COLS }, (_, i) => {
          const r = Math.floor(i / MAX_COLS) + 1;
          const c = (i % MAX_COLS) + 1;
          const active = r <= hover.rows && c <= hover.cols;
          return (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setHover({ rows: r, cols: c })}
              onClick={() => { onSelect(r, c); onClose?.(); }}
              style={{
                width: 18,
                height: 18,
                padding: 0,
                border: `1px solid ${active ? DOC_COLORS.primary : DOC_COLORS.border}`,
                borderRadius: 2,
                background: active ? 'rgba(22, 93, 255, 0.15)' : '#F7F8FA',
                cursor: 'pointer',
              }}
            />
          );
        })}
      </div>
    </div>
  );
};
