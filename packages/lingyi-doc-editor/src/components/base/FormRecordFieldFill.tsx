import React from 'react';
import type { CellValue, ColumnDef } from '@lingyi-doc/core';
import { BASE_THEME } from '@lingyi-doc/core';
import { RecordFieldEditor } from '../editors/RecordFieldEditor';

export interface FormRecordFieldFillProps {
  label: string;
  description?: string;
  required?: boolean;
  columnDef: ColumnDef;
  value: CellValue;
  resetKey?: string | number;
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
  onChange,
}) => (
  <div style={{ marginBottom: 28 }}>
    <div style={{ marginBottom: 10, fontSize: 14, fontWeight: 500, color: BASE_THEME.cellTextColor }}>
      {label}
      {required && <span style={{ color: '#F54A45', marginLeft: 4 }}>*</span>}
    </div>
    {description && (
      <div style={{ fontSize: 13, color: BASE_THEME.secondaryTextColor, marginBottom: 10, lineHeight: '20px' }}>
        {description}
      </div>
    )}
    <div key={resetKey ?? columnDef.id}>
      <RecordFieldEditor
        columnDef={columnDef}
        initialValue={value}
        onCommit={onChange}
      />
    </div>
  </div>
);
