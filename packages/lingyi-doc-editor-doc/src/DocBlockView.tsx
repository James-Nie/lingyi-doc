import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { DocBlock, ListBlock, TextMark, ImageBlock, PendingCaret, BlockSelectionState } from '@lingyi-doc/core-doc';
import { createEmptyParagraph, extractPlainText, extractContentFromEditable, genBlockId, getCaretOffset, setCaretOffset, marksEqual, marksToHtml, isTextBlock, splitMarks, getBlockIndentStyle, extractListItemsFromDom, getListCaretContext, getListItemTextEl, syncListDom, updateListItemMeta, listDomNeedsFullSync, deleteListItemCharAt, focusListItemFromPointer, deleteListDomSelection, isListItemTextEmpty, resolveCaretOffset, applyPendingCaretToBlockEl, DOC_SELECTION_BG, insertTextWithMarks, expandWordRange, selectTextOffsetsInEditable, isCaretAtLineStart, deleteTabBeforeCaret, normalizeMarks } from '@lingyi-doc/core-doc';
import { headingStyles, paragraphStyle, quoteStyle, dividerStyle, dividerWrapStyle, DOC_COLORS } from './styles';
import { DocImageBlock } from './DocImageBlock';
import { DocCodeBlock } from './DocCodeBlock';
import { DocMermaidBlock } from './DocMermaidBlock';
import { DocTableBlock } from './DocTableBlock';
import { getEditorEmbed } from '@lingyi-doc/editor-shared';
import { useNativePasteHandler } from './useNativePasteHandler';
import { useDocHistoryRevision } from './DocHistoryContext';

interface DocBlockViewProps {
  block: DocBlock;
  index: number;
  active: boolean;
  placeholder?: string;
  placeholderColor?: string;
  imageSelected?: boolean;
  codeSelected?: boolean;
  tableSelected?: boolean;
  baseSelected?: boolean;
  whiteboardSelected?: boolean;
  maxImageWidth?: number;
  onCodeSelect?: () => void;
  onTableSelect?: () => void;
  onBaseSelect?: () => void;
  onWhiteboardSelect?: () => void;
  onFocus: () => void;
  onChange: (block: DocBlock, recordHistory?: boolean) => void;
  onImagePatch?: (patch: Partial<ImageBlock>, recordHistory?: boolean) => void;
  onImageSelect?: () => void;
  onEnter: (cursorOffset: number, fullText: string, marks: TextMark[]) => void;
  onTab?: (shiftKey?: boolean) => void;
  /** 空段落输入 `/` 时唤起插入菜单 */
  onSlashCommand?: () => void;
  onBackspaceEmpty: () => void;
  onBackspaceAtStart?: () => void;
  onDeleteAtEnd?: () => void;
  onRegisterRef: (id: string, el: HTMLElement | null) => void;
  onListItemCheck?: (itemIndex: number, checked: boolean) => void;
  onListEnter?: (itemIndex: number, cursorOffset: number, fullText: string) => void;
  onListBackspace?: (itemIndex: number, atStart: boolean, text: string) => void;
  onListTab?: (itemIndex: number, shiftKey: boolean) => void;
  onListDeleteItemAtEnd?: (itemIndex: number, fullText: string) => void;
  onNativePaste?: (e: ClipboardEvent, el: HTMLElement) => void;
  selectionState?: BlockSelectionState;
  consumePendingCaret?: (blockId: string, tableCell?: { row: number; col: number }) => PendingCaret | null;
  releasePendingCaret?: (pending: PendingCaret) => void;
  applyPendingCaret?: (pending: PendingCaret) => void;
  readOnly?: boolean;
  selectedCommentId?: string | null;
  findHighlights?: import('@lingyi-doc/core').FindHighlightRange[];
  findHighlightsByListItem?: Map<number, import('@lingyi-doc/core').FindHighlightRange[]> | Record<number, import('@lingyi-doc/core').FindHighlightRange[]>;
}

export const DocBlockView: React.FC<DocBlockViewProps> = ({
  block,
  index,
  active,
  placeholder = '',
  placeholderColor,
  imageSelected,
  codeSelected,
  tableSelected,
  baseSelected,
  whiteboardSelected,
  maxImageWidth = 704,
  onCodeSelect,
  onTableSelect,
  onBaseSelect,
  onWhiteboardSelect,
  onFocus,
  onChange,
  onImagePatch,
  onImageSelect,
  onEnter,
  onTab,
  onSlashCommand,
  onBackspaceEmpty,
  onBackspaceAtStart,
  onDeleteAtEnd,
  onRegisterRef,
  onListItemCheck,
  onListEnter,
  onListBackspace,
  onListTab,
  onListDeleteItemAtEnd,
  onNativePaste,
  selectionState = 'none',
  consumePendingCaret,
  releasePendingCaret,
  applyPendingCaret,
  readOnly = false,
  selectedCommentId = null,
  findHighlights,
  findHighlightsByListItem,
}) => {
  const editableRef = useRef<HTMLDivElement>(null);
  const skipInput = useRef(false);
  const selectedCommentIdRef = useRef(selectedCommentId);
  const findHighlightsKeyRef = useRef(JSON.stringify(findHighlights ?? []));
  const findHighlightsKey = JSON.stringify(findHighlights ?? []);
  const historyRevision = useDocHistoryRevision();
  const lastHistoryRevisionRef = useRef(historyRevision);

  useLayoutEffect(() => {
    if (!editableRef.current || !isTextBlock(block)) return;
    onRegisterRef(block.id, editableRef.current);
    return () => onRegisterRef(block.id, null);
  }, [block.id, onRegisterRef]);

  useLayoutEffect(() => {
    if (!editableRef.current || !isTextBlock(block)) return;

    const forceSync = historyRevision !== lastHistoryRevisionRef.current;
    if (forceSync) lastHistoryRevisionRef.current = historyRevision;

    const pending = consumePendingCaret?.(block.id) ?? null;
    const commentHighlightChanged = selectedCommentIdRef.current !== selectedCommentId;
    selectedCommentIdRef.current = selectedCommentId;
    const findHighlightChanged = findHighlightsKeyRef.current !== findHighlightsKey;
    findHighlightsKeyRef.current = findHighlightsKey;
    const domContent = extractContentFromEditable(editableRef.current);
    const domMatches = domContent.text === block.text
      && marksEqual(domContent.marks, block.marks);

    if (
      document.activeElement === editableRef.current
      && !forceSync
      && !pending
      && domMatches
      && !commentHighlightChanged
      && !findHighlightChanged
    ) {
      return;
    }

    const hadFocus = document.activeElement === editableRef.current;
    const savedCaret = hadFocus ? getCaretOffset(editableRef.current) : null;

    const html = marksToHtml(block.text, block.marks, {
      selectedCommentId,
      tabStops: isTextBlock(block) ? block.tabStops : undefined,
      findHighlights,
    });
    if (editableRef.current.innerHTML !== html) {
      skipInput.current = true;
      editableRef.current.innerHTML = html || '';
      skipInput.current = false;
    }

    if (pending) {
      applyPendingCaretToBlockEl(editableRef.current, block, pending);
      releasePendingCaret?.(pending);
    } else if (hadFocus && savedCaret !== null) {
      editableRef.current.focus({ preventScroll: true });
      setCaretOffset(editableRef.current, Math.min(savedCaret, block.text.length));
    }
  }, [block, historyRevision, consumePendingCaret, releasePendingCaret, selectedCommentId, findHighlights, findHighlightsKey]);

  const handleInput = useCallback(() => {
    if (skipInput.current || !editableRef.current) return;
    if (isTextBlock(block)) {
      const { text, marks } = extractContentFromEditable(editableRef.current);
      onChange({ ...block, text, marks });
    }
  }, [block, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 输入法组合中（如中文选词确认），不拦截 Enter
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;

    // 空段落 `/` → Slash 插入菜单
    if (
      e.key === '/'
      && !e.ctrlKey && !e.metaKey && !e.altKey
      && onSlashCommand
      && isTextBlock(block)
      && block.type === 'paragraph'
    ) {
      const el = editableRef.current;
      const text = el ? extractPlainText(el) : block.text;
      if (!text.trim()) {
        e.preventDefault();
        onSlashCommand();
        return;
      }
    }

    if (e.key === 'Enter' && e.shiftKey && block.type !== 'code' && isTextBlock(block)) {
      e.preventDefault();
      const el = editableRef.current;
      if (!el) return;
      skipInput.current = true;
      const { text, marks } = extractContentFromEditable(el);
      const offset = getCaretOffset(el);
      const inserted = insertTextWithMarks(text, marks, offset, '\n');
      el.innerHTML = marksToHtml(inserted.text, inserted.marks, { tabStops: block.tabStops }) || '';
      setCaretOffset(el, offset + 1);
      onChange({ ...block, text: inserted.text, marks: inserted.marks }, false);
      skipInput.current = false;
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && block.type !== 'code') {
      e.preventDefault();
      const el = editableRef.current;
      if (!el) return;
      skipInput.current = true;
      const { text: fullText, marks } = extractContentFromEditable(el);
      const offset = getCaretOffset(el);
      skipInput.current = false;
      onEnter(offset, fullText, marks);
      return;
    }

    if (e.key === 'Tab' && block.type !== 'code') {
      // Ctrl/Cmd+Tab：正文无效（仅表格单元格插入制表符）
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        return;
      }

      e.preventDefault();

      // 多块选区 / 非文本：仍走段落缩进
      if (!isTextBlock(block) || !editableRef.current) {
        onTab?.(e.shiftKey);
        return;
      }

      const el = editableRef.current;
      const { text, marks } = extractContentFromEditable(el);
      const offset = getCaretOffset(el);
      const atLineStart = isCaretAtLineStart(text, offset);

      if (e.shiftKey) {
        // 行首 Shift+Tab：清除/减少段落缩进
        if (atLineStart) {
          onTab?.(true);
          return;
        }
        // 光标前是制表符：删除并回退
        const deleted = deleteTabBeforeCaret(text, marks, offset);
        if (deleted) {
          skipInput.current = true;
          const nextMarks = normalizeMarks(deleted.marks, deleted.text.length);
          el.innerHTML = marksToHtml(deleted.text, nextMarks, { tabStops: block.tabStops }) || '';
          setCaretOffset(el, deleted.caret);
          onChange({ ...block, text: deleted.text, marks: nextMarks }, true);
          skipInput.current = false;
          return;
        }
        // 否则尝试减少段落缩进
        onTab?.(true);
        return;
      }

      // Tab 行首：段落缩进（首行空两格 / 整段右移）
      if (atLineStart) {
        onTab?.(false);
        return;
      }

      // 行中：插入制表符，对齐到下一制表位
      skipInput.current = true;
      const inserted = insertTextWithMarks(text, marks, offset, '\t');
      el.innerHTML = marksToHtml(inserted.text, inserted.marks, { tabStops: block.tabStops }) || '';
      setCaretOffset(el, offset + 1);
      onChange({ ...block, text: inserted.text, marks: inserted.marks }, true);
      skipInput.current = false;
      return;
    }

    if (e.key === 'Backspace') {
      const el = editableRef.current;
      if (!el) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      const { text, marks } = extractContentFromEditable(el);
      const offset = getCaretOffset(el);
      if (!text) {
        e.preventDefault();
        onBackspaceEmpty();
        return;
      }
      // 删除光标前的制表符（contenteditable=false 的 span）
      if (isTextBlock(block) && offset > 0 && text[offset - 1] === '\t') {
        e.preventDefault();
        const deleted = deleteTabBeforeCaret(text, marks, offset);
        if (deleted) {
          skipInput.current = true;
          const nextMarks = normalizeMarks(deleted.marks, deleted.text.length);
          el.innerHTML = marksToHtml(deleted.text, nextMarks, { tabStops: block.tabStops }) || '';
          setCaretOffset(el, deleted.caret);
          onChange({ ...block, text: deleted.text, marks: nextMarks }, true);
          skipInput.current = false;
        }
        return;
      }
      if (offset === 0 && onBackspaceAtStart) {
        e.preventDefault();
        onBackspaceAtStart();
      }
      return;
    }

    if (e.key === 'Delete') {
      const el = editableRef.current;
      if (!el) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      const text = extractPlainText(el);
      const offset = getCaretOffset(el);
      if (offset === text.length && onDeleteAtEnd) {
        e.preventDefault();
        onDeleteAtEnd();
      }
      return;
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (readOnly || !isTextBlock(block)) return;
    const el = editableRef.current;
    if (!el) return;
    e.preventDefault();
    const { text } = extractContentFromEditable(el);
    const offset = getCaretOffset(el);
    const range = expandWordRange(text, offset);
    if (range.start === range.end) return;
    selectTextOffsetsInEditable(el, range.start, range.end);
  };

  if (block.type === 'divider') {
    return (
      <SelectionWrap state={selectionState}>
        <div style={dividerWrapStyle}>
          <hr
            style={{ ...dividerStyle, cursor: 'pointer' }}
            data-block-id={block.id}
            data-block-index={index}
            onClick={onFocus}
            onFocus={onFocus}
            tabIndex={0}
          />
        </div>
      </SelectionWrap>
    );
  }

  if (block.type === 'image') {
    return (
      <SelectionWrap state={selectionState}>
        <DocImageBlock
          block={block}
          index={index}
          selected={!!imageSelected || selectionState !== 'none'}
          maxWidth={maxImageWidth}
          onSelect={() => onImageSelect?.()}
          onChange={(b, recordHistory) => onChange(b, recordHistory)}
          onPatch={onImagePatch}
        />
      </SelectionWrap>
    );
  }

  if (block.type === 'list') {
    return (
      <ListBlockView
        block={block}
        index={index}
        active={active}
        readOnly={readOnly}
        selectionState={selectionState}
        findHighlightsByListItem={findHighlightsByListItem}
        onFocus={onFocus}
        onChange={onChange}
        onListItemCheck={onListItemCheck}
        onRegisterRef={onRegisterRef}
        onNativePaste={onNativePaste}
        onEnterItem={onListEnter ?? ((itemIndex, cursorOffset, fullText) => {
          const items = [...block.items];
          const item = items[itemIndex];
          const before = fullText.slice(0, cursorOffset);
          const after = fullText.slice(cursorOffset);
          items[itemIndex] = { ...item, text: before };
          items.splice(itemIndex + 1, 0, {
            text: after,
            level: item.level,
            checked: block.listType === 'task' ? false : item.checked,
            marks: [],
          });
          onChange({ ...block, items }, true);
        })}
        onBackspaceItem={onListBackspace ?? ((itemIndex, atStart, text) => {
          const items = [...block.items];
          if (!text && items.length > 1) {
            items.splice(itemIndex, 1);
            onChange({ ...block, items }, true);
            return;
          }
          if (atStart && itemIndex > 0 && text) {
            const prev = items[itemIndex - 1];
            const curr = items[itemIndex];
            items[itemIndex - 1] = { ...prev, text: prev.text + curr.text };
            items.splice(itemIndex, 1);
            onChange({ ...block, items }, true);
            return;
          }
          if (!text && items.length === 1) {
            onChange({ type: 'paragraph', id: block.id, text: '', marks: [], align: 'left' }, true);
          }
        })}
        onDeleteItemAtEnd={onListDeleteItemAtEnd}
        onTabItem={onListTab}
        consumePendingCaret={consumePendingCaret}
        releasePendingCaret={releasePendingCaret}
        applyPendingCaret={applyPendingCaret}
      />
    );
  }

  const align = 'align' in block ? block.align : 'left';
  const indentStyle = isTextBlock(block) ? getBlockIndentStyle(block) : {};
  const baseStyle: React.CSSProperties = {
    outline: 'none',
    textAlign: align,
    minHeight: 24,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    ...indentStyle,
  };

  const selectionWrap = (children: React.ReactNode) => (
    <SelectionWrap state={selectionState}>{children}</SelectionWrap>
  );

  if (block.type === 'heading') {
    const level = block.level as 1 | 2 | 3 | 4 | 5 | 6;
    return selectionWrap(
      <EditableBlock
        ref={editableRef}
        style={{ ...headingStyles[level], ...baseStyle }}
        dataBlockId={block.id}
        dataBlockIndex={index}
        placeholder={!block.text ? placeholder : undefined}
        placeholderColor={placeholderColor}
        onFocus={onFocus}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={onNativePaste}
        readOnly={readOnly}
      />,
    );
  }

  if (block.type === 'quote') {
    return selectionWrap(
      <EditableBlock
        ref={editableRef}
        style={{ ...quoteStyle, ...baseStyle }}
        dataBlockId={block.id}
        dataBlockIndex={index}
        placeholder={active && !block.text ? '引用内容' : undefined}
        onFocus={onFocus}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={onNativePaste}
        readOnly={readOnly}
      />,
    );
  }

  if (block.type === 'code') {
    return selectionWrap(
      <DocCodeBlock
        block={block}
        index={index}
        selected={!!codeSelected || selectionState !== 'none'}
        onSelect={() => onCodeSelect?.()}
        onFocus={onFocus}
        onChange={(b, recordHistory) => onChange(b, recordHistory)}
        onRegisterRef={onRegisterRef}
      />,
    );
  }

  if (block.type === 'mermaid') {
    return selectionWrap(
      <DocMermaidBlock
        block={block}
        index={index}
        selected={!!codeSelected || selectionState !== 'none'}
        onSelect={() => onCodeSelect?.()}
        onFocus={onFocus}
        onChange={(b, recordHistory) => onChange(b, recordHistory)}
        onRegisterRef={onRegisterRef}
      />,
    );
  }

  if (block.type === 'table') {
    return selectionWrap(
      <DocTableBlock
        block={block}
        index={index}
        selected={!!tableSelected || selectionState !== 'none'}
        onSelect={() => onTableSelect?.()}
        onFocus={onFocus}
        onChange={(b, recordHistory) => onChange(b, recordHistory)}
        onRegisterRef={onRegisterRef}
        onNativePaste={onNativePaste}
        consumePendingCaret={consumePendingCaret}
        releasePendingCaret={releasePendingCaret}
        applyPendingCaret={applyPendingCaret}
        readOnly={readOnly}
      />,
    );
  }

  if (block.type === 'base') {
    const DocBaseBlock = getEditorEmbed('base');
    if (!DocBaseBlock) {
      return selectionWrap(
        <div style={{ padding: 12, color: '#86909C', fontSize: 13 }}>多维表格嵌入未加载</div>,
      );
    }
    return selectionWrap(
      <DocBaseBlock
        block={block}
        index={index}
        selected={!!baseSelected || selectionState !== 'none'}
        onSelect={() => onBaseSelect?.()}
        onFocus={onFocus}
        onChange={(b: typeof block, recordHistory?: boolean) => onChange(b, recordHistory)}
        onRegisterRef={onRegisterRef}
        readOnly={readOnly}
      />,
    );
  }

  if (block.type === 'whiteboard') {
    const DocWhiteboardBlock = getEditorEmbed('whiteboard');
    if (!DocWhiteboardBlock) {
      return selectionWrap(
        <div style={{ padding: 12, color: '#86909C', fontSize: 13 }}>画板嵌入未加载</div>,
      );
    }
    return selectionWrap(
      <DocWhiteboardBlock
        block={block}
        index={index}
        selected={!!whiteboardSelected || selectionState !== 'none'}
        onSelect={() => onWhiteboardSelect?.()}
        onFocus={onFocus}
        onChange={(b: typeof block, recordHistory?: boolean) => onChange(b, recordHistory)}
        onRegisterRef={onRegisterRef}
        readOnly={readOnly}
      />,
    );
  }

  return selectionWrap(
    <EditableBlock
      ref={editableRef}
      style={{ ...paragraphStyle, ...baseStyle, paddingTop: index === 0 ? 0 : undefined }}
      dataBlockId={block.id}
      dataBlockIndex={index}
      placeholder={!block.text ? placeholder : undefined}
      placeholderColor={placeholderColor}
      onFocus={onFocus}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onDoubleClick={handleDoubleClick}
      onPaste={onNativePaste}
      readOnly={readOnly}
    />,
  );
};

function SelectionWrap({
  state = 'none',
  children,
}: {
  state?: BlockSelectionState;
  children: React.ReactNode;
}) {
  // 必须保持稳定的 DOM 包裹层，避免 none→full 时 remount contentEditable 导致内容被清空
  return (
    <div
      style={
        state === 'full'
          ? { background: DOC_SELECTION_BG, borderRadius: 4 }
          : undefined
      }
    >
      {children}
    </div>
  );
}

const EditableBlock = React.forwardRef<
  HTMLDivElement,
  {
    style: React.CSSProperties;
    dataBlockId: string;
    dataBlockIndex: number;
    placeholder?: string;
    placeholderColor?: string;
    onFocus: () => void;
    onInput: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onDoubleClick?: (e: React.MouseEvent) => void;
    onPaste?: (e: ClipboardEvent, el: HTMLElement) => void;
    readOnly?: boolean;
  }
>(({ style, dataBlockId, dataBlockIndex, placeholder, placeholderColor, onFocus, onInput, onKeyDown, onDoubleClick, onPaste: onNativePaste, readOnly = false }, ref) => {
  const [focused, setFocused] = React.useState(false);
  const innerRef = useRef<HTMLDivElement>(null);
  React.useImperativeHandle(ref, () => innerRef.current as HTMLDivElement);
  useNativePasteHandler(innerRef, onNativePaste);

  return (
  <div style={{ position: 'relative' }} data-block-index={dataBlockIndex}>
    <div
      ref={innerRef}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      data-block-id={dataBlockId}
      data-block-index={dataBlockIndex}
      data-doc-editable=""
      style={{ ...style, userSelect: 'text', WebkitUserSelect: 'text' }}
      onFocus={() => {
        setFocused(true);
        onFocus();
      }}
      onBlur={() => setFocused(false)}
      onInput={onInput}
      onKeyDown={onKeyDown}
      onDoubleClick={onDoubleClick}
    />
    {placeholder && !focused && (
      <span
        role="button"
        tabIndex={-1}
        onMouseDown={e => {
          e.preventDefault();
          innerRef.current?.focus();
          onFocus();
        }}
        style={{
          position: 'absolute', left: 0, top: 0,
          color: placeholderColor ?? DOC_COLORS.muted,
          fontSize: style.fontSize, lineHeight: style.lineHeight, fontWeight: style.fontWeight,
          pointerEvents: 'auto',
          cursor: 'text',
          userSelect: 'none',
        }}
      >
        {placeholder}
      </span>
    )}
  </div>
  );
});

function ListBlockView({
  block,
  index,
  onFocus,
  onChange,
  onListItemCheck,
  onRegisterRef,
  onEnterItem,
  onBackspaceItem,
  onDeleteItemAtEnd,
  onTabItem,
  onNativePaste,
  consumePendingCaret,
  releasePendingCaret,
  applyPendingCaret,
  selectionState = 'none',
  readOnly = false,
  findHighlightsByListItem,
}: {
  block: ListBlock;
  index: number;
  active: boolean;
  readOnly?: boolean;
  selectionState?: BlockSelectionState;
  findHighlightsByListItem?: Map<number, import('@lingyi-doc/core').FindHighlightRange[]> | Record<number, import('@lingyi-doc/core').FindHighlightRange[]>;
  onFocus: () => void;
  onChange: (b: DocBlock, recordHistory?: boolean) => void;
  onListItemCheck?: (itemIndex: number, checked: boolean) => void;
  onRegisterRef: (id: string, el: HTMLElement | null) => void;
  onEnterItem: (itemIndex: number, cursorOffset: number, fullText: string) => void;
  onBackspaceItem: (itemIndex: number, atStart: boolean, text: string) => void;
  onDeleteItemAtEnd?: (itemIndex: number, fullText: string) => void;
  onTabItem?: (itemIndex: number, shiftKey: boolean) => void;
  onNativePaste?: (e: ClipboardEvent, el: HTMLElement) => void;
  consumePendingCaret?: (blockId: string, tableCell?: { row: number; col: number }) => PendingCaret | null;
  releasePendingCaret?: (pending: PendingCaret) => void;
  applyPendingCaret?: (pending: PendingCaret) => void;
}) {
  const listRef = useRef<HTMLOListElement | HTMLUListElement | null>(null);
  const skipInput = useRef(false);
  const historyRevision = useDocHistoryRevision();
  const lastHistoryRevisionRef = useRef(historyRevision);
  const findListKey = findHighlightsByListItem
    ? JSON.stringify(
      findHighlightsByListItem instanceof Map
        ? [...findHighlightsByListItem.entries()]
        : findHighlightsByListItem,
    )
    : '';
  const findListKeyRef = useRef(findListKey);
  useNativePasteHandler(listRef, onNativePaste);

  useLayoutEffect(() => {
    onRegisterRef(block.id, listRef.current);
    return () => onRegisterRef(block.id, null);
  }, [block.id, onRegisterRef]);

  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const onCheckbox = (e: Event) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.type === 'checkbox' && t.dataset.listCheckbox != null) {
        onListItemCheck?.(Number(t.dataset.listCheckbox), t.checked);
      }
    };
    root.addEventListener('change', onCheckbox);
    return () => root.removeEventListener('change', onCheckbox);
  }, [block.id, onListItemCheck]);

  useLayoutEffect(() => {
    if (!listRef.current) return;
    const forceSync = historyRevision !== lastHistoryRevisionRef.current;
    if (forceSync) lastHistoryRevisionRef.current = historyRevision;

    const findHighlightChanged = findListKeyRef.current !== findListKey;
    findListKeyRef.current = findListKey;

    const pending = consumePendingCaret?.(block.id) ?? null;
    const needsFullSync = forceSync || listDomNeedsFullSync(listRef.current, block) || findHighlightChanged;

    if (!needsFullSync) {
      updateListItemMeta(listRef.current, block);
      if (pending && listRef.current) {
        applyPendingCaretToBlockEl(listRef.current, block, pending);
        releasePendingCaret?.(pending);
      }
      return;
    }

    skipInput.current = true;
    const itemIdx = pending?.listItemIndex ?? 0;
    const listCaret = pending
      ? {
          itemIndex: itemIdx,
          offset: resolveCaretOffset(pending.position, block.items[itemIdx]?.text.length ?? 0),
        }
      : undefined;
    syncListDom(listRef.current, block, {
      restoreSelection: !pending,
      caret: listCaret,
      findHighlightsByItem: findHighlightsByListItem,
    });
    skipInput.current = false;
    if (pending) releasePendingCaret?.(pending);
  }, [block, historyRevision, consumePendingCaret, releasePendingCaret, findHighlightsByListItem, findListKey]);

  const handleInput = useCallback(() => {
    if (skipInput.current || !listRef.current) return;
    const items = extractListItemsFromDom(listRef.current, block.items);
    const nextBlock = { ...block, items };
    onChange(nextBlock);
    updateListItemMeta(listRef.current, nextBlock);
  }, [block, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const root = listRef.current;
    if (!root) return;
    const ctx = getListCaretContext(root);
    if (!ctx) return;

    const itemIndex = ctx.focusItemIndex;
    const offset = ctx.focusOffset;
    const fullText = ctx.focusItemText;
    const sel = window.getSelection();
    const hasRangeSelection = sel && !sel.isCollapsed;

    if (e.key === 'Enter' && e.shiftKey) {
      if (hasRangeSelection) {
        e.preventDefault();
        deleteListDomSelection(root);
        handleInput();
        return;
      }
      e.preventDefault();
      const textEl = getListItemTextEl(root, itemIndex);
      if (!textEl) return;
      skipInput.current = true;
      const { text, marks } = extractContentFromEditable(textEl);
      const inserted = insertTextWithMarks(text, marks, offset, '\n');
      textEl.innerHTML = marksToHtml(inserted.text, inserted.marks) || '';
      setCaretOffset(textEl, offset + 1);
      const items = block.items.map((it, i) =>
        i === itemIndex ? { ...it, text: inserted.text, marks: inserted.marks } : it,
      );
      onChange({ ...block, items }, false);
      skipInput.current = false;
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (hasRangeSelection) {
        deleteListDomSelection(root);
        handleInput();
        const afterCtx = getListCaretContext(root);
        if (!afterCtx) return;
        onEnterItem(afterCtx.focusItemIndex, afterCtx.focusOffset, afterCtx.focusItemText);
        return;
      }
      onEnterItem(itemIndex, offset, fullText);
      return;
    }

    if (e.key === 'Tab' && onTabItem) {
      e.preventDefault();
      if (hasRangeSelection) {
        deleteListDomSelection(root);
        handleInput();
      }
      onTabItem(itemIndex, e.shiftKey);
      return;
    }

    if (e.key === 'Backspace') {
      if (hasRangeSelection) {
        e.preventDefault();
        deleteListDomSelection(root);
        handleInput();
        return;
      }
      if (isListItemTextEmpty(fullText)) {
        e.preventDefault();
        onBackspaceItem(itemIndex, true, '');
        return;
      }
      if (offset === 0) {
        e.preventDefault();
        onBackspaceItem(itemIndex, true, fullText);
      }
      return;
    }

    if (e.key === 'Delete') {
      if (hasRangeSelection) {
        e.preventDefault();
        deleteListDomSelection(root);
        handleInput();
        return;
      }
      e.preventDefault();
      if (offset < fullText.length) {
        if (deleteListItemCharAt(root, itemIndex, offset)) {
          handleInput();
        }
        return;
      }
      if (offset === fullText.length && onDeleteItemAtEnd) {
        onDeleteItemAtEnd(itemIndex, fullText);
      }
      return;
    }
  };

  const Tag = block.listType === 'ordered' ? 'ol' : 'ul';

  return (
    <SelectionWrap state={selectionState}>
    <Tag
      ref={listRef as React.Ref<HTMLOListElement>}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      style={{
        margin: 0,
        padding: '8px 0',
        paddingLeft: 0,
        listStyle: 'none',
        outline: 'none',
        userSelect: 'text',
        WebkitUserSelect: 'text',
        ...paragraphStyle,
        paddingTop: paragraphStyle.padding,
        paddingBottom: paragraphStyle.padding,
      }}
      data-block-id={block.id}
      data-block-index={index}
      data-doc-editable=""
      data-list-root=""
      onFocus={onFocus}
      onMouseDown={e => {
        if (e.button !== 0 || e.shiftKey) return;
        const root = listRef.current;
        if (root) focusListItemFromPointer(root, e.target as Node);
      }}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
    />
    </SelectionWrap>
  );
}

function trimMarks(marks: TextMark[], len: number): TextMark[] {
  return marks.filter(m => m.start < len && m.end > 0).map(m => ({
    ...m,
    start: Math.max(0, m.start),
    end: Math.min(len, m.end),
  }));
}

export { createEmptyParagraph, genBlockId };
