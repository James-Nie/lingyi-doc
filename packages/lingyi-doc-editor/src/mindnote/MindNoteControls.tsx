import React, { useEffect, useRef, useState } from 'react';
import type { MindNoteBranchStyle, MindNoteStructure, MindNoteViewMode } from '@lingyi-doc/core';
import { MN_COLORS } from './styles';

interface MindNoteControlsProps {
  embedded?: boolean;
  readOnly?: boolean;
  viewMode: MindNoteViewMode;
  structure: MindNoteStructure;
  branchStyle: MindNoteBranchStyle;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  onViewModeChange: (mode: MindNoteViewMode) => void;
  onStructureChange: (s: MindNoteStructure) => void;
  onBranchStyleChange: (s: MindNoteBranchStyle) => void;
  onZoomChange: (z: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onRecenter?: () => void;
}

const PANEL = {
  bg: '#FFFFFF',
  shadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
  radius: 8,
  selectBg: '#E6F0FF',
  selectColor: '#5B8FF9',
  inactive: '#8C8C8C',
  disabled: '#C9CDD4',
  label: '#646A73',
};

/** 左上：大纲 / 导图切换 */
function ViewToggle({
  viewMode,
  onViewModeChange,
  embedded,
}: {
  viewMode: MindNoteViewMode;
  onViewModeChange: (mode: MindNoteViewMode) => void;
  embedded?: boolean;
}) {
  return (
    <div style={{
      position: embedded ? 'absolute' : 'fixed',
      left: embedded ? 16 : 24,
      top: embedded ? 16 : 88,
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column',
      background: '#FFFFFF',
      border: `1px solid ${MN_COLORS.border}`,
      borderRadius: 8,
      boxShadow: '0 2px 12px rgba(31, 35, 41, 0.08)',
      overflow: 'hidden',
    }}>
      <ViewModeBtn
        label="大纲笔记"
        active={viewMode === 'outline'}
        onClick={() => onViewModeChange('outline')}
      >
        <OutlineViewIcon active={viewMode === 'outline'} />
      </ViewModeBtn>
      <div style={{ height: 1, background: MN_COLORS.border, flexShrink: 0 }} />
      <ViewModeBtn
        label="思维导图"
        active={viewMode === 'map'}
        onClick={() => onViewModeChange('map')}
      >
        <MapViewIcon active={viewMode === 'map'} />
      </ViewModeBtn>
    </div>
  );
}

function ViewModeBtn({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const showTooltip = hovered;
  const highlighted = active || hovered;

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {showTooltip && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            left: '100%',
            top: '50%',
            transform: 'translateY(-50%)',
            marginLeft: 8,
            padding: '5px 10px',
            background: '#1F2329',
            color: '#fff',
            fontSize: 12,
            lineHeight: '18px',
            borderRadius: 6,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 60,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          {label}
          <span
            style={{
              position: 'absolute',
              right: '100%',
              top: '50%',
              transform: 'translateY(-50%)',
              width: 0,
              height: 0,
              borderTop: '4px solid transparent',
              borderBottom: '4px solid transparent',
              borderRight: '4px solid #1F2329',
            }}
          />
        </div>
      )}
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        style={{
          width: 36,
          height: 36,
          border: 'none',
          background: highlighted ? '#F2F3F5' : '#FFFFFF',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          transition: 'background 0.15s ease',
        }}
      >
        {children}
      </button>
    </div>
  );
}

export const MindNoteControls: React.FC<MindNoteControlsProps> = ({
  embedded,
  readOnly = false,
  viewMode,
  structure,
  branchStyle,
  zoom,
  canUndo,
  canRedo,
  onViewModeChange,
  onStructureChange,
  onBranchStyleChange,
  onZoomChange,
  onUndo,
  onRedo,
  onRecenter,
}) => {
  const [panelOpen, setPanelOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelOpen) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [panelOpen]);

  return (
    <>
      <ViewToggle viewMode={viewMode} onViewModeChange={onViewModeChange} embedded={embedded} />

      {!readOnly && (
      <div
        ref={wrapRef}
        style={{
          position: embedded ? 'absolute' : 'fixed',
          left: embedded ? 16 : 24,
          bottom: embedded ? 16 : 24,
          zIndex: 50,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
        }}
      >
        <div style={{
          background: PANEL.bg,
          borderRadius: PANEL.radius,
          boxShadow: PANEL.shadow,
          padding: '6px 4px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          width: 40,
        }}>
          <ToolbarIconBtn title="撤销" disabled={!canUndo} onClick={onUndo}>
            <UndoIcon color={canUndo ? '#646A73' : PANEL.disabled} />
          </ToolbarIconBtn>
          <ToolbarIconBtn title="重做" disabled={!canRedo} onClick={onRedo}>
            <RedoIcon color={canRedo ? '#646A73' : PANEL.disabled} />
          </ToolbarIconBtn>

          {viewMode === 'map' && onRecenter && (
            <ToolbarIconBtn title="回到中心" onClick={onRecenter}>
              <RecenterIcon />
            </ToolbarIconBtn>
          )}

          {viewMode === 'map' && (
            <ToolbarIconBtn
              title="结构与分支线"
              active={panelOpen}
              onClick={() => setPanelOpen(v => !v)}
            >
              <StructureTriggerIcon active={panelOpen} />
            </ToolbarIconBtn>
          )}

          {viewMode === 'map' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, paddingTop: 4 }}>
              <button
                type="button"
                title="放大"
                onClick={() => onZoomChange(Math.min(200, zoom + 10))}
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 14, color: PANEL.inactive, lineHeight: 1, padding: '2px 0',
                }}
              >
                +
              </button>
              <button
                type="button"
                title="重置缩放 100%"
                onClick={() => onZoomChange(100)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: 11,
                  color: PANEL.inactive,
                  padding: '2px 0',
                  lineHeight: 1.2,
                  minWidth: 36,
                }}
              >
                {zoom}%
              </button>
              <button
                type="button"
                title="缩小"
                onClick={() => onZoomChange(Math.max(25, zoom - 10))}
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 14, color: PANEL.inactive, lineHeight: 1, padding: '2px 0',
                }}
              >
                −
              </button>
            </div>
          )}
        </div>

        {viewMode === 'map' && panelOpen && (
          <div style={{
            background: PANEL.bg,
            borderRadius: PANEL.radius,
            boxShadow: PANEL.shadow,
            padding: '14px 16px 16px',
            minWidth: 248,
          }}>
            <div style={{ fontSize: 13, color: PANEL.label, marginBottom: 10, fontWeight: 500 }}>
              结构
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {(['right', 'left', 'balanced', 'vertical'] as MindNoteStructure[]).map(s => (
                <OptionBtn
                  key={s}
                  active={structure === s}
                  size="sm"
                  title={STRUCTURE_LABELS[s]}
                  onClick={() => onStructureChange(s)}
                >
                  <StructureOptionIcon type={s} active={structure === s} />
                </OptionBtn>
              ))}
            </div>

            <div style={{ fontSize: 13, color: PANEL.label, marginBottom: 10, fontWeight: 500 }}>
              分支线
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <OptionBtn
                active={branchStyle === 'straight'}
                size="lg"
                title="折线"
                onClick={() => onBranchStyleChange('straight')}
              >
                <BranchStraightIcon active={branchStyle === 'straight'} />
              </OptionBtn>
              <OptionBtn
                active={branchStyle === 'curve'}
                size="lg"
                title="曲线"
                onClick={() => onBranchStyleChange('curve')}
              >
                <BranchCurveIcon active={branchStyle === 'curve'} />
              </OptionBtn>
            </div>
          </div>
        )}
      </div>
      )}
    </>
  );
};

const STRUCTURE_LABELS: Record<MindNoteStructure, string> = {
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

function ToolbarIconBtn({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 32,
        height: 32,
        border: 'none',
        borderRadius: 6,
        background: active ? PANEL.selectBg : 'transparent',
        cursor: disabled ? 'default' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

function OptionBtn({
  active,
  size,
  title,
  onClick,
  children,
}: {
  active: boolean;
  size: 'sm' | 'lg';
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const width = size === 'sm' ? 40 : 56;
  const height = size === 'sm' ? 40 : 44;
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        width,
        height,
        border: 'none',
        borderRadius: 6,
        background: active ? PANEL.selectBg : 'transparent',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function OutlineViewIcon({ active }: { active: boolean }) {
  const c = active ? '#646A73' : '#8F959E';
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M8 6h12M8 12h12M8 18h8" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="4" cy="6" r="1.2" fill={c} />
      <circle cx="4" cy="12" r="1.2" fill={c} />
      <circle cx="4" cy="18" r="1.2" fill={c} />
    </svg>
  );
}

function MapViewIcon({ active }: { active: boolean }) {
  const c = active ? '#3370FF' : '#8F959E';
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 5v14" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6 8h10M6 12h12M6 16h8" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 8v8" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function UndoIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M9 14L4 9l5-5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 9h10a5 5 0 0 1 5 5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function RedoIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M15 14l5-5-5-5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 9H10a5 5 0 0 0-5 5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function RecenterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="#646A73" strokeWidth="1.8" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="#646A73" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function StructureTriggerIcon({ active }: { active: boolean }) {
  const c = active ? PANEL.selectColor : PANEL.inactive;
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M5 6v12" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5 8h8M5 12h10M5 16h6" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M13 8v8" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function StructureOptionIcon({ type, active }: { type: MindNoteStructure; active: boolean }) {
  const c = active ? PANEL.selectColor : PANEL.inactive;
  switch (type) {
    case 'right':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M5 5v14" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M5 7h10M5 12h12M5 17h8" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M15 7v10" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'left':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M19 5v14" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M19 7H9M19 12H7M19 17H11" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M9 7v10" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'balanced':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 4v16" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M12 8H5M12 12H4M12 16H6" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M12 8h7M12 12h8M12 16h6" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'vertical':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M8 5h8" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M12 5v5" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M6 10h12" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M8 10v9M12 10v7M16 10v9" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
  }
}

function BranchStraightIcon({ active }: { active: boolean }) {
  const c = active ? PANEL.selectColor : PANEL.inactive;
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M4 12h6" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 12v-5h8" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 12v5h8" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BranchCurveIcon({ active }: { active: boolean }) {
  const c = active ? PANEL.selectColor : PANEL.inactive;
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M4 12h5" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 12c3-6 6-6 9-3" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 12c3 6 6 6 9 3" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
