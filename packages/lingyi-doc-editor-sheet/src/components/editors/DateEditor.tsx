import React, { useRef, useState } from 'react';
import { DatePicker } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { BaseEditorProps } from './BaseCellEditor';
import { resolveEditorStyle } from './editorUtils';
import { useEditorDropdownOpen } from './useEditorDropdownOpen';

/** 日期编辑器 */
export const DateEditor: React.FC<BaseEditorProps> = ({
  rect, initialValue, onCommit, onCancel, inline,
}) => {
  const getInitialDate = (): Dayjs | null => {
    if (initialValue.type === 'date') {
      return dayjs(initialValue.timestamp);
    }
    return null;
  };

  const [value, setValue] = useState<Dayjs | null>(getInitialDate);
  const committedRef = useRef(false);
  const { open, handleOpenChange } = useEditorDropdownOpen({ autoOpen: !inline });

  const commitValue = (nextValue: Dayjs | null) => {
    committedRef.current = true;
    if (!nextValue) {
      onCommit({ type: 'empty' });
      return;
    }
    const ts = nextValue.valueOf();
    if (!Number.isNaN(ts)) {
      onCommit({ type: 'date', timestamp: ts, format: { kind: 'short' } });
    } else {
      onCommit({ type: 'error', error: '#VALUE!' });
    }
  };

  return (
    <DatePicker
      open={open}
      autoFocus={!inline}
      allowClear
      value={value}
      format="YYYY-MM-DD"
      placeholder="年/月/日"
      onChange={nextValue => {
        setValue(nextValue);
        commitValue(nextValue);
      }}
      onOpenChange={nextOpen => handleOpenChange(nextOpen, () => {
        if (!committedRef.current) onCancel();
      })}
      style={resolveEditorStyle(rect, inline)}
      getPopupContainer={() => document.body}
    />
  );
};
