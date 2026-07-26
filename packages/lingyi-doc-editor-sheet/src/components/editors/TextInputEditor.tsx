import React, { useState, useRef, useEffect } from 'react';
import type { CellValue } from '@lingyi-doc/core-types';
import { getCurrencyConfig, toCurrencyNumberFormat } from '@lingyi-doc/core-sheet';
import type { BaseEditorProps } from './BaseCellEditor';
import { resolveEditorStyle } from './editorUtils';
import { useSheetStore } from '../../store/sheetStore';

function resolveInitialText(initialValue: CellValue, seededFromKeyboard: boolean, formulaBarText: string): string {
  // 键盘打字进编辑：首字符已写入 formulaBar，优先使用，避免被空单元格 initialValue 覆盖
  if (seededFromKeyboard && formulaBarText !== '') {
    return formulaBarText;
  }
  if (initialValue.type === 'text') return initialValue.text;
  if (initialValue.type === 'number') return String(initialValue.value);
  if (initialValue.type === 'boolean') return initialValue.value ? 'TRUE' : 'FALSE';
  if (initialValue.type === 'date') return String(initialValue.timestamp);
  if (initialValue.type === 'formula') return initialValue.formula;
  return '';
}

/** 文本/数字/货币/百分比/邮箱/电话/链接/公式/自动编号 编辑器 */
export const TextInputEditor: React.FC<BaseEditorProps> = ({
  rect, columnDef, initialValue, onCommit, onCancel, inline,
}) => {
  const seededFromKeyboardRef = useRef(false);
  const committedRef = useRef(false);
  const [value, setValue] = useState(() => {
    const store = useSheetStore.getState();
    const seeded = store.keyboardEditOpenedAt > 0
      && Date.now() - store.keyboardEditOpenedAt < 300;
    seededFromKeyboardRef.current = seeded;
    return resolveInitialText(initialValue, seeded, store.formulaBarText);
  });

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inline) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    // number/date 等类型不支持 setSelectionRange / select
    const selectionSafe = input.type === 'text'
      || input.type === 'search'
      || input.type === 'url'
      || input.type === 'tel'
      || input.type === 'password'
      || input.type === '';
    if (!selectionSafe) return;
    try {
      if (seededFromKeyboardRef.current) {
        const len = input.value.length;
        input.setSelectionRange(len, len);
      } else {
        input.select();
      }
    } catch {
      // 部分浏览器对特定 type 仍会抛错，忽略即可
    }
  }, [inline]);

  const handleCommit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const trimmed = value.trim();
    if (trimmed === '') {
      onCommit({ type: 'empty' });
      return;
    }

    const type = columnDef.type;

    // 根据字段类型转换值
    if (type === 'number' || type === 'currency' || type === 'percent' || type === 'rating' || type === 'progress') {
      const num = Number(trimmed.replace(/,/g, '').replace(/%/g, ''));
      if (!isNaN(num)) {
        if (type === 'currency') {
          onCommit({ type: 'number', value: num, format: toCurrencyNumberFormat(getCurrencyConfig(columnDef)) });
          return;
        }
        if (type === 'percent') {
          onCommit({ type: 'number', value: num, format: { kind: 'percent', decimals: 2 } });
          return;
        }
        onCommit({ type: 'number', value: num, format: { kind: 'general' } });
        return;
      }
    }

    if (type === 'formula' && trimmed.startsWith('=')) {
      onCommit({ type: 'formula', formula: trimmed });
      return;
    }

    onCommit({ type: 'text', text: trimmed });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (useSheetStore.getState().shouldIgnoreKeyboardEditCommit()) return;
      handleCommit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      committedRef.current = true;
      onCancel();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      handleCommit();
    }
  };

  const getInputType = (): string => {
    switch (columnDef.type) {
      case 'number':
      case 'currency':
      case 'percent':
      case 'rating':
      case 'progress': return 'number';
      case 'email': return 'email';
      case 'date': return 'date';
      case 'link': return 'url';
      default: return 'text';
    }
  };

  const getPlaceholder = (): string | undefined => {
    if (!inline) return undefined;
    switch (columnDef.type) {
      case 'email':
      case 'phone':
      case 'link':
      case 'text':
      case 'number':
      case 'currency':
      case 'percent':
        return '请输入内容';
      default:
        return undefined;
    }
  };

  const inlineStyle = resolveEditorStyle(rect, inline);
  const cellStyle: React.CSSProperties = inline ? {
    ...inlineStyle,
    border: '1px solid #d9d9d9',
    borderRadius: 4,
    padding: '4px 8px',
    fontSize: 13,
    fontFamily: 'Arial, sans-serif',
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
  } : {
    ...inlineStyle,
    border: '1px solid #1a73e8',
    borderRadius: 2,
    padding: '0 4px',
    fontSize: 13,
    fontFamily: 'Arial, sans-serif',
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <input
      ref={inputRef}
      type={getInputType()}
      value={value}
      placeholder={getPlaceholder()}
      onChange={e => {
        setValue(e.target.value);
        useSheetStore.getState().setFormulaBarText(e.target.value);
      }}
      onKeyDown={handleKeyDown}
      onBlur={() => {
        if (useSheetStore.getState().shouldIgnoreKeyboardEditCommit()) return;
        handleCommit();
      }}
      style={cellStyle}
    />
  );
};
