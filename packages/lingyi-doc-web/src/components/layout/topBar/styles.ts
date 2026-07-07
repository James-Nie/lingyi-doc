import type React from 'react';

export const TOP_BAR_HEIGHT = 56;
export const TOP_BAR_BG = '#fff';
export const TOP_BAR_BORDER = '#ebebeb';
export const TOP_BAR_TEXT = '#1f2329';
export const TOP_BAR_MUTED = '#8f959e';
export const TOP_BAR_ICON = '#646a73';
export const TOP_BAR_HOVER = '#f5f6f7';
export const TOP_BAR_PRIMARY = '#3370ff';
export const TOP_BAR_DANGER = '#f54a45';

export const topBarShellStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  minHeight: TOP_BAR_HEIGHT,
  padding: '0 20px',
  borderBottom: `1px solid ${TOP_BAR_BORDER}`,
  background: TOP_BAR_BG,
  flexShrink: 0,
};
