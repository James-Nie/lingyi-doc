import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Select } from 'antd';
import { findSelectOption, parseMultiSelectOptionIds, serializeMultiSelectOptionIds } from '@lingyi-doc/core-sheet';
import type { BaseEditorProps } from './BaseCellEditor';
import { renderSelectOptionRow, SelectOptionTag } from './SelectOptionTag';
import { resolveEditorStyle } from './editorUtils';
import {
  getSelectEditorSelectorStyle,
  getSelectPopupConfig,
  renderSelectDropdownWithSearch,
  SELECT_EDITOR_CLASS,
  useSelectOptionSearch,
} from './selectEditorShared';
import { useEditorDropdownOpen } from './useEditorDropdownOpen';
import './selectEditor.css';

/** 多选下拉编辑器 */
export const MultiSelectEditor: React.FC<BaseEditorProps> = ({
  rect, columnDef, initialValue, onCommit, inline,
}) => {
  const options = columnDef.options || [];
  const [selected, setSelected] = useState<string[]>(() =>
    parseMultiSelectOptionIds(initialValue, options),
  );
  const selectedRef = useRef(selected);
  const committedRef = useRef(false);
  const { open, handleOpenChange } = useEditorDropdownOpen({ autoOpen: !inline });
  const { search, setSearch, filteredOptions } = useSelectOptionSearch(options);

  const selectOptions = useMemo(
    () => filteredOptions.map(option => ({
      value: option.id,
      label: option.name,
    })),
    [filteredOptions],
  );

  const commitValue = (values: string[]) => {
    committedRef.current = true;
    if (values.length === 0) {
      onCommit({ type: 'empty' });
    } else {
      onCommit({ type: 'text', text: serializeMultiSelectOptionIds(values) });
    }
  };

  // 切换到其他单元格时编辑器被卸载，补一次提交避免丢改
  useEffect(() => () => {
    if (!committedRef.current) {
      const values = selectedRef.current;
      if (values.length === 0) {
        onCommit({ type: 'empty' });
      } else {
        onCommit({ type: 'text', text: serializeMultiSelectOptionIds(values) });
      }
    }
  }, [onCommit]);

  const popupConfig = getSelectPopupConfig(rect, inline, 220);
  const editorClass = `${SELECT_EDITOR_CLASS} ${inline ? 'sheet-select-editor-inline' : 'sheet-select-editor-cell'}`;

  return (
    <Select
      mode="multiple"
      open={open}
      autoFocus={false}
      showSearch={false}
      virtual={false}
      listItemHeight={40}
      allowClear
      className={editorClass}
      placeholder=""
      value={selected}
      options={selectOptions}
      onChange={values => {
        setSelected(values);
        selectedRef.current = values;
        if (inline) commitValue(values);
      }}
      onOpenChange={nextOpen => {
        if (!nextOpen) setSearch('');
        handleOpenChange(nextOpen, () => commitValue(selectedRef.current));
      }}
      style={{ ...resolveEditorStyle(rect, inline), ...getSelectEditorSelectorStyle(inline) }}
      {...popupConfig}
      getPopupContainer={() => document.body}
      dropdownRender={menu => renderSelectDropdownWithSearch(menu, search, setSearch)}
      notFoundContent={search.trim() ? '无匹配选项' : '暂无选项'}
      tagRender={({ value, onClose }) => {
        const option = findSelectOption(options, String(value));
        if (!option) {
          return (
            <span style={{ marginInlineEnd: 4 }}>
              {String(value)}
              <span onClick={onClose} style={{ marginLeft: 4, cursor: 'pointer' }}>×</span>
            </span>
          );
        }
        return (
          <span style={{ marginInlineEnd: 4, marginBottom: 2 }}>
            <SelectOptionTag
              option={option}
              size="sm"
              onRemove={e => {
                e.preventDefault();
                onClose();
              }}
            />
          </span>
        );
      }}
      optionRender={item => {
        const optionValue = item.value ?? item.data?.value;
        const opt = findSelectOption(options, String(optionValue));
        return opt ? renderSelectOptionRow(opt) : item.label;
      }}
    />
  );
};
