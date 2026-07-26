import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CellValue, DataValidation } from '@lingyi-doc/core-types';
import { findSelectOption, normalizeSelectOptionId, parseMultiSelectOptionIds, serializeMultiSelectOptionIds } from '@lingyi-doc/core-sheet';
import {
  getSelectDropdownStyle,
  renderSelectOptionRowWithCheck,
  SelectDropdownChevron,
  SelectOptionTag,
} from './editors/SelectOptionTag';
import { useSelectOptionSearch } from './editors/selectEditorShared';
import './editors/selectEditor.css';

const FREEFORM_SEARCH_PLACEHOLDER = '查找选项';

interface FreeformDropdownEditorProps {
  rect: { x: number; y: number; width: number; height: number };
  validation: DataValidation;
  initialValue: CellValue;
  onCommit: (value: CellValue) => void;
  onClose: () => void;
}

export const FreeformDropdownEditor: React.FC<FreeformDropdownEditorProps> = ({
  rect,
  validation,
  initialValue,
  onCommit,
  onClose,
}) => {
  const options = validation.options || [];
  const isMulti = validation.mode === 'multi';
  const showOptionColor = validation.showOptionColor !== false;
  const panelRef = useRef<HTMLDivElement>(null);
  const committedRef = useRef(false);

  const currentRaw = initialValue.type === 'text' ? initialValue.text : '';
  const currentId = normalizeSelectOptionId(options, currentRaw);
  const [selectedSingle, setSelectedSingle] = useState(currentId);
  const [selectedMulti, setSelectedMulti] = useState<string[]>(() =>
    parseMultiSelectOptionIds(initialValue, options),
  );
  const selectedMultiRef = useRef(selectedMulti);
  selectedMultiRef.current = selectedMulti;
  const { search, setSearch, filteredOptions } = useSelectOptionSearch(options);

  const commitValue = useCallback((value: CellValue) => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(value);
    onClose();
  }, [onCommit, onClose]);

  const commitSingle = useCallback((optionId: string) => {
    if (!optionId) {
      commitValue({ type: 'empty' });
      return;
    }
    const option = findSelectOption(options, optionId);
    commitValue({ type: 'text', text: option?.name?.trim() || optionId });
  }, [commitValue, options]);

  const commitMulti = useCallback((ids: string[]) => {
    if (ids.length === 0) {
      commitValue({ type: 'empty' });
      return;
    }
    commitValue({ type: 'text', text: serializeMultiSelectOptionIds(ids) });
  }, [commitValue]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.('[data-freeform-dropdown-cell]')) return;
      if (isMulti) {
        commitMulti(selectedMultiRef.current);
      } else {
        onClose();
      }
    };
    window.addEventListener('mousedown', handlePointerDown, true);
    return () => window.removeEventListener('mousedown', handlePointerDown, true);
  }, [commitMulti, isMulti, onClose]);

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    zIndex: 1000,
    background: '#fff',
    border: '2px solid #3370FF',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    padding: '2px 8px',
    gap: 4,
    overflow: 'hidden',
    borderRadius: 2,
  };

  const panelStyle = getSelectDropdownStyle(rect, 220);

  const selectedPreview = useMemo(() => {
    if (isMulti) {
      return selectedMulti.slice(0, 2).map(id => {
        const option = findSelectOption(options, id);
        if (!option) return null;
        const displayOption = showOptionColor ? option : { ...option, color: '#646A73' };
        return <SelectOptionTag key={id} option={displayOption} size="sm" />;
      });
    }
    if (!selectedSingle) return null;
    const option = findSelectOption(options, selectedSingle);
    if (!option) return null;
    const displayOption = showOptionColor ? option : { ...option, color: '#646A73' };
    return <SelectOptionTag option={displayOption} size="sm" />;
  }, [isMulti, options, selectedMulti, selectedSingle, showOptionColor]);

  const handleOptionClick = (optionId: string) => {
    if (isMulti) {
      setSelectedMulti(prev => {
        const next = prev.includes(optionId)
          ? prev.filter(id => id !== optionId)
          : [...prev, optionId];
        return next;
      });
      return;
    }
    setSelectedSingle(optionId);
    commitSingle(optionId);
  };

  return createPortal(
    <>
      <div
        style={overlayStyle}
        data-sheet-keep-selection
        data-freeform-dropdown-cell
        onMouseDown={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {selectedPreview}
        </div>
        <SelectDropdownChevron />
      </div>

      <div
        ref={panelRef}
        style={panelStyle}
        className="sheet-select-dropdown sheet-select-dropdown-panel"
        data-sheet-keep-selection
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="sheet-select-dropdown-search">
          <input
            type="text"
            autoFocus
            value={search}
            placeholder={FREEFORM_SEARCH_PLACEHOLDER}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.stopPropagation()}
          />
        </div>
        <div style={{ maxHeight: 256, overflowY: 'auto' }}>
          {filteredOptions.length === 0 ? (
            <div style={{ padding: '8px 12px', color: '#86909c', fontSize: 13 }}>
              {search.trim() ? '无匹配选项' : '暂无选项'}
            </div>
          ) : filteredOptions.map(option => {
            const selected = isMulti
              ? selectedMulti.includes(option.id)
              : option.id === selectedSingle;
            const displayOption = showOptionColor ? option : { ...option, color: '#646A73' };
            return (
              <button
                key={option.id}
                type="button"
                className="sheet-select-dropdown-option"
                onClick={() => handleOptionClick(option.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  border: 'none',
                  background: selected ? '#f5f6f7' : 'transparent',
                  textAlign: 'left',
                  padding: '6px 12px',
                  cursor: 'pointer',
                }}
              >
                {renderSelectOptionRowWithCheck(displayOption, selected)}
              </button>
            );
          })}
        </div>
        {isMulti && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '8px 12px', borderTop: '1px solid #ebebeb' }}>
            <button
              type="button"
              onClick={() => commitMulti([])}
              style={{
                height: 28,
                padding: '0 10px',
                borderRadius: 6,
                border: '1px solid #dee0e3',
                background: '#fff',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              清除
            </button>
            <button
              type="button"
              onClick={() => commitMulti(selectedMulti)}
              style={{
                height: 28,
                padding: '0 10px',
                borderRadius: 6,
                border: 'none',
                background: '#3370ff',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              确定
            </button>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
};
