import type React from 'react';
import { useMemo, useState } from 'react';
import type { SelectOption } from '@lingyi-doc/core';
import { BASE_THEME } from '@lingyi-doc/core';
import type { EditorRect } from './editorUtils';
import { getSelectPopupWidth } from './editorUtils';

export const SELECT_SEARCH_PLACEHOLDER = '查找或创建选项';
export const SELECT_EDITOR_CLASS = 'sheet-select-editor';
export const SELECT_DROPDOWN_CLASS = 'sheet-select-dropdown';

export function useSelectOptionSearch(options: SelectOption[]) {
  const [search, setSearch] = useState('');
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter(option => option.name.toLowerCase().includes(query));
  }, [options, search]);

  return { search, setSearch, filteredOptions };
}

export function renderSelectDropdownWithSearch(
  menu: React.ReactElement,
  search: string,
  onSearchChange: (value: string) => void,
  placeholder = SELECT_SEARCH_PLACEHOLDER,
): React.ReactElement {
  return (
    <div className="sheet-select-dropdown-panel" data-sheet-keep-selection>
      <div className="sheet-select-dropdown-search">
        <input
          type="text"
          autoFocus
          value={search}
          placeholder={placeholder}
          onChange={e => onSearchChange(e.target.value)}
          onKeyDown={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
        />
      </div>
      {menu}
    </div>
  );
}

export function getSelectEditorSelectorStyle(inline?: boolean): React.CSSProperties {
  if (inline) {
    return { width: '100%', minHeight: 32 };
  }
  // 单元格模式：宽度由 getFixedCellStyle(rect) 提供，不可再设 100%（会撑满视口）
  return {
    boxSizing: 'border-box',
    overflow: 'hidden',
  };
}

export function getSelectPopupConfig(rect: EditorRect, inline?: boolean, minWidth = 200) {
  const popupStyleBase = {
    zIndex: 1001,
    borderRadius: 8,
    padding: '4px 0',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
  };

  if (inline) {
    return {
      popupMatchSelectWidth: true,
      styles: {
        popup: {
          root: popupStyleBase,
        },
      },
      classNames: {
        popup: {
          root: SELECT_DROPDOWN_CLASS,
        },
      },
    } as const;
  }

  const width = getSelectPopupWidth(rect, minWidth);
  return {
    popupMatchSelectWidth: false,
    styles: {
      popup: {
        root: {
          ...popupStyleBase,
          width,
          minWidth: width,
        },
      },
    },
    classNames: {
      popup: {
        root: SELECT_DROPDOWN_CLASS,
      },
    },
  } as const;
}

export const selectEditorTokenStyle = {
  borderRadius: 6,
  colorBorder: BASE_THEME.gridColor,
  colorPrimary: BASE_THEME.primaryColor,
  controlOutline: 'none',
  controlOutlineWidth: 0,
};
