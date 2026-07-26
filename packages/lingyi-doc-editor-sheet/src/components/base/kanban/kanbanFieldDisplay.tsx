import React from 'react';
import type { CellValue, ColumnDef } from '@lingyi-doc/core-types';
import { BASE_THEME, getMultiSelectDisplayNames, getSelectDisplayName, parseMultiSelectOptionIds } from '@lingyi-doc/core-sheet';
import { getCellText } from '@lingyi-doc/core-types';

const pillStyle = (bg: string, color = BASE_THEME.cellTextColor): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '1px 8px',
  borderRadius: 4,
  fontSize: 12,
  lineHeight: '20px',
  background: bg,
  color,
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

function SelectPill({ name, color }: { name: string; color?: string }) {
  return <span style={pillStyle(color || '#E8F0FF')}>{name}</span>;
}

export function KanbanFieldValue({
  columnDef,
  value,
}: {
  columnDef: ColumnDef;
  value: CellValue | undefined;
}): React.ReactNode {
  if (!value || value.type === 'empty') {
    return <span style={{ color: BASE_THEME.secondaryTextColor }}>—</span>;
  }

  switch (columnDef.type) {
    case 'select': {
      const raw = value.type === 'text' ? value.text : getCellText(value);
      const opt = columnDef.options?.find(o => o.id === raw || o.name === raw);
      const name = getSelectDisplayName(columnDef.options, raw);
      return name ? <SelectPill name={name} color={opt?.color} /> : null;
    }
    case 'multiSelect': {
      const ids = parseMultiSelectOptionIds(value, columnDef.options);
      const names = getMultiSelectDisplayNames(value, columnDef.options);
      if (!names.length) return null;
      return (
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {names.map((name, i) => {
            const opt = columnDef.options?.find(o => o.id === ids[i] || o.name === name);
            return <SelectPill key={`${ids[i] || name}-${i}`} name={name} color={opt?.color} />;
          })}
        </span>
      );
    }
    case 'user':
    case 'createdBy':
    case 'updatedBy': {
      const text = getCellText(value);
      if (!text) return null;
      const initial = text.charAt(0);
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: BASE_THEME.cellTextColor }}>
          <span style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: BASE_THEME.selectionHeaderBg,
            color: BASE_THEME.primaryColor,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 600,
            flexShrink: 0,
          }}>
            {initial}
          </span>
          {text}
        </span>
      );
    }
    case 'boolean':
      return (
        <span style={{ fontSize: 13, color: BASE_THEME.cellTextColor }}>
          {value.type === 'boolean' && value.value ? '是' : '否'}
        </span>
      );
    case 'attachment': {
      const text = getCellText(value);
      return text
        ? <span style={{ fontSize: 12, color: BASE_THEME.secondaryTextColor }}>{text}</span>
        : null;
    }
    default: {
      const text = getCellText(value);
      if (!text) return null;
      return (
        <span style={{
          fontSize: 13,
          color: BASE_THEME.headerTextColor,
          lineHeight: 1.4,
          wordBreak: 'break-word',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {text}
        </span>
      );
    }
  }
}
