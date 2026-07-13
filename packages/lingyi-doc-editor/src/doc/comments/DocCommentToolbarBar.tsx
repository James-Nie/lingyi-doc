import React from 'react';
import { DOC_COLORS, DOC_TOOLBAR_HOVER_BG, docToolbarIconBtn } from '../styles';
import { IconOutline, IconFullscreen } from '../DocToolbarIcons';
import { ToolbarTooltip } from '../../components/Toolbar/Tooltip';

interface DocCommentToolbarBarProps {
  showComments: boolean;
  showOutline: boolean;
  onToggleComments: () => void;
  onToggleOutline: () => void;
  onToggleFullscreen: () => void;
}

function BarBtn({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <ToolbarTooltip label={label} active={active} hoverBg={DOC_TOOLBAR_HOVER_BG}>
      <button
        type="button"
        onClick={onClick}
        style={{
          ...docToolbarIconBtn(),
          background: active ? DOC_TOOLBAR_HOVER_BG : undefined,
        }}
      >
        {children}
      </button>
    </ToolbarTooltip>
  );
}

export const DocCommentToolbarBar: React.FC<DocCommentToolbarBarProps> = ({
  showComments,
  showOutline,
  onToggleComments,
  onToggleOutline,
  onToggleFullscreen,
}) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    padding: '6px 12px',
    borderBottom: `1px solid ${DOC_COLORS.border}`,
    background: '#fff',
    flexShrink: 0,
  }}>
    <BarBtn label="评论" active={showComments} onClick={onToggleComments}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      </svg>
    </BarBtn>
    <BarBtn label="大纲" active={showOutline} onClick={onToggleOutline}>
      <IconOutline />
    </BarBtn>
    <BarBtn label="全屏" onClick={onToggleFullscreen}>
      <IconFullscreen />
    </BarBtn>
  </div>
);
