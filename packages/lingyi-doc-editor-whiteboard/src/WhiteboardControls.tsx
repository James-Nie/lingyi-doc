import React, { useState } from 'react';
import { WB_COLORS, WB_PANEL } from './styles';

interface WhiteboardControlsProps {
  embedded?: boolean;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  panMode: boolean;
  readOnly?: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomTo: (zoom: number) => void;
  onFitView: () => void;
  onResetView: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onTogglePan: () => void;
}

const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];

export const WhiteboardControls: React.FC<WhiteboardControlsProps> = ({
  embedded,
  zoom,
  canUndo,
  canRedo,
  panMode,
  readOnly,
  onZoomIn,
  onZoomOut,
  onZoomTo,
  onFitView,
  onResetView,
  onUndo,
  onRedo,
  onTogglePan,
}) => {
  const pct = Math.round(zoom * 100);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);

  return (
    <div style={{
      position: 'absolute',
      right: embedded ? 16 : 24,
      bottom: embedded ? 16 : 24,
      zIndex: 60,
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '6px 8px',
      background: WB_PANEL.bg,
      borderRadius: WB_COLORS.toolbarRadius,
      boxShadow: WB_COLORS.toolbarShadow,
      border: WB_PANEL.border,
    }}>
      <ControlBtn disabled={readOnly || !canUndo} title="撤销 ⌘Z" onClick={onUndo}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 14L4 9l5-5" /><path d="M4 9h10a5 5 0 0 1 5 5v1" />
        </svg>
      </ControlBtn>
      <ControlBtn disabled={readOnly || !canRedo} title="重做 ⇧⌘Z" onClick={onRedo}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 14l5-5-5-5" /><path d="M20 9H10a5 5 0 0 0-5 5v1" />
        </svg>
      </ControlBtn>
      <Divider />
      <ControlBtn active={panMode} title="抓手 H / 空格拖拽" onClick={onTogglePan}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 11V6a2 2 0 0 0-4 0v5" /><path d="M14 10V4a2 2 0 0 0-4 0v6" /><path d="M10 10V5a2 2 0 0 0-4 0v9a8 8 0 0 0 16 0v-3h-4" />
        </svg>
      </ControlBtn>
      <Divider />
      <ControlBtn title="缩小" onClick={onZoomOut}>
        <span style={{ fontSize: 16, lineHeight: 1 }}>−</span>
      </ControlBtn>
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          title="缩放比例"
          onClick={() => setZoomMenuOpen(v => !v)}
          style={{
            minWidth: 48,
            border: 'none',
            background: zoomMenuOpen ? WB_COLORS.activeBg : 'transparent',
            fontSize: 12,
            color: WB_COLORS.text,
            cursor: 'pointer',
            padding: '6px 4px',
            borderRadius: 6,
          }}
        >
          {pct}%
        </button>
        {zoomMenuOpen && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 59 }}
              onClick={() => setZoomMenuOpen(false)}
            />
            <div style={{
              position: 'absolute',
              bottom: '100%',
              right: 0,
              marginBottom: 6,
              background: '#fff',
              border: WB_PANEL.border,
              borderRadius: 8,
              boxShadow: WB_PANEL.shadow,
              padding: 4,
              zIndex: 61,
              minWidth: 88,
            }}
            >
              {ZOOM_PRESETS.map(z => (
                <button
                  key={z}
                  type="button"
                  onClick={() => { onZoomTo(z); setZoomMenuOpen(false); }}
                  style={{
                    display: 'block',
                    width: '100%',
                    border: 'none',
                    background: Math.abs(zoom - z) < 0.01 ? WB_COLORS.activeBg : 'transparent',
                    padding: '6px 10px',
                    textAlign: 'left',
                    fontSize: 12,
                    cursor: 'pointer',
                    borderRadius: 4,
                  }}
                >
                  {Math.round(z * 100)}%
                </button>
              ))}
              <div style={{ height: 1, background: WB_COLORS.border, margin: '4px 0' }} />
              <button
                type="button"
                onClick={() => { onResetView(); setZoomMenuOpen(false); }}
                style={{
                  display: 'block', width: '100%', border: 'none', background: 'transparent',
                  padding: '6px 10px', textAlign: 'left', fontSize: 12, cursor: 'pointer',
                }}
              >
                重置 100%
              </button>
              <button
                type="button"
                onClick={() => { onFitView(); setZoomMenuOpen(false); }}
                style={{
                  display: 'block', width: '100%', border: 'none', background: 'transparent',
                  padding: '6px 10px', textAlign: 'left', fontSize: 12, cursor: 'pointer',
                }}
              >
                适应画布
              </button>
            </div>
          </>
        )}
      </div>
      <ControlBtn title="放大" onClick={onZoomIn}>
        <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
      </ControlBtn>
      <ControlBtn title="适应画布 ⌘1" onClick={onFitView}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
      </ControlBtn>
    </div>
  );
};

function Divider() {
  return <div style={{ width: 1, height: 20, background: WB_COLORS.border, margin: '0 2px' }} />;
}

function ControlBtn({
  children,
  title,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
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
        borderRadius: 8,
        background: active ? WB_COLORS.activeBg : 'transparent',
        color: disabled ? '#c9cdd4' : WB_COLORS.text,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
}
