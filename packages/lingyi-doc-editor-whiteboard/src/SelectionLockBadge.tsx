import React from 'react';
import { FORMAT_TOOLBAR_SCREEN_GAP } from './formatToolbarUi';
import { WB_PANEL, WB_Z_INDEX } from './styles';

interface SelectionLockBadgeProps {
  anchorX: number;
  anchorY: number;
  onUnlock: () => void;
}

export const SelectionLockBadge: React.FC<SelectionLockBadgeProps> = ({
  anchorX,
  anchorY,
  onUnlock,
}) => (
  <button
    type="button"
    title="点击解锁"
    aria-label="解锁"
    onClick={onUnlock}
    onPointerDown={e => e.stopPropagation()}
    style={{
      position: 'absolute',
      left: anchorX,
      top: anchorY,
      transform: `translate(-50%, calc(-100% - ${FORMAT_TOOLBAR_SCREEN_GAP}px))`,
      zIndex: WB_Z_INDEX.shapeToolbar,
      width: 28,
      height: 28,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 0,
      border: WB_PANEL.border,
      borderRadius: 6,
      background: WB_PANEL.bg,
      boxShadow: WB_PANEL.shadow,
      cursor: 'pointer',
      pointerEvents: 'auto',
      color: '#1f2329',
    }}
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8 11V8a4 4 0 0 1 8 0v3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  </button>
);
