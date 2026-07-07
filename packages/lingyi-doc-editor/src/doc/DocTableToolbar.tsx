import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BlockAlign, TableCellStyle, TableCellVerticalAlign } from '@lingyi-doc/core';
import { TABLE_CELL_STYLE_LABELS } from '@lingyi-doc/core';
import { DOC_COLORS, DOC_TOOLBAR_HOVER_BG } from './styles';
import {
  IconBold, IconItalic, IconStrike, IconUnderline, IconInlineCode,
  IconChevronDown, IconBtnWrap, IconAlignLeft, IconAlignCenter, IconAlignRight,
  IconBulletList, IconOrderedList, IconTask,
} from './DocToolbarIcons';

export type TableSelectionKind = 'col' | 'row' | null;

interface DocTableToolbarProps {
  open: boolean;
  anchorRect: DOMRect | null;
  selectionKind: TableSelectionKind;
  cellStyle: TableCellStyle;
  align: BlockAlign;
  verticalAlign: TableCellVerticalAlign;
  onInsertCol: () => void;
  onInsertRow: () => void;
  onDelete: () => void;
  onFormat: (cmd: 'bold' | 'italic' | 'underline' | 'strikeThrough') => void;
  onCellStyle: (style: TableCellStyle) => void;
  onAlign: (align: BlockAlign) => void;
  onVerticalAlign: (align: TableCellVerticalAlign) => void;
}

type MenuKey = 'style' | 'align' | null;

function ToolbarBtn({
  tooltip,
  active,
  onClick,
  children,
}: {
  tooltip?: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      title={tooltip}
      onMouseDown={e => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={e => {
        e.stopPropagation();
        onClick?.();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 28,
        height: 28,
        padding: '0 6px',
        border: 'none',
        borderRadius: 4,
        background: active || hover ? '#F2F3F5' : 'transparent',
        color: active ? DOC_COLORS.primary : DOC_COLORS.text,
        cursor: 'pointer',
        fontSize: 13,
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 16, background: DOC_COLORS.border, margin: '0 2px', flexShrink: 0 }} />;
}

function CheckMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M5 12l5 5L19 7" stroke={DOC_COLORS.primary} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconAlignTop() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 5h16" />
      <path d="M12 8v11" />
      <path d="M9 11l3-3 3 3" />
    </svg>
  );
}

function IconAlignMiddle() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 12h16" />
      <path d="M12 7v10" />
      <path d="M9 10l3-3 3 3M9 14l3 3 3-3" />
    </svg>
  );
}

function IconAlignBottom() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 19h16" />
      <path d="M12 5v11" />
      <path d="M9 16l3 3 3-3" />
    </svg>
  );
}

function IconTextBody({ active }: { active?: boolean }) {
  return (
    <span style={{
      fontSize: 15,
      fontWeight: 700,
      color: active ? DOC_COLORS.primary : DOC_COLORS.text,
      width: 20,
      textAlign: 'center',
    }}>T</span>
  );
}

function IconHeadingLabel({ level }: { level: string }) {
  return (
    <span style={{
      fontSize: 12,
      fontWeight: 700,
      color: DOC_COLORS.text,
      width: 20,
      textAlign: 'center',
    }}>{level}</span>
  );
}

function useFloatingPos(anchorRef: React.RefObject<HTMLElement | null>, open: boolean) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const update = () => {
      const rect = anchorRef.current!.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, anchorRef]);
  return pos;
}

function MenuItem({
  label,
  selected,
  icon,
  trailing,
  onClick,
  onMouseEnter,
}: {
  label: string;
  selected?: boolean;
  icon: React.ReactNode;
  trailing?: React.ReactNode;
  onClick: () => void;
  onMouseEnter?: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      onMouseEnter={() => { setHover(true); onMouseEnter?.(); }}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '10px 16px',
        border: 'none',
        background: hover ? DOC_TOOLBAR_HOVER_BG : 'transparent',
        cursor: 'pointer',
        fontSize: 14,
        color: selected ? DOC_COLORS.primary : DOC_COLORS.text,
        textAlign: 'left',
      }}
    >
      <span style={{ width: 20, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {trailing ?? (selected ? <CheckMark /> : <span style={{ width: 14 }} />)}
    </button>
  );
}

const MAIN_STYLE_OPTIONS: { value: TableCellStyle; icon: React.ReactNode }[] = [
  { value: 'paragraph', icon: <IconTextBody /> },
  { value: 'heading1', icon: <IconHeadingLabel level="H1" /> },
  { value: 'heading2', icon: <IconHeadingLabel level="H2" /> },
  { value: 'heading3', icon: <IconHeadingLabel level="H3" /> },
];

const OTHER_HEADING_OPTIONS: TableCellStyle[] = ['heading4', 'heading5', 'heading6'];

const LIST_STYLE_OPTIONS: { value: TableCellStyle; icon: React.FC }[] = [
  { value: 'orderedList', icon: IconOrderedList },
  { value: 'bulletList', icon: IconBulletList },
  { value: 'task', icon: IconTask },
  { value: 'code', icon: IconInlineCode },
];

function TableStyleMenu({
  open,
  anchorRef,
  selected,
  onSelect,
  onClose,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  selected: TableCellStyle;
  onSelect: (s: TableCellStyle) => void;
  onClose: () => void;
}) {
  const pos = useFloatingPos(anchorRef, open);
  const [otherHover, setOtherHover] = useState(false);
  const [subPos, setSubPos] = useState({ top: 0, left: 0 });
  const otherRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!otherHover || !otherRef.current) return;
    const rect = otherRef.current.getBoundingClientRect();
    setSubPos({ top: rect.top, left: rect.right + 4 });
  }, [otherHover, open]);

  if (!open) return null;

  const isOtherSelected = OTHER_HEADING_OPTIONS.includes(selected);

  return createPortal(
    <>
      <div
        data-doc-table-ui
        data-doc-table-menu
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          minWidth: 220,
          padding: '6px 0',
          background: '#fff',
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          border: `1px solid ${DOC_COLORS.border}`,
          zIndex: 10003,
        }}
      >
        {MAIN_STYLE_OPTIONS.map(({ value, icon }) => (
          <MenuItem
            key={value}
            label={TABLE_CELL_STYLE_LABELS[value]}
            selected={selected === value}
            icon={value === 'paragraph' ? <IconTextBody active={selected === value} /> : icon}
            onClick={() => { onSelect(value); onClose(); }}
          />
        ))}
        <div
          ref={otherRef}
          onMouseEnter={() => setOtherHover(true)}
          onMouseLeave={() => setOtherHover(false)}
        >
          <MenuItem
            label="其他标题"
            selected={isOtherSelected}
            icon={<IconHeadingLabel level="Hn" />}
            trailing={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {isOtherSelected ? <CheckMark /> : <span style={{ width: 14 }} />}
                <span style={{ color: '#86909C', fontSize: 12 }}>›</span>
              </span>
            }
            onClick={() => {}}
          />
        </div>
        {LIST_STYLE_OPTIONS.map(({ value, icon: Icon }) => (
          <MenuItem
            key={value}
            label={TABLE_CELL_STYLE_LABELS[value]}
            selected={selected === value}
            icon={<IconBtnWrap><Icon /></IconBtnWrap>}
            onClick={() => { onSelect(value); onClose(); }}
          />
        ))}
      </div>
      {otherHover && createPortal(
        <div
          data-doc-table-ui
          data-doc-table-menu
          onMouseEnter={() => setOtherHover(true)}
          onMouseLeave={() => setOtherHover(false)}
          style={{
            position: 'fixed',
            top: subPos.top,
            left: subPos.left,
            minWidth: 160,
            padding: '6px 0',
            background: '#fff',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            border: `1px solid ${DOC_COLORS.border}`,
            zIndex: 10004,
          }}
        >
          {OTHER_HEADING_OPTIONS.map(value => (
            <MenuItem
              key={value}
              label={TABLE_CELL_STYLE_LABELS[value]}
              selected={selected === value}
              icon={<IconHeadingLabel level={`H${value.replace('heading', '')}`} />}
              onClick={() => { onSelect(value); onClose(); setOtherHover(false); }}
            />
          ))}
        </div>,
        document.body,
      )}
    </>,
    document.body,
  );
}

function TableAlignMenu({
  open,
  anchorRef,
  align,
  verticalAlign,
  onAlign,
  onVerticalAlign,
  onClose,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  align: BlockAlign;
  verticalAlign: TableCellVerticalAlign;
  onAlign: (a: BlockAlign) => void;
  onVerticalAlign: (a: TableCellVerticalAlign) => void;
  onClose: () => void;
}) {
  const pos = useFloatingPos(anchorRef, open);
  if (!open) return null;

  const hOpts: { value: BlockAlign; label: string; icon: React.FC }[] = [
    { value: 'left', label: '左对齐', icon: IconAlignLeft },
    { value: 'center', label: '居中对齐', icon: IconAlignCenter },
    { value: 'right', label: '右对齐', icon: IconAlignRight },
  ];
  const vOpts: { value: TableCellVerticalAlign; label: string; icon: React.FC }[] = [
    { value: 'top', label: '顶部对齐', icon: IconAlignTop },
    { value: 'middle', label: '垂直居中', icon: IconAlignMiddle },
    { value: 'bottom', label: '底部对齐', icon: IconAlignBottom },
  ];

  return createPortal(
    <div
      data-doc-table-ui
      data-doc-table-menu
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        minWidth: 200,
        padding: '6px 0',
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        border: `1px solid ${DOC_COLORS.border}`,
        zIndex: 10003,
      }}
    >
      {hOpts.map(({ value, label, icon: Icon }) => (
        <MenuItem
          key={value}
          label={label}
          selected={align === value}
          icon={<IconBtnWrap active={align === value}><Icon /></IconBtnWrap>}
          onClick={() => { onAlign(value); onClose(); }}
        />
      ))}
      <div style={{ height: 1, background: DOC_COLORS.border, margin: '6px 0' }} />
      {vOpts.map(({ value, label, icon: Icon }) => (
        <MenuItem
          key={value}
          label={label}
          selected={verticalAlign === value}
          icon={<IconBtnWrap active={verticalAlign === value}><Icon /></IconBtnWrap>}
          onClick={() => { onVerticalAlign(value); onClose(); }}
        />
      ))}
    </div>,
    document.body,
  );
}

const IconInsertCol = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M12 4v16M8 8h8M8 16h8" />
    <path d="M18 6v12" />
  </svg>
);

const IconInsertRow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M4 12h16M8 8v8M16 8v8" />
    <path d="M6 18h12" />
  </svg>
);

const IconDelete = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h16M9 7V5h6v2M7 7l1 12h8l1-12" />
  </svg>
);

const IconTableGrid = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="4" y="4" width="16" height="16" rx="1" />
    <path d="M4 10h16M4 16h16M10 4v16M16 4v16" />
  </svg>
);

const IconPalette = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M12 3c-4.4 0-8 3.1-8 7.5 0 2.1 1.2 4 3 5.2.6.4 1 .9 1 1.5v.8c0 .8.7 1.5 1.5 1.5H10c.6 0 1.1.4 1.3 1 .3.9 1.1 1.5 2 1.5 3.9 0 7-3.1 7-7.5S16.4 3 12 3z" />
    <circle cx="8.5" cy="10" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="10" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const DocTableToolbar: React.FC<DocTableToolbarProps> = ({
  open,
  anchorRect,
  selectionKind,
  cellStyle,
  align,
  verticalAlign,
  onInsertCol,
  onInsertRow,
  onDelete,
  onFormat,
  onCellStyle,
  onAlign,
  onVerticalAlign,
}) => {
  const barRef = useRef<HTMLDivElement>(null);
  const styleAnchorRef = useRef<HTMLDivElement>(null);
  const alignAnchorRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRect || !barRef.current) return;
    const barRect = barRef.current.getBoundingClientRect();
    const left = anchorRect.left + anchorRect.width / 2 - barRect.width / 2;
    const top = anchorRect.top - barRect.height - 8;
    setPos({
      left: Math.max(8, Math.min(left, window.innerWidth - barRect.width - 8)),
      top: Math.max(8, top),
    });
  }, [open, anchorRect, selectionKind]);

  useEffect(() => {
    if (!openMenu) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target.closest?.('[data-doc-table-menu]')) return;
      if (barRef.current?.contains(target as Node)) return;
      setOpenMenu(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openMenu]);

  useEffect(() => {
    if (!open) setOpenMenu(null);
  }, [open]);

  if (!open || !anchorRect) return null;

  const AlignIcon = align === 'center' ? IconAlignCenter : align === 'right' ? IconAlignRight : IconAlignLeft;

  return createPortal(
    <div
      ref={barRef}
      data-doc-table-ui
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 10002,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '4px 8px',
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        border: `1px solid ${DOC_COLORS.border}`,
      }}
    >
      <ToolbarBtn tooltip="表格">
        <IconTableGrid />
      </ToolbarBtn>
      <ToolbarBtn tooltip="背景色">
        <IconPalette />
      </ToolbarBtn>

      <div ref={styleAnchorRef} data-doc-table-menu>
        <ToolbarBtn
          tooltip="文本样式"
          active={openMenu === 'style'}
          onClick={() => setOpenMenu(v => (v === 'style' ? null : 'style'))}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 13, fontWeight: 600 }}>
            T <IconChevronDown size={8} />
          </span>
        </ToolbarBtn>
        <TableStyleMenu
          open={openMenu === 'style'}
          anchorRef={styleAnchorRef}
          selected={cellStyle}
          onSelect={onCellStyle}
          onClose={() => setOpenMenu(null)}
        />
      </div>

      <div ref={alignAnchorRef} data-doc-table-menu>
        <ToolbarBtn
          tooltip="对齐"
          active={openMenu === 'align'}
          onClick={() => setOpenMenu(v => (v === 'align' ? null : 'align'))}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <IconBtnWrap><AlignIcon /></IconBtnWrap>
            <IconChevronDown size={8} />
          </span>
        </ToolbarBtn>
        <TableAlignMenu
          open={openMenu === 'align'}
          anchorRef={alignAnchorRef}
          align={align}
          verticalAlign={verticalAlign}
          onAlign={onAlign}
          onVerticalAlign={onVerticalAlign}
          onClose={() => setOpenMenu(null)}
        />
      </div>

      <Divider />

      <ToolbarBtn tooltip="粗体" onClick={() => onFormat('bold')}>
        <IconBtnWrap><IconBold /></IconBtnWrap>
      </ToolbarBtn>
      <ToolbarBtn tooltip="删除线" onClick={() => onFormat('strikeThrough')}>
        <IconBtnWrap><IconStrike /></IconBtnWrap>
      </ToolbarBtn>
      <ToolbarBtn tooltip="斜体" onClick={() => onFormat('italic')}>
        <IconBtnWrap><IconItalic /></IconBtnWrap>
      </ToolbarBtn>
      <ToolbarBtn tooltip="下划线" onClick={() => onFormat('underline')}>
        <IconBtnWrap><IconUnderline /></IconBtnWrap>
      </ToolbarBtn>
      <ToolbarBtn tooltip="代码">
        <IconBtnWrap><IconInlineCode /></IconBtnWrap>
      </ToolbarBtn>

      <Divider />

      <ToolbarBtn tooltip="表格">
        <IconTableGrid />
      </ToolbarBtn>
      {selectionKind === 'col' ? (
        <ToolbarBtn tooltip="插入列" onClick={onInsertCol}>
          <IconInsertCol />
        </ToolbarBtn>
      ) : (
        <ToolbarBtn tooltip="插入行" onClick={onInsertRow}>
          <IconInsertRow />
        </ToolbarBtn>
      )}

      <Divider />

      <ToolbarBtn tooltip="删除" onClick={onDelete}>
        <IconBtnWrap><IconDelete /></IconBtnWrap>
      </ToolbarBtn>
    </div>,
    document.body,
  );
};
