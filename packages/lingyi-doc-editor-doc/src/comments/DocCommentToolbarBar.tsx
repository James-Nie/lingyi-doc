import React from 'react';
import { DOC_COLORS, DOC_TOOLBAR_HOVER_BG, docToolbarIconBtn } from '../styles';
import { IconOutline, IconFullscreen } from '../DocToolbarIcons';
import { ToolbarTooltip } from '@lingyi-doc/editor-shared';

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
    <BarBtn label="大纲" active={showOutline} onClick={onToggleOutline}>
      <IconOutline />
    </BarBtn>
    <BarBtn label="全屏" onClick={onToggleFullscreen}>
      <IconFullscreen />
    </BarBtn>
  </div>
);
