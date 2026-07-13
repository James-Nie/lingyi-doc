import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DOC_COLORS } from './styles';
import { TableInsertPicker } from './TableInsertPicker';
import { computeFloatingPosition } from './floatingPosition';

interface DocBlockInsertMenuProps {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onInsert: (kind: InsertBlockKind, tableSize?: { rows: number; cols: number }) => void;
  /** 默认右侧展开；工具栏插入按钮使用 bottom */
  placement?: 'right' | 'bottom';
}

export type InsertBlockKind =
  | 'paragraph'
  | 'heading1' | 'heading2' | 'heading3' | 'heading4'
  | 'bulletList' | 'orderedList' | 'taskList'
  | 'code' | 'mermaid' | 'quote' | 'divider'
  | 'table' | 'image'
  | 'baseGrid' | 'baseKanban' | 'baseGantt' | 'baseGallery'
  | 'whiteboard' | 'whiteboardFlowchart' | 'whiteboardMindmap';

const ROW_HOVER_BG = '#F2F3F5';
const ICON_HOVER_BG = '#F2F3F5';

function InsertIconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 28,
        height: 28,
        border: 'none',
        borderRadius: 6,
        background: hover ? ICON_HOVER_BG : 'transparent',
        color: DOC_COLORS.text,
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.12s ease',
      }}
    >
      {children}
    </button>
  );
}

function MenuRow({
  icon,
  label,
  active,
  hasSub,
  rowRef,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  hasSub?: boolean;
  rowRef?: React.Ref<HTMLButtonElement>;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const highlighted = active || hover;

  return (
    <button
      ref={rowRef}
      type="button"
      onMouseEnter={() => {
        setHover(true);
        onMouseEnter?.();
      }}
      onMouseLeave={() => {
        setHover(false);
        onMouseLeave?.();
      }}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: 'calc(100% - 8px)',
        margin: '0 4px',
        padding: '8px 10px',
        border: 'none',
        borderRadius: 6,
        background: highlighted ? ROW_HOVER_BG : 'transparent',
        cursor: 'pointer',
        fontSize: 14,
        color: DOC_COLORS.text,
        textAlign: 'left',
        transition: 'background 0.12s ease',
      }}
    >
      <span style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DOC_COLORS.muted }}>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {hasSub && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={highlighted ? '#86909C' : '#C9CDD4'} strokeWidth="2">
          <path d="M9 6l6 6-6 6" />
        </svg>
      )}
    </button>
  );
}

const basicIcons: { kind: InsertBlockKind; label: string; content: React.ReactNode }[] = [
  { kind: 'paragraph', label: '正文', content: 'T' },
  { kind: 'heading1', label: '标题1', content: 'H1' },
  { kind: 'heading2', label: '标题2', content: 'H2' },
  { kind: 'heading3', label: '标题3', content: 'H3' },
  { kind: 'heading4', label: '标题4', content: 'H4' },
  { kind: 'bulletList', label: '无序列表', content: '•' },
  { kind: 'orderedList', label: '有序列表', content: '1.' },
  { kind: 'taskList', label: '任务', content: '☑' },
  { kind: 'code', label: '代码块', content: '</>' },
  { kind: 'mermaid', label: 'Mermaid', content: '◇' },
  { kind: 'quote', label: '引用', content: '❝' },
  { kind: 'divider', label: '分割线', content: '—' },
];

export const DocBlockInsertMenu: React.FC<DocBlockInsertMenuProps> = ({
  open,
  anchorRef,
  onClose,
  onInsert,
  placement = 'right',
}) => {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [tablePickerPos, setTablePickerPos] = useState({ top: 0, left: 0 });
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [positioned, setPositioned] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const tableRowRef = useRef<HTMLButtonElement>(null);
  const tablePickerCloseTimer = useRef<number | null>(null);

  const clearTablePickerTimer = useCallback(() => {
    if (tablePickerCloseTimer.current != null) {
      window.clearTimeout(tablePickerCloseTimer.current);
      tablePickerCloseTimer.current = null;
    }
  }, []);

  const openTablePicker = useCallback(() => {
    clearTablePickerTimer();
    setShowTablePicker(true);
  }, [clearTablePickerTimer]);

  const scheduleCloseTablePicker = useCallback(() => {
    clearTablePickerTimer();
    tablePickerCloseTimer.current = window.setTimeout(() => {
      setShowTablePicker(false);
      tablePickerCloseTimer.current = null;
    }, 120);
  }, [clearTablePickerTimer]);

  const closeTablePicker = useCallback(() => {
    clearTablePickerTimer();
    setShowTablePicker(false);
  }, [clearTablePickerTimer]);

  const reposition = useCallback(() => {
    if (!anchorRef.current || !panelRef.current) return;
    const anchorRect = anchorRef.current.getBoundingClientRect();
    const panel = panelRef.current;
    setPos(computeFloatingPosition(anchorRect, {
      width: panel.offsetWidth || 240,
      height: panel.offsetHeight || 420,
    }, { placement }));

    if (showTablePicker && tableRowRef.current) {
      const rowRect = tableRowRef.current.getBoundingClientRect();
      setTablePickerPos(computeFloatingPosition(rowRect, {
        width: 220,
        height: 200,
      }, { gap: 0 }));
    }
    setPositioned(true);
  }, [anchorRef, placement, showTablePicker]);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPositioned(false);
      return;
    }
    reposition();
    const raf = requestAnimationFrame(reposition);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      setPositioned(false);
    };
  }, [open, anchorRef, reposition]);

  useEffect(() => {
    if (!open) {
      closeTablePicker();
    }
  }, [open, closeTablePicker]);

  useEffect(() => {
    if (showTablePicker) reposition();
  }, [showTablePicker, reposition]);

  useEffect(() => () => clearTablePickerTimer(), [clearTablePickerTimer]);

  if (!open) return null;

  const dismissTablePicker = () => closeTablePicker();

  return createPortal(
    <>
      <div
        ref={panelRef}
        data-doc-block-insert-menu
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          zIndex: 10002,
          width: 240,
          maxHeight: 'calc(100vh - 16px)',
          overflowY: 'auto',
          visibility: positioned ? 'visible' : 'hidden',
          background: '#fff',
          borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          border: `1px solid ${DOC_COLORS.border}`,
          padding: '8px 0',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div style={{ padding: '4px 12px 8px', fontSize: 12, color: DOC_COLORS.muted }}>基础</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: '0 8px 8px' }}>
          {basicIcons.map(item => (
            <InsertIconBtn
              key={item.kind}
              label={item.label}
              onClick={() => { onInsert(item.kind); onClose(); }}
            >
              {item.content}
            </InsertIconBtn>
          ))}
        </div>

        <div style={{ height: 1, background: DOC_COLORS.border, margin: '4px 0' }} />
        <div style={{ padding: '4px 12px 4px', fontSize: 12, color: DOC_COLORS.muted }}>常用</div>

        <MenuRow
          rowRef={tableRowRef}
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
            </svg>
          }
          label="表格"
          active={showTablePicker}
          hasSub
          onMouseEnter={openTablePicker}
          onMouseLeave={scheduleCloseTablePicker}
          onClick={openTablePicker}
        />
        <MenuRow
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="8.5" cy="11" r="1.5" />
              <path d="M12 9l4 5" />
            </svg>
          }
          label="图片"
          onMouseEnter={dismissTablePicker}
          onClick={() => { onInsert('image'); onClose(); }}
        />

        <div style={{ height: 1, background: DOC_COLORS.border, margin: '8px 0 4px' }} />
        <div style={{ padding: '4px 12px 4px', fontSize: 12, color: DOC_COLORS.muted }}>多维表格</div>

        <MenuRow
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3370FF" strokeWidth="1.8">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
            </svg>
          }
          label="表格"
          onMouseEnter={dismissTablePicker}
          onClick={() => { onInsert('baseGrid'); onClose(); }}
        />
        <MenuRow
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00B578" strokeWidth="1.8">
              <rect x="3" y="4" width="6" height="16" rx="1" />
              <rect x="11" y="4" width="6" height="10" rx="1" />
              <rect x="19" y="4" width="2" height="13" rx="1" />
            </svg>
          }
          label="看板"
          onMouseEnter={dismissTablePicker}
          onClick={() => { onInsert('baseKanban'); onClose(); }}
        />
        <MenuRow
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F54A45" strokeWidth="1.8">
              <path d="M4 6h8v3H4zM4 11h14v3H4zM4 16h10v3H4z" />
            </svg>
          }
          label="甘特图"
          onMouseEnter={dismissTablePicker}
          onClick={() => { onInsert('baseGantt'); onClose(); }}
        />
        <MenuRow
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C6CFF" strokeWidth="1.8">
              <rect x="3" y="5" width="8" height="8" rx="1" />
              <rect x="13" y="5" width="8" height="8" rx="1" />
              <rect x="3" y="15" width="8" height="6" rx="1" />
              <rect x="13" y="15" width="8" height="6" rx="1" />
            </svg>
          }
          label="画册"
          onMouseEnter={dismissTablePicker}
          onClick={() => { onInsert('baseGallery'); onClose(); }}
        />

        <div style={{ height: 1, background: DOC_COLORS.border, margin: '8px 0 4px' }} />
        <div style={{ padding: '4px 12px 4px', fontSize: 12, color: DOC_COLORS.muted }}>画板</div>

        <MenuRow
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3370FF" strokeWidth="1.8">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M8 12h8M12 8v8" />
            </svg>
          }
          label="画板"
          onMouseEnter={dismissTablePicker}
          onClick={() => { onInsert('whiteboard'); onClose(); }}
        />
        <MenuRow
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F57C00" strokeWidth="1.8">
              <rect x="4" y="3" width="7" height="5" rx="1" />
              <rect x="13" y="3" width="7" height="5" rx="1" />
              <rect x="8.5" y="16" width="7" height="5" rx="1" />
              <path d="M7.5 8v3h9M12 11v5M16.5 8v3" />
            </svg>
          }
          label="流程图"
          onMouseEnter={dismissTablePicker}
          onClick={() => { onInsert('whiteboardFlowchart'); onClose(); }}
        />
        <MenuRow
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3370FF" strokeWidth="1.8">
              <circle cx="6" cy="12" r="2.5" />
              <circle cx="18" cy="6" r="2.5" />
              <circle cx="18" cy="18" r="2.5" />
              <path d="M8.5 12h7M16 7.5l-2 2.5M16 16.5l-2-2.5" />
            </svg>
          }
          label="思维导图"
          onMouseEnter={dismissTablePicker}
          onClick={() => { onInsert('whiteboardMindmap'); onClose(); }}
        />
      </div>

      {showTablePicker && (
        <div
          style={{
            position: 'fixed',
            top: tablePickerPos.top,
            left: tablePickerPos.left,
            zIndex: 10003,
          }}
          onMouseEnter={openTablePicker}
          onMouseLeave={scheduleCloseTablePicker}
        >
          <TableInsertPicker
            onSelect={(rows, cols) => {
              onInsert('table', { rows, cols });
              onClose();
            }}
            onClose={closeTablePicker}
          />
        </div>
      )}
    </>,
    document.body,
  );
};
