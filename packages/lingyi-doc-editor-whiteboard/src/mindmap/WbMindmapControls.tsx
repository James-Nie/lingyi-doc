import React, { useState } from 'react';
import type { MindmapLayout } from '@lingyi-doc/core-whiteboard';
import type { MindNoteBranchStyle } from '@lingyi-doc/core-types';
import { MindmapLayoutIcon } from './MindmapLayoutIcon';
import { MindmapLayoutPicker } from './MindmapLayoutPicker';
import { WB_MM_UI } from './types';

interface WbMindmapControlsProps {
  layout: MindmapLayout;
  branchStyle: MindNoteBranchStyle;
  onLayoutChange: (layout: MindmapLayout) => void;
  onBranchStyleChange: (style: MindNoteBranchStyle) => void;
  onRecenter: () => void;
}

export const WbMindmapControls: React.FC<WbMindmapControlsProps> = ({
  layout,
  branchStyle,
  onLayoutChange,
  onBranchStyleChange,
  onRecenter,
}) => {
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <div
      style={{
        position: 'absolute',
        right: 8,
        bottom: 8,
        zIndex: 20,
        display: 'flex',
        alignItems: 'flex-end',
        gap: 6,
        pointerEvents: 'auto',
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      <div style={{
        background: WB_MM_UI.panelBg,
        borderRadius: WB_MM_UI.radius,
        boxShadow: WB_MM_UI.panelShadow,
        padding: '4px 2px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        width: 36,
      }}>
        <IconBtn title="回到中心" onClick={onRecenter}>
          <span style={{ fontSize: 14 }}>◎</span>
        </IconBtn>
        <IconBtn title="结构与分支线" active={panelOpen} onClick={() => setPanelOpen(v => !v)}>
          <MindmapLayoutIcon layout={layout} size={24} />
        </IconBtn>
      </div>

      {panelOpen && (
        <div style={{
          background: WB_MM_UI.panelBg,
          borderRadius: WB_MM_UI.radius,
          boxShadow: WB_MM_UI.panelShadow,
          padding: '12px 14px',
        }}>
          <MindmapLayoutPicker
            layout={layout}
            branchStyle={branchStyle}
            showBranchStyle
            onLayoutChange={onLayoutChange}
            onBranchStyleChange={onBranchStyleChange}
          />
        </div>
      )}
    </div>
  );
};

function IconBtn({
  active,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  title: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        border: 'none',
        borderRadius: 6,
        background: active ? WB_MM_UI.selectBg : 'transparent',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        color: WB_MM_UI.muted,
      }}
    >
      {children}
    </button>
  );
}
