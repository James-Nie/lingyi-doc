import React, { useRef, useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';

/** 点击这些区域时不关闭 ToolbarPopover（Ant Design 弹层在 body 下渲染） */
const IGNORE_OUTSIDE_SELECTOR = [
  '[data-sheet-keep-selection]',
  '.ant-select-dropdown',
  '.ant-picker-dropdown',
  '.ant-dropdown',
  '.ant-popover',
  '.ant-tooltip',
  '.ant-modal-root',
  '.ant-drawer',
].join(', ');

function isIgnoredOutsideClick(target: Node): boolean {
  return Boolean((target as Element).closest?.(IGNORE_OUTSIDE_SELECTOR));
}

export interface ToolbarPopoverProps {
  open: boolean;
  onClose: () => void;
  trigger: React.ReactNode;
  title?: string;
  titleExtra?: React.ReactNode;
  width?: number | string;
  minWidth?: number;
  maxWidth?: number;
  maxHeight?: number | string;
  align?: 'left' | 'right';
  overflowVisible?: boolean;
  children: React.ReactNode;
}

interface PanelPosition {
  top: number;
  left?: number;
  right?: number;
}

export const ToolbarPopover: React.FC<ToolbarPopoverProps> = ({
  open,
  onClose,
  trigger,
  title,
  titleExtra,
  width,
  minWidth = 280,
  maxWidth,
  maxHeight = '70vh',
  align = 'left',
  overflowVisible = false,
  children,
}) => {
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<PanelPosition>({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (align === 'right') {
      setPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    } else {
      setPosition({ top: rect.bottom + 4, left: rect.left });
    }
  }, [align]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    const target = e.target as Node;
    if (triggerRef.current?.contains(target)) return;
    if (panelRef.current?.contains(target)) return;
    if (isIgnoredOutsideClick(target)) return;
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, handleClickOutside]);

  const panel = open ? (
    <div
      ref={panelRef}
      data-sheet-keep-selection
      style={{
        position: 'fixed',
        top: position.top,
        left: align === 'left' ? position.left : undefined,
        right: align === 'right' ? position.right : undefined,
        zIndex: 10001,
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        width,
        minWidth,
        maxWidth,
        maxHeight,
        display: 'flex',
        flexDirection: 'column',
        overflow: overflowVisible ? 'visible' : 'hidden',
      }}
      onClick={e => e.stopPropagation()}
    >
      {(title || titleExtra) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid #f0f0f0',
          flexShrink: 0,
        }}>
          {title && (
            <span style={{ fontSize: 14, fontWeight: 600, color: '#333', display: 'flex', alignItems: 'center', gap: 6 }}>
              {title}
              <span style={{ fontSize: 12, color: '#bbb', cursor: 'help' }} title="帮助">ⓘ</span>
            </span>
          )}
          {titleExtra}
        </div>
      )}
      <div style={{ flex: 1, overflow: overflowVisible ? 'visible' : 'auto' }}>
        {children}
      </div>
    </div>
  ) : null;

  return (
    <div ref={triggerRef} style={{ position: 'relative', display: 'inline-flex' }}>
      {trigger}
      {panel && createPortal(panel, document.body)}
    </div>
  );
};
