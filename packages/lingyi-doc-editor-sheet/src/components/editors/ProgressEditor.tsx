import React, { useMemo, useState } from 'react';
import { Slider } from 'antd';
import { getProgressColor, PROGRESS_RAIL_BG } from '@lingyi-doc/core-sheet';
import type { BaseEditorProps } from './BaseCellEditor';
import { resolveEditorStyle } from './editorUtils';

function getInitialProgress(initialValue: BaseEditorProps['initialValue']): number {
  if (initialValue.type === 'number') return Math.max(0, Math.min(100, initialValue.value));
  if (initialValue.type === 'text') return Math.max(0, Math.min(100, parseFloat(initialValue.text) || 0));
  return 0;
}

/** 进度编辑器（样式与画布预览态对齐：细轨道 + 彩色填充 + 右侧百分比） */
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
          boxSizing: 'border-box',
        }),
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: inline ? '0 8px' : '0 8px',
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
          rail: { background: PROGRESS_RAIL_BG, height: 4 },
          track: { background: trackColor, height: 4 },
          handle: {
            width: 14,
            height: 14,
            marginTop: -5,
            borderColor: trackColor,
            backgroundColor: '#fff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
          },
        }}
        style={{ flex: 1, margin: 0 }}
      />
      <span style={{ fontSize: 11, fontWeight: 600, color: '#333', minWidth: 34, textAlign: 'right', flexShrink: 0 }}>
        {progress}%
      </span>
    </div>
  );
};
