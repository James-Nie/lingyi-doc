import React, { useMemo, useState } from 'react';
import { Select } from 'antd';
import { findSelectOption, normalizeSelectOptionId } from '@lingyi-doc/core';
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

/** 单选下拉编辑器 */
export const SelectEditor: React.FC<BaseEditorProps> = ({
  rect, columnDef, initialValue, onCommit, inline,
}) => {
  const options = columnDef.options || [];
  const currentRaw = initialValue.type === 'text' ? initialValue.text : '';
  const currentId = normalizeSelectOptionId(options, currentRaw);
  const [selected, setSelected] = useState(currentId);
  const { open, setOpen, handleOpenChange } = useEditorDropdownOpen({ autoOpen: !inline });
  const { search, setSearch, filteredOptions } = useSelectOptionSearch(options);

  const selectOptions = useMemo(
    () => filteredOptions.map(option => ({
      value: option.id,
      label: option.name,
    })),
    [filteredOptions],
  );

  const commitValue = (value: string) => {
    if (!value) {
      onCommit({ type: 'empty' });
    } else {
      onCommit({ type: 'text', text: value });
    }
  };

  const popupConfig = getSelectPopupConfig(rect, inline);
  const editorClass = `${SELECT_EDITOR_CLASS} ${inline ? 'sheet-select-editor-inline' : 'sheet-select-editor-cell'}`;

  return (
    <Select
      open={open}
      autoFocus={false}
      showSearch={false}
      virtual={false}
      listItemHeight={40}
      allowClear
      className={editorClass}
      placeholder=""
      value={selected || undefined}
      options={selectOptions}
      onChange={value => {
        const next = value ?? '';
        setSelected(next);
        commitValue(next);
        if (inline) {
          setOpen(false);
          setSearch('');
        }
      }}
      onOpenChange={nextOpen => {
        if (!nextOpen) setSearch('');
        handleOpenChange(nextOpen, () => {});
      }}
      onClear={() => {
        setSelected('');
        commitValue('');
      }}
      style={{ ...resolveEditorStyle(rect, inline), ...getSelectEditorSelectorStyle(inline) }}
      {...popupConfig}
      getPopupContainer={() => document.body}
      dropdownRender={menu => renderSelectDropdownWithSearch(menu, search, setSearch)}
      notFoundContent={search.trim() ? '无匹配选项' : '暂无选项'}
      labelRender={({ value }) => {
        const option = value ? findSelectOption(options, String(value)) : undefined;
        return option ? <SelectOptionTag option={option} size="sm" /> : <span>{value}</span>;
      }}
      optionRender={item => {
        const optionValue = item.value ?? item.data?.value;
        const opt = findSelectOption(options, String(optionValue));
        return opt ? renderSelectOptionRow(opt) : item.label;
      }}
    />
  );
};
