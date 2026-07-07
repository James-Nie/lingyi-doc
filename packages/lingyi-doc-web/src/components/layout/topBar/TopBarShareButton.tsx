import React from 'react';
import { TOP_BAR_PRIMARY } from './styles';

interface TopBarShareButtonProps {
  onClick?: () => void;
  label?: string;
}

export const TopBarShareButton: React.FC<TopBarShareButtonProps> = ({
  onClick,
  label = '分享',
}) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: 32,
      padding: '0 14px',
      border: 'none',
      borderRadius: 16,
      background: TOP_BAR_PRIMARY,
      color: '#fff',
      fontSize: 14,
      fontWeight: 500,
      cursor: 'pointer',
      flexShrink: 0,
    }}
  >
    {label}
  </button>
);
