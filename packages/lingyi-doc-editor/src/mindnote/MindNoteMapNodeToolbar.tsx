import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { MindNode } from '@lingyi-doc/core';
import { isMacPlatform } from '../components/Toolbar/Tooltip';
import { MindNoteMapMoreMenu, type MindNoteMapMoreAction } from './MindNoteMapMoreMenu';
import { MN_COLORS } from './styles';

const TOOLBAR_BG = '#4E5969';
const TOOLBAR_HOVER = 'rgba(255,255,255,0.12)';
const TOOLBAR_ACTIVE = 'rgba(255,255,255,0.18)';
const ICON_COLOR = 'rgba(255,255,255,0.92)';

const TEXT_COLORS = [
  { value: '#F76964', bg: '#FDD9D5' },
  { value: '#FF8800', bg: '#FAE6A7' },
  { value: '#7C6CFF', bg: '#E8D4F8' },
  { value: '#3370FF', bg: '#C8D9FA' },
  { value: '#00B8A9', bg: '#C8EDE8' },
  { value: '#7EB712', bg: '#D9F5A7' },
  { value: '#8F959E', bg: '#E8E9EB' },
] as const;

function shortcutModEnter(): string {
  return isMacPlatform() ? '⌘ Enter' : 'Ctrl+Enter';
}

function shortcutShiftEnter(): string {
  return 'Shift+Enter';
}

function shortcutOptionEnter(): string {
  return isMacPlatform() ? 'Option+Enter' : 'Alt+Enter';
}

function shortcutModAltM(): string {
  return isMacPlatform() ? '⌘ Option+M' : 'Ctrl+Alt+M';
}

function ToolbarBtn({
  label,
  active,
  onClick,
  children,
  btnRef,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  btnRef?: React.RefObject<HTMLButtonElement>;
}) {
  const [hovered, setHovered] = useState(false);
  const highlighted = active || hovered;

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '100%',
            transform: 'translateX(-50%)',
            marginBottom: 8,
            padding: '5px 10px',
            background: '#1F2329',
            color: '#fff',
            fontSize: 12,
            lineHeight: '18px',
            borderRadius: 6,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 30,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          {label}
          <span
            style={{
              position: 'absolute',
              left: '50%',
              bottom: -4,
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderTop: '4px solid #1F2329',
            }}
          />
        </div>
      )}
      <button
        ref={btnRef}
        type="button"
        aria-label={label.split(' (')[0]}
        onClick={onClick}
        onMouseDown={e => e.preventDefault()}
        style={{
          width: 32,
          height: 32,
          border: 'none',
          borderRadius: 6,
          background: highlighted ? TOOLBAR_HOVER : 'transparent',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          color: ICON_COLOR,
          transition: 'background 0.12s ease',
        }}
      >
        {children}
      </button>
    </div>
  );
}

function TextStylePanel({
  node,
  onPatch,
}: {
  node: MindNode;
  onPatch: (patch: Partial<MindNode>) => void;
}) {
  const toggle = (key: 'bold' | 'italic' | 'underline') => {
    onPatch({ [key]: !node[key] });
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      background: TOOLBAR_BG,
      borderRadius: 8,
      padding: '4px 6px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.16)',
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 4px' }}>
        {([
          { key: 'bold' as const, label: 'B', style: { fontWeight: 700 } },
          { key: 'italic' as const, label: 'I', style: { fontStyle: 'italic' } },
          { key: 'underline' as const, label: 'U', style: { textDecoration: 'underline' } },
        ]).map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => toggle(item.key)}
            style={{
              width: 28,
              height: 28,
              border: 'none',
              borderRadius: 6,
              background: node[item.key] ? TOOLBAR_ACTIVE : 'transparent',
              color: ICON_COLOR,
              fontSize: 14,
              cursor: 'pointer',
              ...item.style,
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)', margin: '0 6px' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 2px' }}>
        {TEXT_COLORS.map(c => (
          <button
            key={c.value}
            type="button"
            title={c.value}
            onClick={() => onPatch({ color: node.color === c.value ? undefined : c.value })}
            style={{
              width: 28,
              height: 28,
              border: node.color === c.value ? '2px solid #fff' : 'none',
              borderRadius: 6,
              background: c.bg,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 600,
              color: c.value,
              padding: 0,
            }}
          >
            A
          </button>
        ))}
      </div>
    </div>
  );
}

const TOOLBAR_SLIDE_MS = 280;

export interface MindNoteMapNodeToolbarProps {
  visible: boolean;
  node: MindNode | null;
  onPatch: (patch: Partial<MindNode>) => void;
  onMoreAction: (action: MindNoteMapMoreAction) => void;
  onEditDescription: () => void;
  onAddImage: () => void;
  onComment: () => void;
}

export const MindNoteMapNodeToolbar: React.FC<MindNoteMapNodeToolbarProps> = ({
  visible,
  node,
  onPatch,
  onMoreAction,
  onEditDescription,
  onAddImage,
  onComment,
}) => {
  const [mounted, setMounted] = useState(visible);
  const [shown, setShown] = useState(false);
  const [displayNode, setDisplayNode] = useState<MindNode | null>(node);
  const [textStyleOpen, setTextStyleOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible && node) {
      setDisplayNode(node);
    }
  }, [visible, node]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setShown(true));
      });
      return () => cancelAnimationFrame(frame);
    }
    setShown(false);
    const timer = window.setTimeout(() => setMounted(false), TOOLBAR_SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setTextStyleOpen(false);
      setMoreOpen(false);
    }
  }, [visible]);

  const toggleComplete = useCallback(() => {
    if (!displayNode) return;
    onPatch({ completed: !displayNode.completed });
  }, [displayNode, onPatch]);

  useEffect(() => {
    if (!textStyleOpen && !moreOpen) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setTextStyleOpen(false);
      setMoreOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [textStyleOpen, moreOpen]);

  if (!mounted || !displayNode) return null;

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 24,
        transform: `translateX(-50%) translateY(${shown ? 0 : 'calc(100% + 32px)'})`,
        opacity: shown ? 1 : 0,
        transition: `transform ${TOOLBAR_SLIDE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${TOOLBAR_SLIDE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        pointerEvents: shown ? 'auto' : 'none',
        willChange: 'transform, opacity',
      }}
    >
      {textStyleOpen && (
        <TextStylePanel node={displayNode} onPatch={onPatch} />
      )}

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        background: TOOLBAR_BG,
        borderRadius: 8,
        padding: '4px 8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
      }}>
        <ToolbarBtn
          label="文字样式"
          active={textStyleOpen}
          onClick={() => { setMoreOpen(false); setTextStyleOpen(v => !v); }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <text x="3" y="11" fill="currentColor" fontSize="9" fontWeight="700" fontFamily="system-ui,sans-serif">A</text>
            <path d="M13 6h7M13 10h5M13 14h7M13 18h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </ToolbarBtn>

        <ToolbarBtn
          label={displayNode.completed
            ? `激活 (${shortcutModEnter()})`
            : `完成 (${shortcutModEnter()})`}
          active={!!displayNode.completed}
          onClick={toggleComplete}
        >
          {displayNode.completed ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="8" stroke={MN_COLORS.completedActive} strokeWidth="1.6" />
              <path
                d="M8 12l2.5 2.5L16 9"
                stroke={MN_COLORS.completedActive}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="M8 12l2.5 2.5L16 9"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </ToolbarBtn>

        <ToolbarBtn
          label={`编辑描述 (${shortcutShiftEnter()})`}
          onClick={onEditDescription}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 8h10M6 12h12M6 16h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M17 10l3 3-6 6h-3v-3l6-6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </ToolbarBtn>

        <ToolbarBtn
          label={`添加图片 (${shortcutOptionEnter()})`}
          onClick={onAddImage}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="4" y="6" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="9" cy="11" r="1.5" fill="currentColor" />
            <path d="M4 15l4-3 3 2 5-4 4 3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </ToolbarBtn>

        <ToolbarBtn
          label="更多"
          active={moreOpen}
          btnRef={moreBtnRef}
          onClick={() => { setTextStyleOpen(false); setMoreOpen(v => !v); }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="6" cy="12" r="1.5" fill="currentColor" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
            <circle cx="18" cy="12" r="1.5" fill="currentColor" />
          </svg>
        </ToolbarBtn>

        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />

        <ToolbarBtn
          label={`添加评论 (${shortcutModAltM()})`}
          onClick={onComment}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 6a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H10l-4 3V6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M9 11h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </ToolbarBtn>
      </div>

      {moreOpen && (
        <MindNoteMapMoreMenu
          anchorRef={moreBtnRef}
          onAction={onMoreAction}
          onClose={() => setMoreOpen(false)}
        />
      )}
    </div>
  );
};
