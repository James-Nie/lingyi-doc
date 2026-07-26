import React from 'react';
import type { CellValue, ColumnDef } from '@lingyi-doc/core-types';
import { BASE_THEME } from '@lingyi-doc/core-sheet';
import { RecordFieldEditor } from '../editors/RecordFieldEditor';

export interface FormRecordFieldFillProps {
  label: string;
  description?: string;
  required?: boolean;
  columnDef: ColumnDef;
  value: CellValue;
  resetKey?: string | number;
  readOnly?: boolean;
  onChange: (value: CellValue) => void;
}

/** 表单填写 / 记录详情：统一的字段展示与编辑区 */
export const FormRecordFieldFill: React.FC<FormRecordFieldFillProps> = ({
  label,
  description,
  required,
  columnDef,
  value,
  resetKey,
  readOnly = false,
  onChange,
}) => (
  <div style={{ marginBottom: 28 }}>
    <div style={{ marginBottom: 10, fontSize: 14, fontWeight: 500, color: BASE_THEME.cellTextColor }}>
      {label}
      {required && !readOnly && <span style={{ color: '#F54A45', marginLeft: 4 }}>*</span>}
    </div>
    {description && (
      <div style={{ fontSize: 13, color: BASE_THEME.secondaryTextColor, marginBottom: 10, lineHeight: '20px' }}>
        {description}
      </div>
    )}
    <div
      key={resetKey ?? columnDef.id}
      style={readOnly ? { pointerEvents: 'none', userSelect: 'text' } : undefined}
    >
      <RecordFieldEditor
        columnDef={columnDef}
        initialValue={value}
        onCommit={readOnly ? () => {} : onChange}
        readOnly={readOnly}
      />
    </div>
  </div>
);
