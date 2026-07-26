import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ToolbarState, ParagraphStyle, BlockAlign } from '@lingyi-doc/core-doc';
import { FONT_SIZES } from '@lingyi-doc/core-doc';
import {
  toolbarDivider,
  DOC_COLORS,
  DOC_TOOLBAR_HOVER_BG,
  docToolbarIconBtn,
  docToolbarDropdownBtn,
} from './styles';
import type { ToolbarAction } from './RichDocEditor';
import { ToolbarTooltip, modShortcut, redoShortcut, headingShortcut } from '@lingyi-doc/editor-shared';
import { DocColorMenu } from './DocColorMenu';
import {
  IconUndo, IconRedo, IconBold, IconItalic, IconStrike, IconUnderline, IconInlineCode,
  IconAlignLeft, IconAlignCenter, IconAlignRight, IconBulletList, IconOrderedList,
  IconIndentInc, IconIndentDec, IconTask, IconLink, IconQuote, IconDivider, IconImage,
  IconOutline, IconFullscreen, IconFindReplace, IconHighlight, IconTextColor, IconChevronDown, IconBtnWrap,
} from './DocToolbarIcons';

const PARAGRAPH_OPTIONS: { value: ParagraphStyle; label: string; shortcut?: string; preview?: React.CSSProperties }[] = [
  { value: 'paragraph', label: '正文' },
  { value: 'heading1', label: '标题 1', shortcut: headingShortcut(1), preview: { fontSize: 26, fontWeight: 700 } },
  { value: 'heading2', label: '标题 2', shortcut: headingShortcut(2), preview: { fontSize: 22, fontWeight: 700 } },
  { value: 'heading3', label: '标题 3', shortcut: headingShortcut(3), preview: { fontSize: 20, fontWeight: 700 } },
  { value: 'heading4', label: '标题 4', shortcut: headingShortcut(4), preview: { fontSize: 18, fontWeight: 600 } },
  { value: 'heading5', label: '标题 5', shortcut: headingShortcut(5), preview: { fontSize: 16, fontWeight: 600 } },
  { value: 'heading6', label: '标题 6', shortcut: headingShortcut(6), preview: { fontSize: 14, fontWeight: 600 } },
];

type MenuKey = 'style' | 'size' | 'align' | 'ordered' | 'indent' | 'textColor' | 'highlight' | null;

interface DocToolbarProps {
  state: ToolbarState;
  showOutline: boolean;
  showComments?: boolean;
  showFindReplace?: boolean;
  onAction: (action: ToolbarAction) => void;
  onToggleOutline: () => void;
  onToggleComments?: () => void;
  onToggleFindReplace?: () => void;
  onToggleFullscreen: () => void;
  onInsertImage?: () => void;
  insertMenuAnchorRef?: React.RefObject<HTMLButtonElement>;
  findReplaceAnchorRef?: React.RefObject<HTMLButtonElement>;
}

export const DocToolbar: React.FC<DocToolbarProps> = ({
  state,
  showOutline,
  showComments = false,
  showFindReplace = false,
  onAction,
  onToggleOutline,
  onToggleComments,
  onToggleFindReplace,
  onToggleFullscreen,
  onInsertImage,
  insertMenuAnchorRef,
  findReplaceAnchorRef,
}) => {
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const toggle = (key: MenuKey) => setOpenMenu(v => (v === key ? null : key));
  const closeAll = () => setOpenMenu(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target.closest?.('[data-doc-toolbar-menu]')) return;
      if (toolbarRef.current?.contains(target as Node)) return;
      closeAll();
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const currentStyleLabel = PARAGRAPH_OPTIONS.find(o => o.value === state.paragraphStyle)?.label ?? '正文';
  const highlightColor = state.backgroundColor === 'transparent' ? '#FBDE28' : state.backgroundColor;
  const AlignIcon = state.align === 'center' ? IconAlignCenter : state.align === 'right' ? IconAlignRight : IconAlignLeft;

  return (
    <div
      ref={toolbarRef}
      data-sheet-keep-selection
      onMouseDown={e => {
        const t = e.target as HTMLElement;
        if (t.closest('button, input, [data-doc-toolbar-menu], a')) e.preventDefault();
      }}
      style={{
        height: 48,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 1,
        background: '#fff',
        borderBottom: `1px solid ${DOC_COLORS.border}`,
        overflowX: 'auto',
        position: 'relative',
        zIndex: 20,
      }}
    >
      {/* 插入 */}
      <ToolbarTooltip label="插入" hideTooltip hoverBg={DOC_TOOLBAR_HOVER_BG}>
        <button
          ref={insertMenuAnchorRef}
          type="button"
          onClick={() => { closeAll(); onAction({ type: 'new' }); }}
          style={{
            width: 28, height: 28, borderRadius: '50%', border: 'none', background: '#00B42A',
            color: '#fff', fontSize: 18, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >+</button>
      </ToolbarTooltip>

      <DocIconBtn label="撤销" shortcut={modShortcut('Z')} disabled={!state.canUndo} onClick={() => onAction({ type: 'undo' })}><IconUndo /></DocIconBtn>
      <DocIconBtn label="重做" shortcut={redoShortcut()} disabled={!state.canRedo} onClick={() => onAction({ type: 'redo' })}><IconRedo /></DocIconBtn>

      <div style={toolbarDivider} />

      <StyleDropdown
        open={openMenu === 'style'}
        label={currentStyleLabel}
        selected={state.paragraphStyle}
        onToggle={() => toggle('style')}
        onSelect={style => { onAction({ type: 'paragraphStyle', style }); closeAll(); }}
      />
      <SizeDropdown
        open={openMenu === 'size'}
        fontSize={state.fontSize}
        onToggle={() => toggle('size')}
        onSelect={size => { onAction({ type: 'fontSize', size }); closeAll(); }}
      />

      <div style={toolbarDivider} />

      <DocIconBtn label="加粗" shortcut={modShortcut('B')} active={state.bold} onClick={() => onAction({ type: 'inline', cmd: 'bold' })}><IconBold /></DocIconBtn>
      <DocIconBtn label="斜体" shortcut={modShortcut('I')} active={state.italic} onClick={() => onAction({ type: 'inline', cmd: 'italic' })}><IconItalic /></DocIconBtn>
      <DocIconBtn label="删除线" active={state.strikethrough} onClick={() => onAction({ type: 'inline', cmd: 'strikethrough' })}><IconStrike /></DocIconBtn>
      <DocIconBtn label="下划线" shortcut={modShortcut('U')} active={state.underline} onClick={() => onAction({ type: 'inline', cmd: 'underline' })}><IconUnderline /></DocIconBtn>
      <DocIconBtn label="代码" active={state.isCode} onClick={() => onAction({ type: 'code' })}><IconInlineCode /></DocIconBtn>

      <div style={toolbarDivider} />

      <TextColorPicker
        open={openMenu === 'textColor'}
        color={state.color}
        onToggle={() => toggle('textColor')}
        onPick={c => { onAction({ type: 'color', color: c }); closeAll(); }}
        onClose={closeAll}
      />

      <HighlightColorPicker
        open={openMenu === 'highlight'}
        color={state.backgroundColor}
        highlightColor={highlightColor}
        onToggle={() => toggle('highlight')}
        onPick={c => { onAction({ type: 'background', color: c }); closeAll(); }}
        onClose={closeAll}
      />

      <div style={toolbarDivider} />

      <AlignDropdown
        open={openMenu === 'align'}
        align={state.align}
        AlignIcon={AlignIcon}
        onToggle={() => toggle('align')}
        onSelect={align => { onAction({ type: 'align', align }); closeAll(); }}
      />

      <DocIconBtn label="无序列表" active={state.listType === 'bullet'} onClick={() => onAction({ type: 'list', listType: 'bullet' })}><IconBulletList /></DocIconBtn>

      <OrderedListDropdown
        open={openMenu === 'ordered'}
        active={state.listType === 'ordered'}
        onToggle={() => toggle('ordered')}
        onSelect={styleIndex => {
          const styles = ['multiLevel', 'chinese', 'hierarchical'] as const;
          onAction({ type: 'list', listType: 'ordered', orderedStyle: styles[styleIndex] });
          closeAll();
        }}
      />

      <IndentDropdown
        open={openMenu === 'indent'}
        onToggle={() => toggle('indent')}
        onSelect={dir => { onAction({ type: 'indent', direction: dir }); closeAll(); }}
      />

      <div style={toolbarDivider} />

      <DocIconBtn label="任务列表" active={state.listType === 'task'} onClick={() => onAction({ type: 'list', listType: 'task' })}><IconTask /></DocIconBtn>
      <DocIconBtn label="插入链接" onClick={() => onAction({ type: 'link' })}><IconLink /></DocIconBtn>
      <DocIconBtn label="引用" active={state.isQuote} onClick={() => onAction({ type: 'quote' })}><IconQuote /></DocIconBtn>
      <DocIconBtn label="分割线" onClick={() => onAction({ type: 'divider' })}><IconDivider /></DocIconBtn>

      <div style={toolbarDivider} />

      <DocIconBtn label="插入图片" onClick={() => onInsertImage?.()}><IconImage /></DocIconBtn>

      {onToggleComments && (
        <>
          <div style={toolbarDivider} />
          <DocIconBtn label="评论" active={showComments} onClick={onToggleComments}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
            </svg>
          </DocIconBtn>
        </>
      )}

      {onToggleFindReplace && (
        <>
          {!onToggleComments && <div style={toolbarDivider} />}
          <ToolbarTooltip label="查找替换" shortcut={modShortcut('F')} active={showFindReplace} twoLineTooltip hoverBg={DOC_TOOLBAR_HOVER_BG}>
            <button
              ref={findReplaceAnchorRef}
              type="button"
              style={{
                ...docToolbarIconBtn(),
                color: showFindReplace ? DOC_COLORS.primary : DOC_COLORS.text,
              }}
              onClick={onToggleFindReplace}
            >
              <IconBtnWrap active={showFindReplace}><IconFindReplace /></IconBtnWrap>
            </button>
          </ToolbarTooltip>
        </>
      )}

      <div style={toolbarDivider} />
      <DocIconBtn label="大纲" active={showOutline} onClick={onToggleOutline}><IconOutline /></DocIconBtn>
      <DocIconBtn label="全屏" onClick={onToggleFullscreen}><IconFullscreen /></DocIconBtn>
    </div>
  );
};

function TextColorPicker({ open, color, onToggle, onPick, onClose }: {
  open: boolean; color: string; onToggle: () => void; onPick: (c: string) => void; onClose: () => void;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={anchorRef}>
        <ToolbarTooltip label="文字颜色" active={open} hideTooltip hoverBg={DOC_TOOLBAR_HOVER_BG}>
          <button type="button" onClick={onToggle} style={{ ...docToolbarIconBtn(), padding: '0 4px' }}>
            <IconTextColor color={color} />
          </button>
        </ToolbarTooltip>
      </div>
      <DocColorMenu mode="text" value={color} open={open} anchorRef={anchorRef} placement="bottom" onPick={onPick} onClose={onClose} />
    </>
  );
}

function HighlightColorPicker({ open, color, highlightColor, onToggle, onPick, onClose }: {
  open: boolean; color: string; highlightColor: string; onToggle: () => void; onPick: (c: string) => void; onClose: () => void;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={anchorRef}>
        <ToolbarTooltip label="背景色" active={open} hideTooltip hoverBg={DOC_TOOLBAR_HOVER_BG}>
          <button type="button" onClick={onToggle} style={{ ...docToolbarIconBtn(), padding: '0 4px' }}>
            <IconHighlight color={highlightColor} />
          </button>
        </ToolbarTooltip>
      </div>
      <DocColorMenu mode="highlight" value={color} open={open} anchorRef={anchorRef} placement="bottom" onPick={onPick} onClose={onClose} />
    </>
  );
}

function AlignDropdown({ open, align, AlignIcon, onToggle, onSelect }: {
  open: boolean; align: BlockAlign; AlignIcon: React.FC; onToggle: () => void; onSelect: (a: BlockAlign) => void;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const pos = useFloatingPos(anchorRef, open);
  const [hover, setHover] = useState<BlockAlign | null>(null);
  const opts: { value: BlockAlign; icon: React.FC }[] = [
    { value: 'left', icon: IconAlignLeft },
    { value: 'center', icon: IconAlignCenter },
    { value: 'right', icon: IconAlignRight },
  ];
  return (
    <>
      <div ref={anchorRef}>
        <ToolbarTooltip label="对齐方式" active={open} hideTooltip hoverBg={DOC_TOOLBAR_HOVER_BG}>
          <button type="button" onClick={onToggle} style={{ ...docToolbarIconBtn(), gap: 1, padding: '0 4px' }}>
            <IconBtnWrap><AlignIcon /></IconBtnWrap><IconChevronDown />
          </button>
        </ToolbarTooltip>
      </div>
      {open && createPortal(
        <div data-doc-toolbar-menu style={{
          position: 'fixed', top: pos.top, left: pos.left, padding: 6,
          background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          border: `1px solid ${DOC_COLORS.border}`, zIndex: 10000, display: 'flex', gap: 2,
        }}>
          {opts.map(({ value: v, icon: Icon }) => (
            <button key={v} type="button" onClick={() => onSelect(v)}
              onMouseEnter={() => setHover(v)} onMouseLeave={() => setHover(null)}
              style={{
                width: 32, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer',
                background: align === v || hover === v ? DOC_TOOLBAR_HOVER_BG : 'transparent',
                color: align === v ? DOC_COLORS.primary : DOC_COLORS.text,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}><Icon /></button>
          ))}
        </div>, document.body,
      )}
    </>
  );
}

function OrderedListDropdown({ open, active, onToggle, onSelect }: {
  open: boolean; active: boolean; onToggle: () => void; onSelect: (styleIndex: number) => void;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const pos = useFloatingPos(anchorRef, open);
  const [sel, setSel] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const styles = [
    { lines: ['1.', 'a.', 'b.', 'i.', '2.'] },
    { lines: ['一、', '(一)', '(二)', '1.', '二、'] },
    { lines: ['1.', '1.1.', '1.2.', '1.2.1.', '2.'] },
  ];
  return (
    <>
      <div ref={anchorRef}>
        <ToolbarTooltip label="有序列表" active={active || open} hideTooltip hoverBg={DOC_TOOLBAR_HOVER_BG}>
          <button type="button" onClick={onToggle} style={{ ...docToolbarIconBtn(), gap: 1, padding: '0 4px' }}>
            <IconBtnWrap active={active}><IconOrderedList /></IconBtnWrap><IconChevronDown />
          </button>
        </ToolbarTooltip>
      </div>
      {open && createPortal(
        <div data-doc-toolbar-menu style={{
          position: 'fixed', top: pos.top, left: pos.left, padding: 8,
          background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          border: `1px solid ${DOC_COLORS.border}`, zIndex: 10000, display: 'flex', gap: 8,
        }}>
          {styles.map((st, i) => (
            <button key={i} type="button" onClick={() => { setSel(i); onSelect(i); }}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              style={{
                width: 100, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                border: `1px solid ${sel === i ? DOC_COLORS.primary : '#E5E6EB'}`,
                background: hover === i ? '#F7F8FA' : '#fff',
              }}>
              {st.lines.map((l, li) => (
                <div key={li} style={{ fontSize: 11, color: '#86909C', lineHeight: 1.6, paddingLeft: li > 0 ? 8 : 0 }}>{l}</div>
              ))}
            </button>
          ))}
        </div>, document.body,
      )}
    </>
  );
}

function IndentDropdown({ open, onToggle, onSelect }: {
  open: boolean; onToggle: () => void; onSelect: (d: 'increase' | 'decrease') => void;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const pos = useFloatingPos(anchorRef, open);
  const [hover, setHover] = useState<string | null>(null);
  const items = [
    { id: 'inc', label: '增加缩进', icon: IconIndentInc, dir: 'increase' as const },
    { id: 'dec', label: '减少缩进', icon: IconIndentDec, dir: 'decrease' as const },
  ];
  return (
    <>
      <div ref={anchorRef}>
        <ToolbarTooltip label="缩进" active={open} hideTooltip hoverBg={DOC_TOOLBAR_HOVER_BG}>
          <button type="button" onClick={onToggle} style={{ ...docToolbarIconBtn(), gap: 1, padding: '0 4px' }}>
            <IconIndentInc /><IconChevronDown />
          </button>
        </ToolbarTooltip>
      </div>
      {open && createPortal(
        <div data-doc-toolbar-menu style={{
          position: 'fixed', top: pos.top, left: pos.left, minWidth: 160, padding: '4px 0',
          background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          border: `1px solid ${DOC_COLORS.border}`, zIndex: 10000,
        }}>
          {items.map(it => (
            <button key={it.id} type="button" onClick={() => onSelect(it.dir)}
              onMouseEnter={() => setHover(it.id)} onMouseLeave={() => setHover(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px',
                border: 'none', background: hover === it.id ? DOC_TOOLBAR_HOVER_BG : 'transparent',
                cursor: 'pointer', fontSize: 13, color: DOC_COLORS.text,
              }}>
              <it.icon />{it.label}
            </button>
          ))}
        </div>, document.body,
      )}
    </>
  );
}

function DocIconBtn({ label, shortcut, active, disabled, onClick, children }: {
  label: string; shortcut?: string; active?: boolean; disabled?: boolean;
  onClick?: () => void; children: React.ReactNode;
}) {
  return (
    <ToolbarTooltip label={label} shortcut={shortcut} active={active} disabled={disabled} twoLineTooltip={!!shortcut} hoverBg={DOC_TOOLBAR_HOVER_BG}>
      <button type="button" style={{
        ...docToolbarIconBtn(disabled),
        color: disabled ? '#C9CDD4' : active ? DOC_COLORS.primary : DOC_COLORS.text,
      }} disabled={disabled} onClick={disabled ? undefined : onClick}>
        <IconBtnWrap active={active}>{children}</IconBtnWrap>
      </button>
    </ToolbarTooltip>
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
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [open, anchorRef]);
  return pos;
}

function StyleDropdown({ open, label, selected, onToggle, onSelect }: {
  open: boolean; label: string; selected: ParagraphStyle;
  onToggle: () => void; onSelect: (s: ParagraphStyle) => void;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const pos = useFloatingPos(anchorRef, open);
  return (
    <div ref={anchorRef}>
      <ToolbarTooltip label="段落样式" active={open} hideTooltip hoverBg={DOC_TOOLBAR_HOVER_BG}>
        <button type="button" style={docToolbarDropdownBtn} onClick={onToggle}>
          <span>{label}</span><IconChevronDown />
        </button>
      </ToolbarTooltip>
      {open && createPortal(
        <div data-doc-toolbar-menu style={{
          position: 'fixed', top: pos.top, left: pos.left, minWidth: 220, padding: '4px 0',
          background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          border: `1px solid ${DOC_COLORS.border}`, zIndex: 10000,
        }}>
          {PARAGRAPH_OPTIONS.map(opt => <DropdownItem key={opt.value} label={opt.label} shortcut={opt.shortcut} selected={selected === opt.value} preview={opt.preview} onClick={() => onSelect(opt.value)} />)}
        </div>, document.body,
      )}
    </div>
  );
}

function SizeDropdown({ open, fontSize, onToggle, onSelect }: {
  open: boolean; fontSize: number; onToggle: () => void; onSelect: (s: number) => void;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const pos = useFloatingPos(anchorRef, open);
  return (
    <div ref={anchorRef}>
      <ToolbarTooltip label="字号" active={open} hideTooltip hoverBg={DOC_TOOLBAR_HOVER_BG}>
        <button type="button" style={{ ...docToolbarDropdownBtn, minWidth: 56, justifyContent: 'space-between' }} onClick={onToggle}>
          <span>{fontSize}px</span><IconChevronDown />
        </button>
      </ToolbarTooltip>
      {open && createPortal(
        <div data-doc-toolbar-menu style={{
          position: 'fixed', top: pos.top, left: pos.left, minWidth: 100, padding: '4px 0',
          background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          border: `1px solid ${DOC_COLORS.border}`, zIndex: 10000,
        }}>
          {FONT_SIZES.map(s => <DropdownItem key={s} label={`${s}px`} selected={fontSize === s} onClick={() => onSelect(s)} />)}
        </div>, document.body,
      )}
    </div>
  );
}

function AlignMenu({ open, anchorRef, value, onSelect, onClose }: {
  open: boolean; anchorRef: React.RefObject<HTMLElement | null>; value: BlockAlign;
  onSelect: (a: BlockAlign) => void; onClose: () => void;
}) {
  const pos = useFloatingPos(anchorRef, open);
  const [hover, setHover] = useState<BlockAlign | null>(null);
  const opts: { value: BlockAlign; icon: React.FC }[] = [
    { value: 'left', icon: IconAlignLeft },
    { value: 'center', icon: IconAlignCenter },
    { value: 'right', icon: IconAlignRight },
  ];
  if (!open) return null;
  return createPortal(
    <div data-doc-toolbar-menu style={{
      position: 'fixed', top: pos.top, left: pos.left, padding: 6,
      background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      border: `1px solid ${DOC_COLORS.border}`, zIndex: 10000, display: 'flex', gap: 2,
    }}>
      {opts.map(({ value: v, icon: Icon }) => (
        <button key={v} type="button" onClick={() => onSelect(v)}
          onMouseEnter={() => setHover(v)} onMouseLeave={() => setHover(null)}
          style={{
            width: 32, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer',
            background: value === v || hover === v ? DOC_TOOLBAR_HOVER_BG : 'transparent',
            color: value === v ? DOC_COLORS.primary : DOC_COLORS.text,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}><Icon /></button>
      ))}
    </div>, document.body,
  );
}

function OrderedListMenu({ open, anchorRef, onSelect, onClose }: {
  open: boolean; anchorRef: React.RefObject<HTMLElement | null>;
  onSelect: () => void; onClose: () => void;
}) {
  const pos = useFloatingPos(anchorRef, open);
  const [sel, setSel] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const styles = [
    { lines: ['1.', 'a.', 'b.', 'i.', '2.'] },
    { lines: ['一、', '(一)', '(二)', '1.', '二、'] },
    { lines: ['1.', '1.1.', '1.2.', '1.2.1.', '2.'] },
  ];
  if (!open) return null;
  return createPortal(
    <div data-doc-toolbar-menu style={{
      position: 'fixed', top: pos.top, left: pos.left, padding: 8,
      background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      border: `1px solid ${DOC_COLORS.border}`, zIndex: 10000, display: 'flex', gap: 8,
    }}>
      {styles.map((st, i) => (
        <button key={i} type="button" onClick={() => { setSel(i); onSelect(); }}
          onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
          style={{
            width: 100, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
            border: `1px solid ${sel === i ? DOC_COLORS.primary : '#E5E6EB'}`,
            background: hover === i ? '#F7F8FA' : '#fff',
          }}>
          {st.lines.map((l, li) => (
            <div key={li} style={{ fontSize: 11, color: '#86909C', lineHeight: 1.6, paddingLeft: li > 0 ? 8 : 0 }}>{l}</div>
          ))}
        </button>
      ))}
    </div>, document.body,
  );
}

function IndentMenu({ open, anchorRef, onSelect, onClose }: {
  open: boolean; anchorRef: React.RefObject<HTMLElement | null>;
  onSelect: (d: 'increase' | 'decrease') => void; onClose: () => void;
}) {
  const pos = useFloatingPos(anchorRef, open);
  const [hover, setHover] = useState<string | null>(null);
  const items = [
    { id: 'inc', label: '增加缩进', icon: IconIndentInc, dir: 'increase' as const },
    { id: 'dec', label: '减少缩进', icon: IconIndentDec, dir: 'decrease' as const },
  ];
  if (!open) return null;
  return createPortal(
    <div data-doc-toolbar-menu style={{
      position: 'fixed', top: pos.top, left: pos.left, minWidth: 160, padding: '4px 0',
      background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      border: `1px solid ${DOC_COLORS.border}`, zIndex: 10000,
    }}>
      {items.map(it => (
        <button key={it.id} type="button" onClick={() => onSelect(it.dir)}
          onMouseEnter={() => setHover(it.id)} onMouseLeave={() => setHover(null)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px',
            border: 'none', background: hover === it.id ? DOC_TOOLBAR_HOVER_BG : 'transparent',
            cursor: 'pointer', fontSize: 13, color: DOC_COLORS.text,
          }}>
          <it.icon />{it.label}
        </button>
      ))}
    </div>, document.body,
  );
}

function DropdownItem({ label, shortcut, selected, preview, onClick }: {
  label: string; shortcut?: string; selected?: boolean; preview?: React.CSSProperties; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button type="button" onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', width: '100%', padding: '8px 12px', border: 'none',
        background: hovered ? DOC_TOOLBAR_HOVER_BG : 'transparent', cursor: 'pointer', textAlign: 'left', gap: 8,
      }}>
      <span style={{ width: 16, flexShrink: 0, fontSize: 13, color: DOC_COLORS.primary }}>{selected ? '✓' : ''}</span>
      <span style={{ flex: 1, color: DOC_COLORS.text, ...preview }}>{label}</span>
      {shortcut && <span style={{ fontSize: 12, color: '#999', flexShrink: 0 }}>{shortcut}</span>}
    </button>
  );
}
