import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DOC_COLORS } from './styles';
import { DocColorMenu } from './DocColorMenu';
import { DocBlockInsertMenu, type InsertBlockKind } from './DocBlockInsertMenu';
import { computeFloatingPosition } from './floatingPosition';

interface DocBlockActionMenuProps {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onTextColor: (color: string) => void;
  onBackgroundColor: (color: string) => void;
  onInsertBelow?: (kind: InsertBlockKind, tableSize?: { rows: number; cols: number }) => void;
  showColorActions?: boolean;
}

function MenuItem({
  icon,
  label,
  danger,
  hasSub,
  active,
  itemRef,
  onMouseEnter,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  hasSub?: boolean;
  active?: boolean;
  itemRef?: React.Ref<HTMLButtonElement>;
  onMouseEnter?: () => void;
  onClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      ref={itemRef}
      type="button"
      onClick={onClick}
      onMouseEnter={() => { setHover(true); onMouseEnter?.(); }}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '8px 12px',
        border: 'none',
        background: active || hover ? '#F2F3F5' : 'transparent',
        cursor: 'pointer',
        fontSize: 14,
        color: danger ? '#F53F3F' : DOC_COLORS.text,
        textAlign: 'left',
      }}
    >
      <span style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DOC_COLORS.muted }}>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {hasSub && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#C9CDD4" strokeWidth="2">
          <path d="M9 6l6 6-6 6" />
        </svg>
      )}
    </button>
  );
}

export const DocBlockActionMenu: React.FC<DocBlockActionMenuProps> = ({
  open,
  anchorRef,
  onClose,
  onDelete,
  onCopy,
  onTextColor,
  onBackgroundColor,
  onInsertBelow,
  showColorActions = true,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const insertBelowRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [colorMode, setColorMode] = useState<'text' | 'highlight' | null>(null);
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  const [textColor, setTextColor] = useState('#1F2329');
  const [bgColor, setBgColor] = useState('#FFFFFF');
  const [positioned, setPositioned] = useState(false);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPositioned(false);
      return;
    }
    const update = () => {
      if (!anchorRef.current || !panelRef.current) return;
      const anchorRect = anchorRef.current.getBoundingClientRect();
      const panel = panelRef.current;
      setPos(computeFloatingPosition(anchorRect, {
        width: panel.offsetWidth || 180,
        height: panel.offsetHeight || 240,
      }, { placement: 'bottom', gap: 4 }));
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
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) {
      setColorMode(null);
      setInsertMenuOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      if ((t as Element).closest?.('[data-doc-block-insert-menu]')) return;
      if ((t as Element).closest?.('[data-doc-table-picker]')) return;
      if ((t as Element).closest?.('[data-doc-toolbar-menu]')) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return createPortal(
    <>
      <div
        ref={panelRef}
        data-doc-block-menu
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          zIndex: 10001,
          minWidth: 180,
          maxHeight: 'calc(100vh - 16px)',
          overflowY: 'auto',
          visibility: positioned ? 'visible' : 'hidden',
          background: '#fff',
          borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          border: `1px solid ${DOC_COLORS.border}`,
          padding: '4px 0',
        }}
      >
        {showColorActions && (
          <>
            <MenuItem
              icon={<span style={{ fontSize: 15, fontWeight: 700 }}>A</span>}
              label="文字颜色"
              hasSub
              active={colorMode === 'text'}
              onMouseEnter={() => { setColorMode('text'); setInsertMenuOpen(false); }}
              onClick={() => setColorMode('text')}
            />
            <MenuItem
              icon={
                <span style={{
                  width: 14, height: 14, borderRadius: 2,
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  border: '1px solid #E5E6EB',
                }} />
              }
              label="背景颜色"
              hasSub
              active={colorMode === 'highlight'}
              onMouseEnter={() => { setColorMode('highlight'); setInsertMenuOpen(false); }}
              onClick={() => setColorMode('highlight')}
            />
            <div style={{ height: 1, background: DOC_COLORS.border, margin: '4px 0' }} />
          </>
        )}

        {onInsertBelow && (
          <>
            <MenuItem
              itemRef={insertBelowRef}
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              }
              label="在下方添加"
              hasSub
              active={insertMenuOpen}
              onMouseEnter={() => { setInsertMenuOpen(true); setColorMode(null); }}
              onClick={() => { setInsertMenuOpen(true); setColorMode(null); }}
            />
            <div style={{ height: 1, background: DOC_COLORS.border, margin: '4px 0' }} />
          </>
        )}

        <MenuItem
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          }
          label="复制"
          onClick={onCopy}
        />
        <MenuItem
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            </svg>
          }
          label="删除"
          danger
          onClick={onDelete}
        />
      </div>

      {insertMenuOpen && onInsertBelow && (
        <DocBlockInsertMenu
          open
          anchorRef={insertBelowRef}
          onClose={() => { setInsertMenuOpen(false); onClose(); }}
          onInsert={(kind, tableSize) => {
            onInsertBelow(kind, tableSize);
            setInsertMenuOpen(false);
            onClose();
          }}
        />
      )}

      {colorMode === 'text' && (
        <DocColorMenu
          mode="text"
          value={textColor}
          open
          anchorRef={panelRef}
          placement="right"
          onPick={c => { setTextColor(c); onTextColor(c); onClose(); }}
          onClose={() => setColorMode(null)}
        />
      )}
      {colorMode === 'highlight' && (
        <DocColorMenu
          mode="highlight"
          value={bgColor}
          open
          anchorRef={panelRef}
          placement="right"
          onPick={c => { setBgColor(c); onBackgroundColor(c); onClose(); }}
          onClose={() => setColorMode(null)}
        />
      )}
    </>,
    document.body,
  );
};
