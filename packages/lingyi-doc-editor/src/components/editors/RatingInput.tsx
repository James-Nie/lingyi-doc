import React from 'react';
import type { RatingFieldConfig, RatingIconDef } from '@lingyi-doc/core';
import { getRatingItemColors } from '@lingyi-doc/core';

interface RatingIconGlyphProps {
  iconDef: RatingIconDef;
  iconKey: string;
  size: number;
  active: boolean;
  value: number;
}

/** 与表格单元格一致的评分图形 */
export const RatingIconGlyph: React.FC<RatingIconGlyphProps> = ({
  iconDef, iconKey, size, active, value,
}) => {
  const colors = getRatingItemColors(iconDef, active);

  if (iconDef.isNumber) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size * 0.85,
          borderRadius: 4,
          background: colors.color,
          color: active ? '#fff' : '#999',
          fontSize: Math.max(11, size * 0.42),
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        {value}
      </span>
    );
  }

  if (iconKey === 'star') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <path
          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
          fill={colors.color}
        />
      </svg>
    );
  }

  if (iconDef.useEmoji) {
    return (
      <span
        style={{
          fontSize: size,
          lineHeight: 1,
          filter: active ? undefined : 'grayscale(1)',
          opacity: active ? 1 : 0.35,
        }}
      >
        {iconDef.char}
      </span>
    );
  }

  return (
    <span style={{ fontSize: size, lineHeight: 1, color: colors.color, display: 'inline-block' }}>
      {iconDef.char}
    </span>
  );
};

interface RatingInputProps {
  config: RatingFieldConfig;
  value: number;
  hoverValue?: number;
  itemSize?: number;
  gap?: number;
  readOnly?: boolean;
  onChange?: (value: number) => void;
  onHoverChange?: (value: number) => void;
}

/** 评分输入（表格 / 表单复用） */
export const RatingInput: React.FC<RatingInputProps> = ({
  config,
  value,
  hoverValue = 0,
  itemSize = 28,
  gap = 10,
  readOnly = false,
  onChange,
  onHoverChange,
}) => {
  const display = hoverValue || value;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap }}>
      {Array.from({ length: config.count }, (_, i) => {
        const score = config.min + i;
        const active = score <= display;
        return (
          <button
            key={score}
            type="button"
            disabled={readOnly}
            onClick={() => onChange?.(score)}
            onMouseEnter={() => onHoverChange?.(score)}
            onMouseLeave={() => onHoverChange?.(0)}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: readOnly ? 'default' : 'pointer',
              padding: 0,
              lineHeight: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <RatingIconGlyph
              iconDef={config.iconDef}
              iconKey={config.iconKey}
              size={itemSize}
              active={active}
              value={score}
            />
          </button>
        );
      })}
    </div>
  );
};
