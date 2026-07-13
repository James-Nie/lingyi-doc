import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BorderStyle } from '@lingyi-doc/core';
import {
  BORDER_LINE_STYLE_OPTIONS,
  borderLinePreviewDash,
  borderLinePreviewWidth,
  type BorderLineStyle,
} from '@lingyi-doc/core';
import { ColorPicker } from './ColorPicker';

export type BorderPreset =
  | 'all'
  | 'outer'
  | 'inner'
  | 'none'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom';

const BORDER_PRESETS: { value: BorderPreset; label: string }[] = [
  { value: 'all', label: '所有边框' },
  { value: 'outer', label: '外侧框线' },
  { value: 'inner', label: '内侧框线' },
  { value: 'none', label: '无框线' },
  { value: 'left', label: '左侧框线' },
  { value: 'right', label: '右侧框线' },
  { value: 'top', label: '顶部框线' },
  { value: 'bottom', label: '底部框线' },
];

const STROKE = '#646A73';
const ACTIVE_BG = '#E8F3FF';

function isKeepSelectionTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('[data-sheet-keep-selection]');
}

function BorderPresetIcon({ preset }: { preset: BorderPreset }) {
  const s = 24;
  const pad = 4;
  const x1 = pad;
  const x2 = s - pad;
  const y1 = pad;
  const y2 = s - pad;
  const mx = s / 2;
  const my = s / 2;
  const lines: React.ReactNode[] = [];

  const edge = (d: string, key: string) => (
    <path key={key} d={d} stroke={STROKE} strokeWidth="1.6" strokeLinecap="round" />
  );

  switch (preset) {
    case 'all':
      lines.push(
        edge(`M ${x1} ${y1} H ${x2}`, 't'),
        edge(`M ${x1} ${y2} H ${x2}`, 'b'),
        edge(`M ${x1} ${y1} V ${y2}`, 'l'),
        edge(`M ${x2} ${y1} V ${y2}`, 'r'),
        edge(`M ${mx} ${y1} V ${y2}`, 'vc'),
        edge(`M ${x1} ${my} H ${x2}`, 'hc'),
      );
      break;
    case 'outer':
      lines.push(
        edge(`M ${x1} ${y1} H ${x2}`, 't'),
        edge(`M ${x1} ${y2} H ${x2}`, 'b'),
        edge(`M ${x1} ${y1} V ${y2}`, 'l'),
        edge(`M ${x2} ${y1} V ${y2}`, 'r'),
      );
      break;
    case 'inner':
      lines.push(
        edge(`M ${mx} ${y1} V ${y2}`, 'vc'),
        edge(`M ${x1} ${my} H ${x2}`, 'hc'),
      );
      break;
    case 'none':
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
          <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} fill="none" stroke="#C9CDD4" strokeWidth="1.2" strokeDasharray="2 2" />
        </svg>
      );
    case 'left':
      lines.push(edge(`M ${x1} ${y1} V ${y2}`, 'l'));
      break;
    case 'right':
      lines.push(edge(`M ${x2} ${y1} V ${y2}`, 'r'));
      break;
    case 'top':
      lines.push(edge(`M ${x1} ${y1} H ${x2}`, 't'));
      break;
    case 'bottom':
      lines.push(edge(`M ${x1} ${y2} H ${x2}`, 'b'));
      break;
  }

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
      <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} fill="none" stroke="#E5E6EB" strokeWidth="1" />
      {lines}
    </svg>
  );
}

function LineStylePreview({ style, width = 56 }: { style: BorderLineStyle; width?: number }) {
  const strokeWidth = borderLinePreviewWidth(style);
  const dash = borderLinePreviewDash(style);
  if (style === 'double') {
    return (
      <svg width={width} height={12} aria-hidden>
        <line x1={4} y1={4} x2={width - 4} y2={4} stroke={STROKE} strokeWidth={1} />
        <line x1={4} y1={8} x2={width - 4} y2={8} stroke={STROKE} strokeWidth={1} />
      </svg>
    );
  }
  return (
    <svg width={width} height={12} aria-hidden>
      <line
        x1={4}
        y1={6}
        x2={width - 4}
        y2={6}
        stroke={STROKE}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
        strokeLinecap="round"
      />
    </svg>
  );
}

function BorderColorTrigger({ color }: { color: string }) {
  return (
    <button
      type="button"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 6px',
        border: '1px solid #E5E6EB',
        borderRadius: 6,
        background: '#fff',
        cursor: 'pointer',
        height: 32,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={STROKE} strokeWidth="1.8" strokeLinecap="round">
        <path d="M4 20h16" />
        <path d="M7 16l8-12 4 4-8 12H7z" />
      </svg>
      <span style={{ width: 18, height: 3, background: color, borderRadius: 1 }} />
      <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.45 }}>
        <path d="M7 10l5 5 5-5z" />
      </svg>
    </button>
  );
}

interface BorderPickerProps {
  borderColor: string;
  borderLineStyle: BorderLineStyle;
  onBorderColorChange: (color: string) => void;
  onBorderLineStyleChange: (style: BorderLineStyle) => void;
  onApplyPreset: (preset: BorderPreset) => void;
  trigger: React.ReactNode;
}

export const BorderPicker: React.FC<BorderPickerProps> = ({
  borderColor,
  borderLineStyle,
  onBorderColorChange,
  onBorderLineStyleChange,
  onApplyPreset,
  trigger,
}) => {
  const [open, setOpen] = useState(false);
  const [lineMenuOpen, setLineMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const lineMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setLineMenuOpen(false);
      return;
    }
    const handler = (e: MouseEvent) => {
      const target = e.target;
      if (panelRef.current?.contains(target as Node)) return;
      if (triggerRef.current?.contains(target as Node)) return;
      if (isKeepSelectionTarget(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!lineMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target;
      if (lineMenuRef.current?.contains(target as Node)) return;
      if (panelRef.current?.contains(target as Node)) return;
      if (isKeepSelectionTarget(target)) return;
      setLineMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [lineMenuOpen]);

  const handlePreset = useCallback((preset: BorderPreset) => {
    onApplyPreset(preset);
    if (preset !== 'none') setOpen(false);
  }, [onApplyPreset]);

  const triggerRect = triggerRef.current?.getBoundingClientRect();

  return (
    <>
      <div
        ref={triggerRef}
        onClick={() => setOpen(v => !v)}
        style={{ cursor: 'pointer', display: 'inline-flex' }}
      >
        {trigger}
      </div>
      {open && triggerRect && createPortal(
        <div
          ref={panelRef}
          data-sheet-keep-selection
          style={{
            position: 'fixed',
            left: triggerRect.left,
            top: triggerRect.bottom + 4,
            zIndex: 10001,
            background: '#fff',
            border: '1px solid #E5E6EB',
            borderRadius: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            padding: 10,
            width: 248,
          }}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
        >
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 4,
            marginBottom: 10,
          }}
          >
            {BORDER_PRESETS.map(preset => (
              <button
                key={preset.value}
                type="button"
                title={preset.label}
                onClick={() => handlePreset(preset.value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  height: 36,
                  padding: 0,
                  border: 'none',
                  borderRadius: 6,
                  background: 'transparent',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = ACTIVE_BG; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <BorderPresetIcon preset={preset.value} />
              </button>
            ))}
          </div>

          <div style={{ height: 1, background: '#EBEBEB', margin: '0 -2px 10px' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ColorPicker
              value={borderColor}
              onChange={onBorderColorChange}
              trigger={<BorderColorTrigger color={borderColor} />}
            />
            <div style={{ position: 'relative', flex: 1 }}>
              <button
                type="button"
                onClick={() => setLineMenuOpen(v => !v)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  height: 32,
                  padding: '0 8px',
                  border: `1px solid ${lineMenuOpen ? '#1a73e8' : '#E5E6EB'}`,
                  borderRadius: 6,
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                <LineStylePreview style={borderLineStyle} width={120} />
                <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.45, flexShrink: 0 }}>
                  <path d="M7 10l5 5 5-5z" />
                </svg>
              </button>
              {lineMenuOpen && (
                <div
                  ref={lineMenuRef}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: '100%',
                    marginTop: 4,
                    background: '#fff',
                    border: '1px solid #E5E6EB',
                    borderRadius: 8,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                    padding: '4px 0',
                    zIndex: 2,
                    maxHeight: 280,
                    overflowY: 'auto',
                  }}
                >
                  {BORDER_LINE_STYLE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        onBorderLineStyleChange(opt.value);
                        setLineMenuOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '8px 12px',
                        border: 'none',
                        background: borderLineStyle === opt.value ? ACTIVE_BG : 'transparent',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => {
                        if (borderLineStyle !== opt.value) e.currentTarget.style.background = '#F7F8FA';
                      }}
                      onMouseLeave={e => {
                        if (borderLineStyle !== opt.value) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <LineStylePreview style={opt.value} width={140} />
                      {borderLineStyle === opt.value && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M5 12l5 5L19 7" stroke="#1a73e8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

export type { BorderLineStyle, BorderStyle };
