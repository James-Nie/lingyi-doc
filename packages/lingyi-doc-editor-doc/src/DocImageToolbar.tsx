import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ImageBlock, BlockAlign, ImageStyle } from '@lingyi-doc/core-doc';
import { DOC_COLORS } from './styles';
import { IconAlignLeft, IconAlignCenter, IconAlignRight, IconLink, IconChevronDown } from './DocToolbarIcons';

const TOOLBAR_GAP = 2;

type MenuKey = 'size' | 'align' | 'style' | null;

interface DocImageToolbarProps {
  block: ImageBlock;
  displayWidth: number;
  displayHeight: number;
  maxWidth: number;
  minWidth: number;
  captionEditing: boolean;
  onToggleCaption: () => void;
  onPatch: (patch: Partial<ImageBlock>, recordHistory?: boolean) => void;
  onReplace: () => void;
  onPreview: () => void;
  onReset: () => void;
}

function ToolbarBtn({
  label,
  tooltip,
  active,
  hasMenu,
  onClick,
  children,
}: {
  label?: string;
  tooltip?: string;
  active?: boolean;
  hasMenu?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const [showTip, setShowTip] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        title={tooltip}
        onClick={onClick}
        onMouseEnter={() => { setHover(true); setShowTip(!!tooltip); }}
        onMouseLeave={() => { setHover(false); setShowTip(false); }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          height: 28,
          padding: label ? '0 8px' : '0 6px',
          border: 'none',
          borderRadius: 4,
          background: active || hover ? '#F2F3F5' : 'transparent',
          color: DOC_COLORS.text,
          cursor: 'pointer',
          fontSize: 13,
          whiteSpace: 'nowrap',
        }}
      >
        {children}
        {label && <span>{label}</span>}
        {hasMenu && <IconChevronDown size={10} />}
      </button>
      {showTip && tooltip && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: 6,
          padding: '4px 10px',
          background: '#4E5969',
          color: '#fff',
          fontSize: 12,
          borderRadius: 4,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          {tooltip}
        </div>
      )}
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 16, background: DOC_COLORS.border, margin: '0 2px' }} />;
}

function DropdownMenu({
  open,
  anchorRef,
  items,
  onClose,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  items: { id: string; label: string; icon?: React.ReactNode; checked?: boolean; onClick: () => void }[];
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={panelRef}
      data-doc-image-ui
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 10002,
        minWidth: 140,
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        border: `1px solid ${DOC_COLORS.border}`,
        padding: '4px 0',
      }}
    >
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          onMouseDown={e => {
            e.preventDefault();
            e.stopPropagation();
            item.onClick();
            onClose();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '8px 12px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 14,
            color: DOC_COLORS.text,
            textAlign: 'left',
          }}
        >
          <span style={{ width: 16, display: 'flex', justifyContent: 'center', color: DOC_COLORS.muted }}>
            {item.checked ? '✓' : item.icon}
          </span>
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}

function SizePopover({
  open,
  anchorRef,
  width,
  height,
  minWidth,
  maxWidth,
  onApply,
  onClose,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  width: number;
  height: number;
  minWidth: number;
  maxWidth: number;
  onApply: (w: number) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [w, setW] = useState(String(width));

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
    setW(String(width));
  }, [open, anchorRef, width]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const ratio = width / height;

  return createPortal(
    <div
      ref={panelRef}
      data-doc-image-ui
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 10002,
        padding: 12,
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        border: `1px solid ${DOC_COLORS.border}`,
      }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ fontSize: 12, color: DOC_COLORS.muted, marginBottom: 8 }}>图片尺寸</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ fontSize: 13, color: DOC_COLORS.text }}>
          宽
          <input
            type="number"
            value={w}
            min={minWidth}
            max={maxWidth}
            onChange={e => setW(e.target.value)}
            style={{
              display: 'block', width: 72, marginTop: 4, padding: '4px 8px',
              border: `1px solid ${DOC_COLORS.border}`, borderRadius: 4, fontSize: 13,
            }}
          />
        </label>
        <span style={{ color: DOC_COLORS.muted, marginTop: 18 }}>×</span>
        <label style={{ fontSize: 13, color: DOC_COLORS.text }}>
          高
          <input
            type="number"
            value={Math.round(Number(w) / ratio) || height}
            readOnly
            style={{
              display: 'block', width: 72, marginTop: 4, padding: '4px 8px',
              border: `1px solid ${DOC_COLORS.border}`, borderRadius: 4, fontSize: 13,
              background: '#F7F8FA', color: DOC_COLORS.muted,
            }}
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() => {
          const nw = Math.round(Math.max(minWidth, Math.min(maxWidth, Number(w) || minWidth)));
          onApply(nw);
          onClose();
        }}
        style={{
          marginTop: 10, width: '100%', padding: '6px 0', border: 'none', borderRadius: 4,
          background: DOC_COLORS.primary, color: '#fff', fontSize: 13, cursor: 'pointer',
        }}
      >
        确定
      </button>
    </div>,
    document.body,
  );
}

const IconRotate = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M3 12a9 9 0 019-9 9 9 0 016.36 2.64" />
    <path d="M3 4v5h5" />
  </svg>
);

const IconReplace = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <path d="M12 9v6M9 12h6" />
  </svg>
);

const IconDesc = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <rect x="3" y="4" width="18" height="14" rx="2" />
    <path d="M7 9h10M7 13h6" />
  </svg>
);

const IconStyle = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <rect x="4" y="4" width="12" height="12" rx="1" />
    <rect x="8" y="8" width="12" height="12" rx="1" />
  </svg>
);

const IconPreview = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" />
  </svg>
);

const IconReset = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M4 12a8 8 0 018-8 8 8 0 015.3 2" />
    <path d="M4 4v5h5" />
  </svg>
);

export const DocImageToolbar: React.FC<DocImageToolbarProps> = ({
  block,
  displayWidth,
  displayHeight,
  maxWidth,
  minWidth,
  captionEditing,
  onToggleCaption,
  onPatch,
  onReplace,
  onPreview,
  onReset,
}) => {
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const alignBtnRef = useRef<HTMLDivElement>(null);
  const styleBtnRef = useRef<HTMLDivElement>(null);
  const sizeBtnRef = useRef<HTMLDivElement>(null);

  const align = block.align ?? 'left';
  const imageStyle = block.imageStyle ?? 'none';
  const AlignIcon = align === 'center' ? IconAlignCenter : align === 'right' ? IconAlignRight : IconAlignLeft;

  const rotate = () => {
    const next = ((block.rotation ?? 0) - 90 + 360) % 360 as ImageBlock['rotation'];
    applyChange({ rotation: next });
  };

  const setLink = () => {
    const url = window.prompt('图片链接', block.link || 'https://');
    if (url === null) return;
    applyChange({ link: url || undefined });
  };

  const applyChange = (patch: Partial<ImageBlock>, recordHistory = true) => {
    onPatch(patch, recordHistory);
  };

  const closeMenu = () => setOpenMenu(null);

  return (
    <>
      <div
        data-doc-image-ui
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        style={{
          position: 'absolute',
          bottom: `calc(100% + ${TOOLBAR_GAP}px)`,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '4px 6px',
          background: '#fff',
          borderRadius: 8,
          boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
          border: `1px solid ${DOC_COLORS.border}`,
          whiteSpace: 'nowrap',
          zIndex: 5,
        }}
      >
        <ToolbarBtn tooltip="替换图片" onClick={onReplace}><IconReplace /></ToolbarBtn>
        <ToolbarBtn tooltip="逆时针旋转90度" onClick={rotate}><IconRotate /></ToolbarBtn>
        <div ref={sizeBtnRef as React.RefObject<HTMLDivElement>}>
          <ToolbarBtn
            label="宽高"
            active={openMenu === 'size'}
            onClick={() => setOpenMenu(openMenu === 'size' ? null : 'size')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 8V4h4M20 16v4h-4M4 16v4h4M20 8V4h-4" />
            </svg>
          </ToolbarBtn>
        </div>

        <Divider />

        <ToolbarBtn tooltip="添加链接" onClick={setLink}><IconLink /></ToolbarBtn>
        <ToolbarBtn label="描述" active={captionEditing} onClick={onToggleCaption}><IconDesc /></ToolbarBtn>

        <Divider />

        <div ref={alignBtnRef as React.RefObject<HTMLDivElement>}>
          <ToolbarBtn
            active={openMenu === 'align'}
            hasMenu
            onClick={() => setOpenMenu(openMenu === 'align' ? null : 'align')}
          >
            <AlignIcon />
          </ToolbarBtn>
        </div>
        <div ref={styleBtnRef as React.RefObject<HTMLDivElement>}>
          <ToolbarBtn
            label="样式"
            active={openMenu === 'style'}
            hasMenu
            onClick={() => setOpenMenu(openMenu === 'style' ? null : 'style')}
          >
            <IconStyle />
          </ToolbarBtn>
        </div>

        <Divider />

        <ToolbarBtn tooltip="查看大图" onClick={onPreview}><IconPreview /></ToolbarBtn>
        <ToolbarBtn tooltip="重置" onClick={onReset}><IconReset /></ToolbarBtn>
      </div>

      <SizePopover
        open={openMenu === 'size'}
        anchorRef={sizeBtnRef}
        width={displayWidth}
        height={displayHeight}
        minWidth={minWidth}
        maxWidth={maxWidth}
        onApply={w => applyChange({ width: w })}
        onClose={closeMenu}
      />

      <DropdownMenu
        open={openMenu === 'align'}
        anchorRef={alignBtnRef}
        onClose={closeMenu}
        items={([
          { id: 'left', label: '左对齐', icon: <IconAlignLeft /> },
          { id: 'center', label: '居中', icon: <IconAlignCenter /> },
          { id: 'right', label: '右对齐', icon: <IconAlignRight /> },
        ] as const).map(item => ({
          ...item,
          checked: align === item.id,
          onClick: () => applyChange({ align: item.id as BlockAlign }),
        }))}
      />

      <DropdownMenu
        open={openMenu === 'style'}
        anchorRef={styleBtnRef}
        onClose={closeMenu}
        items={([
          { id: 'none', label: '无样式' },
          { id: 'border', label: '图片描边' },
          { id: 'shadow', label: '图片阴影' },
        ] as const).map(item => ({
          ...item,
          checked: imageStyle === item.id,
          onClick: () => applyChange({ imageStyle: item.id as ImageStyle }),
        }))}
      />
    </>
  );
};
