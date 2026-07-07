import React from 'react';
import { Checkbox } from 'antd';
import type { CellValue, ColumnDef } from '@lingyi-doc/core';
import { BaseCellEditor } from './BaseCellEditor';
import { EditorAntdProvider } from './EditorAntdProvider';

const INLINE_RECT = { x: 0, y: 0, width: 360, height: 32 };
const INLINE_COORD = { row: 0, col: 0 };

export interface RecordFieldEditorProps {
  columnDef: ColumnDef;
  initialValue: CellValue;
  onCommit: (value: CellValue) => void;
}

/** 详情抽屉 / 表单填写：复用单元格同款编辑器 */
export const RecordFieldEditor: React.FC<RecordFieldEditorProps> = ({
  columnDef,
  initialValue,
  onCommit,
}) => {
  if (columnDef.type === 'boolean') {
    const checked = initialValue.type === 'boolean' ? initialValue.value : false;
    return (
      <EditorAntdProvider>
        <Checkbox
          checked={checked}
          onChange={e => onCommit({ type: 'boolean', value: e.target.checked })}
        />
      </EditorAntdProvider>
    );
  }

  return (
    <EditorAntdProvider>
      <BaseCellEditor
        inline
        coord={INLINE_COORD}
        rect={INLINE_RECT}
        columnDef={columnDef}
        initialValue={initialValue}
        onCommit={onCommit}
        onCancel={() => {}}
      />
    </EditorAntdProvider>
  );
};
