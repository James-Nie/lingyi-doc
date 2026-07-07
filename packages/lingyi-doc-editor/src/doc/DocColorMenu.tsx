import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DOC_COLORS } from './styles';
import { computeFloatingPosition } from './floatingPosition';

const COLOR_PALETTE: string[][] = [
  ['#FFFFFF', '#4285F4', '#00BCD4', '#34A853', '#8BC34A', '#FBBC04', '#FF9800', '#FF6B6B', '#E91E63', '#9C27B0'],
  ['#F1F3F4', '#AECBFA', '#80DEEA', '#A8DAB5', '#C5E1A5', '#FFF176', '#FFCC80', '#FFAB91', '#F48FB1', '#CE93D8'],
  ['#DADCE0', '#669DF6', '#4DD0E1', '#81C995', '#AED581', '#FFD54F', '#FFB74D', '#FF8A65', '#F06292', '#BA68C8'],
  ['#BDC1C6', '#1967D2', '#00ACC1', '#188038', '#7CB342', '#F9AB00', '#F57C00', '#E53935', '#C2185B', '#8E24AA'],
  ['#80868B', '#174EA6', '#00838F', '#137333', '#558B2F', '#E37400', '#EF6C00', '#C5221F', '#A31566', '#6A1B9A'],
  ['#5F6368', '#185ABC', '#006064', '#0D652D', '#33691E', '#B06000', '#E65100', '#A50E0E', '#880E4F', '#4A148C'],
];

const GRAYSCALE = ['#000000', '#434343', '#666666', '#999999', '#B7B7B7', '#CCCCCC', '#D9D9D9', '#EFEFEF', '#F3F3F3', '#FFFFFF'];

const GRADIENTS = [
  'linear-gradient(135deg, #667eea, #764ba2)',
  'linear-gradient(135deg, #f093fb, #f5576c)',
  'linear-gradient(135deg, #4facfe, #00f2fe)',
  'linear-gradient(135deg, #43e97b, #38f9d7)',
];

const RECENT_KEY = 'doc-recent-colors';
const SWATCH = 20;
const GAP = 4;

function normalizeHex(hex: string): string {
  let h = hex.replace('#', '').trim().toLowerCase();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6) return '#000000';
  return `#${h}`;
}

function isLightColor(hex: string): boolean {
  const h = normalizeHex(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
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
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(colors)); } catch { /* ignore */ }
}

function pushRecent(color: string, list: string[]): string[] {
  const norm = normalizeHex(color);
  const next = [norm, ...list.filter(c => normalizeHex(c) !== norm)].slice(0, 10);
  saveRecent(next);
  return next;
}

function hexToRgb(hex: string) {
  const h = normalizeHex(hex).slice(1);
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function rgbToHex(r: number, g: number, b: number) {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[c(r), c(g), c(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

function rgbToHsv(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max, v = max;
  if (d) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      default: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s, v };
}

function hsvToRgb(h: number, s: number, v: number) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let rp = 0, gp = 0, bp = 0;
  if (h < 60) { rp = c; gp = x; }
  else if (h < 120) { rp = x; gp = c; }
  else if (h < 180) { gp = c; bp = x; }
  else if (h < 240) { gp = x; bp = c; }
  else if (h < 300) { rp = x; bp = c; }
  else { rp = c; bp = x; }
  return { r: (rp + m) * 255, g: (gp + m) * 255, b: (bp + m) * 255 };
}

function Swatch({ color, selected, onClick, size = SWATCH }: { color: string; selected: boolean; onClick: () => void; size?: number }) {
  const isWhite = normalizeHex(color) === '#ffffff';
  const light = isLightColor(color);
  return (
    <button type="button" onClick={onClick} style={{
      width: size, height: size, borderRadius: 3, background: color, cursor: 'pointer', padding: 0,
      border: selected ? '2px solid #165DFF' : isWhite ? '1px solid #E5E6EB' : '1px solid transparent',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
    }}>
      {selected && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={light ? '#165DFF' : '#fff'} strokeWidth="3" strokeLinecap="round">
          <path d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}

function CustomPanel({ color, onChange }: { color: string; onChange: (hex: string) => void }) {
  const { r, g, b } = hexToRgb(color);
  const { h, s, v } = rgbToHsv(r, g, b);
  const svRef = useRef<HTMLDivElement>(null);
  const dragSv = useRef(false);
  const dragHue = useRef(false);

  const apply = useCallback((nh: number, ns: number, nv: number) => {
    const rgb = hsvToRgb(nh, ns, nv);
    onChange(rgbToHex(rgb.r, rgb.g, rgb.b));
  }, [onChange]);

  const pickSv = useCallback((cx: number, cy: number) => {
    const el = svRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    apply(h, Math.max(0, Math.min(1, (cx - rect.left) / rect.width)), Math.max(0, Math.min(1, 1 - (cy - rect.top) / rect.height)));
  }, [h, apply]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragSv.current) pickSv(e.clientX, e.clientY);
      if (dragHue.current) {
        const el = document.getElementById('doc-color-hue');
        if (!el) return;
        const rect = el.getBoundingClientRect();
        apply(Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360)), s, v);
      }
    };
    const onUp = () => { dragSv.current = false; dragHue.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [pickSv, apply, s, v]);

  const hueRgb = hsvToRgb(h, 1, 1);
  const hueColor = rgbToHex(hueRgb.r, hueRgb.g, hueRgb.b);
  const hex = normalizeHex(color).toUpperCase();

  return (
    <div style={{ width: 220, padding: '12px 12px 12px 8px', borderLeft: '1px solid #EBEBEB' }}>
      <div ref={svRef} onMouseDown={e => { dragSv.current = true; pickSv(e.clientX, e.clientY); }}
        style={{ position: 'relative', width: '100%', height: 160, borderRadius: 4, cursor: 'crosshair', marginBottom: 12,
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})` }}>
        <div style={{ position: 'absolute', left: `${s * 100}%`, top: `${(1 - v) * 100}%`, transform: 'translate(-50%,-50%)',
          width: 14, height: 14, borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.25)', pointerEvents: 'none' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: color, border: '1px solid #E5E6EB' }} />
        <div id="doc-color-hue" onMouseDown={e => {
          dragHue.current = true;
          const rect = e.currentTarget.getBoundingClientRect();
          apply(Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360)), s, v);
        }} style={{ flex: 1, height: 12, borderRadius: 6, cursor: 'pointer',
          background: 'linear-gradient(to right, #f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr', gap: 6 }}>
        {([['HEX', hex], ['R', String(r)], ['G', String(g)], ['B', String(b)]] as const).map(([label, val]) => (
          <div key={label}>
            <div style={{ fontSize: 11, color: '#999', textAlign: 'center', marginBottom: 4 }}>{label}</div>
            <input value={val} readOnly={label !== 'HEX'} style={{
              width: '100%', boxSizing: 'border-box', padding: '4px 6px', border: '1px solid #E5E6EB',
              borderRadius: 4, fontSize: 12, textAlign: 'center', outline: 'none',
            }} onChange={e => {
              if (label !== 'HEX') return;
              const cleaned = e.target.value.replace('#', '').trim();
              if (/^[0-9a-fA-F]{6}$/.test(cleaned)) onChange(`#${cleaned}`);
            }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DocColorMenu({
  mode,
  value,
  open,
  anchorRef,
  placement = 'right',
  onPick,
  onClose,
}: {
  mode: 'text' | 'highlight';
  value: string;
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  placement?: 'right' | 'bottom';
  onPick: (color: string) => void;
  onClose: () => void;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const [recent, setRecent] = useState(loadRecent);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [positioned, setPositioned] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const normalized = normalizeHex(value === 'transparent' ? '#FFFFFF' : value);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPositioned(false);
      return;
    }
    const update = () => {
      if (!anchorRef.current) return;
      const anchorRect = anchorRef.current.getBoundingClientRect();
      const panel = panelRef.current;
      const width = panel?.offsetWidth ?? 280;
      const height = panel?.offsetHeight ?? 320;
      setPos(computeFloatingPosition(anchorRect, { width, height }, { placement, gap: 4 }));
      setPositioned(true);
    };
    update();
    const raf = requestAnimationFrame(update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      setPositioned(false);
    };
  }, [open, anchorRef, showCustom, placement]);

  useEffect(() => { if (!open) setShowCustom(false); }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, anchorRef]);

  const pick = (c: string) => {
    onPick(c);
    setRecent(prev => pushRecent(c, prev));
    onClose();
  };

  if (!open) return null;

  const panelW = 10 * SWATCH + 9 * GAP + 24 + (showCustom ? 228 : 0);

  return createPortal(
    <div ref={panelRef} data-doc-toolbar-menu style={{
      position: 'fixed', top: pos.top, left: pos.left, zIndex: 10002,
      maxHeight: 'calc(100vh - 16px)', overflowY: 'auto',
      visibility: positioned ? 'visible' : 'hidden',
      background: '#fff', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
      border: `1px solid ${DOC_COLORS.border}`, display: 'flex', width: panelW,
    }}>
      <div style={{ padding: 12, flexShrink: 0, width: 10 * SWATCH + 9 * GAP }}>
        {mode === 'text' ? (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: '#86909C', marginBottom: 6 }}>默认</div>
            <Swatch color="#1F2329" selected={normalized === '#1f2329'} onClick={() => pick('#1F2329')} size={28} />
          </div>
        ) : (
          <button type="button" onClick={() => { onPick('transparent'); onClose(); }} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 4px', marginBottom: 8,
            border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: DOC_COLORS.text,
          }}>
            <span style={{ width: 20, height: 20, border: '1px solid #E5E6EB', borderRadius: 3, position: 'relative', background: '#fff' }}>
              <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, transparent 46%, #F53F3F 46%, #F53F3F 54%, transparent 54%)' }} />
            </span>
            无填充色
          </button>
        )}

        <div style={{ display: 'flex', gap: GAP, marginBottom: GAP }}>
          {GRAYSCALE.map(c => <Swatch key={c} color={c} selected={normalizeHex(c) === normalized} onClick={() => pick(c)} />)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
          {COLOR_PALETTE.map((row, ri) => (
            <div key={ri} style={{ display: 'flex', gap: GAP }}>
              {row.map(c => <Swatch key={c} color={c} selected={normalizeHex(c) === normalized} onClick={() => pick(c)} />)}
            </div>
          ))}
        </div>

        {mode === 'text' && (
          <>
            <div style={{ fontSize: 12, color: '#86909C', marginTop: 12, marginBottom: 6 }}>渐变色</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              {GRADIENTS.map((g, i) => (
                <button key={i} type="button" onClick={() => pick(['#667eea', '#f5576c', '#00f2fe', '#38f9d7'][i])}
                  style={{ width: 28, height: 28, borderRadius: '50%', background: g, border: '1px solid #E5E6EB', cursor: 'pointer', padding: 0 }} />
              ))}
            </div>
          </>
        )}

        <div style={{ fontSize: 12, color: '#86909C', marginTop: 12, marginBottom: 6 }}>最近使用自定义颜色</div>
        <div style={{ display: 'flex', gap: GAP, minHeight: SWATCH }}>
          {recent.length ? recent.map(c => <Swatch key={c} color={c} selected={normalizeHex(c) === normalized} onClick={() => pick(c)} />)
            : <span style={{ fontSize: 12, color: '#C9CDD4' }}>暂无</span>}
        </div>

        <button type="button" onClick={() => setShowCustom(v => !v)} style={{
          marginTop: 10, width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
          border: 'none', borderRadius: 6, background: showCustom ? '#E8F3FF' : '#F7F8FA', cursor: 'pointer', fontSize: 13, color: DOC_COLORS.text,
        }}>
          <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)', flexShrink: 0 }} />
          <span style={{ flex: 1, textAlign: 'left' }}>更多颜色</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>
      {showCustom && <CustomPanel color={normalized} onChange={pick} />}
    </div>,
    document.body,
  );
}
