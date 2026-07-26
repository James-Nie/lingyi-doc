import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CellValue } from '@lingyi-doc/core-types';
import type { BaseEditorProps } from './BaseCellEditor';
import { useSheetStore } from '../../store/sheetStore';

const EDIT_BORDER = '#8B7CF7';
const HINT_COLOR = '#BFBFBF';
const HINT_HEIGHT = 26;

function resolveInitialText(initialValue: CellValue, seededFromKeyboard: boolean, formulaBarText: string): string {
  if (seededFromKeyboard && formulaBarText !== '') return formulaBarText;
  if (initialValue.type === 'text') return initialValue.text;
  if (initialValue.type === 'number') return String(initialValue.value);
  if (initialValue.type === 'formula') return initialValue.formula;
  return '';
}

/** 多行文本编辑器：紫边框弹层，Shift+Enter 换行，Enter 结束 */
export const MultilineTextEditor: React.FC<BaseEditorProps> = ({
  rect, initialValue, onCommit, onCancel, inline,
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const minW = Math.max(rect.width, 200);
  const minH = Math.max(rect.height, 120);

  useEffect(() => {
    if (inline) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    if (seededFromKeyboardRef.current) {
      el.setSelectionRange(len, len);
    } else {
      el.select();
    }
  }, [inline]);

  const handleCommit = () => {
    if (committedRef.current) return;
    if (!inline) committedRef.current = true;
    const text = value;
    if (text.trim() === '') {
      onCommit({ type: 'empty' });
      return;
    }
    onCommit({ type: 'text', text });
  };

  const handleCancel = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCancel();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (inline) {
      // 表单/详情：Enter 换行，失焦提交
      e.stopPropagation();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleCancel();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      if (useSheetStore.getState().shouldIgnoreKeyboardEditCommit()) return;
      handleCommit();
      return;
    }
    // Shift+Enter：默认换行；阻止冒泡到表格快捷键
    e.stopPropagation();
  };

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    useSheetStore.getState().setFormulaBarText(e.target.value);
  };

  const onBlur = () => {
    if (useSheetStore.getState().shouldIgnoreKeyboardEditCommit()) return;
    handleCommit();
  };

  if (inline) {
    return (
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          onBlur={onBlur}
          rows={4}
          placeholder="请输入内容"
          style={{
            width: '100%',
            minHeight: 96,
            resize: 'vertical',
            border: `1px solid ${EDIT_BORDER}`,
            borderRadius: 4,
            padding: '8px 10px',
            fontSize: 13,
            lineHeight: 1.5,
            fontFamily: 'inherit',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>
    );
  }

  return createPortal(
    <div
      data-sheet-keep-selection
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: rect.x,
        top: rect.y,
        width: minW,
        minHeight: minH,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        border: `2px solid ${EDIT_BORDER}`,
        borderRadius: 4,
        boxShadow: '0 4px 16px rgba(139, 124, 247, 0.18)',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        onBlur={onBlur}
        style={{
          flex: 1,
          minHeight: minH - HINT_HEIGHT,
          width: '100%',
          border: 'none',
          outline: 'none',
          resize: 'none',
          padding: '8px 10px 4px',
          fontSize: 13,
          lineHeight: 1.55,
          color: '#262626',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
          background: 'transparent',
        }}
      />
      <div
        style={{
          flexShrink: 0,
          height: HINT_HEIGHT,
          padding: '2px 10px 6px',
          fontSize: 12,
          color: HINT_COLOR,
          textAlign: 'right',
          userSelect: 'none',
          letterSpacing: 0.2,
          boxSizing: 'border-box',
        }}
      >
        Shift+Enter 换行　Enter 结束编辑
      </div>
    </div>,
    document.body,
  );
};
