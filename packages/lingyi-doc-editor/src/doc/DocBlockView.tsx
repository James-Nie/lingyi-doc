import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { DocBlock, ListBlock, TextMark, ImageBlock, PendingCaret, BlockSelectionState } from '@lingyi-doc/core';
import {
  createEmptyParagraph,
  extractPlainText,
  extractContentFromEditable,
  genBlockId,
  getCaretOffset,
  setCaretOffset,
  marksEqual,
  marksToHtml,
  isTextBlock,
  splitMarks,
  getBlockIndentStyle,
  extractListItemsFromDom,
  getListCaretContext,
  getListItemTextEl,
  syncListDom,
  updateListItemMeta,
  listDomNeedsFullSync,
  deleteListItemCharAt,
  focusListItemFromPointer,
  deleteListDomSelection,
  isListItemTextEmpty,
  resolveCaretOffset,
  applyPendingCaretToBlockEl,
  DOC_SELECTION_BG,
} from '@lingyi-doc/core';
import { headingStyles, paragraphStyle, quoteStyle, dividerStyle, dividerWrapStyle, DOC_COLORS } from './styles';
import { DocImageBlock } from './DocImageBlock';
import { DocCodeBlock } from './DocCodeBlock';
import { DocMermaidBlock } from './DocMermaidBlock';
import { DocTableBlock } from './DocTableBlock';
import { DocBaseBlock } from './DocBaseBlock';
import { DocWhiteboardBlock } from './DocWhiteboardBlock';
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
  onTab?: () => void;
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
}) => {
  const editableRef = useRef<HTMLDivElement>(null);
  const skipInput = useRef(false);
  const selectedCommentIdRef = useRef(selectedCommentId);
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
    const domContent = extractContentFromEditable(editableRef.current);
    const domMatches = domContent.text === block.text
      && marksEqual(domContent.marks, block.marks);

    if (document.activeElement === editableRef.current && !forceSync && !pending && domMatches && !commentHighlightChanged) {
      return;
    }

    const hadFocus = document.activeElement === editableRef.current;
    const savedCaret = hadFocus ? getCaretOffset(editableRef.current) : null;

    const html = marksToHtml(block.text, block.marks, { selectedCommentId });
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
  }, [block, historyRevision, consumePendingCaret, releasePendingCaret, selectedCommentId]);

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

    if (e.key === 'Enter' && e.shiftKey && block.type !== 'code') {
      e.preventDefault();
      document.execCommand('insertLineBreak');
      handleInput();
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

    if (e.key === 'Tab' && !e.shiftKey && block.type !== 'code' && onTab) {
      e.preventDefault();
      onTab();
      return;
    }

    if (e.key === 'Backspace') {
      const el = editableRef.current;
      if (!el) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      const text = extractPlainText(el);
      const offset = getCaretOffset(el);
      if (!text) {
        e.preventDefault();
        onBackspaceEmpty();
        return;
      }
      if (offset === 0 && onBackspaceAtStart) {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) return;
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
    return selectionWrap(
      <DocBaseBlock
        block={block}
        index={index}
        selected={!!baseSelected || selectionState !== 'none'}
        onSelect={() => onBaseSelect?.()}
        onFocus={onFocus}
        onChange={(b, recordHistory) => onChange(b, recordHistory)}
        onRegisterRef={onRegisterRef}
        readOnly={readOnly}
      />,
    );
  }

  if (block.type === 'whiteboard') {
    return selectionWrap(
      <DocWhiteboardBlock
        block={block}
        index={index}
        selected={!!whiteboardSelected || selectionState !== 'none'}
        onSelect={() => onWhiteboardSelect?.()}
        onFocus={onFocus}
        onChange={(b, recordHistory) => onChange(b, recordHistory)}
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
    onPaste?: (e: ClipboardEvent, el: HTMLElement) => void;
    readOnly?: boolean;
  }
>(({ style, dataBlockId, dataBlockIndex, placeholder, placeholderColor, onFocus, onInput, onKeyDown, onPaste: onNativePaste, readOnly = false }, ref) => {
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
}: {
  block: ListBlock;
  index: number;
  active: boolean;
  readOnly?: boolean;
  selectionState?: BlockSelectionState;
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

    const pending = consumePendingCaret?.(block.id) ?? null;
    const needsFullSync = forceSync || listDomNeedsFullSync(listRef.current, block);

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
    });
    skipInput.current = false;
  }, [block, historyRevision, consumePendingCaret, releasePendingCaret]);

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
      document.execCommand('insertLineBreak');
      handleInput();
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
