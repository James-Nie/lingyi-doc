import React, { useMemo, useState } from 'react';
import { Slider } from 'antd';
import type { BaseEditorProps } from './BaseCellEditor';
import { resolveEditorStyle } from './editorUtils';

function getInitialProgress(initialValue: BaseEditorProps['initialValue']): number {
  if (initialValue.type === 'number') return Math.max(0, Math.min(100, initialValue.value));
  if (initialValue.type === 'text') return Math.max(0, Math.min(100, parseFloat(initialValue.text) || 0));
  return 0;
}

function getProgressColor(progress: number): string {
  if (progress >= 100) return '#52c41a';
  if (progress >= 60) return '#1677ff';
  return '#fa8c16';
}

/** 进度编辑器 */
export const ProgressEditor: React.FC<BaseEditorProps> = ({
  rect, initialValue, onCommit, inline,
}) => {
  const [progress, setProgress] = useState(() => getInitialProgress(initialValue));
  const trackColor = useMemo(() => getProgressColor(progress), [progress]);

  const handleCommit = (value: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    onCommit({ type: 'number', value: clamped, format: { kind: 'general' } });
  };

  return (
    <div
      style={{
        ...resolveEditorStyle(rect, inline, inline ? undefined : rect.height),
        ...(inline ? {} : {
          background: '#fff',
          border: '1px solid #1677ff',
          borderRadius: 4,
          boxSizing: 'border-box',
        }),
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: inline ? 0 : '0 8px',
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      <Slider
        min={0}
        max={100}
        value={progress}
        onChange={setProgress}
        onChangeComplete={handleCommit}
        tooltip={{ formatter: value => `${value}%` }}
        styles={{
          track: { background: trackColor },
        }}
        style={{ flex: 1, margin: 0 }}
      />
      <span style={{ fontSize: 11, fontWeight: 600, color: '#333', minWidth: 36, textAlign: 'right' }}>
        {progress}%
      </span>
    </div>
  );
};
