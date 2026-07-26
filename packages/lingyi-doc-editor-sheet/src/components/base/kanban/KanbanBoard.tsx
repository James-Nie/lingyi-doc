import React from 'react';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import { KanbanColumn } from './KanbanColumn';
import type { KanbanColumnData } from './useKanbanBoardData';

export interface KanbanBoardProps {
  table: FreeTable;
  columns: KanbanColumnData[];
  columnWidth: number;
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

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  table,
  columns,
  columnWidth,
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
  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      overflowX: 'auto',
      overflowY: 'hidden',
      display: 'flex',
      gap: 16,
      padding: '4px 8px 12px',
      alignItems: 'stretch',
    }}>
      {columns.map(column => (
        <KanbanColumn
          key={column.key}
          table={table}
          column={column}
          width={columnWidth}
          titleFieldId={titleFieldId}
          cardFieldIds={cardFieldIds}
          showFieldNames={showFieldNames}
          coverFieldId={coverFieldId}
          readOnly={readOnly}
          onAddRecord={onAddRecord}
          onOpenRecord={onOpenRecord}
          onDragStart={onDragStart}
          onDrop={onDrop}
        />
      ))}
    </div>
  );
};
