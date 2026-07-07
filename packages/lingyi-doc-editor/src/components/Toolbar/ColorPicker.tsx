import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

/** 10 列 × 6 行预设色板（上浅下深） */
const COLOR_PALETTE: string[][] = [
  ['#FFFFFF', '#4285F4', '#00BCD4', '#34A853', '#8BC34A', '#FBBC04', '#FF9800', '#FF6B6B', '#E91E63', '#9C27B0'],
  ['#F1F3F4', '#AECBFA', '#80DEEA', '#A8DAB5', '#C5E1A5', '#FFF176', '#FFCC80', '#FFAB91', '#F48FB1', '#CE93D8'],
  ['#DADCE0', '#669DF6', '#4DD0E1', '#81C995', '#AED581', '#FFD54F', '#FFB74D', '#FF8A65', '#F06292', '#BA68C8'],
  ['#BDC1C6', '#1967D2', '#00ACC1', '#188038', '#7CB342', '#F9AB00', '#F57C00', '#E53935', '#C2185B', '#8E24AA'],
  ['#80868B', '#174EA6', '#00838F', '#137333', '#558B2F', '#E37400', '#EF6C00', '#C5221F', '#A31566', '#6A1B9A'],
  ['#5F6368', '#185ABC', '#006064', '#0D652D', '#33691E', '#B06000', '#E65100', '#A50E0E', '#880E4F', '#4A148C'],
];

const RECENT_KEY = 'sheet-recent-colors';
const MAX_RECENT = 10;
const SWATCH = 20;
const GAP = 4;

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  recentColors?: string[];
  trigger: React.ReactNode;
}

function normalizeHex(hex: string): string {
  let h = hex.replace('#', '').trim().toLowerCase();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6) return '#000000';
  return `#${h}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = normalizeHex(hex).slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      default: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s, v };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0; let gp = 0; let bp = 0;
  if (h < 60) { rp = c; gp = x; }
  else if (h < 120) { rp = x; gp = c; }
  else if (h < 180) { gp = c; bp = x; }
  else if (h < 240) { gp = x; bp = c; }
  else if (h < 300) { rp = x; bp = c; }
  else { rp = c; bp = x; }
  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  };
}

function isLightColor(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 186;
}

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch { /* ignore */ }
  return [];
}

function saveRecent(colors: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(colors));
  } catch { /* ignore */ }
}

function pushRecent(color: string, list: string[]): string[] {
  const norm = normalizeHex(color);
  const next = [norm, ...list.filter(c => normalizeHex(c) !== norm)].slice(0, MAX_RECENT);
  saveRecent(next);
  return next;
}

function CheckIcon({ dark }: { dark: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={dark ? '#1a73e8' : '#fff'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ filter: dark ? 'none' : 'drop-shadow(0 0 1px rgba(0,0,0,0.5))' }}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ColorSwatch({
  color,
  selected,
  onClick,
}: {
  color: string;
  selected: boolean;
  onClick: () => void;
}) {
  const isWhite = normalizeHex(color) === '#ffffff';
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: SWATCH,
        height: SWATCH,
        borderRadius: 3,
        background: color,
        border: selected ? '2px solid #1a73e8' : isWhite ? '1px solid #dadce0' : '1px solid transparent',
        cursor: 'pointer',
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxSizing: 'border-box',
      }}
    >
      {selected && <CheckIcon dark={isLightColor(color)} />}
    </button>
  );
}

function CustomColorPanel({
  color,
  onChange,
}: {
  color: string;
  onChange: (hex: string) => void;
}) {
  const { r, g, b } = hexToRgb(color);
  const { h, s, v } = rgbToHsv(r, g, b);
  const svRef = useRef<HTMLDivElement>(null);
  const draggingSv = useRef(false);
  const draggingHue = useRef(false);

  const applyHsv = useCallback((nh: number, ns: number, nv: number) => {
    const rgb = hsvToRgb(nh, ns, nv);
    onChange(rgbToHex(rgb.r, rgb.g, rgb.b));
  }, [onChange]);

  const pickSv = useCallback((clientX: number, clientY: number) => {
    const el = svRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ns = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const nv = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    applyHsv(h, ns, nv);
  }, [h, applyHsv]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (draggingSv.current) pickSv(e.clientX, e.clientY);
      if (draggingHue.current) {
        const el = document.getElementById('sheet-color-hue-track');
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const nh = Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360));
        applyHsv(nh, s, v);
      }
    };
    const onUp = () => {
      draggingSv.current = false;
      draggingHue.current = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [pickSv, applyHsv, s, v]);

  const hexDisplay = normalizeHex(color).toUpperCase();

  const setFromHex = (raw: string) => {
    const cleaned = raw.replace('#', '').trim();
    if (/^[0-9a-fA-F]{6}$/.test(cleaned)) onChange(`#${cleaned}`);
    else if (/^[0-9a-fA-F]{3}$/.test(cleaned)) onChange(normalizeHex(`#${cleaned}`));
  };

  const setChannel = (channel: 'r' | 'g' | 'b', val: string) => {
    const n = parseInt(val, 10);
    if (Number.isNaN(n)) return;
    const clamped = Math.max(0, Math.min(255, n));
    if (channel === 'r') onChange(rgbToHex(clamped, g, b));
    else if (channel === 'g') onChange(rgbToHex(r, clamped, b));
    else onChange(rgbToHex(r, g, clamped));
  };

  const hueRgb = hsvToRgb(h, 1, 1);
  const hueColor = rgbToHex(hueRgb.r, hueRgb.g, hueRgb.b);

  return (
    <div style={{ width: 220, padding: '12px 12px 12px 8px', borderLeft: '1px solid #eee' }}>
      <div
        ref={svRef}
        onMouseDown={e => { draggingSv.current = true; pickSv(e.clientX, e.clientY); }}
        style={{
          position: 'relative',
          width: '100%',
          height: 160,
          borderRadius: 4,
          cursor: 'crosshair',
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: `${s * 100}%`,
            top: `${(1 - v) * 100}%`,
            transform: 'translate(-50%, -50%)',
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.25)',
            pointerEvents: 'none',
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 4,
            background: color,
            border: '1px solid #dadce0',
            flexShrink: 0,
          }}
        />
        <div
          id="sheet-color-hue-track"
          onMouseDown={e => {
            draggingHue.current = true;
            const rect = e.currentTarget.getBoundingClientRect();
            const nh = Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360));
            applyHsv(nh, s, v);
          }}
          style={{
            flex: 1,
            height: 12,
            borderRadius: 6,
            cursor: 'pointer',
            position: 'relative',
            background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: `${(h / 360) * 100}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: '#fff',
              border: '1px solid #dadce0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr', gap: 6 }}>
        {([
          { label: 'HEX', value: hexDisplay, onChange: (v: string) => setFromHex(v) },
          { label: 'R', value: String(r), onChange: (v: string) => setChannel('r', v) },
          { label: 'G', value: String(g), onChange: (v: string) => setChannel('g', v) },
          { label: 'B', value: String(b), onChange: (v: string) => setChannel('b', v) },
        ] as const).map(field => (
          <div key={field.label}>
            <div style={{ fontSize: 11, color: '#999', textAlign: 'center', marginBottom: 4 }}>{field.label}</div>
            <input
              value={field.value}
              onChange={e => field.onChange(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '4px 6px',
                border: '1px solid #dadce0',
                borderRadius: 4,
                fontSize: 12,
                textAlign: 'center',
                outline: 'none',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  value,
  onChange,
  recentColors: recentProp,
  trigger,
}) => {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => recentProp?.length ? recentProp : loadRecent());
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const normalizedValue = normalizeHex(value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      if (triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      setShowCustom(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) setShowCustom(false);
  }, [open]);

  const pickColor = useCallback((color: string) => {
    const norm = normalizeHex(color);
    onChange(norm);
    setRecent(prev => pushRecent(norm, prev));
  }, [onChange]);

  const triggerRect = triggerRef.current?.getBoundingClientRect();
  const displayRecent = recent.slice(0, MAX_RECENT);

  const panelWidth = 10 * SWATCH + 9 * GAP + 24 + (showCustom ? 228 : 0);

  return (
    <>
      <div ref={triggerRef} onClick={() => setOpen(v => !v)} style={{ cursor: 'pointer', display: 'inline-flex' }}>
        {trigger}
      </div>
      {open && triggerRect && createPortal(
        <div
          ref={dropdownRef}
          data-sheet-keep-selection
          style={{
            position: 'fixed',
            left: triggerRect.left,
            top: triggerRect.bottom + 4,
            zIndex: 10001,
            background: '#fff',
            border: '1px solid #e8e8e8',
            borderRadius: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            display: 'flex',
            width: panelWidth,
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ padding: 12, flexShrink: 0 }}>
            {/* 预设色板 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
              {COLOR_PALETTE.map((row, ri) => (
                <div key={ri} style={{ display: 'flex', gap: GAP }}>
                  {row.map(c => (
                    <ColorSwatch
                      key={c}
                      color={c}
                      selected={colorsEqual(c, normalizedValue)}
                      onClick={() => pickColor(c)}
                    />
                  ))}
                </div>
              ))}
            </div>

            {/* 最近使用 */}
            <div style={{ fontSize: 12, color: '#999', marginTop: 12, marginBottom: 6 }}>最近使用</div>
            <div style={{ display: 'flex', gap: GAP, minHeight: SWATCH }}>
              {displayRecent.length > 0 ? displayRecent.map(c => (
                <ColorSwatch
                  key={c}
                  color={c}
                  selected={colorsEqual(c, normalizedValue)}
                  onClick={() => pickColor(c)}
                />
              )) : (
                <span style={{ fontSize: 11, color: '#ccc', lineHeight: `${SWATCH}px` }}>暂无</span>
              )}
            </div>

            {/* 更多颜色 */}
            <button
              type="button"
              onClick={() => setShowCustom(v => !v)}
              style={{
                marginTop: 10,
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                border: 'none',
                borderRadius: 6,
                background: showCustom ? '#e8f0fe' : '#f5f5f5',
                cursor: 'pointer',
                fontSize: 13,
                color: '#333',
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: 'conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
                  flexShrink: 0,
                }}
              />
              <span style={{ flex: 1, textAlign: 'left' }}>更多颜色</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>

          {showCustom && (
            <CustomColorPanel
              color={normalizedValue}
              onChange={pickColor}
            />
          )}
        </div>,
        document.body,
      )}
    </>
  );
};

function colorsEqual(a: string, b: string): boolean {
  return normalizeHex(a) === normalizeHex(b);
}
