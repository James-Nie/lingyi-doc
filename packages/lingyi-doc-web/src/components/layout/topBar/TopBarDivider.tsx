import React from 'react';
import { TOP_BAR_BORDER } from './styles';

export const TopBarDivider: React.FC = () => (
  <div
    aria-hidden
    style={{
      width: 1,
      height: 20,
      background: TOP_BAR_BORDER,
      flexShrink: 0,
      margin: '0 2px',
    }}
  />
);
