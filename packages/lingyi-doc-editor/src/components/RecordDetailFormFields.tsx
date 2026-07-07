import React, { useCallback, useMemo } from 'react';
import type { BaseFormFieldItem, CellValue, ColumnDef, FreeTable, SheetModel } from '@lingyi-doc/core';
import { FormRecordFieldFill } from './base/FormRecordFieldFill';
import { getFormFieldItems } from './base/formViewUtils';

export interface RecordDetailFieldEntry {
  item: BaseFormFieldItem;
  columnDef: ColumnDef;
  colIndex: number;
}

/** 详情面板字段列表：优先使用表单视图顺序与文案 */
export function resolveRecordDetailFields(sheet: SheetModel): RecordDetailFieldEntry[] {
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
  const fields = useMemo(
    () => resolveRecordDetailFields(sheet),
    [sheet.columnDefs, sheet.views],
  );

  const handleChange = useCallback((colIndex: number, value: CellValue) => {
    table.setCellValue(rowIndex, colIndex, value);
    table.notifyChange(null);
    onFieldChange?.();
  }, [table, rowIndex, onFieldChange]);

  return (
    <div style={style}>
      {fields.map(({ item, columnDef, colIndex }) => (
        <FormRecordFieldFill
          key={columnDef.id}
          label={item.question || columnDef.name}
          description={item.description}
          required={item.required}
          columnDef={columnDef}
          value={table.getCell(rowIndex, colIndex)?.value ?? { type: 'empty' }}
          resetKey={`${resetKey ?? rowIndex}-${columnDef.id}-${columnDef.ratingIcon ?? 'star'}`}
          onChange={v => handleChange(colIndex, v)}
        />
      ))}
    </div>
  );
};
