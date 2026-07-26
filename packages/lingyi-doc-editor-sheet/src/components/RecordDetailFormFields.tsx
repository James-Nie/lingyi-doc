import React, { useCallback, useMemo } from 'react';
import type { FreeTable } from '@lingyi-doc/core-sheet';
import type { BaseFormFieldItem, CellValue, ColumnDef, BaseSheetModel } from '@lingyi-doc/core-types';
import { BASE_THEME, formatColumnDateString, isSystemColumnType } from '@lingyi-doc/core-sheet';
import { getCellText, isBaseSheet } from '@lingyi-doc/core-types';
import { FormRecordFieldFill } from './base/FormRecordFieldFill';
import { getFormFieldItems } from './base/formViewUtils';

export interface RecordDetailFieldEntry {
  item: BaseFormFieldItem;
  columnDef: ColumnDef;
  colIndex: number;
}

/** 详情面板字段列表：优先使用表单视图顺序与文案 */
export function resolveRecordDetailFields(sheet: BaseSheetModel): RecordDetailFieldEntry[] {
  const formView = sheet.views?.find(v => v.viewType === 'form');
  const formItems = getFormFieldItems(formView ?? null);
  const columnDefs = sheet.columnDefs;
  const entries: RecordDetailFieldEntry[] = [];
  const seen = new Set<string>();

  for (const item of formItems) {
    const colIndex = columnDefs.findIndex(c => c.id === item.fieldId);
    if (colIndex < 0) continue;
    const columnDef = columnDefs[colIndex];
    if (columnDef.hidden) continue;
    entries.push({ item, columnDef, colIndex });
    seen.add(item.fieldId);
  }

  columnDefs.forEach((columnDef, colIndex) => {
    if (columnDef.hidden || seen.has(columnDef.id)) return;
    entries.push({
      item: { fieldId: columnDef.id, question: columnDef.name },
      columnDef,
      colIndex,
    });
  });

  return entries;
}

function formatSystemFieldDisplay(columnDef: ColumnDef, value: CellValue): string {
  if (
    (columnDef.type === 'createdTime' || columnDef.type === 'updatedTime') &&
    value.type === 'date'
  ) {
    return formatColumnDateString(value.timestamp, columnDef.format || 'YYYY/MM/DD HH:mm');
  }
  return getCellText(value) || '—';
}

interface RecordDetailFormFieldsProps {
  table: FreeTable;
  rowIndex: number;
  resetKey?: string | number;
  onFieldChange?: () => void;
  style?: React.CSSProperties;
}

export const RecordDetailFormFields: React.FC<RecordDetailFormFieldsProps> = ({
  table,
  rowIndex,
  resetKey,
  onFieldChange,
  style,
}) => {
  const sheet = table.sheet;
  const fields = useMemo(() => {
    if (!isBaseSheet(sheet)) return [];
    return resolveRecordDetailFields(sheet);
  }, [sheet]);

  const handleChange = useCallback((colIndex: number, value: CellValue) => {
    table.setCellValue(rowIndex, colIndex, value);
    table.notifyChange(null);
    onFieldChange?.();
  }, [table, rowIndex, onFieldChange]);

  return (
    <div style={style}>
      {fields.map(({ item, columnDef, colIndex }) => {
        const value = table.getCell(rowIndex, colIndex)?.value ?? { type: 'empty' as const };
        if (isSystemColumnType(columnDef.type)) {
          return (
            <div key={columnDef.id} style={{ marginBottom: 28 }}>
              <div style={{ marginBottom: 10, fontSize: 14, fontWeight: 500, color: BASE_THEME.cellTextColor }}>
                {columnDef.name || item.question}
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: BASE_THEME.secondaryTextColor,
                  lineHeight: '22px',
                  padding: '6px 0',
                }}
              >
                {formatSystemFieldDisplay(columnDef, value)}
              </div>
            </div>
          );
        }
        return (
          <FormRecordFieldFill
            key={columnDef.id}
            label={columnDef.name || item.question || ''}
            description={item.description}
            required={item.required}
            columnDef={columnDef}
            value={value}
            resetKey={`${resetKey ?? rowIndex}-${columnDef.id}-${columnDef.ratingIcon ?? 'star'}`}
            onChange={v => handleChange(colIndex, v)}
          />
        );
      })}
    </div>
  );
};
