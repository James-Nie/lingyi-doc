import React, { useState } from 'react';

interface BaseRecordRowToolbarProps {
  rowIndex: number;
  cellRect: { x: number; y: number; width: number; height: number };
  onViewDetail: (rowIndex: number) => void;
  onAddChild: (rowIndex: number) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  showViewDetail?: boolean;
  showAddChild?: boolean;
}

const Tooltip: React.FC<{ text: string; anchorHeight: number }> = ({ text, anchorHeight }) => (
  <div
    style={{
      position: 'absolute',
      bottom: anchorHeight + 6,
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#1D2129',
      color: '#fff',
      fontSize: 12,
      padding: '6px 10px',
      borderRadius: 6,
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      zIndex: 10,
    }}
  >
    {text}
    <span style={{
      position: 'absolute', top: '100%', left: '50%', marginLeft: -5,
      border: '5px solid transparent', borderTopColor: '#1D2129',
    }} />
  </div>
);

export const BaseRecordRowToolbar: React.FC<BaseRecordRowToolbarProps> = ({
  rowIndex,
  cellRect,
  onViewDetail,
  onAddChild,
  onMouseEnter,
  onMouseLeave,
  showViewDetail = true,
  showAddChild = true,
}) => {
  const [plusHovered, setPlusHovered] = useState(false);
  const [viewHovered, setViewHovered] = useState(false);

  return (
    <div
      data-sheet-keep-selection
      style={{
        position: 'absolute',
        left: cellRect.x + cellRect.width - 8,
        top: cellRect.y,
        height: cellRect.height,
        transform: 'translateX(-100%)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        paddingRight: 10,
        pointerEvents: 'auto',
        zIndex: 120,
      }}
      onMouseDown={e => e.stopPropagation()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div style={{ position: 'relative' }}>
        {viewHovered && <Tooltip text="查看详情" anchorHeight={cellRect.height} />}
        <button
          type="button"
          onMouseEnter={() => setViewHovered(true)}
          onMouseLeave={() => setViewHovered(false)}
          onClick={() => onViewDetail(rowIndex)}
          style={{
            display: showViewDetail ? 'inline-flex' : 'none',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            border: '1px solid #DEE0E3',
            borderRadius: 6,
            background: '#fff',
            cursor: 'pointer',
            fontSize: 12,
            color: '#646A73',
            height: 26,
            whiteSpace: 'nowrap',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
          </svg>
          查看
        </button>
      </div>

      <div style={{ position: 'relative' }}>
        {plusHovered && <Tooltip text="添加子记录" anchorHeight={cellRect.height} />}
        <button
          type="button"
          onMouseEnter={() => setPlusHovered(true)}
          onMouseLeave={() => setPlusHovered(false)}
          onClick={() => onAddChild(rowIndex)}
          style={{
            display: showAddChild ? 'inline-flex' : 'none',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: '#3370FF',
            fontSize: 20,
            fontWeight: 300,
            lineHeight: 1,
            padding: 0,
          }}
        >
          +
        </button>
      </div>
    </div>
  );
};
