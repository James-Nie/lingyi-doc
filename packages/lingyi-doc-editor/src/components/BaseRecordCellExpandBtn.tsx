import React from 'react';

interface BaseRecordCellExpandBtnProps {
  rowIndex: number;
  contentRect: { x: number; y: number; width: number; height: number };
  onExpand: (rowIndex: number) => void;
}

/** 子记录首列选中时右侧展开详情按钮 */
export const BaseRecordCellExpandBtn: React.FC<BaseRecordCellExpandBtnProps> = ({
  rowIndex,
  contentRect,
  onExpand,
}) => (
  <button
    type="button"
    data-sheet-keep-selection
    title="查看详情"
    onMouseDown={e => e.stopPropagation()}
    onClick={e => {
      e.stopPropagation();
      onExpand(rowIndex);
    }}
    style={{
      position: 'absolute',
      left: contentRect.x + contentRect.width - 26,
      top: contentRect.y + (contentRect.height - 22) / 2,
      width: 22,
      height: 22,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '1px solid #DEE0E3',
      borderRadius: 4,
      background: '#fff',
      cursor: 'pointer',
      padding: 0,
      zIndex: 125,
    }}
  >
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#86909C" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </svg>
  </button>
);
