import React from 'react';
import { Popover } from './formatToolbarUi';
import { WB_COLORS } from './styles';

export type TextStylePatch = Partial<{
  textAlign: 'left' | 'center' | 'right';
  textVerticalAlign: 'top' | 'center' | 'bottom';
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  textUnderline: boolean;
  textLineThrough: boolean;
}>;

export function TextStylePanel({
  textAlign,
  textVerticalAlign,
  isBold,
  isItalic,
  isUnderline,
  isLineThrough,
  onPatch,
}: {
  textAlign: 'left' | 'center' | 'right';
  textVerticalAlign: 'top' | 'center' | 'bottom';
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isLineThrough: boolean;
  onPatch: (patch: TextStylePatch, recordHistory?: boolean) => void;
}) {
  const fmtBtn = (active: boolean): React.CSSProperties => ({
    flex: 1,
    height: 34,
    border: 'none',
    borderRadius: 8,
    background: active ? '#eef3ff' : '#f5f6f7',
    cursor: 'pointer',
    color: active ? WB_COLORS.accent : WB_COLORS.text,
    fontSize: 14,
  });

  return (
    <Popover width={220} anchor="center">
      <PanelSection label="样式">
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            title="加粗"
            style={fmtBtn(isBold)}
            onClick={() => onPatch({ fontWeight: isBold ? 400 : 700 }, true)}
          >
            <span style={{ fontWeight: 700 }}>B</span>
          </button>
          <button
            type="button"
            title="斜体"
            style={fmtBtn(isItalic)}
            onClick={() => onPatch({ fontStyle: isItalic ? 'normal' : 'italic' }, true)}
          >
            <span style={{ fontStyle: 'italic' }}>I</span>
          </button>
          <button
            type="button"
            title="下划线"
            style={fmtBtn(isUnderline)}
            onClick={() => onPatch({ textUnderline: !isUnderline }, true)}
          >
            <span style={{ textDecoration: 'underline' }}>U</span>
          </button>
          <button
            type="button"
            title="中划线"
            style={fmtBtn(isLineThrough)}
            onClick={() => onPatch({ textLineThrough: !isLineThrough }, true)}
          >
            <span style={{ textDecoration: 'line-through' }}>S</span>
          </button>
        </div>
      </PanelSection>

      <PanelSection label="水平对齐">
        <div style={{ display: 'flex', gap: 6 }}>
          {(['left', 'center', 'right'] as const).map(a => (
            <button
              key={a}
              type="button"
              style={fmtBtn(textAlign === a)}
              onClick={() => onPatch({ textAlign: a }, true)}
            >
              <AlignIcon align={a} />
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection label="垂直对齐" last>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['top', 'center', 'bottom'] as const).map(v => (
            <button
              key={v}
              type="button"
              style={fmtBtn(textVerticalAlign === v)}
              onClick={() => onPatch({ textVerticalAlign: v }, true)}
            >
              <VerticalAlignIcon align={v} />
            </button>
          ))}
        </div>
      </PanelSection>
    </Popover>
  );
}

function PanelSection({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ marginBottom: last ? 0 : 14 }}>
      <div style={{ fontSize: 12, color: WB_COLORS.text, fontWeight: 500, marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
}

function AlignIcon({ align }: { align: 'left' | 'center' | 'right' }) {
  const x = align === 'left' ? 4 : align === 'right' ? 16 : 10;
  return (
    <svg width="20" height="18" viewBox="0 0 24 20" aria-hidden>
      <text x="3" y="8" fontSize="11" fontWeight="600" fill="currentColor">A</text>
      <line x1={x} y1="13" x2={x + (align === 'center' ? 4 : 14)} y2="13" stroke="currentColor" strokeWidth="1.5" />
      <line x1={align === 'right' ? 6 : 3} y1="17" x2={align === 'left' ? 17 : 21} y2="17" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function VerticalAlignIcon({ align }: { align: 'top' | 'center' | 'bottom' }) {
  const boxY = 3;
  const boxH = 14;
  const lineY = align === 'top'
    ? boxY + 3
    : align === 'bottom'
      ? boxY + boxH - 3
      : boxY + boxH / 2;
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <rect x="5" y={boxY} width="14" height={boxH} rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="8" y1={lineY} x2="16" y2={lineY} stroke="currentColor" strokeWidth="1.5" />
      {align === 'top' && (
        <>
          <line x1="12" y1={boxY} x2="12" y2={boxY + 2.5} stroke="currentColor" strokeWidth="1.5" />
          <polygon points={`12,${boxY - 1} 9.5,${boxY + 2} 14.5,${boxY + 2}`} fill="currentColor" />
        </>
      )}
      {align === 'bottom' && (
        <>
          <line x1="12" y1={boxY + boxH} x2="12" y2={boxY + boxH - 2.5} stroke="currentColor" strokeWidth="1.5" />
          <polygon points={`12,${boxY + boxH + 1} 9.5,${boxY + boxH - 2} 14.5,${boxY + boxH - 2}`} fill="currentColor" />
        </>
      )}
    </svg>
  );
}
