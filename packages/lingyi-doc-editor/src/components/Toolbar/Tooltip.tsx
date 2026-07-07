import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const HOVER_BG = '#e8e8e8';
const ACTIVE_BG = '#e1eaff';
const TOOLTIP_BG = '#2b2b2b';

export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

export function modShortcut(key: string): string {
  return isMacPlatform() ? `⌘ ${key}` : `Ctrl+${key}`;
}

export function redoShortcut(): string {
  return isMacPlatform() ? '⌘ Shift Z' : 'Ctrl+Y';
}

export function headingShortcut(level: number): string {
  return isMacPlatform() ? `⌥ ⌘ ${level}` : `Ctrl+Alt+${level}`;
}

interface ToolbarTooltipProps {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
  /** 不显示 tooltip，仅保留 hover 背景 */
  hideTooltip?: boolean;
  /** 自定义 hover 背景色 */
  hoverBg?: string;
  /** 双行 tooltip（名称 + 快捷键分行） */
  twoLineTooltip?: boolean;
}

export const ToolbarTooltip: React.FC<ToolbarTooltipProps> = ({
  label,
  shortcut,
  disabled,
  active,
  children,
  style,
  hideTooltip,
  hoverBg = HOVER_BG,
  twoLineTooltip = false,
}) => {
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number>(0);

  const show = () => {
    if (disabled) return;
    setHovered(true);
    if (hideTooltip) return;
    timeoutRef.current = window.setTimeout(() => {
      if (wrapperRef.current) {
        const rect = wrapperRef.current.getBoundingClientRect();
        setPos({ x: rect.left + rect.width / 2, y: rect.bottom + 4 });
      }
      setVisible(true);
    }, 300);
  };

  const hide = () => {
    clearTimeout(timeoutRef.current);
    setHovered(false);
    setVisible(false);
  };

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const background = disabled
    ? 'transparent'
    : hovered
      ? hoverBg
      : active
        ? ACTIVE_BG
        : 'transparent';

  const tipText = shortcut ? `${label} (${shortcut})` : label;

  return (
    <div
      ref={wrapperRef}
      data-sheet-keep-selection
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
        background,
        transition: 'background 0.12s ease',
        flexShrink: 0,
        ...style,
      }}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {visible && !disabled && !hideTooltip && createPortal(
        <div
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y,
            transform: 'translateX(-50%)',
            zIndex: 99999,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderBottom: `5px solid ${TOOLTIP_BG}`,
              margin: '0 auto',
            }}
          />
          <div
            style={{
              background: TOOLTIP_BG,
              color: '#fff',
              fontSize: 12,
              padding: twoLineTooltip && shortcut ? '6px 10px' : '5px 10px',
              borderRadius: 6,
              lineHeight: '18px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              textAlign: 'center',
            }}
          >
            {twoLineTooltip && shortcut ? (
              <>
                <div>{label}</div>
                <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>{shortcut}</div>
              </>
            ) : tipText}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

/** @deprecated 使用 ToolbarTooltip */
export const Tooltip = ToolbarTooltip;
