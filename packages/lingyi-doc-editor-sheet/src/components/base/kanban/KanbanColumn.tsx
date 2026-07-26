import React, { useState } from 'react';
import { PlusOutlined } from '@ant-design/icons';
import { BASE_THEME, GROUP_EMPTY_KEY } from '@lingyi-doc/core-sheet';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import { KanbanCard } from './KanbanCard';
import type { KanbanColumnData } from './useKanbanBoardData';

export interface KanbanColumnProps {
  table: FreeTable;
  column: KanbanColumnData;
  width: number;
  titleFieldId?: string;
  cardFieldIds: string[];
  showFieldNames: boolean;
  coverFieldId: string | null;
  readOnly?: boolean;
  onAddRecord: (columnKey: string) => void;
  onOpenRecord: (rowIndex: number) => void;
  onDragStart: (rowIndex: number, e: React.DragEvent) => void;
  onDrop: (columnKey: string) => void;
}

function columnAccent(color?: string, key?: string): string {
  if (color) return color;
  if (key === GROUP_EMPTY_KEY) return '#C9CDD4';
  return BASE_THEME.primaryColor;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  table,
  column,
  width,
  titleFieldId,
  cardFieldIds,
  showFieldNames,
  coverFieldId,
  readOnly,
  onAddRecord,
  onOpenRecord,
  onDragStart,
  onDrop,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const accent = columnAccent(column.color, column.key);

  return (
    <div
      style={{
        width,
        minWidth: width,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '100%',
        background: dragOver ? 'rgba(51, 112, 255, 0.04)' : 'transparent',
        borderRadius: 8,
        transition: 'background 0.15s ease',
      }}
      onDragOver={e => {
        if (readOnly) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        if (readOnly) return;
        e.preventDefault();
        setDragOver(false);
        onDrop(column.key);
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 4px 12px',
        flexShrink: 0,
      }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '2px 10px',
          borderRadius: 4,
          background: column.color || '#F2F3F5',
          color: BASE_THEME.cellTextColor,
          fontSize: 13,
          fontWeight: 500,
          maxWidth: '70%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          borderLeft: `3px solid ${accent}`,
        }}>
          {column.label}
        </span>
        <span style={{ fontSize: 12, color: BASE_THEME.secondaryTextColor }}>
          {column.recordIndices.length}
        </span>
        {!readOnly && (
          <button
            type="button"
            title="添加记录"
            onClick={() => onAddRecord(column.key)}
            style={{
              marginLeft: 'auto',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: BASE_THEME.secondaryTextColor,
              padding: 4,
              borderRadius: 4,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <PlusOutlined />
          </button>
        )}
      </div>

      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '0 2px 8px',
      }}>
        {column.recordIndices.map(rowIndex => (
          <KanbanCard
            key={`${column.key}-${rowIndex}`}
            table={table}
            rowIndex={rowIndex}
            titleFieldId={titleFieldId}
            cardFieldIds={cardFieldIds}
            showFieldNames={showFieldNames}
            coverFieldId={coverFieldId}
            draggable={!readOnly}
            onOpen={onOpenRecord}
            onDragStart={onDragStart}
          />
        ))}

        {!readOnly && (
          <button
            type="button"
            onClick={() => onAddRecord(column.key)}
            style={{
              height: 36,
              border: `1px dashed ${BASE_THEME.cardBorder}`,
              borderRadius: 8,
              background: '#fff',
              color: BASE_THEME.secondaryTextColor,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            <PlusOutlined />
          </button>
        )}
      </div>
    </div>
  );
};
