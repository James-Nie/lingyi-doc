import React from 'react';
import { SIDEBAR_HOVER_BG, SIDEBAR_MUTED } from './sidebarTheme';

interface SidebarIconBtnProps {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
}

export const SidebarIconBtn = React.forwardRef<HTMLButtonElement, SidebarIconBtnProps>(({
  children,
  title,
  onClick,
  active,
}, ref) => (
  <button
    ref={ref}
    type="button"
    title={title}
    onClick={onClick}
    style={{
      width: 22,
      height: 22,
      border: 'none',
      borderRadius: 4,
      background: active ? '#dee0e3' : 'transparent',
      cursor: 'pointer',
      fontSize: 13,
      color: SIDEBAR_MUTED,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = SIDEBAR_HOVER_BG; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = active ? '#dee0e3' : 'transparent'; }}
  >
    {children}
  </button>
));

SidebarIconBtn.displayName = 'SidebarIconBtn';
