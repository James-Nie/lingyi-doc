import React from 'react';
import type { CellCoord, ColumnDef, CellValue } from '@lingyi-doc/core-types';
import { TextInputEditor } from './TextInputEditor';
import { MultilineTextEditor } from './MultilineTextEditor';
import { SelectEditor } from './SelectEditor';
import { MultiSelectEditor } from './MultiSelectEditor';
import { DateEditor } from './DateEditor';
import { DateTimeEditor } from './DateTimeEditor';
import { RatingEditor } from './RatingEditor';
import { ProgressEditor } from './ProgressEditor';
import { UserEditor } from './UserEditor';

import { AttachmentEditor } from './AttachmentEditor';
import { EditorOverlay } from './EditorOverlay';

export interface BaseEditorProps {
  coord: CellCoord;
  rect: { x: number; y: number; width: number; height: number };
  columnDef: ColumnDef;
  initialValue: CellValue;
  onCommit: (value: CellValue) => void;
  onCancel: () => void;
  /** 内联模式：用于详情抽屉等场景，不使用 fixed 定位 */
  inline?: boolean;
}

export const ANT_EDITOR_TYPES = new Set([
  'select', 'multiSelect', 'date', 'datetime', 'rating', 'progress', 'user', 'attachment',
]);

/** 根据字段类型路由到对应编辑器 */
export const BaseCellEditor: React.FC<BaseEditorProps> = (props) => {
  const { columnDef } = props;

  let editor: React.ReactNode;
  switch (columnDef.type) {
    case 'select':
      editor = <SelectEditor {...props} />;
      break;
    case 'multiSelect':
      editor = <MultiSelectEditor {...props} />;
      break;
    case 'date':
      editor = <DateEditor {...props} />;
      break;
    case 'datetime':
      editor = <DateTimeEditor {...props} />;
      break;
    case 'rating':
      editor = <RatingEditor {...props} />;
      break;
    case 'progress':
      editor = <ProgressEditor {...props} />;
      break;
    case 'user':
      editor = <UserEditor {...props} />;
      break;
    case 'attachment':
      editor = <AttachmentEditor {...props} />;
      break;
    case 'multilineText':
      editor = <MultilineTextEditor {...props} />;
      break;
    case 'text':
    case 'number':
    case 'currency':
    case 'percent':
    case 'email':
    case 'phone':
    case 'link':
    case 'formula':
    case 'autoNumber':
    default:
      editor = <TextInputEditor {...props} />;
      break;
  }

  if (ANT_EDITOR_TYPES.has(columnDef.type)) {
    return <EditorOverlay>{editor}</EditorOverlay>;
  }
  return editor;
};
