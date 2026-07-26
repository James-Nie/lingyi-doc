import React, { useState } from 'react';
import { MIND_NODE_MAX_WIDTH } from '@lingyi-doc/core-mindmap';
import { MN_COLORS } from './styles';

export interface MindNoteNodeImageProps {
  src: string;
  width?: number;
  height?: number;
  maxWidth?: number;
  onRemove?: () => void;
}

export const MindNoteNodeImage: React.FC<MindNoteNodeImageProps> = ({
  src,
  width,
  height,
  maxWidth = MIND_NODE_MAX_WIDTH,
  onRemove,
}) => {
  const [hovered, setHovered] = useState(false);
  const fittedWidth = width && height ? Math.min(width, maxWidth) : maxWidth;
  const fittedHeight = width && height
    ? Math.max(1, Math.round(height * (fittedWidth / width)))
    : undefined;

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-block',
        maxWidth: '100%',
        marginTop: 8,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          border: `1px solid ${MN_COLORS.border}`,
          borderRadius: 6,
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          lineHeight: 0,
          background: '#fff',
        }}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          style={{
            display: 'block',
            width: fittedWidth,
            height: fittedHeight,
            maxWidth: '100%',
            objectFit: 'contain',
          }}
        />
      </div>

      {hovered && onRemove && (
        <>
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: -6,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: 'rgba(91, 143, 249, 0.28)',
              border: `2px solid ${MN_COLORS.primary}`,
              pointerEvents: 'none',
            }}
          />
          <button
            type="button"
            aria-label="删除图片"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            onMouseDown={(e) => e.preventDefault()}
            style={{
              position: 'absolute',
              right: 8,
              bottom: 8,
              width: 24,
              height: 24,
              borderRadius: '50%',
              border: 'none',
              background: '#F54A45',
              color: '#fff',
              fontSize: 16,
              lineHeight: '24px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            }}
          >
            ×
          </button>
        </>
      )}
    </div>
  );
};
