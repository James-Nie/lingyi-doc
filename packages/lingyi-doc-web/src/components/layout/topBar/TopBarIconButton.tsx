import React from 'react';
import { TOP_BAR_HOVER, TOP_BAR_ICON } from './styles';

interface TopBarIconButtonProps {
  title: string;
  onClick?: () => void;
  active?: boolean;
  filled?: boolean;
  children: React.ReactNode;
}

export const TopBarIconButton: React.FC<TopBarIconButtonProps> = ({
  title,
  onClick,
  active,
  filled,
  children,
}) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    style={{
      width: 32,
      height: 32,
      border: filled ? 'none' : 'none',
      borderRadius: 6,
      background: active || filled ? TOP_BAR_HOVER : 'transparent',
      cursor: 'pointer',
      color: TOP_BAR_ICON,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      padding: 0,
    }}
    onMouseEnter={e => { e.currentTarget.style.background = TOP_BAR_HOVER; }}
    onMouseLeave={e => {
      e.currentTarget.style.background = active || filled ? TOP_BAR_HOVER : 'transparent';
    }}
  >
    {children}
  </button>
);
