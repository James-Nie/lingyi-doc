import React, { useCallback, useState } from 'react';

interface AddRowsBarProps {
  top: number;
  headerWidth: number;
  height: number;
  onAddRows: (count: number) => void;
}

const DEFAULT_ROW_COUNT = 200;
const MIN_ROWS = 1;
const MAX_ROWS = 10000;

function clampRowCount(value: number): number {
  return Math.max(MIN_ROWS, Math.min(MAX_ROWS, Math.floor(value) || MIN_ROWS));
}

/**
 * 添加行工具栏
 * 用于在表格末尾添加行
 * @param top 工具栏距离顶部的距离
 * @param headerWidth 行头列的宽度
 * @param height 工具栏的高度
 * @param onAddRows 添加行的回调函数
 * @returns 添加行工具栏的 React 组件
 */
export const AddRowsBar: React.FC<AddRowsBarProps> = ({
  top,
  headerWidth,
  height,
  onAddRows,
}) => {
  const [inputText, setInputText] = useState(String(DEFAULT_ROW_COUNT));

  const submit = useCallback(() => {
    const n = clampRowCount(parseInt(inputText, 10) || MIN_ROWS);
    setInputText(String(n));
    onAddRows(n);
  }, [inputText, onAddRows]);

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: 0,
        right: 0,
        height,
        zIndex: 90,
        display: 'flex',
        alignItems: 'stretch',
        background: '#fff',
        borderTop: '1px solid #d4d4d4',
        pointerEvents: 'auto',
        boxSizing: 'border-box',
      }}
      data-sheet-keep-selection
    >
      {/* 行头列区域：与上方行号列对齐，居中显示 + */}
      <div
        style={{
          flex: `0 0 ${headerWidth}px`,
          width: headerWidth,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f5f5f5',
          borderRight: '1px solid #d4d4d4',
          boxSizing: 'border-box',
        }}
      >
        <button
          type="button"
          onClick={submit}
          title="在末尾添加行"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            background: 'transparent',
            color: '#333',
            cursor: 'pointer',
            fontSize: 16,
            fontWeight: 400,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          +
        </button>
      </div>

      {/* 数据区：输入框 + 「行」 */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingLeft: 10,
          background: '#fff',
          boxSizing: 'border-box',
        }}
      >
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={inputText}
          onChange={e => setInputText(e.target.value.replace(/\D/g, ''))}
          onBlur={() => {
            const n = clampRowCount(parseInt(inputText, 10) || MIN_ROWS);
            setInputText(String(n));
          }}
          onKeyDown={e => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          style={{
            width: 60,
            height: 24,
            border: '1px solid #d4d4d4',
            borderRadius: 20,
            background: '#fff',
            textAlign: 'center',
            fontSize: 12,
            color: '#333',
            outline: 'none',
            padding: '2px 10px',
            boxSizing: 'border-box',
          }}
        />
        <span style={{ fontSize: 12, color: '#666', userSelect: 'none', lineHeight: 1 }}>行</span>
      </div>
    </div>
  );
};
