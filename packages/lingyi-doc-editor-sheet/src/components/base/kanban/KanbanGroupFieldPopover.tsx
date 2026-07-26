import React from 'react';
import { CheckOutlined } from '@ant-design/icons';
import type { ColumnDef } from '@lingyi-doc/core-types';
import { BASE_THEME, isGroupableColumn } from '@lingyi-doc/core-sheet';
import { FieldTypeIcon } from '../FieldTypeIcon';

export interface KanbanGroupFieldPopoverProps {
  columnDefs: ColumnDef[];
  groupFieldId?: string;
  onSelect: (fieldId: string) => void;
}

export const KanbanGroupFieldPopover: React.FC<KanbanGroupFieldPopoverProps> = ({
  columnDefs,
  groupFieldId,
  onSelect,
}) => {
  const fields = columnDefs.filter(c => !c.hidden && isGroupableColumn(c));

  return (
    <div style={{ width: 240, maxHeight: 320, overflowY: 'auto', padding: '4px 0' }}>
      {fields.map(field => {
        const active = field.id === groupFieldId;
        return (
          <button
            key={field.id}
            type="button"
            onClick={() => onSelect(field.id)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              border: 'none',
              background: active ? BASE_THEME.selectionHeaderBg : 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: 13,
              color: BASE_THEME.cellTextColor,
            }}
          >
            <FieldTypeIcon type={field.type} size={16} color={BASE_THEME.headerIconColor} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {field.name}
            </span>
            {active && <CheckOutlined style={{ color: BASE_THEME.primaryColor, fontSize: 12 }} />}
          </button>
        );
      })}
      {fields.length === 0 && (
        <div style={{ padding: 16, color: BASE_THEME.secondaryTextColor, fontSize: 13, textAlign: 'center' }}>
          暂无可分组字段
        </div>
      )}
    </div>
  );
};
