import React, { useState } from 'react';
import type { MindmapLayout, MindNoteBranchStyle } from '@lingyi-doc/core';
import { WB_MM_UI } from './types';

interface WbMindmapControlsProps {
  layout: MindmapLayout;
  branchStyle: MindNoteBranchStyle;
  onLayoutChange: (layout: MindmapLayout) => void;
  onBranchStyleChange: (style: MindNoteBranchStyle) => void;
  onRecenter: () => void;
}

const STRUCTURE_LABELS: Record<MindmapLayout, string> = {
  right: '向右',
  left: '向左',
  balanced: '平衡',
  vertical: '向下',
  treeRight: '向右',
  treeLeft: '向左',
  treeBalanced: '左右',
  timelineH: '横向',
  timelineV: '纵向',
};

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
          <span style={{ fontSize: 13 }}>⊞</span>
        </IconBtn>
      </div>

      {panelOpen && (
        <div style={{
          background: WB_MM_UI.panelBg,
          borderRadius: WB_MM_UI.radius,
          boxShadow: WB_MM_UI.panelShadow,
          padding: '12px 14px',
          minWidth: 220,
        }}>
          <div style={{ fontSize: 12, color: WB_MM_UI.muted, marginBottom: 8, fontWeight: 500 }}>结构</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {(['right', 'left', 'balanced', 'vertical'] as MindmapLayout[]).map(s => (
              <button
                key={s}
                type="button"
                title={STRUCTURE_LABELS[s]}
                onClick={() => onLayoutChange(s)}
                style={{
                  width: 36,
                  height: 36,
                  border: `1px solid ${layout === s ? WB_MM_UI.accent : '#dee0e3'}`,
                  borderRadius: 6,
                  background: layout === s ? WB_MM_UI.selectBg : '#fff',
                  cursor: 'pointer',
                  fontSize: 11,
                  color: layout === s ? WB_MM_UI.accent : WB_MM_UI.muted,
                }}
              >
                {STRUCTURE_LABELS[s].slice(0, 1)}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: WB_MM_UI.muted, marginBottom: 8, fontWeight: 500 }}>分支线</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['straight', 'curve'] as MindNoteBranchStyle[]).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => onBranchStyleChange(s)}
                style={{
                  flex: 1,
                  height: 32,
                  border: `1px solid ${branchStyle === s ? WB_MM_UI.accent : '#dee0e3'}`,
                  borderRadius: 6,
                  background: branchStyle === s ? WB_MM_UI.selectBg : '#fff',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: branchStyle === s ? WB_MM_UI.accent : WB_MM_UI.muted,
                }}
              >
                {s === 'straight' ? '折线' : '曲线'}
              </button>
            ))}
          </div>
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
