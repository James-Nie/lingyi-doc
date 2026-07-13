import React from 'react';

export interface MindmapNodeActionBarProps {
  anchor: { left: number; top: number; width: number };
  onAddChild: () => void;
  onAddSibling: () => void;
  onAddImage?: () => void;
}

const BAR_BG = 'rgba(31, 35, 41, 0.94)';
const BTN_HOVER = 'rgba(255, 255, 255, 0.12)';

function ActionBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      onMouseDown={e => e.preventDefault()}
      style={{
        height: 28,
        padding: '0 10px',
        border: 'none',
        borderRadius: 6,
        background: 'transparent',
        color: 'rgba(255,255,255,0.92)',
        fontSize: 12,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = BTN_HOVER; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

export const MindmapNodeActionBar: React.FC<MindmapNodeActionBarProps> = ({
  anchor,
  onAddChild,
  onAddSibling,
  onAddImage,
}) => (
  <div
    style={{
      position: 'absolute',
      left: anchor.left + anchor.width / 2,
      top: anchor.top - 8,
      transform: 'translate(-50%, -100%)',
      zIndex: 10040,
      pointerEvents: 'auto',
    }}
    onPointerDown={e => e.stopPropagation()}
  >
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        background: BAR_BG,
        borderRadius: 8,
        padding: '4px 6px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
      }}
    >
      <ActionBtn label="添加子节点 (Tab)" onClick={onAddChild}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        子节点
      </ActionBtn>
      <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)' }} />
      <ActionBtn label="添加同级节点 (Enter)" onClick={onAddSibling}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 5v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        </svg>
        同级
      </ActionBtn>
      {onAddImage && (
        <>
          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)' }} />
          <ActionBtn label="添加图片" onClick={onAddImage}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="4" y="6" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="9" cy="11" r="1.2" fill="currentColor" />
              <path d="M4 15l4-3 3 2 5-4 4 3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
            图片
          </ActionBtn>
        </>
      )}
    </div>
  </div>
);
