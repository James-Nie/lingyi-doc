import React from 'react';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import type { ColumnDef } from '@lingyi-doc/core-types';
import { BASE_THEME } from '@lingyi-doc/core-sheet';
import { getCellText, isBaseSheet } from '@lingyi-doc/core-types';
import { KanbanFieldValue } from './kanbanFieldDisplay';

export interface KanbanCardProps {
  table: FreeTable;
  rowIndex: number;
  titleFieldId?: string;
  cardFieldIds: string[];
  showFieldNames: boolean;
  coverFieldId: string | null;
  draggable: boolean;
  onOpen: (rowIndex: number) => void;
  onDragStart: (rowIndex: number, e: React.DragEvent) => void;
}

export const KanbanCard: React.FC<KanbanCardProps> = ({
  table,
  rowIndex,
  titleFieldId,
  cardFieldIds,
  showFieldNames,
  coverFieldId,
  draggable,
  onOpen,
  onDragStart,
}) => {
  const sheet = table.sheet;
  if (!isBaseSheet(sheet)) return null;

  const columnDefs = sheet.columnDefs;
  const titleCol = titleFieldId ? columnDefs.findIndex(c => c.id === titleFieldId) : 0;
  const titleValue = titleCol >= 0 ? table.getCell(rowIndex, titleCol)?.value : undefined;
  const title = titleValue ? getCellText(titleValue) : table.getRecordTitle(rowIndex);

  let coverUrl: string | null = null;
  if (coverFieldId) {
    const coverCol = columnDefs.findIndex(c => c.id === coverFieldId);
    if (coverCol >= 0) {
      const coverVal = table.getCell(rowIndex, coverCol)?.value;
      const text = coverVal ? getCellText(coverVal) : '';
      if (text && (/^https?:\/\//.test(text) || text.startsWith('data:'))) {
        coverUrl = text;
      }
    }
  }

  const fields = cardFieldIds
    .map(id => columnDefs.find(c => c.id === id))
    .filter((c): c is ColumnDef => !!c && c.id !== titleFieldId);

  return (
    <div
      draggable={draggable}
      onDragStart={e => onDragStart(rowIndex, e)}
      onClick={() => onOpen(rowIndex)}
      style={{
        background: '#fff',
        borderRadius: 8,
        border: `1px solid ${BASE_THEME.cardBorder}`,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        padding: coverUrl ? 0 : '12px 12px 10px',
        cursor: draggable ? 'grab' : 'pointer',
        userSelect: 'none',
        transition: 'box-shadow 0.15s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)';
      }}
    >
      {coverUrl && (
        <div style={{
          height: 100,
          borderRadius: '8px 8px 0 0',
          backgroundImage: `url(${coverUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          marginBottom: 0,
        }} />
      )}
      <div style={{ padding: coverUrl ? '10px 12px 10px' : 0 }}>
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: BASE_THEME.cellTextColor,
          lineHeight: 1.4,
          marginBottom: fields.length ? 8 : 0,
          wordBreak: 'break-word',
        }}>
          {title || '未命名记录'}
        </div>
        {fields.map(col => {
          const colIndex = columnDefs.findIndex(c => c.id === col.id);
          const value = colIndex >= 0 ? table.getCell(rowIndex, colIndex)?.value : undefined;
          if (!value || value.type === 'empty') return null;
          const text = getCellText(value);
          if (!text && col.type !== 'boolean') return null;
          return (
            <div key={col.id} style={{ marginBottom: 6 }}>
              {showFieldNames && (
                <div style={{
                  fontSize: 11,
                  color: BASE_THEME.secondaryTextColor,
                  marginBottom: 2,
                }}>
                  {col.name}
                </div>
              )}
              <KanbanFieldValue columnDef={col} value={value} />
            </div>
          );
        })}
      </div>
    </div>
  );
};
