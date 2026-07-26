import React, { useState } from 'react';
import { DOC_COLORS } from './styles';

const MAX_ROWS = 10;
const MAX_COLS = 10;

interface TableInsertPickerProps {
  onSelect: (rows: number, cols: number) => void;
  onClose?: () => void;
}

export const TableInsertPicker: React.FC<TableInsertPickerProps> = ({ onSelect, onClose }) => {
  const [hover, setHover] = useState<{ rows: number; cols: number } | null>(null);

  return (
    <div
      data-doc-table-picker
      style={{
        padding: '12px 14px',
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
        border: `1px solid ${DOC_COLORS.border}`,
        minWidth: 228,
      }}
      onMouseDown={e => e.stopPropagation()}
      onMouseLeave={() => setHover(null)}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        fontSize: 13,
        color: DOC_COLORS.text,
        gap: 12,
      }}>
        <span style={{ whiteSpace: 'nowrap' }}>插入支持富文本的表格</span>
        <span style={{ color: DOC_COLORS.muted, fontWeight: 500, flexShrink: 0, minWidth: 36, textAlign: 'right' }}>
          {hover ? `${hover.cols} × ${hover.rows}` : ''}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${MAX_COLS}, 16px)`,
          gap: 4,
        }}
      >
        {Array.from({ length: MAX_ROWS * MAX_COLS }, (_, i) => {
          const r = Math.floor(i / MAX_COLS) + 1;
          const c = (i % MAX_COLS) + 1;
          const active = hover != null && r <= hover.rows && c <= hover.cols;
          return (
            <button
              key={i}
              type="button"
              aria-label={`${c} 列 ${r} 行`}
              onMouseEnter={() => setHover({ rows: r, cols: c })}
              onClick={() => { onSelect(r, c); onClose?.(); }}
              style={{
                width: 16,
                height: 16,
                padding: 0,
                border: `1px solid ${active ? DOC_COLORS.primary : '#E5E6EB'}`,
                borderRadius: 3,
                background: active ? 'rgba(22, 93, 255, 0.12)' : '#F7F8FA',
                cursor: 'pointer',
                transition: 'background 0.08s ease, border-color 0.08s ease',
              }}
            />
          );
        })}
      </div>
    </div>
  );
};
