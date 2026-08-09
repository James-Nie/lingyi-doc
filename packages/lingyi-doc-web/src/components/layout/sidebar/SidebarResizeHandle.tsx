import React from 'react';
import { SIDEBAR_ACTIVE_COLOR } from './sidebarTheme';
import { SIDEBAR_MAX_W, SIDEBAR_MIN_W } from './useSidebarResize';

interface SidebarResizeHandleProps {
  sidebarWidth: number;
  resizeHover: boolean;
  resizing: boolean;
  onResizeStart: (e: React.MouseEvent) => void;
  onResizeHover: (hover: boolean) => void;
}

export const SidebarResizeHandle: React.FC<SidebarResizeHandleProps> = ({
  sidebarWidth,
  resizeHover,
  resizing,
  onResizeStart,
  onResizeHover,
}) => (
  <div
    role="separator"
    aria-orientation="vertical"
    aria-label="调整侧边栏宽度"
    aria-valuemin={SIDEBAR_MIN_W}
    aria-valuemax={SIDEBAR_MAX_W}
    aria-valuenow={sidebarWidth}
    onMouseDown={onResizeStart}
    onMouseEnter={() => onResizeHover(true)}
    onMouseLeave={() => onResizeHover(false)}
    style={{
      position: 'absolute',
      top: 0,
      right: -3,
      width: 6,
      height: '100%',
      cursor: 'col-resize',
      zIndex: 20,
      touchAction: 'none',
    }}
  >
    <div
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: '50%',
        width: resizeHover || resizing ? 2 : 1,
        transform: 'translateX(-50%)',
        background: resizeHover || resizing ? SIDEBAR_ACTIVE_COLOR : 'transparent',
        transition: resizing ? 'none' : 'background 0.15s ease, width 0.15s ease',
        pointerEvents: 'none',
      }}
    />
  </div>
);
