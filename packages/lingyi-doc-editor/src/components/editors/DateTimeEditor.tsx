import React, { useState } from 'react';
import { DatePicker } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { BaseEditorProps } from './BaseCellEditor';
import { resolveEditorStyle } from './editorUtils';
import { useEditorDropdownOpen } from './useEditorDropdownOpen';

/** 日期时间编辑器 */
export const DateTimeEditor: React.FC<BaseEditorProps> = ({
  rect, initialValue, onCommit, inline,
}) => {
  const getInitialDateTime = (): Dayjs | null => {
    if (initialValue.type === 'date') {
      return dayjs(initialValue.timestamp);
    }
    return null;
  };

  const [value, setValue] = useState<Dayjs | null>(getInitialDateTime);
  const { open, handleOpenChange } = useEditorDropdownOpen({ autoOpen: !inline });

  const commitValue = (nextValue: Dayjs | null) => {
    if (!nextValue) {
      onCommit({ type: 'empty' });
      return;
    }
    const ts = nextValue.valueOf();
    if (!Number.isNaN(ts)) {
      onCommit({ type: 'date', timestamp: ts, format: { kind: 'datetime' } });
    } else {
      onCommit({ type: 'error', error: '#VALUE!' });
    }
  };

  return (
    <DatePicker
      open={open}
      autoFocus={!inline}
      allowClear
      showTime
      needConfirm={false}
      value={value}
      format="YYYY-MM-DD HH:mm"
      placeholder="选择日期时间"
      onChange={nextValue => {
        setValue(nextValue);
        commitValue(nextValue);
      }}
      onOpenChange={nextOpen => handleOpenChange(nextOpen, () => {})}
      style={resolveEditorStyle(rect, inline)}
      getPopupContainer={() => document.body}
    />
  );
};
