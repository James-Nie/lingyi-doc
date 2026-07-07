import React, { useMemo, useState } from 'react';
import { getRatingConfig, parseRatingValue } from '@lingyi-doc/core';
import type { BaseEditorProps } from './BaseCellEditor';
import { resolveEditorStyle } from './editorUtils';
import { RatingInput } from './RatingInput';

function readRatingValue(initialValue: BaseEditorProps['initialValue'], config: ReturnType<typeof getRatingConfig>): number {
  if (!initialValue || initialValue.type === 'empty') return 0;
  const parsed = parseRatingValue(initialValue, config);
  if (initialValue.type === 'number' && initialValue.value <= 0) return 0;
  if (initialValue.type === 'text' && !(parseFloat(initialValue.text) > 0)) return 0;
  return parsed;
}

/** 评分编辑器 */
export const RatingEditor: React.FC<BaseEditorProps> = ({
  rect, initialValue, columnDef, onCommit, inline,
}) => {
  const config = useMemo(() => getRatingConfig(columnDef), [columnDef]);
  const [rating, setRating] = useState(() => readRatingValue(initialValue, config));
  const [hoverRating, setHoverRating] = useState(0);

  const handleCommit = (value: number) => {
    const clamped = Math.max(config.min, Math.min(config.max, value));
    setRating(clamped);
    onCommit({ type: 'number', value: clamped, format: { kind: 'general' } });
  };

  const itemSize = inline
    ? 28
    : Math.min(22, Math.max(12, (rect.width - 8 - (config.count - 1) * 2) / config.count));

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
        justifyContent: inline ? 'flex-start' : 'center',
      }}
    >
      <RatingInput
        config={config}
        value={rating}
        hoverValue={hoverRating}
        itemSize={itemSize}
        gap={inline ? 10 : 4}
        onChange={handleCommit}
        onHoverChange={setHoverRating}
      />
    </div>
  );
};
